begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select is((select source_policy from private.player_result_policy),'API_SPORTS_NFLVERSE','migration retains existing source policy');
select ok(not private.player_source_policy_validated(),'unvalidated defaults cannot acquire pilot');
select function_privs_are('private','configure_nflverse_primary_pilot',array['text','text'],'authenticated',array[]::text[],'member cannot change source policy');
select function_privs_are('api','resolve_verified_player_result_exception',array['uuid','uuid','text','integer','integer','text','text','text','uuid','text','text'],'authenticated',array[]::text[],'member cannot inject exception evidence');
select function_privs_are('api','resolve_verified_player_result_exception',array['uuid','uuid','text','integer','integer','text','text','text','uuid','text','text'],'service_role',array['EXECUTE'],'only the trusted operator receives exception execution');
select throws_ok($$select private.configure_nflverse_primary_pilot('bad','Approved pilot fixture')$$,'22023',null,'policy requires exact validation SHA');
select lives_ok($$select private.configure_nflverse_primary_pilot(repeat('a',64),'Approved restricted featured-lines pilot fixture')$$,'explicit validated policy can be recorded before any props');
select is(private.configure_nflverse_primary_pilot(repeat('a',64),'Approved restricted featured-lines pilot fixture')->>'replayed','true','same approval replays without rewriting evidence');
select throws_ok($$select private.configure_nflverse_primary_pilot(repeat('b',64),'Approved restricted featured-lines pilot fixture')$$,'22000',null,'different validation cannot silently replace recorded policy');
select ok(not (select processing_enabled or metadata_enabled or nflverse_contract_validated or api_sports_contract_validated from private.player_result_policy),'recording policy activates no contracts or workers');
select throws_ok($$update private.player_source_validations set approval_reference='Different approval fixture'$$,'55000',null,'validation audit is immutable');
update private.player_result_policy set nflverse_contract_validated=true,metadata_enabled=true,processing_enabled=true;
select ok(private.player_source_policy_validated(),'primary pilot validates without API-Sports subscription');
select is(api.claim_player_result_jobs()->>'status','DISABLED','pilot never calls API-Sports results');
select is(api.claim_player_statistics_status()->>'status','DISABLED','pilot never calls API-Sports status');
select throws_ok($$select api.reserve_player_metadata_request()$$,'55000',null,'pilot cannot reserve API-Sports metadata');
select is(api.claim_player_catalog_source('NFLVERSE:2026')->>'status','DISABLED','pilot cannot mix old dual-source cache');
select is(api.claim_player_catalog_source('GAMES:2026')->>'status','DISABLED','pilot cannot request API-Sports schedule');
create temporary table pilot_cache as select api.claim_player_catalog_source('NFLVERSE_PRIMARY:2026') response;
select is((select response->>'status' from pilot_cache),'CLAIMED','pilot obtains dedicated NFLVERSE source lease');
select api.complete_player_catalog_source('NFLVERSE_PRIMARY:2026',(select (response->>'leaseId')::uuid from pilot_cache),'{"validatedFixture":true}');
select is(api.claim_player_catalog_source('NFLVERSE_PRIMARY:2026')->>'status','CACHED','dedicated pilot cache replays');

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
update private.player_prop_controls set offers_enabled=false;
select is(pg_temp.props_try(pg_temp.props_batch('RB_RUSH','OVER',50),'disabled-prop-trial')->>'accepted','false','safe disable rejects new props');
select is((select count(*) from private.position_receipts where card_id=c.card_id),3::bigint,'safe disable retains immutable accepted game and prop receipts') from props_context c;
select is((api.get_league_matchup_cards(slug,week_id)#>'{cards,0,positions}')::text,'[]','before reliable start no individual positions are revealed') from props_context;


select ok(bool_and(source_policy='NFLVERSE_PRIMARY' and selection_policy='FEATURED_HIGHEST_STANDARD_LINES' and source_validation_id is not null),'menu freezes explicit approved source and selection policy') from private.week_player_menu;
select throws_ok($$update private.week_player_menu set source_policy='API_SPORTS_NFLVERSE' where frozen_at is not null$$,'55000',null,'frozen menu cannot change source policy');
select throws_ok($$update private.player_result_policy set source_policy='API_SPORTS_NFLVERSE',selection_policy='LEGACY_ROLE_PRIORITY',source_validation_id=null$$,'55000',null,'accepted props prevent replacing source policy');
select lives_ok($$select api.register_player_result_event(jsonb_build_object('externalEventId',e.fixture_event_key,'apiSportsEventId',null,'nflverseEventId','2026_01_BUF_NYJ','gameDate',(e.scheduled_start_at at time zone 'America/New_York')::date,'awayTeam',e.away_team,'homeTeam',e.home_team,'evidenceHash',repeat('b',64))) from private.sports_events e where e.id=(select event_id from props_context)$$,'NFLVERSE crosswalk registers without fabricated API-Sports ID');
select ok((select api_sports_event_id is null and source_policy='NFLVERSE_PRIMARY' and source_validation_id is not null from private.player_result_event_mappings),'crosswalk persists honest provider and validation identity');
select api.import_player_catalog((select jsonb_agg(jsonb_build_object('canonicalKey',s.canonical_key,'displayName',s.display_name,'position',s.position,'provider','NFLVERSE','externalEventId',e.fixture_event_key,'externalPlayerId',s.id::text||':NFLVERSE','team',r.subject_team,'gameDate',(e.scheduled_start_at at time zone 'America/New_York')::date,'verifiedAt',clock_timestamp(),'evidenceHash',repeat('c',64),'roleRank',1,'roleEvidence','Verified result fixture identity','resultPathVerified',true))
 from private.position_receipts r join private.player_subjects s on s.id=r.subject_id join private.sports_events e on e.id=r.event_id where r.card_id=(select card_id from props_context)));
create temporary table pilot_subject as select subject_id,statistic from private.position_receipts where card_id=(select card_id from props_context) and subject_id is not null order by subject_id limit 1;
create function pg_temp.pilot_exception(p_value integer,p_snaps integer,p_key text default 'pilot-exception-01',p_actor uuid default null,p_url text default 'https://www.nfl.com/verified-test-gamebook') returns jsonb language sql as $$
 select api.resolve_verified_player_result_exception(c.event_id,s.subject_id,s.statistic,p_value,p_snaps,p_url,'https://www.pro-football-reference.com/boxscores/verified-test',repeat('d',64),coalesce(p_actor,c.owner_id),'Commissioner verified explicit individual yards and offensive snaps from final evidence.',p_key) from props_context c,pilot_subject s;
$$;
select throws_ok($$select pg_temp.pilot_exception(100,60)$$,'55000',null,'exception cannot settle before verified game final');
update private.seasons set simulated_now=(select scheduled_start_at+interval '1 minute' from private.sports_events where id=(select event_id from props_context)) where id=(select season_id from props_context);
update private.sports_events set state='LIVE',actual_started_at=scheduled_start_at where id=(select event_id from props_context);
select private.record_stage1_result_as((select owner_id from props_context),(select event_id from props_context),'FINAL',24,21,'Final game with unpublished player row fixture.','SIMULATION_FIXTURE','pilot-final-teams');
insert into private.player_result_jobs(external_event_id,final_observed_at,next_reconcile_at)
 select fixture_event_key,clock_timestamp()-interval '2 hours',clock_timestamp() from private.sports_events where id=(select event_id from props_context);
create temporary table pilot_claim as select api.claim_nflverse_reconciliation() response;
select is((select response->>'status' from pilot_claim),'CLAIMED','primary NFLVERSE results lease without API-Sports validation');
select ok((select (response#>>'{jobs,0,context,finalObservedAt}')::timestamptz is not null from pilot_claim),'result lease carries verified final observation time');
select is((select response#>>'{jobs,0,context,awayTeam}' from pilot_claim),'BUF','result completeness context uses NFLVERSE away code');
select is((select response#>>'{jobs,0,context,homeTeam}' from pilot_claim),'NYJ','result completeness context uses NFLVERSE home code');
select api.complete_nflverse_reconciliation((select (response#>>'{jobs,0,leaseId}')::uuid from pilot_claim),'[]');
select isnt((select state from private.player_result_jobs),'COMPLETE','omitted incomplete game stays pending after shared lease completion');
select throws_ok($$select pg_temp.pilot_exception(null,60)$$,'22023',null,'missing yardage cannot become zero');
select throws_ok($$select pg_temp.pilot_exception(100,0)$$,'22023',null,'nonzero yards cannot coexist with no offense');
select throws_ok($$select pg_temp.pilot_exception(100,null)$$,'22023',null,'missing participation cannot become DNP');
select throws_ok($$select pg_temp.pilot_exception(100,60,'pilot-exception-01',gen_random_uuid())$$,'42501',null,'unrelated actor cannot verify evidence');
select throws_ok($$select pg_temp.pilot_exception(100,60,'pilot-exception-01',null,'https://example.com/unsupported')$$,'22023',null,'unverifiable source origin is rejected');
select lives_ok($$select pg_temp.pilot_exception(100,60)$$,'verified exception settles only a missing accepted pilot result');
select is((select count(*) from private.player_verified_exceptions),1::bigint,'exception audit is retained once');
select is((select provider from private.player_result_observations),'VERIFIED_EXCEPTION','exception is honestly labeled separately from NFLVERSE');
select is((select outcome from private.settlement_versions sv join private.position_receipts r on r.id=sv.receipt_id where r.subject_id=(select subject_id from pilot_subject) order by sv.created_at desc limit 1),'WIN','original line and existing grading authority settle verified evidence');
select is(pg_temp.pilot_exception(100,60)->>'replayed','true','exact evidence retry is idempotent');
select throws_ok($$select pg_temp.pilot_exception(101,60)$$,'22000',null,'same operation cannot replace evidence or economics');
select throws_ok($$select pg_temp.pilot_exception(101,60,'pilot-new-exception')$$,'55000',null,'exception cannot override an already complete result');
select is((select count(*) from private.player_evidence_bundles),1::bigint,'failed retries preserve one authoritative evidence bundle');
-- Later automatic data cannot silently overwrite a manually verified exception.
select api.import_player_result_observations((select jsonb_build_array(jsonb_build_object('provider','NFLVERSE','externalEventId',e.fixture_event_key,
 'sourceEventId','2026_01_BUF_NYJ','externalPlayerId',pm.external_player_id,'subjectId',s.subject_id,'team',pm.team,'gameDate',pm.game_date,
 'statistic',s.statistic,'period','FULL_GAME','value',101,'complete',true,'participation','OFFENSE','participationComplete',true,
 'sourceUpdatedAt',clock_timestamp()-interval '1 second','fetchedAt',clock_timestamp(),'contentHash',repeat('e',64)))
 from pilot_subject s,props_context c join private.sports_events e on e.id=c.event_id
 join private.player_provider_mappings pm on pm.external_event_id=e.fixture_event_key and pm.provider='NFLVERSE' where pm.subject_id=s.subject_id));
select private.reconcile_player_event((select event_id from props_context));
select ok(exists(select 1 from private.player_result_candidates where reason='SOURCE_REVISION_ORDER_UNVERIFIED'),'later conflicting source evidence requires review after exception');
select is((select count(*) from private.player_evidence_bundles),1::bigint,'later automatic observation preserves verified result');
select isnt((select state from private.player_result_jobs),'COMPLETE','another missing accepted prop keeps the shared job pending');
update pilot_subject set subject_id=r.subject_id,statistic=r.statistic from private.position_receipts r
 where r.card_id=(select card_id from props_context) and r.subject_id is not null and r.subject_id<>pilot_subject.subject_id;
create function pg_temp.closed_pilot_exception() returns jsonb language plpgsql as $$
begin
 update private.season_weeks set state='PROVISIONAL',correction_window_closes_at=(select private.stage1_season_time(season_id) from props_context)-interval '1 second'
 where id=(select week_id from props_context);
 return pg_temp.pilot_exception(0,30,'pilot-closed-window');
end; $$;
select throws_ok($$select pg_temp.closed_pilot_exception()$$,'55000',null,'verified exception cannot bypass existing correction deadline');
select is((select count(*) from private.player_verified_exceptions),1::bigint,'closed deadline rolls back all exception evidence writes');
update private.player_result_jobs set state='INCIDENT',incident_code='PLAYER_EVIDENCE_REQUIRES_VERIFIED_SOURCE',next_reconcile_at=null;
select lives_ok($$select pg_temp.pilot_exception(0,30,'pilot-final-missing')$$,'explicit zero with positive offensive snaps resolves final missing prop');
select is((select state from private.player_result_jobs),'COMPLETE','last resolved accepted prop closes an expired shared incident');
select ok((select incident_code is null and completed_at is not null from private.player_result_jobs),'completed exception clears outstanding incident without restarting retries');
select * from finish();
rollback;
