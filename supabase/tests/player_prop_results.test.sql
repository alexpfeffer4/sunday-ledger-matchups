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

-- Results extend the exact same accepted receipts and authoritative rebuild.
-- Simulated timestamps are test fixtures; no network or new settlement engine.
select ok(not (select processing_enabled from private.player_result_policy),'result jobs remain disabled by migration');
select function_privs_are('api','import_player_result_observations',array['jsonb'],'authenticated',array[]::text[],'members cannot author raw statistics');
select function_privs_are('api','claim_player_result_jobs',array[]::text[],'anon',array[]::text[],'anonymous cannot claim provider jobs');
select table_privs_are('private','player_result_observations','authenticated',array[]::text[],'raw player evidence is not directly readable');
select table_privs_are('private','player_evidence_bundles','authenticated',array[]::text[],'raw evidence bundle does not widen member access');
select is((select count(*) from private.grade_player_prop_receipt('OVER',50000,-110,100,'FINAL',null,false,'UNKNOWN',false)),0::bigint,'pending player evidence emits no settlement row');
select is((select outcome from private.grade_player_prop_receipt('UNDER',0,-110,100,'FINAL',-5,true,'OFFENSE',true)),'WIN','negative individual yards grade normally');
select is((select outcome from private.grade_player_prop_receipt('OVER',0,-110,100,'FINAL',0,true,'OFFENSE',true)),'PUSH','verified zero equality pushes');
select is((select outcome from private.grade_player_prop_receipt('OVER',50000,-110,100,'FINAL',null,false,'NO_OFFENSE',true)),'VOID','verified zero offensive snaps void without fabricating zero yards');
select is((select count(*) from private.grade_player_prop_receipt('OVER',50000,-110,100,'FINAL',0,true,'UNKNOWN',false)),0::bigint,'a zero-only stat row does not prove offensive participation');

select api.register_player_result_event(jsonb_build_object('externalEventId',e.fixture_event_key,'apiSportsEventId','99001','nflverseEventId','2026_01_TEST_TEST','gameDate',(e.scheduled_start_at at time zone 'America/New_York')::date,'awayTeam',e.away_team,'homeTeam',e.home_team,'evidenceHash',repeat('b',64)))
 from private.sports_events e where e.id=(select event_id from props_context);
select api.import_player_catalog((select jsonb_agg(jsonb_build_object('canonicalKey',s.canonical_key,'displayName',s.display_name,'position',s.position,'provider',p.provider,'externalEventId',e.fixture_event_key,'externalPlayerId',s.id::text||':'||p.provider,'team',r.subject_team,'gameDate',(e.scheduled_start_at at time zone 'America/New_York')::date,'verifiedAt',clock_timestamp(),'evidenceHash',repeat('c',64),'roleRank',1,'roleEvidence','Verified result fixture identity','resultPathVerified',true))
 from private.position_receipts r join private.player_subjects s on s.id=r.subject_id join private.sports_events e on e.id=r.event_id cross join(values('API_SPORTS'),('NFLVERSE'))p(provider) where r.card_id=(select card_id from props_context)));
create temporary table result_test_subject as select subject_id from private.position_receipts where card_id=(select card_id from props_context) and subject_id is not null order by subject_id limit 1;
create function pg_temp.player_observation(p_subject uuid,p_provider text,p_value integer,p_complete boolean,p_part text,p_minutes integer) returns jsonb language sql as $$
 select jsonb_build_object('provider',p_provider,'externalEventId',e.fixture_event_key,'sourceEventId',case p_provider when 'API_SPORTS' then '99001' else '2026_01_TEST_TEST' end,
 'externalPlayerId',r.subject_id::text||':'||p_provider,'subjectId',r.subject_id,'team',r.subject_team,'gameDate',(e.scheduled_start_at at time zone 'America/New_York')::date,
 'statistic',r.statistic,'period','FULL_GAME','value',p_value,'complete',p_complete,'participation',p_part,'participationComplete',p_part<>'UNKNOWN',
 'sourceUpdatedAt',clock_timestamp()-make_interval(mins=>p_minutes),'fetchedAt',clock_timestamp(),'contentHash',repeat('d',64))
 from private.position_receipts r join private.sports_events e on e.id=r.event_id where r.card_id=(select card_id from props_context) and r.subject_id=p_subject limit 1;
$$;
update private.seasons set simulated_now=(select scheduled_start_at+interval '1 minute' from private.sports_events where id=(select event_id from props_context)) where id=(select season_id from props_context);
select is((select state from private.season_weeks where id=(select week_id from props_context)),'OPEN','rolling week remains open while an earlier game finishes');
select ok(not private.rolling_week_entries_closed((select week_id from props_context)),'later published game still has entry opportunities');
update private.sports_events set state='LIVE',actual_started_at=scheduled_start_at where id=(select event_id from props_context);
select lives_ok($$select private.record_stage1_result_as((select owner_id from props_context),(select event_id from props_context),'FINAL',24,21,'Deterministic final fixture with missing player data.','SIMULATION_FIXTURE','props-final-teams')$$,'team-final import leaves unresolved props pending');
select is((select count(*) from private.settlement_versions sv join private.position_receipts r on r.id=sv.receipt_id where r.card_id=c.card_id and r.subject_id is not null),0::bigint,'team final creates no false settled player rows') from props_context c;
select ok(not (select is_complete from private.weekly_score_versions where card_id=c.card_id order by created_at desc,id desc limit 1),'pending props prevent a complete card score') from props_context c;
select isnt((select state from private.season_weeks where id=c.week_id),'FINAL','pending props block week finality') from props_context c;
select lives_ok($$select api.import_player_result_observations(jsonb_build_array(pg_temp.player_observation((select subject_id from result_test_subject),'API_SPORTS',100,true,'OFFENSE',10)))$$,'verified initial player evidence imports privately');
select private.reconcile_player_event((select event_id from props_context));
select is((select count(*) from private.player_evidence_bundles where event_id=c.event_id),1::bigint,'complete offensive evidence creates immutable initial bundle') from props_context c;
select is((select state from private.season_weeks where id=(select week_id from props_context)),'OPEN','earlier player results settle without closing later entries');
select is((select outcome from private.settlement_versions sv join private.position_receipts r on r.id=sv.receipt_id where r.subject_id=(select subject_id from result_test_subject) order by sv.created_at desc,sv.id desc limit 1),'WIN','existing grade/return authority settles over correctly');
create temporary table original_player_result as select count(*) n from private.event_result_versions where event_id=(select event_id from props_context);
create temporary table duplicate_observation as select pg_temp.player_observation((select subject_id from result_test_subject),'API_SPORTS',50,true,'OFFENSE',5) observation;
select api.import_player_result_observations(jsonb_build_array(observation)) from duplicate_observation;
select private.reconcile_player_event((select event_id from props_context));
select is((select count(*) from private.player_evidence_bundles where event_id=c.event_id),2::bigint,'stat-only correction creates successor bundle with unchanged team score') from props_context c;
select is((select outcome from private.settlement_versions sv join private.position_receipts r on r.id=sv.receipt_id where r.subject_id=(select subject_id from result_test_subject) order by sv.created_at desc,sv.id desc limit 1),'LOSS','stat-only correction changes settlement using original accepted line');
select api.import_player_result_observations(jsonb_build_array(observation)) from duplicate_observation;
select private.reconcile_player_event((select event_id from props_context));
select is((select count(*) from private.player_evidence_bundles where event_id=c.event_id),2::bigint,'duplicate evidence does not duplicate settlement returns') from props_context c;
select api.import_player_result_observations(jsonb_build_array(pg_temp.player_observation((select subject_id from result_test_subject),'API_SPORTS',999,true,'OFFENSE',20)));
select private.reconcile_player_event((select event_id from props_context));
select is((select count(*) from private.player_evidence_bundles where event_id=c.event_id),2::bigint,'older provider revision cannot supersede newer authority') from props_context c;
select api.import_player_result_observations(jsonb_build_array(pg_temp.player_observation((select subject_id from result_test_subject),'NFLVERSE',51,true,'OFFENSE',4)));
select private.reconcile_player_event((select event_id from props_context));
select is((select count(*) from private.player_evidence_bundles where event_id=c.event_id),2::bigint,'source disagreement is not last-write-wins') from props_context c;
select ok(exists(select 1 from private.player_result_candidates where event_id=c.event_id and reason='SOURCE_STATISTIC_DISAGREEMENT'),'disagreement raises an objective correction candidate') from props_context c;
select api.import_player_result_observations(jsonb_build_array(pg_temp.player_observation((select subject_id from result_test_subject),'NFLVERSE',50,true,'NO_OFFENSE',3)));
select private.reconcile_player_event((select event_id from props_context));
select lives_ok($$select api.resolve_player_result_candidate((select id from private.player_result_candidates where event_id=(select event_id from props_context) order by created_at desc,id desc limit 1),
 (select id from private.player_result_observations where provider='NFLVERSE' order by source_updated_at desc limit 1),(select id from private.player_result_observations where provider='NFLVERSE' order by source_updated_at desc limit 1),'Verified offensive participation correction fixture.')$$,'commissioner resolves conflicting participation with verified immutable evidence');
select is((select outcome from private.settlement_versions sv join private.position_receipts r on r.id=sv.receipt_id where r.subject_id=(select subject_id from result_test_subject) order by sv.created_at desc,sv.id desc limit 1),'VOID','participation-only revision creates successor void settlement');
select is((select count(*) from private.event_result_versions where event_id=(select event_id from props_context)),(select n from original_player_result),'player corrections never invent changed team-score revisions');
select throws_ok($$update private.player_result_observations set value=123$$,'55000',null,'player observations are append-only');
select throws_ok($$delete from private.player_evidence_bundles$$,'55000',null,'settlement bundles are append-only');
select is((select to_jsonb(r) from private.position_receipts r where r.id=(original->>'id')::uuid),original,'settlement revisions preserve legacy accepted receipt bytes') from props_legacy_receipt;

-- Missing source revision never makes arrival order authoritative.
select api.import_player_result_observations(jsonb_build_array(jsonb_set(pg_temp.player_observation((select subject_id from result_test_subject),'API_SPORTS',999,true,'OFFENSE',1),'{sourceUpdatedAt}','null')));
select private.reconcile_player_event((select event_id from props_context));
select ok(exists(select 1 from private.player_result_candidates where event_id=c.event_id and reason='SOURCE_REVISION_ORDER_UNVERIFIED'),'unordered provider content change becomes a review candidate') from props_context c;
select is((select count(*) from private.player_evidence_bundles where event_id=c.event_id),3::bigint,'unordered data cannot overwrite accepted player authority') from props_context c;
select ok(exists(select 1 from private.corrections where event_id=c.event_id and corrected_player_evidence_bundle_id is not null and original_result_version_id=corrected_result_version_id),'player revisions enter existing correction audit without fake team score changes') from props_context c;

-- Protected correction boundary is inherited and never restarted for props.
update private.season_weeks set state='PROVISIONAL',correction_window_closes_at=(select private.stage1_season_time(season_id) from props_context)-interval '1 second' where id=(select week_id from props_context);
create temporary table protected_player_deadline as select correction_window_closes_at deadline from private.season_weeks where id=(select week_id from props_context);
select throws_ok($$select private.publish_player_evidence((select event_id from props_context),(select subject_id from result_test_subject),'PASSING_YARDS',(select id from private.player_result_observations where provider='API_SPORTS' and value=50 limit 1),(select id from private.player_result_observations where provider='API_SPORTS' and value=50 limit 1),'Late protected correction fixture.')$$,'55000',null,'late player correction cannot silently change protected results');
select is((select correction_window_closes_at from private.season_weeks where id=(select week_id from props_context)),(select deadline from protected_player_deadline),'player corrections do not restart the correction clock');

-- Provider daily rollover restores documented allowance, retaining every request.
update private.player_result_policy set provider_remaining=0,provider_window_date=(clock_timestamp() at time zone 'UTC')::date-1;
create temporary table old_player_request as with inserted as (insert into private.player_result_requests(request_class,reserved_at) values('METADATA',clock_timestamp()-interval '1 day') returning id) select id from inserted;
select private.roll_player_result_budget_day();
select is((select provider_remaining from private.player_result_policy),100,'new documented UTC provider day restores bounded allowance');
select api.complete_player_result_request((select id from old_player_request),null,0,null,null);
select is((select provider_remaining from private.player_result_policy),100,'late response from old provider day cannot poison new allowance');
select is((select count(*) from private.player_result_requests where id=(select id from old_player_request)),1::bigint,'provider rollover never clears historical request accounting');
select function_privs_are('api','resolve_finalized_week17_player_candidate',array['uuid','uuid','uuid','text'],'anon',array[]::text[],'protected Week17 player corrections require authenticated commissioner authority');
select throws_ok($$select api.resolve_finalized_week17_player_candidate((select id from private.player_result_candidates order by created_at desc,id desc limit 1),null,(select id from private.player_result_observations order by created_at desc,id desc limit 1),'Invalid nonterminal correction fixture.')$$,'55000',null,'protected Week17 path rejects ordinary closed regular-season weeks');

-- Independent 80-result/20-metadata budget; unknown network failures stay charged.
select is(api.claim_player_result_jobs()->>'status','DISABLED','empty disabled scheduler is a cheap no-provider run');
update private.player_result_policy set processing_enabled=true,api_sports_contract_validated=true;
insert into private.player_result_requests(request_class,reserved_at) select 'RESULT',clock_timestamp()-interval '2 minutes' from generate_series(1,80);
select is(api.claim_player_result_jobs()->>'status','BUDGET','80 reserved result calls exhaust only result budget');
select lives_ok($$select api.reserve_player_metadata_request()$$,'the separate metadata reserve remains available after 80 result attempts');
insert into private.player_result_requests(request_class,reserved_at) select 'METADATA',clock_timestamp()-interval '2 minutes' from generate_series(1,19);
select throws_ok($$select api.reserve_player_metadata_request()$$,'55000',null,'all metadata calls share enforced 20/day reserve');
select * from finish();
rollback;
