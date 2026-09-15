begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select is((select count(*) from private.prepared_player_props_rulesets),2::bigint,'both exact props packages are prepared');
select ok(not (select offers_enabled from private.player_prop_controls),'offers are disabled after migration');
select table_privs_are('private','player_subjects','authenticated',array[]::text[],'canonical identities are not client writable');
select table_privs_are('private','player_provider_mappings','authenticated',array[]::text[],'crosswalk evidence is private');
select table_privs_are('private','week_player_menu','authenticated',array[]::text[],'menu mutations require guarded RPC');
select function_privs_are('api','import_player_catalog',array['jsonb'],'authenticated',array[]::text[],'members cannot author provider mappings');
select function_privs_are('api','confirm_player_prop_menu',array['text','jsonb'],'anon',array[]::text[],'anonymous cannot confirm menus');
update private.authoritative_season_rulesets a set ruleset_version='1.4',product_bible_version='3.3',
 canonical_json=p.canonical_json,sha256_hash=p.sha256_hash from private.prepared_player_props_rulesets p where p.mode=a.mode;
create temporary table props_context(owner_id uuid,league_id uuid,slug text,season_id uuid,week_id uuid,card_id uuid,event_id uuid,batch jsonb,response jsonb);
grant select,update on props_context to authenticated;
do $$ declare u uuid:=gen_random_uuid(); begin
 insert into auth.users(id,email) values(u,u::text||'@props.test');
 insert into private.profiles(id,display_name) values(u,'Props Owner');
 insert into private.owner_rehearsal_entitlements(user_id,note) values(u,'Disposable player props verification');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 perform api.start_owner_rehearsal('props-start-01');
 perform api.fill_owner_rehearsal_bots('props-fill-01');
 perform api.advance_owner_rehearsal('FORMATION_READY','props-open-01');
 insert into props_context(owner_id,league_id,slug,season_id,week_id,card_id,event_id)
 select u,l.id,l.slug,r.season_id,w.id,c.id,(select id from private.sports_events where week_id=w.id order by scheduled_start_at,id limit 1)
 from private.owner_rehearsals r join private.leagues l on l.id=r.league_id
 join private.season_weeks w on w.season_id=r.season_id and w.nfl_week=1
 join private.weekly_cards c on c.week_id=w.id and c.owner_user_id=u where r.owner_user_id=u and r.status='ACTIVE';
 end $$;
select ok(private.is_rolling_week(week_id) and private.is_player_props_week(week_id),'1.4 explicitly inherits rolling capability') from props_context;
select is((select ruleset_version from private.season_ruleset_snapshots r join private.season_weeks w on w.ruleset_snapshot_id=r.id where w.id=c.week_id),'1.4','new unopened week pins new package') from props_context c;
select is((select count(*) from private.week_player_menu where week_id=c.week_id),6*(select count(*) from private.sports_events where week_id=c.week_id),'menu contains six structural slots for every game before any prop quotes') from props_context c;
update private.player_prop_controls set offers_enabled=true;
insert into private.player_prop_leagues(league_id,enabled) select league_id,true from props_context;
-- Every game has current mapped role candidates. Teams have distinct QBs/RBs/WRs;
-- candidate identity is verified independently of bookmaker market availability.
select api.import_player_catalog((select jsonb_agg(jsonb_build_object(
 'canonicalKey',e.id::text||':'||t.team||':'||role.position,'displayName',t.team||' Test '||role.position,'position',role.position,
 'provider','SIMULATION_FIXTURE','externalEventId',e.fixture_event_key,'externalPlayerId',e.id::text||':'||t.team||':'||role.position,
 'team',t.team,'gameDate',(e.scheduled_start_at at time zone 'America/New_York')::date,
 'verifiedAt',clock_timestamp(),'evidenceHash',repeat('a',64),'roleRank',1,'roleEvidence','Verified deterministic current role','resultPathVerified',true))
 from private.sports_events e cross join lateral(values(e.away_team),(e.home_team)) t(team)
 cross join(values('QB'),('RB'),('WR')) role(position) where e.week_id=(select week_id from props_context)));
select lives_ok($$select api.import_player_catalog((select jsonb_build_array(jsonb_build_object(
 'canonicalKey',p.canonical_key,'displayName',p.display_name,'position',p.position,'provider',m.provider,
 'externalEventId',m.external_event_id,'externalPlayerId',m.external_player_id,'team',m.team,'gameDate',m.game_date,
 'verifiedAt',clock_timestamp(),'evidenceHash',repeat('b',64),'roleRank',2,'roleEvidence','Updated verified role evidence','resultPathVerified',true))
 from private.player_provider_mappings m join private.player_subjects p on p.id=m.subject_id order by m.id limit 1))$$,
 'renewed role evidence appends without replacing canonical mapping');
select is((select count(*) from private.player_provider_mapping_observations),
 (select count(*)+1 from private.player_provider_mappings),'new role evidence creates an independent immutable observation');
select lives_ok($$select api.prepare_player_prop_menu((select slug from props_context))$$,'commissioner auto-proposes full slate without manual name entry');
select is((select count(*) from private.week_player_menu where week_id=c.week_id and subject_id is not null),6*(select count(*) from private.sports_events where week_id=c.week_id),'all mapped players proposed before bookmaker lines exist') from props_context c;
create temporary table props_choices as select jsonb_agg(jsonb_build_object('eventId',event_id,'team',team,'slot',slot,'subjectId',subject_id)) choices
 from private.week_player_menu where week_id=(select week_id from props_context);
select throws_ok($$select api.confirm_player_prop_menu((select slug from props_context),'[]')$$,'22023',null,'partial review cannot silently omit games');
select lives_ok($$select api.confirm_player_prop_menu((select slug from props_context),(select choices from props_choices))$$,'one commissioner bulk confirmation publishes all six identities per game');
select throws_ok($$update private.week_player_menu m set subject_id=(select subject_id from private.week_player_menu x where x.event_id=m.event_id and x.team=m.team and x.slot='QB_PASS') where m.week_id=(select week_id from props_context) and m.slot='RB_RUSH'$$,'22023',null,'a QB rushing line cannot populate the RB slot');
-- Explicitly unresolved frozen receiver: ordinary games and other known subjects remain usable.
update private.week_player_menu set subject_id=null,unavailable_reason='PLAYER_IDENTITY_UNRESOLVED'
 where event_id=(select event_id from props_context) and slot='RECEIVER'
 and team=(select away_team from private.sports_events where id=(select event_id from props_context));
update props_context set batch=(select jsonb_build_array(jsonb_build_object('marketSnapshotId',q.id,'payloadHash',q.payload_hash,'stakeCredits',100))
 from private.live_quote_heads h join private.market_snapshots q on q.id=h.market_snapshot_id
 where h.event_id=props_context.event_id and h.market_type='MONEYLINE' and h.outcome_key='HOME');
set local role authenticated;
select lives_ok($$update props_context set response=api.accept_stage1_card(slug,batch,'props-first-main')$$,'first game-only submission succeeds and freezes player menu');
reset role;
create temporary table props_legacy_receipt as select to_jsonb(r) original from private.position_receipts r where card_id=(select card_id from props_context);
select is((select count(*) from private.week_player_menu where week_id=c.week_id and frozen_at is null),0::bigint,'the first game-only bet freezes every menu identity league-wide') from props_context c;
select is((select receipt_serialization_version from private.position_receipts where card_id=c.card_id),1,'new game-line receipt keeps original serializer') from props_context c;
select throws_ok($$select api.confirm_player_prop_menu((select slug from props_context),(select choices from props_choices))$$,'55000',null,'no commissioner replacement after first game-only acceptance');
select throws_ok($$update private.week_player_menu set subject_id=null where week_id=(select week_id from props_context) and subject_id is not null$$,'55000',null,'frozen players cannot be substituted directly');
-- Real lines can arrive later for the same known frozen player identities.
do $$ declare rec record; sid uuid; sl uuid; side text; begin
 select id into sl from private.slates where week_id=(select week_id from props_context) order by version desc limit 1;
 for rec in select m.*,s.display_name from private.week_player_menu m join private.player_subjects s on s.id=m.subject_id
 where m.event_id=(select event_id from props_context) loop
  foreach side in array array['OVER','UNDER'] loop
   insert into private.market_snapshots(event_id,week_id,league_id,book_key,market_type,outcome_key,proposition,line_milli,american_odds,observed_at,payload_hash,subject_id,statistic,period)
   values(rec.event_id,rec.week_id,(select league_id from props_context),'draftkings','PLAYER_'||rec.statistic,side,
   rec.display_name||' '||side||' 75.5',75500,-110,(select private.card_confirmation_time(season_id) from props_context),
   encode(extensions.digest(rec.subject_id::text||side||'props-late','sha256'),'hex'),rec.subject_id,rec.statistic,'FULL_GAME') returning id into sid;
   insert into private.slate_items(slate_id,event_id,market_snapshot_id,week_id,league_id)
   values(sl,rec.event_id,sid,rec.week_id,(select league_id from props_context));
  end loop;
 end loop;
end $$;
select is((select count(*) from private.live_quote_heads where event_id=c.event_id and subject_id is not null),10::bigint,'late known-player quotes create distinct subject heads; unresolved slot stays unavailable') from props_context c;
create function pg_temp.props_batch(p_slot text,p_side text,p_stake integer) returns jsonb language sql as $$
 select jsonb_agg(jsonb_build_object('marketSnapshotId',q.id,'payloadHash',q.payload_hash,'stakeCredits',p_stake) order by m.team)
 from private.week_player_menu m join private.live_quote_heads h on h.event_id=m.event_id and h.subject_id=m.subject_id
 and h.statistic=m.statistic and h.period=m.period and h.outcome_key=p_side
 join private.market_snapshots q on q.id=h.market_snapshot_id
 where m.event_id=(select event_id from props_context) and m.slot=p_slot;
$$;
create function pg_temp.props_try(p_batch jsonb,p_key text) returns jsonb language plpgsql as $$
declare r jsonb; begin
 begin r:=api.accept_stage1_card((select slug from props_context),p_batch,p_key);
 raise exception using errcode='ZX001',message=r::text;
 exception when sqlstate 'ZX001' then return jsonb_build_object('accepted',true,'response',sqlerrm::jsonb);
 when others then return jsonb_build_object('accepted',false,'code',sqlstate,'message',sqlerrm); end;
end $$;
select is(pg_temp.props_try(pg_temp.props_batch('QB_PASS','OVER',50),'two-qb-trial')->>'accepted','true','different players in the same statistic and game are distinct');
select is(pg_temp.props_try(pg_temp.props_batch('QB_PASS','OVER',50)||pg_temp.props_batch('QB_PASS','UNDER',50),'opposed-qb-trial')->>'code','23505','opposing sides for the same player fail atomically');
select is(pg_temp.props_try(pg_temp.props_batch('QB_PASS','OVER',49),'props-minimum-trial')->>'accepted','false','props share the 50-credit minimum');
select is(pg_temp.props_try(pg_temp.props_batch('QB_PASS','OVER',500),'props-over-budget')->>'accepted','false','mixed original allocation cannot be exceeded');
select lives_ok($$update props_context set response=api.accept_stage1_card(slug,pg_temp.props_batch('QB_PASS','OVER',100),'props-qb-batch-01')$$,'both mapped QBs accepted through original shared public authority');
select is(response->>'allocatedCredits','300','game and prop batches share original credits') from props_context;
select is(pg_temp.props_try(pg_temp.props_batch('QB_PASS','UNDER',50),'props-opposing-later')->>'code','23505','repeat or opposing same-player selection rejected across batches');
select is((select count(*) from private.position_receipts where card_id=c.card_id and subject_id is not null),2::bigint,'failed mixed/duplicate submissions create no extra receipts') from props_context c;
select ok(bool_and(r.receipt_serialization_version=2 and r.receipt_canonical_json->>'subjectId'=r.subject_id::text
 and r.receipt_hash=encode(extensions.digest(private.canonical_ruleset_json(r.receipt_canonical_json),'sha256'),'hex')),
 'prop receipts retain canonical subject/team/accepted economics and verified v2 hashes') from private.position_receipts r where card_id=(select card_id from props_context) and subject_id is not null;
select is((select to_jsonb(r) from private.position_receipts r where r.id=(original->>'id')::uuid),original,'legacy receipt remains byte-for-byte unchanged after prop acceptance') from props_legacy_receipt;
select is(api.accept_stage1_card(slug,pg_temp.props_batch('QB_PASS','OVER',100),'props-qb-batch-01')->>'replayed','true','response-loss retry returns original accepted prop batch') from props_context;
select ok(private.rolling_card_can_submit(card_id),'remaining structural subjects keep entry open') from props_context;
create function pg_temp.props_structural_trial() returns boolean language plpgsql as $$
declare b jsonb; result boolean; begin
 begin
  -- Close every other game, exhaust all main opportunities on this game and
  -- remove transient prop heads. Published unselected players must still count.
  update private.sports_events set scheduled_start_at=(select private.card_confirmation_time(season_id) from props_context)-interval '1 minute'
   where week_id=(select week_id from props_context) and id<>(select event_id from props_context);
  select jsonb_agg(jsonb_build_object('marketSnapshotId',q.id,'payloadHash',q.payload_hash,'stakeCredits',50)) into b
   from private.live_quote_heads h join private.market_snapshots q on q.id=h.market_snapshot_id
   where h.event_id=(select event_id from props_context) and h.market_type in('SPREAD','TOTAL') and h.outcome_key in('HOME','OVER');
  perform api.accept_stage1_card((select slug from props_context),b,'props-structural-main');
  delete from private.live_quote_heads where week_id=(select week_id from props_context) and subject_id is not null;
  result:=private.rolling_card_can_submit((select card_id from props_context));
  raise exception using errcode='ZX001',message=result::text;
 exception when sqlstate 'ZX001' then return sqlerrm::boolean; end;
end; $$;
select ok(pg_temp.props_structural_trial(),'known unselected props remain structural opportunities after all main opportunities close and quotes disappear');

update private.player_prop_controls set offers_enabled=false;
select is(pg_temp.props_try(pg_temp.props_batch('RB_RUSH','OVER',50),'disabled-prop-trial')->>'accepted','false','safe disable rejects new props');
select is((select count(*) from private.position_receipts where card_id=c.card_id),3::bigint,'safe disable retains immutable accepted game and prop receipts') from props_context c;
select is((api.get_league_matchup_cards(slug,week_id)#>'{cards,0,positions}')::text,'[]','before reliable start no individual positions are revealed') from props_context;
select * from finish();
rollback;
