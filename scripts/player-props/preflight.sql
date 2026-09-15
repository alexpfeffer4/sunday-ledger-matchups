-- Read-only installed-support/configuration preflight. No provider calls or live
-- changes. Run in a dedicated connection; retain participant metadata privately.
begin transaction isolation level repeatable read read only;
set local statement_timeout='20s';
do $preflight$
declare p record; expected text; n text; r text;
begin
 if (select count(*) from private.prepared_player_props_rulesets)<>2 then raise exception 'Both prepared1.4 packages are required'; end if;
 for p in select * from private.prepared_player_props_rulesets loop
 expected:=case p.mode when 'LIVE' then '7a2721afb0c0d366367cfbb8a90fba6e4061df0bd02893f5722c5ba838ecd8f5'
 else 'c9e9d9c049a57dbab45de23f1b6e6e3b7d8abcf52ba1854b3c496fd230bc653c' end;
 if p.sha256_hash<>expected or encode(extensions.digest(private.canonical_ruleset_json(p.canonical_json),'sha256'),'hex')<>expected
 or p.canonical_json->>'version'<>'1.4' or p.canonical_json->>'productBibleVersion'<>'3.3' then
 raise exception 'Prepared props package differs from tested application'; end if;
 end loop;
 if exists(select 1 from private.authoritative_season_rulesets a where a.ruleset_version<>'1.3' or a.product_bible_version<>'3.2'
 or a.canonical_json is distinct from private.rolling_ruleset_package(a.mode)) then
 raise exception 'Unexpected global catalog; no global upgrade or downgrade inferred'; end if;
 foreach n in array array['private.player_subjects','private.player_provider_mappings','private.week_player_menu',
 'private.player_prop_controls','private.player_prop_leagues','private.prepared_player_props_rulesets'] loop
 if not (select relrowsecurity from pg_class where oid=n::regclass) then raise exception 'Missing RLS: %',n; end if;
 foreach r in array array['anon','authenticated'] loop
 if has_table_privilege(r,n,'INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'Unsafe participant write grant: %',n; end if;
 end loop;
 end loop;
 foreach n in array array['private.prop_snapshot_allowed(uuid,uuid,text,text)','private.is_player_props_week(uuid)',
 'private.player_receipt_canonical(uuid,uuid,uuid,integer,timestamptz,uuid)',
 'api.import_player_catalog(jsonb)','api.confirm_player_prop_menu(text,jsonb)',
 'api.open_reviewed_player_prop_week(text,text)','api.configure_player_prop_odds_budget(jsonb)',
 'private.player_props_menu_eligible(uuid)','private.player_props_menu_reviewed(uuid)'] loop
 if to_regprocedure(n) is null then raise exception 'Missing authority: %',n; end if;
 end loop;
 if strpos(pg_get_functiondef('private.pin_week_rules()'::regprocedure),'p.rules_enabled')=0
 or strpos(pg_get_functiondef('private.accept_authoritative_card_for_actor(uuid,text,jsonb,text)'::regprocedure),'v_receipt_canonical')=0 then
 raise exception 'Missing scoped prospective rules or shared receipt authority'; end if;
 raise notice 'Database support verified. Provider/account, deployed commit, tests and scheduler evidence remain separate checks.';
end; $preflight$;
select mode,sha256_hash as prepared_1_4_sha256 from private.prepared_player_props_rulesets order by mode;
select p.enabled,daily_credit_limit,monthly_credit_limit,protected_core_daily_credits,protected_core_monthly_credits,
 provider_entitlement_credits,provider_cycle_id,provider_cycle_verified_at,quota_reset_policy,next_quota_reset_at,
 (select max(completed_at) from private.odds_entitlement_probes proof where proof.state='SUCCEEDED'
 and proof.started_at>=p.provider_cycle_verified_at and proof.remaining::bigint+proof.used::bigint=p.provider_entitlement_credits) as latest_consistent_entitlement_probe_at
 from private.odds_refresh_policy p;
select processing_enabled,api_sports_contract_validated,nflverse_contract_validated,
 results_daily_limit,metadata_daily_limit,requests_per_minute from private.player_result_policy;

select mode,ruleset_version,product_bible_version,sha256_hash from private.authoritative_season_rulesets order by mode;
select c.offers_enabled,p.league_id,p.season_id,p.enabled as league_offers_enabled,p.rules_enabled,p.first_enabled_week,p.activated_at,p.release_sha
 from private.player_prop_controls c left join private.player_prop_leagues p on true order by p.league_id;
select s.id as season_id,s.league_id,l.slug,s.mode,s.lifecycle,
 (select max(w.nfl_week) from private.season_weeks w where w.season_id=s.id and w.state<>'PLANNED') as last_opened_week,
 case when s.lifecycle='FINAL' then null else nullif(least(19,coalesce((select max(w.nfl_week) from private.season_weeks w where w.season_id=s.id and w.state<>'PLANNED'),0)+1),19) end as first_eligible_unopened_week
 from private.seasons s join private.leagues l on l.id=s.league_id where s.lifecycle<>'FINAL' order by s.created_at;
-- Migration ledger parity must include every reviewed release migration. The
-- installed-object checks intentionally do not claim remote ledger alignment.
select version,name from supabase_migrations.schema_migrations order by version desc limit 8;
rollback;
