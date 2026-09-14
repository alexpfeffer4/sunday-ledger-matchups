begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select is((select count(*) from private.authoritative_season_rulesets where ruleset_version='1.2'),2::bigint,'support migration does not activate the new rules');
select is((select count(*) from private.prepared_rolling_rulesets),2::bigint,'both supported modes have a prepared immutable package');
select function_privs_are('private','rolling_ruleset_package',array['text'],'authenticated',array[]::text[],'members cannot select or change rule activation');
select table_privs_are('private','prepared_rolling_rulesets','authenticated',array[]::text[],'the prepared catalog is private');
select table_privs_are('private','event_entry_cutoff_history','authenticated',array[]::text[],'cutoff evidence has no direct public access');

-- Rollback-only activation of the exact compiled package, followed by real
-- rehearsal formation and the same member acceptance RPC used by Live.
update private.authoritative_season_rulesets a set ruleset_version='1.3',product_bible_version='3.2',
 canonical_json=p.canonical_json,sha256_hash=p.sha256_hash from private.prepared_rolling_rulesets p where p.mode=a.mode;
create temporary table rolling_context(owner_id uuid,slug text,season_id uuid,week_id uuid,card_id uuid,batch jsonb,response jsonb);
grant select,update on rolling_context to authenticated;
do $$
declare u uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email) values(u,u::text||'@rolling.test');
 insert into private.profiles(id,display_name) values(u,'Rolling Owner');
 insert into private.owner_rehearsal_entitlements(user_id,note) values(u,'Disposable rolling submission verification');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 perform api.start_owner_rehearsal('rolling-start-1');
 perform api.fill_owner_rehearsal_bots('rolling-fill-1');
 perform api.advance_owner_rehearsal('FORMATION_READY','rolling-open-1');
 insert into rolling_context(owner_id,slug,season_id,week_id,card_id)
 select u,l.slug,r.season_id,w.id,c.id from private.owner_rehearsals r join private.leagues l on l.id=r.league_id
 join private.season_weeks w on w.season_id=r.season_id and w.nfl_week=1
 join private.weekly_cards c on c.week_id=w.id and c.owner_user_id=u where r.owner_user_id=u and r.status='ACTIVE';
end; $$;
create function pg_temp.rolling_positions(p_start integer,p_stakes integer[]) returns jsonb language sql as $$
 select jsonb_agg(jsonb_build_object('marketSnapshotId',m.id,'payloadHash',m.payload_hash,'stakeCredits',p_stakes[m.rn-p_start+1]) order by m.rn)
 from (select row_number() over(order by e.scheduled_start_at,e.id,s.market_type) rn,s.*
  from private.sports_events e join private.live_quote_heads h on h.event_id=e.id
  join private.market_snapshots s on s.id=h.market_snapshot_id
  where e.week_id=(select week_id from rolling_context) and h.outcome_key in ('HOME','OVER')) m
 where m.rn between p_start and p_start+cardinality(p_stakes)-1;
$$;
create function pg_temp.rolling_try(p_positions jsonb,p_key text) returns jsonb language plpgsql as $$
declare response jsonb;
begin
 begin response:=api.accept_stage1_card((select slug from rolling_context),p_positions,p_key);
 raise exception using errcode='ZX001',message=response::text;
 exception when sqlstate 'ZX001' then return jsonb_build_object('accepted',true,'response',sqlerrm::jsonb);
 when others then return jsonb_build_object('accepted',false,'code',sqlstate,'message',sqlerrm); end;
end; $$;
select ok(private.is_rolling_week(week_id),'opened new week binds rolling rules') from rolling_context;
select is(private.season_card_rules((select ruleset_snapshot_id from private.season_weeks where id=week_id),'SIMULATION')#>>'{card,acceptanceUnit}','BATCH_ATOMIC','database validates the prepared rolling contract') from rolling_context;
select cmp_ok(private.week_entry_closes_at(week_id),'>',(select common_lock_at from private.season_weeks where id=week_id),'weekly entry continues through the later published game') from rolling_context;
select is(pg_temp.rolling_try(pg_temp.rolling_positions(1,array[49]),'minimum-stake-trial')->>'accepted','false','49 credits cannot be submitted');
select is(pg_temp.rolling_try(jsonb_set(pg_temp.rolling_positions(1,array[50]),'{0,stakeCredits}','50.5'),'fractional-trial')->>'accepted','false','fractional stakes cannot be submitted');
select is(pg_temp.rolling_try(pg_temp.rolling_positions(1,array[1001]),'budget-trial-over')->>'accepted','false','a batch cannot exceed the budget');
select is(pg_temp.rolling_try(pg_temp.rolling_positions(1,array[951]),'unusable-remainder')->>'accepted','true','an unused remainder below50 is allowed');
select is(pg_temp.rolling_try(pg_temp.rolling_positions(1,array_fill(50,array[20])),'twenty-bet-trial')->>'accepted','true','twenty50-credit bets fit the weekly position and budget limits');
select is(pg_temp.rolling_try(pg_temp.rolling_positions(1,array_fill(50,array[21])),'twenty-one-bet-trial')->>'accepted','false','a21-bet batch is rejected');
select is(pg_temp.rolling_try(pg_temp.rolling_positions(1,array[50])||pg_temp.rolling_positions(1,array[50]),'duplicate-market-trial')->>'accepted','false','duplicate event/market in one batch fails atomically');

update rolling_context set batch=pg_temp.rolling_positions(1,array[300]);
set local role authenticated;
select lives_ok($$update rolling_context set response=api.accept_stage1_card(slug,batch,'rolling-first-batch')$$,'member submits a partial batch using the actual public RPC');
reset role;
select is(response->>'allocatedCredits','300','first batch reports cumulative allocation') from rolling_context;
select is(response->>'remainingCredits','700','unspent credits remain available') from rolling_context;
select is((select compliance from private.weekly_cards where id=card_id),'COMPLIANT','any accepted rolling bet is compliant') from rolling_context;
create temporary table immutable_first_batch as select to_jsonb(r) receipt from private.position_receipts r where card_id=(select card_id from rolling_context);
select is(api.accept_stage1_card(slug,batch,'rolling-first-batch')->>'replayed','true','duplicate click replays the accepted batch') from rolling_context;
select is(pg_temp.rolling_try(jsonb_set(batch,'{0,stakeCredits}','350'),'rolling-first-batch')->>'code','22000','same retry identity with changed content is rejected') from rolling_context;
select is(pg_temp.rolling_try(batch,'new-key-same-market')->>'accepted','false','a second request cannot top up an existing accepted market') from rolling_context;
select is(pg_temp.rolling_try(pg_temp.rolling_positions(2,array[400,400]),'second-batch-over-budget')->>'accepted','false','later batch cumulative overspend rejected');
select is((select count(*) from private.position_receipts where card_id=rolling_context.card_id),1::bigint,'failed later batch adds no receipt') from rolling_context;
select lives_ok($$update rolling_context set response=api.accept_stage1_card(slug,pg_temp.rolling_positions(2,array[300]),'rolling-second-batch')$$,'a second market in the same game submits independently');
select is(response->>'allocatedCredits','600','second batch reports cumulative allocation') from rolling_context;
select is(response->>'positionCount','2','second batch reports cumulative accepted bet count') from rolling_context;
select is((select to_jsonb(r) from private.position_receipts r where r.id=(receipt->>'id')::uuid),receipt,'earlier receipt stays byte-for-byte immutable') from immutable_first_batch;
select throws_ok($$update private.position_receipts set stake_credits=350 where card_id=(select card_id from rolling_context)$$,'55000',null,'accepted receipts reject mutation');

-- The original published cutoff never moves later even if schedule changes.
create temporary table cutoff_before as select id,entry_cutoff_at from private.sports_events where week_id=(select week_id from rolling_context) order by scheduled_start_at,id limit 1;
select lives_ok($$update private.sports_events set scheduled_start_at=scheduled_start_at+interval '1 hour' where id=(select id from cutoff_before)$$,'a schedule adjustment retains a stable submission cutoff');
select is((select entry_cutoff_at from private.sports_events where id=c.id),c.entry_cutoff_at,'later schedule cannot reopen entry') from cutoff_before c;
select is((select count(*) from private.event_entry_cutoff_history where event_id=c.id),1::bigint,'later schedule does not invent a changed competitive cutoff') from cutoff_before c;


-- Independent timing trials roll back only the fixture clock and trial writes;
-- real permission, review, acceptance and receipt guards remain enabled.
create function pg_temp.rolling_at(p_time timestamptz,p_index integer,p_early_start boolean default false)
returns jsonb language plpgsql as $$
declare out jsonb; event_id uuid;
begin
 begin
  update private.seasons set simulated_now=p_time where id=(select season_id from rolling_context);
  if p_early_start then
   select m.event_id into event_id from private.market_snapshots m
   where m.id=(pg_temp.rolling_positions(p_index,array[50])->0->>'marketSnapshotId')::uuid;
   update private.sports_events set actual_started_at=p_time,state='LIVE' where id=event_id;
  end if;
  perform api.prepare_simulation_card_quotes((select slug from rolling_context));
  out:=api.accept_stage1_card((select slug from rolling_context),pg_temp.rolling_positions(p_index,array[50]),'rolling-clock-'||gen_random_uuid()::text);
  raise exception using errcode='ZX001',message=out::text;
 exception when sqlstate 'ZX001' then return jsonb_build_object('accepted',true,'result',sqlerrm::jsonb);
 when others then return jsonb_build_object('accepted',false,'code',sqlstate,'message',sqlerrm); end;
end; $$;
select is(pg_temp.rolling_at(entry_cutoff_at-interval '1 microsecond',3)->>'accepted','true','bet immediately before published kickoff is accepted') from cutoff_before;
select is(pg_temp.rolling_at(entry_cutoff_at,3)->>'accepted','false','bet exactly at cutoff is rejected without a provider LIVE flag') from cutoff_before;
select is(pg_temp.rolling_at(entry_cutoff_at+interval '1 microsecond',3)->>'accepted','false','bet immediately after cutoff is rejected') from cutoff_before;
select is(pg_temp.rolling_at(entry_cutoff_at+interval '2 hours',3)->>'accepted','false','earlier1PM game cannot be selected at3PM') from cutoff_before;
select is(pg_temp.rolling_at(entry_cutoff_at+interval '2 hours',22)->>'accepted','true','later published game stays available after early games close') from cutoff_before;
select is(pg_temp.rolling_at(entry_cutoff_at-interval '1 minute',3,true)->>'accepted','false','confirmed early start closes acceptance before scheduled cutoff') from cutoff_before;
select is(pg_temp.rolling_at((select private.week_entry_closes_at(week_id) from rolling_context)-interval '1 minute',22)->>'accepted','true','Monday-window later batch uses fresh deterministic quotes and remaining allocation');
select is(pg_temp.rolling_at((select private.week_entry_closes_at(week_id) from rolling_context),22)->>'accepted','false','no game accepts after final slate cutoff');
select is((select count(*) from private.position_receipts where card_id=c.card_id),2::bigint,'failed timing trials preserve earlier successful receipts') from rolling_context c;
select is(api.accept_stage1_card(slug,batch,'rolling-first-batch')->>'replayed','true','earlier batch still replays after later submission') from rolling_context;
select * from finish();
rollback;
