begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select ok(to_regprocedure('private.dispatch_player_result_checkpoints()') is not null,'tracked migration installs dormant player dispatcher');
select ok(strpos(pg_get_functiondef('private.dispatch_score_checkpoints()'::regprocedure),'perform private.dispatch_player_result_checkpoints();')>0,'player hook runs before original score early return');
select ok(not (select processing_enabled or metadata_enabled from private.player_result_policy),'migration activates no player worker');
select ok(not (select enabled from private.score_refresh_policy),'migration activates no score worker');
select is(private.dispatch_player_result_checkpoints(),null::bigint,'disabled dispatcher sends no request');
select is(private.dispatch_score_checkpoints(),null::bigint,'disabled core dispatcher still sends no request');
select function_privs_are('private','dispatch_player_result_checkpoints',array[]::text[],'authenticated',array[]::text[],'members cannot invoke private dispatcher');
select function_privs_are('private','attach_player_result_dispatch_hook',array[]::text[],'authenticated',array[]::text[],'members cannot alter the core hook');
create temporary table dispatch_original as select pg_get_functiondef('private.dispatch_score_checkpoints()'::regprocedure) definition;
create temporary table dispatch_cron_before as select to_jsonb(j) data from cron.job j where jobname='sunday-ledger-score-checkpoints';
select is(private.attach_player_result_dispatch_hook(),false,'repeated attachment is idempotent');
select is(pg_get_functiondef('private.dispatch_score_checkpoints()'::regprocedure),(select definition from dispatch_original),'idempotent attachment preserves core function bytes');
update private.player_result_policy set metadata_enabled=true;
select is(private.dispatch_player_result_checkpoints(),null::bigint,'enabled metadata without due catalog work sends no request or reads no secret');
update private.player_result_policy set metadata_enabled=false;
select is((select to_jsonb(j) from cron.job j where jobname='sunday-ledger-score-checkpoints'),(select data from dispatch_cron_before),'dormant migration and calls preserve existing cron cadence and command');
select private.configure_nflverse_primary_pilot(repeat('a',64),'Approved dispatcher primary source fixture');
update private.player_result_policy set processing_enabled=true;
insert into private.player_result_event_mappings(external_event_id,api_sports_event_id,nflverse_event_id,game_date,away_team,home_team,verified_at,evidence_hash,source_policy,source_validation_id)
 select 'dispatcher-fixture',null,'2026_01_BUF_NYJ',current_date,'Away fixture','Home fixture',clock_timestamp(),repeat('a',64),'NFLVERSE_PRIMARY',source_validation_id from private.player_result_policy;
insert into private.player_result_jobs(external_event_id,final_observed_at,next_attempt_at,next_reconcile_at)
 values('dispatcher-fixture',clock_timestamp()-interval '1 hour',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour');
select is(private.dispatch_player_result_checkpoints(),null::bigint,'primary dispatcher requires recorded source validation before work');
update private.player_result_policy set nflverse_contract_validated=true;
select is(private.dispatch_player_result_checkpoints(),null::bigint,'future NFLVERSE reconciliation does not dispatch just because the unused API-Sports attempt is due');

-- A fresh database need not schedule its cron before applying this migration.
select cron.unschedule('sunday-ledger-score-checkpoints');
update private.player_result_jobs set next_reconcile_at=clock_timestamp();
select throws_ok($$select private.dispatch_player_result_checkpoints()$$,'P0001','Existing five-minute score checkpoint job must be verified first','due production work remains blocked until scheduler readiness');
update private.player_result_policy set processing_enabled=false;

select is(private.dispatch_player_result_checkpoints(),null::bigint,'disabled code remains usable before cron initialization');
select is(private.attach_player_result_dispatch_hook(),false,'dormant hook attachment does not require or create an active cron');
select is((select count(*) from cron.job where jobname='sunday-ledger-score-checkpoints'),0::bigint,'attaching dormant hook never schedules a job');
-- A scoped no-network function body verifies wrapper ordering and error isolation.
create temporary table dispatch_observations(sequence integer generated always as identity,kind text);
create or replace function private.dispatch_player_result_checkpoints() returns bigint language plpgsql security definer set search_path='' as $$
begin insert into pg_temp.dispatch_observations(kind) values('player');return 7;end; $$;
create or replace function private.dispatch_score_checkpoints() returns bigint language plpgsql security definer set search_path='' as $$
begin
 insert into pg_temp.dispatch_observations(kind) values('core');
 begin
  insert into pg_temp.dispatch_observations(kind) values('nested-core');
 end;
 return 17;
end; $$;
select is(private.attach_player_result_dispatch_hook(),true,'core initializer replacement can restore tracked hook before cron scheduling');
select is(private.dispatch_score_checkpoints(),17::bigint,'hook preserves the original core return value');
select is((select array_agg(kind order by sequence) from dispatch_observations),array['player','core','nested-core'],'only outer body is hooked and nested core semantics are preserved');
truncate dispatch_observations;
create or replace function private.dispatch_player_result_checkpoints() returns bigint language plpgsql security definer set search_path='' as $$
begin raise exception using errcode='55000',message='Synthetic player provider outage';end; $$;
select is(private.dispatch_score_checkpoints(),17::bigint,'player failure does not block core score dispatch');
select is((select array_agg(kind order by sequence) from dispatch_observations),array['core','nested-core'],'core score work survives player failure exactly once');
select * from finish();
rollback;
