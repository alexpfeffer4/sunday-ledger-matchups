begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create temporary table smoke_baseline as select jsonb_build_object(
 'jobs',(select count(*) from private.player_result_jobs),
 'observations',(select count(*) from private.player_result_observations),
 'evidence',(select count(*) from private.player_evidence_bundles),
 'mappings',(select count(*) from private.player_result_event_mappings),
 'catalog_jobs',(select count(*) from private.player_catalog_jobs),
 'catalog_sources',(select count(*) from private.player_catalog_sources),
 'subjects',(select count(*) from private.player_subjects),
 'menus',(select count(*) from private.week_player_menu),
 'quotes',(select count(*) from private.market_snapshots),
 'receipts',(select count(*) from private.position_receipts)) counts;
create temporary table smoke_context(run_id uuid,request_id uuid,response jsonb);
insert into smoke_context default values;
create function pg_temp.smoke_report() returns jsonb language sql as $$
 select '{"coverageAvailable":true,"gameIdentityVerified":true,"bothRostersAvailable":true,"boxScoreShapeValid":true,"matchingPlayerCount":3,"passingRows":1,"rushingRows":1,"receivingRows":1,"offensiveActivityRows":2,"missingMappedPlayers":3,"completenessValidated":false,"dnpValidated":false,"correctionValidated":false}'::jsonb;
$$;
create function pg_temp.smoke_sample() returns jsonb language sql as $$
 select '{"gameId":"10","awayTeamId":"1","homeTeamId":"2"}'::jsonb;
$$;
create function pg_temp.ready_smoke(p_key text) returns uuid language plpgsql as $$
declare r jsonb;id uuid;
begin
 r:=api.claim_player_source_smoke(p_key);
 if r->>'status'<>'CLAIMED' then raise exception 'Test claim failed: %',r;end if;
 id:=(r->>'smokeRunId')::uuid;
 perform api.complete_player_statistics_status(id,true,100,0,clock_timestamp());
 return id;
end;$$;
create function pg_temp.complete_smoke_requests(p_run_id uuid,p_count integer) returns void language plpgsql as $$
declare request_id uuid;i integer;
begin
 for i in 1..p_count loop
  request_id:=api.reserve_player_source_smoke_request(p_run_id);
  -- Empty observation marker records transport success for METADATA only. It
  -- never reaches the competitive result importer through this request class.
  perform api.complete_player_result_request(request_id,'[]'::jsonb,null,8,null);
 end loop;
end;$$;

select ok(not processing_enabled and not metadata_enabled and not api_sports_contract_validated and not nflverse_contract_validated,'all source and processing flags start false') from private.player_result_policy;
select is((select offers_enabled from private.player_prop_controls),false,'diagnostics begin with offers disabled');
select ok(not has_function_privilege('anon','api.claim_player_source_smoke(text)','execute'),'anonymous visitors cannot start diagnostics');
select ok(not has_function_privilege('authenticated','api.reserve_player_source_smoke_request(uuid)','execute'),'members cannot spend diagnostic quota');
select ok(not has_function_privilege('authenticated','api.complete_player_source_smoke(uuid,text,jsonb,jsonb,text,text)','execute'),'members cannot attest diagnostic reports');
select ok(not has_table_privilege('service_role','private.player_source_smoke_runs','select'),'private sample identifiers are available only through operator access');
select ok(not has_table_privilege('authenticated','private.player_source_smoke_runs','select'),'members cannot read diagnostic samples');
select throws_ok($$select api.reserve_player_metadata_request()$$,'55000','Statistics metadata requests unavailable.','ordinary metadata remains disabled');
select throws_ok($$select api.reserve_player_source_smoke_request(null)$$,'P0001','SMOKE_LEASE_UNAVAILABLE','a null diagnostic ID cannot fall through to ordinary metadata authority');
select throws_ok($$select api.claim_player_source_smoke('bad key')$$,'P0001','INVALID_SMOKE_OPERATION','operation keys are bounded opaque identities');

update smoke_context set response=api.claim_player_source_smoke('smoke-success-2026');
update smoke_context set run_id=(response->>'smokeRunId')::uuid;
select is((select response->>'status' from smoke_context),'CLAIMED','disabled source admits one isolated diagnostic lease');
select is((select response->>'season' from smoke_context),'2026','diagnostic scope is fixed to the 2026 season');
select is(api.claim_player_source_smoke('smoke-success-2026')->>'status','BUSY','duplicate active operation does not get a second lease');
select is(api.claim_player_source_smoke('smoke-other-active')->>'status','BUSY','another operation shares the same global diagnostic lease');
select is((select count(*) from private.player_source_smoke_runs),1::bigint,'busy retries create no extra run');
select throws_ok($$select api.reserve_player_source_smoke_request(run_id) from smoke_context$$,'P0001','SMOKE_ACCOUNT_UNVERIFIED','charged work requires fresh account-status completion for this lease');
select throws_ok($$select api.complete_player_statistics_status(run_id,true,100,0,clock_timestamp()-interval '2 minutes') from smoke_context$$,'22023','Statistics status observation invalid.','older account proof cannot unlock new diagnostic work');
select api.complete_player_statistics_status(run_id,true,100,0,clock_timestamp()) from smoke_context;
select ok(not processing_enabled and not metadata_enabled and not api_sports_contract_validated and not nflverse_contract_validated,'quota-free account proof does not validate a source or enable workers') from private.player_result_policy;
select throws_ok($$select api.complete_player_source_smoke(run_id,'CHECKED',pg_temp.smoke_report(),pg_temp.smoke_sample()) from smoke_context$$,'P0001','INVALID_SMOKE_REPORT','a report cannot claim the five-call sample without five successful requests');
select pg_temp.complete_smoke_requests(run_id,5) from smoke_context;
select is((select count(*) from private.player_result_requests where source_smoke_run_id=(select run_id from smoke_context)),5::bigint,'sample uses exactly five separately reserved requests');
select is((select count(*) from private.player_result_requests where source_smoke_run_id=(select run_id from smoke_context) and request_class='METADATA' and completed_at is not null and succeeded),5::bigint,'all five share the existing metadata ledger and completion authority');
select is((select provider_remaining from private.player_result_policy),95,'five reserved requests reduce conservative headroom by five');
select throws_ok($$select api.reserve_player_source_smoke_request(run_id) from smoke_context$$,'P0001','SMOKE_REQUEST_LIMIT','a sixth request cannot enter the same sample');
select throws_ok($$select api.complete_player_source_smoke(run_id,'CHECKED',pg_temp.smoke_report()||'{"rawPayload":{"name":"private"}}',pg_temp.smoke_sample()) from smoke_context$$,'P0001','INVALID_SMOKE_REPORT','raw source fields are rejected at persistence');
select throws_ok($$select api.complete_player_source_smoke(run_id,'CHECKED',pg_temp.smoke_report()||'{"completenessValidated":true}',pg_temp.smoke_sample()) from smoke_context$$,'P0001','INVALID_SMOKE_REPORT','a completed game sample cannot claim final-stat completeness');
select throws_ok($$select api.complete_player_source_smoke(run_id,'CHECKED',pg_temp.smoke_report()||'{"dnpValidated":true}',pg_temp.smoke_sample()) from smoke_context$$,'P0001','INVALID_SMOKE_REPORT','a sample cannot claim DNP validation');
select throws_ok($$select api.complete_player_source_smoke(run_id,'CHECKED',pg_temp.smoke_report()-'matchingPlayerCount',pg_temp.smoke_sample()) from smoke_context$$,'P0001','INVALID_SMOKE_REPORT','missing required summary fields fail closed');
select throws_ok($$select api.complete_player_source_smoke(run_id,'CHECKED',pg_temp.smoke_report()||'{"gameIdentityVerified":false}',pg_temp.smoke_sample()) from smoke_context$$,'P0001','INVALID_SMOKE_REPORT','failed identity cannot be persisted as checked');
select throws_ok($$select api.complete_player_source_smoke(run_id,'CHECKED',pg_temp.smoke_report(),pg_temp.smoke_sample()||'{"playerName":"private"}') from smoke_context$$,'P0001','INVALID_SMOKE_SAMPLE','private sample storage accepts only the three scoped numeric IDs');
update smoke_context set response=api.complete_player_source_smoke(run_id,'CHECKED',pg_temp.smoke_report(),pg_temp.smoke_sample());
select is((select response->>'status' from smoke_context),'CHECKED','bounded success persists the sanitized report');
select ok((select not(response ? 'sample') and not(response ? 'gameId') from smoke_context),'response never returns private sample IDs');
select is((select report from private.player_source_smoke_runs where id=(select run_id from smoke_context)),pg_temp.smoke_report(),'only the exact safe report is retained');
select is((select sample from private.player_source_smoke_runs where id=(select run_id from smoke_context)),pg_temp.smoke_sample(),'minimal private sample references support later operator validation');
select is(api.claim_player_source_smoke('smoke-success-2026'),(select response from smoke_context),'completed operation replays without new quota work');
select is((select count(*) from private.player_result_requests),5::bigint,'success replay does not reserve another request');

update smoke_context set run_id=pg_temp.ready_smoke('smoke-failure-2026');
update smoke_context set request_id=api.reserve_player_source_smoke_request(run_id);
select api.complete_player_result_request(request_id,null,null,null,null) from smoke_context;
select is((select provider_remaining from private.player_result_policy),99,'unknown failure preserves its conservative charge');
select is((select succeeded from private.player_result_requests where id=(select request_id from smoke_context)),false,'failed request is recorded without synthetic evidence');
select api.complete_player_source_smoke(run_id,'UNAVAILABLE',null,null,'COVERAGE','SOURCE_UNAVAILABLE') from smoke_context;
select is(api.claim_player_source_smoke('smoke-failure-2026')->>'status','UNAVAILABLE','failed operation replays instead of retrying provider calls');
update smoke_context set run_id=pg_temp.ready_smoke('smoke-expiry-2026');
update smoke_context set request_id=api.reserve_player_source_smoke_request(run_id);
update private.player_source_smoke_runs set expires_at=clock_timestamp()-interval '1 second' where id=(select run_id from smoke_context);
select throws_ok($$select api.reserve_player_source_smoke_request(run_id) from smoke_context$$,'P0001','SMOKE_LEASE_UNAVAILABLE','expired run cannot reserve additional requests');
select is((select api.complete_player_source_smoke(run_id,'CHECKED',pg_temp.smoke_report(),pg_temp.smoke_sample())->>'failureCode' from smoke_context),'LEASE_EXPIRED','late completion cannot become checked');
select is((select provider_remaining from private.player_result_policy),99,'expired in-flight request is not refunded');
select is((select count(*) from private.player_result_requests),7::bigint,'failed and expired attempts remain in shared accounting');

-- Simulate elapsed minutes without changing request classes or deleting charges.
update private.player_result_requests set reserved_at=clock_timestamp()-interval '2 minutes';
update smoke_context set run_id=pg_temp.ready_smoke('smoke-rate-2026');
update smoke_context set request_id=api.reserve_player_source_smoke_request(run_id);
select api.complete_player_result_request(request_id,'[]',null,1,null) from smoke_context;
select is((select requests_per_minute from private.player_result_policy),1,'lower observed provider minute limit is retained');
select throws_ok($$select api.reserve_player_source_smoke_request(run_id) from smoke_context$$,'55000','Statistics metadata budget exhausted.','diagnostic honors the observed lower minute limit');
update private.player_result_policy set requests_per_minute=8;
insert into private.player_result_requests(request_class,completed_at) select 'RESULT',clock_timestamp() from generate_series(1,7);
select throws_ok($$select api.reserve_player_source_smoke_request(run_id) from smoke_context$$,'55000','Statistics metadata budget exhausted.','the eight-per-minute ceiling includes ordinary result work');
delete from private.player_result_requests where request_class='RESULT' and external_event_id is null;
update private.player_result_requests set reserved_at=clock_timestamp()-interval '2 minutes';
update smoke_context set request_id=api.reserve_player_source_smoke_request(run_id);
select api.complete_player_result_request(request_id,null,80,3,120) from smoke_context;
select ok(blocked_until>clock_timestamp()+interval '1 minute' and requests_per_minute=3,'429 accounting retains provider backoff and the lower limit') from private.player_result_policy;
select throws_ok($$select api.reserve_player_source_smoke_request(run_id) from smoke_context$$,'55000','Statistics metadata requests unavailable.','backoff blocks subsequent diagnostic network reservations');
select api.complete_player_source_smoke(run_id,'DEFERRED',null,null,'AWAY_ROSTER','BUDGET_DEFERRED') from smoke_context;
select is(api.claim_player_source_smoke('smoke-blocked-2026')->>'status','DEFERRED','new operations cannot evade provider backoff');
update private.player_result_policy set blocked_until=null,requests_per_minute=8;
update private.player_result_requests set reserved_at=clock_timestamp()-interval '2 minutes';

update smoke_context set run_id=pg_temp.ready_smoke('smoke-priority-2026');
update private.player_result_policy set metadata_daily_limit=0;
select throws_ok($$select api.reserve_player_source_smoke_request(run_id) from smoke_context$$,'55000','Statistics metadata budget exhausted.','the shared metadata daily cap also applies to isolated diagnostics');
update private.player_result_policy set metadata_daily_limit=20;
-- Disposable due-job fixture tests priority only; diagnostic functions themselves
-- never create a mapping, accepted receipt, source approval, or result job.
insert into private.player_result_event_mappings(external_event_id,api_sports_event_id,nflverse_event_id,game_date,away_team,home_team,verified_at,evidence_hash)
 values('smoke-priority-fixture','9001','2026_01_A_B',current_date,'A','B',clock_timestamp(),repeat('a',64));
insert into private.player_result_jobs(external_event_id,final_observed_at,next_attempt_at)
 values('smoke-priority-fixture',clock_timestamp(),clock_timestamp()-interval '1 minute');
update private.player_result_policy set processing_enabled=true,api_sports_contract_validated=true;
select throws_ok($$select api.reserve_player_source_smoke_request(run_id) from smoke_context$$,'55000','Accepted player results have priority.','due result work retains priority over diagnostic metadata');
update private.player_result_policy set processing_enabled=false,api_sports_contract_validated=false;
delete from private.player_result_jobs where external_event_id='smoke-priority-fixture';
delete from private.player_result_event_mappings where external_event_id='smoke-priority-fixture';
select pg_temp.complete_smoke_requests(run_id,3) from smoke_context;
select api.complete_player_source_smoke(run_id,'DEFERRED',null,null,'BOX_SCORE','BUDGET_DEFERRED') from smoke_context;
update private.player_result_requests set reserved_at=clock_timestamp()-interval '2 minutes';
update smoke_context set run_id=pg_temp.ready_smoke('smoke-second-complete');
select pg_temp.complete_smoke_requests(run_id,5) from smoke_context;
select api.complete_player_source_smoke(run_id,'CHECKED',pg_temp.smoke_report(),pg_temp.smoke_sample()) from smoke_context;
update private.player_result_requests set reserved_at=clock_timestamp()-interval '2 minutes';
update smoke_context set run_id=pg_temp.ready_smoke('smoke-rollout-ceiling');
select pg_temp.complete_smoke_requests(run_id,3) from smoke_context;
select is((select count(*) from private.player_result_requests where source_smoke_run_id is not null),20::bigint,'all runs together reserve at most twenty charged requests for this rollout');
select throws_ok($$select api.reserve_player_source_smoke_request(run_id) from smoke_context$$,'P0001','SMOKE_REQUEST_LIMIT','aggregate ceiling blocks further work even before this run reaches five');
select api.complete_player_source_smoke(run_id,'DEFERRED',null,null,'HOME_ROSTER','BUDGET_DEFERRED') from smoke_context;
select is(api.claim_player_source_smoke('smoke-over-ceiling')->>'status','LIMIT','a new operation key cannot reset the aggregate ceiling');
update private.player_result_policy set provider_window_date=(clock_timestamp() at time zone 'UTC')::date-1;
select is(api.claim_player_source_smoke('smoke-next-day-ceiling')->>'status','LIMIT','UTC quota rollover cannot reset the rollout-wide ceiling');
select ok(not processing_enabled and not metadata_enabled and not api_sports_contract_validated and not nflverse_contract_validated,'all readiness flags remain false after the diagnostic workflow') from private.player_result_policy;
select is((select offers_enabled from private.player_prop_controls),false,'diagnostics never enable live offers');
select is(jsonb_build_object(
 'jobs',(select count(*) from private.player_result_jobs),
 'observations',(select count(*) from private.player_result_observations),
 'evidence',(select count(*) from private.player_evidence_bundles),
 'mappings',(select count(*) from private.player_result_event_mappings),
 'catalog_jobs',(select count(*) from private.player_catalog_jobs),
 'catalog_sources',(select count(*) from private.player_catalog_sources),
 'subjects',(select count(*) from private.player_subjects),
 'menus',(select count(*) from private.week_player_menu),
 'quotes',(select count(*) from private.market_snapshots),
 'receipts',(select count(*) from private.position_receipts)),(select counts from smoke_baseline),'diagnostic workflow creates no competitive data, jobs, source caches, catalog, menu or quotes');
select * from finish();
rollback;
