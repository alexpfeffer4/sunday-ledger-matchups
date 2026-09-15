-- Scoped future-week activation, only after the owner's concrete release approval.
-- Default is read-only in effect (locks/verification, no mutations).
-- Required approved-operator settings are documented in README.md.
begin;
set local lock_timeout='5s';
set local statement_timeout='20s';
do $activation$
declare
 apply boolean:=coalesce(nullif(current_setting('sunday_ledger.props_apply',true),'')::boolean,false);
 lid uuid:=nullif(current_setting('sunday_ledger.props_league_id',true),'')::uuid;
 sid uuid:=nullif(current_setting('sunday_ledger.props_season_id',true),'')::uuid;
 sha text:=coalesce(current_setting('sunday_ledger.props_release_sha',true),'');
 approval text:=coalesce(current_setting('sunday_ledger.props_approval_reference',true),'');
 readiness text:=coalesce(current_setting('sunday_ledger.props_readiness_sha',true),'');
 s private.seasons%rowtype; p private.prepared_player_props_rulesets%rowtype;
 boundary integer; before_bindings jsonb; after_bindings jsonb;
begin
 if not apply then
 raise notice 'DRY_RUN: no offer, rules, quota or scheduler settings changed. Run preflight.sql for scope metadata.'; return;
 end if;
 if lid is null or sid is null or sha!~'^[0-9a-f]{40}$' or readiness!~'^[0-9a-f]{64}$' or char_length(btrim(approval)) not between 3 and 500 then
 raise exception 'Exact league/season, tested deployed commit, readiness manifest hash and release approval are required'; end if;
 -- Same first lock as week opening; a concurrently opened target moves the
 -- activation boundary to the next unopened week under the approved policy.
 select * into strict s from private.seasons where id=sid and league_id=lid for update;
 if s.mode<>'LIVE' or s.lifecycle not in('ROSTER_LOCKED','REGULAR','PLAYOFFS','CHAMPION_FINAL','WEEK_18_EXHIBITION') then
 raise exception 'The configured live pilot season is not eligible'; end if;
 if s.id<>(select current.id from private.seasons current where current.league_id=lid order by current.created_at desc,current.id desc limit 1) then
 raise exception 'The configured season is no longer current'; end if;
 select * into strict p from private.prepared_player_props_rulesets where mode=s.mode;
 if p.sha256_hash<>'7a2721afb0c0d366367cfbb8a90fba6e4061df0bd02893f5722c5ba838ecd8f5'
 or encode(extensions.digest(private.canonical_ruleset_json(p.canonical_json),'sha256'),'hex')<>p.sha256_hash then
 raise exception 'Prepared package differs from tested application'; end if;
 if exists(select 1 from private.authoritative_season_rulesets a where a.ruleset_version<>'1.3'
 or a.canonical_json is distinct from private.rolling_ruleset_package(a.mode)) then raise exception 'Unexpected global catalog'; end if;
 if not exists(select 1 from private.odds_refresh_policy policy where policy.enabled and daily_credit_limit=1000 and monthly_credit_limit=5000
 and protected_core_daily_credits>=350 and protected_core_monthly_credits>=2000 and provider_entitlement_credits>=20000
 and quota_reset_policy='FIRST_OF_MONTH_CONFIRMED_HEADERS' and next_quota_reset_at>clock_timestamp()
 and (provider_cycle_verified_at between clock_timestamp()-interval '10 minutes' and clock_timestamp()
   or exists(select 1 from private.odds_entitlement_probes proof where proof.state='SUCCEEDED'
    and proof.completed_at between clock_timestamp()-interval '10 minutes' and clock_timestamp()
    and proof.started_at>=policy.provider_cycle_verified_at
    and proof.remaining::bigint+proof.used::bigint=policy.provider_entitlement_credits))) then
 raise exception 'Reviewed paid-plan budget and fresh verified entitlement are required before offers'; end if;
 if not exists(select 1 from private.player_result_policy where processing_enabled)
 or not private.player_source_policy_validated() then
 raise exception 'Validated automatic player-result processing is required before offers'; end if;
 if to_regprocedure('private.dispatch_player_result_checkpoints()') is null then raise exception 'Player result dispatcher is not installed'; end if;
 if not exists(select 1 from cron.job where jobname='sunday-ledger-score-checkpoints' and schedule='*/5 * * * *' and active)
 or strpos(pg_get_functiondef('private.dispatch_score_checkpoints()'::regprocedure),'perform private.dispatch_player_result_checkpoints();')=0 then
 raise exception 'The verified five-minute score/player-result scheduler is required before offers'; end if;

 select coalesce(max(nfl_week),0)+1 into boundary from private.season_weeks where season_id=s.id and state<>'PLANNED';
 if boundary>18 then raise exception 'No eligible unopened week remains in this season'; end if;
 select coalesce(jsonb_agg(jsonb_build_array(w.id,w.ruleset_snapshot_id) order by w.id),'[]') into before_bindings
 from private.season_weeks w where w.season_id=s.id and w.state<>'PLANNED';
 if exists(select 1 from private.player_prop_leagues where league_id=lid and rules_enabled and season_id<>sid) then
 raise exception 'A different season override requires explicit review'; end if;
 insert into private.player_prop_leagues(league_id,enabled,rules_enabled,season_id,first_enabled_week,activated_at,release_sha,approval_reference)
 values(lid,true,true,sid,boundary,clock_timestamp(),sha,approval)
 on conflict(league_id) do update set enabled=true,rules_enabled=true,season_id=excluded.season_id,
 first_enabled_week=case when private.player_prop_leagues.rules_enabled then private.player_prop_leagues.first_enabled_week else excluded.first_enabled_week end,
 activated_at=coalesce(private.player_prop_leagues.activated_at,excluded.activated_at),release_sha=excluded.release_sha,approval_reference=excluded.approval_reference;
 update private.player_prop_controls set offers_enabled=true,updated_at=clock_timestamp();
 select coalesce(jsonb_agg(jsonb_build_array(w.id,w.ruleset_snapshot_id) order by w.id),'[]') into after_bindings
 from private.season_weeks w where w.season_id=s.id and w.state<>'PLANNED';
 if after_bindings is distinct from before_bindings then raise exception 'Opened-week bindings changed'; end if;
 raise notice 'Configured pilot future week % for Ruleset1.4/3.3; existing weeks and global catalogs unchanged. Readiness manifest %',boundary,readiness;
end; $activation$;
commit;
