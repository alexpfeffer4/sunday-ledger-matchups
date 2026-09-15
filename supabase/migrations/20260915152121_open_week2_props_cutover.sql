-- Narrow owner-approved exception for the already-open 2026 Week 2. Staging
-- keeps original rules/receipts/entry intact; only the guarded cutover resets
-- the exact recorded card and adopts props after the complete menu is reviewed.
create table private.week2_props_stages (
 week_id uuid primary key references private.season_weeks(id),
 league_id uuid not null references private.leagues(id),
 season_id uuid not null references private.seasons(id),
 card_id uuid not null references private.weekly_cards(id),
 original_ruleset_snapshot_id uuid not null references private.season_ruleset_snapshots(id),
 expected_receipt_ids uuid[] not null check(cardinality(expected_receipt_ids) between 1 and 20),
 expected_receipt_fingerprint text not null check(expected_receipt_fingerprint ~ '^[0-9a-f]{64}$'),
 approval_reference text not null check(char_length(btrim(approval_reference)) between 3 and 500),
 created_at timestamptz not null default clock_timestamp()
);
create table private.week2_props_cutovers (
 week_id uuid primary key references private.week2_props_stages(week_id),
 previous_ruleset_snapshot_id uuid not null references private.season_ruleset_snapshots(id),
 new_ruleset_snapshot_id uuid not null references private.season_ruleset_snapshots(id),
 reset_id uuid not null unique references private.card_reset_events(id),
 menu_hash text not null check(menu_hash ~ '^[0-9a-f]{64}$'),
 readiness_sha text not null check(readiness_sha ~ '^[0-9a-f]{64}$'),
 release_sha text not null check(release_sha ~ '^[0-9a-f]{40}$'),
 idempotency_key text not null check(char_length(idempotency_key) between 8 and 120),
 approval_reference text not null check(char_length(btrim(approval_reference)) between 3 and 500),
 reason text not null check(char_length(btrim(reason)) between 8 and 500),
 cutover_transaction_id xid8 not null default pg_current_xact_id(),
 created_at timestamptz not null default clock_timestamp()
);
create index week2_props_stages_league_idx on private.week2_props_stages(league_id);
create index week2_props_stages_season_idx on private.week2_props_stages(season_id);
create index week2_props_stages_card_idx on private.week2_props_stages(card_id);
create index week2_props_stages_rules_idx on private.week2_props_stages(original_ruleset_snapshot_id);
create index week2_props_cutovers_previous_rules_idx on private.week2_props_cutovers(previous_ruleset_snapshot_id);
create index week2_props_cutovers_new_rules_idx on private.week2_props_cutovers(new_ruleset_snapshot_id);
alter table private.week2_props_stages enable row level security;
alter table private.week2_props_cutovers enable row level security;
revoke all on private.week2_props_stages,private.week2_props_cutovers from public,anon,authenticated,service_role;
create trigger week2_props_stages_append_only before update or delete on private.week2_props_stages
 for each row execute function private.reject_competitive_mutation();
create trigger week2_props_cutovers_append_only before update or delete on private.week2_props_cutovers
 for each row execute function private.reject_competitive_mutation();

create function private.week2_props_stage_current(p_week_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select coalesce((select s.mode='LIVE' and s.nfl_year=2026 and s.lifecycle='REGULAR'
 and w.nfl_week=2 and w.state='OPEN' and w.ruleset_snapshot_id=stage.original_ruleset_snapshot_id
 and w.league_id=stage.league_id and w.season_id=stage.season_id and s.league_id=stage.league_id
 and s.id=(select current.id from private.seasons current where current.league_id=s.league_id order by current.created_at desc,current.id desc limit 1)
 and w.nfl_week=(select max(nfl_week) from private.season_weeks where season_id=s.id)
 and c.week_id=w.id and c.card_generation=0
 and not exists(select 1 from private.position_receipts other where other.week_id=w.id and other.card_id<>c.id)
 and r.ruleset_version='1.3' and r.canonical_json=private.rolling_ruleset_package('LIVE')
 and stage.expected_receipt_ids=(select array_agg(receipt.id order by receipt.id) from private.position_receipts receipt where receipt.week_id=w.id)
 and stage.expected_receipt_fingerprint=private.card_receipt_fingerprint(c.id,0)
 and not exists(select 1 from private.week2_props_cutovers cutover where cutover.week_id=w.id)
 and exists(select 1 from private.sports_events e where e.week_id=w.id)
 and not exists(select 1 from private.sports_events e where e.week_id=w.id
   and (e.state<>'SCHEDULED' or e.actual_started_at is not null or e.scheduled_start_at<=clock_timestamp() or e.entry_cutoff_at<=clock_timestamp()))
 and not exists(select 1 from private.event_result_versions result where result.week_id=w.id)
 from private.week2_props_stages stage join private.season_weeks w on w.id=stage.week_id
 join private.seasons s on s.id=w.season_id join private.weekly_cards c on c.id=stage.card_id
 join private.season_ruleset_snapshots r on r.id=w.ruleset_snapshot_id where stage.week_id=p_week_id),false);
$$;
create function private.week2_props_menu_hash(p_week_id uuid) returns text
language sql stable security invoker set search_path='' as $$
 select encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(m) order by m.event_id,m.team,m.slot),'[]'::jsonb)::text,'sha256'),'hex')
 from private.week_player_menu m where m.week_id=p_week_id;
$$;

create function private.stage_open_week2_props(
 p_league_id uuid,p_season_id uuid,p_week_id uuid,p_card_id uuid,
 p_expected_receipt_ids uuid[],p_expected_receipt_fingerprint text,p_approval_reference text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s private.seasons%rowtype;w private.season_weeks%rowtype;c private.weekly_cards%rowtype;
 existing private.week2_props_stages%rowtype;ids uuid[];
begin
 select * into strict s from private.seasons where id=p_season_id and league_id=p_league_id for update;
 select * into strict w from private.season_weeks where id=p_week_id and season_id=s.id for update;
 perform 1 from private.sports_events where week_id=w.id order by id for update;
 select * into strict c from private.weekly_cards where id=p_card_id and week_id=w.id for update;
 select array_agg(id order by id) into ids from unnest(p_expected_receipt_ids) id;
 if ids is null or cardinality(ids) not between 1 and 20 or cardinality(ids)<>(select count(distinct id) from unnest(ids) id)
 or p_expected_receipt_fingerprint is null or p_expected_receipt_fingerprint!~'^[0-9a-f]{64}$'
 or p_approval_reference is null or char_length(btrim(p_approval_reference)) not between 3 and 500 then
 raise exception using errcode='22023',message='Exact Week 2 receipt evidence and owner reset approval are required.';end if;
 select * into existing from private.week2_props_stages where week_id=w.id;
 if found then
 if existing.card_id<>c.id or existing.expected_receipt_ids<>ids or existing.expected_receipt_fingerprint<>p_expected_receipt_fingerprint
 or existing.approval_reference<>p_approval_reference then
 raise exception using errcode='22000',message='Week 2 already has a different recorded amendment.';end if;
 else
 insert into private.week2_props_stages(week_id,league_id,season_id,card_id,original_ruleset_snapshot_id,expected_receipt_ids,expected_receipt_fingerprint,approval_reference)
 values(w.id,s.league_id,s.id,c.id,w.ruleset_snapshot_id,ids,p_expected_receipt_fingerprint,p_approval_reference);
 end if;
 if not private.week2_props_stage_current(w.id) then
 raise exception using errcode='55000',message='The exact unstarted Week 2 card or original rules have changed.';end if;
 perform private.prepare_player_menu(w.id);
 return jsonb_build_object('status','STAGED','weekId',w.id,'rulesetVersion','1.3','offersEnabled',false,'cardReset',false);
end; $$;

-- Reuse the normal source/menu authorities. Staged game submissions remain 1.3
-- and therefore cannot freeze the props menu. Additional accepted bets make the
-- recorded amendment stale and prevent both confirmation and cutover.
create or replace function private.player_props_menu_eligible(p_week_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select private.is_player_props_week(p_week_id) or private.week2_props_stage_current(p_week_id)
 or coalesce((select w.state='PLANNED' and private.player_props_target_week(w.season_id,w.nfl_week)
 from private.season_weeks w where w.id=p_week_id),false);
$$;
do $staged_menu$
declare d text;old text;
begin
 d:=pg_get_functiondef('api.confirm_player_prop_menu(text,jsonb)'::regprocedure);
 old:='or exists(select 1 from private.effective_position_receipts where week_id=w.id)';
 if strpos(d,old)=0 then raise exception 'Week 2 effective receipt confirmation baseline changed';end if;
 execute replace(d,old,'or (exists(select 1 from private.effective_position_receipts where week_id=w.id) and not private.week2_props_stage_current(w.id))');
 d:=pg_get_functiondef('api.get_player_prop_menu(text)'::regprocedure);
 old:=$old$'weekState',w.state$old$;
 if strpos(d,old)=0 then raise exception 'Week 2 menu read baseline changed';end if;
 execute replace(d,old,$new$'amendmentPending',private.week2_props_stage_current(w.id),'amendmentApplied',exists(select 1 from private.week2_props_cutovers where week_id=w.id),'menuHash',private.week2_props_menu_hash(w.id),'weekState',w.state$new$);
end; $staged_menu$;

create function private.require_week2_props_readiness(p_results boolean) returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from private.odds_refresh_policy for share;
 perform 1 from private.player_result_policy for share;
 if not exists(select 1 from private.odds_refresh_policy policy where policy.enabled and daily_credit_limit=1000 and monthly_credit_limit=5000
 and protected_core_daily_credits>=350 and protected_core_monthly_credits>=2000 and provider_entitlement_credits>=20000
 and quota_reset_policy='FIRST_OF_MONTH_CONFIRMED_HEADERS' and next_quota_reset_at>clock_timestamp()
 and (provider_cycle_verified_at between clock_timestamp()-interval '10 minutes' and clock_timestamp()
   or exists(select 1 from private.odds_entitlement_probes proof where proof.state='SUCCEEDED'
    and proof.completed_at between clock_timestamp()-interval '10 minutes' and clock_timestamp()
    and proof.started_at>=policy.provider_cycle_verified_at
    and proof.remaining::bigint+proof.used::bigint=policy.provider_entitlement_credits))) then
 raise exception using errcode='55000',message='Reviewed paid-plan budget and fresh verified entitlement are required.';end if;
 if not exists(select 1 from private.player_result_policy where metadata_enabled and api_sports_contract_validated and nflverse_contract_validated
 and results_daily_limit=80 and metadata_daily_limit=20 and requests_per_minute<=8 and (not p_results or processing_enabled)) then
 raise exception using errcode='55000',message='Validated player sources and protected request budgets are required.';end if;
 if p_results then
 if to_regprocedure('private.dispatch_player_result_checkpoints()') is null then
 raise exception using errcode='55000',message='The player result dispatcher is not installed.';end if;
 if not exists(select 1 from cron.job where jobname='sunday-ledger-score-checkpoints' and schedule='*/5 * * * *' and active)
 or strpos(pg_get_functiondef('private.dispatch_score_checkpoints()'::regprocedure),'perform private.dispatch_player_result_checkpoints();')=0 then
 raise exception using errcode='55000',message='The verified five-minute player-result scheduler is required.';end if;
 end if;
end; $$;

create function private.start_open_week2_props_catalog(p_week_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare stage private.week2_props_stages%rowtype;
begin
 select * into strict stage from private.week2_props_stages where week_id=p_week_id;
 perform 1 from private.seasons where id=stage.season_id for update;
 perform 1 from private.season_weeks where id=p_week_id for update;
 if not private.week2_props_stage_current(p_week_id) then
 raise exception using errcode='55000',message='The exact unstarted Week 2 card or original rules have changed.';end if;
 perform private.require_week2_props_readiness(false);
 if exists(select 1 from private.player_prop_leagues where league_id=stage.league_id
 and (rules_enabled or enabled or season_id is distinct from stage.season_id or catalog_hold_from_week is not null)) then
 raise exception using errcode='55000',message='A different player-props release scope requires review.';end if;
 insert into private.player_prop_leagues(league_id,season_id,catalog_enabled)
 values(stage.league_id,stage.season_id,true)
 on conflict(league_id) do update set catalog_enabled=true;
 insert into private.player_catalog_jobs(week_id) values(p_week_id) on conflict(week_id) do nothing;
 return jsonb_build_object('status','QUEUED','weekId',p_week_id,'cardReset',false,'offersEnabled',false);
end; $$;

-- The ordinary opened-week rule guard admits this one transition only inside
-- the same transaction as its append-only reset and cutover audit records.
do $binding_guard$
declare d text;old text;
begin
 d:=pg_get_functiondef('private.pin_week_rules()'::regprocedure);
 old:=$old$  if tg_op='UPDATE' and old.state<>'PLANNED' then$old$;
 if strpos(d,old)=0 then raise exception 'Week 2 opened-binding guard baseline changed';end if;
 execute replace(d,old,$new$  if tg_op='UPDATE' and old.state='OPEN' and new.state='OPEN'
    and old.nfl_week=2 and new.nfl_week=old.nfl_week and new.season_id=old.season_id
    and (to_jsonb(new)-'ruleset_snapshot_id')=(to_jsonb(old)-'ruleset_snapshot_id')
    and exists(select 1 from private.week2_props_cutovers a
      join private.week2_props_stages stage on stage.week_id=a.week_id
      join private.card_reset_events reset on reset.id=a.reset_id
      where a.week_id=old.id and a.previous_ruleset_snapshot_id=old.ruleset_snapshot_id
      and a.new_ruleset_snapshot_id=new.ruleset_snapshot_id
      and a.cutover_transaction_id=pg_current_xact_id()
      and reset.reset_transaction_id=pg_current_xact_id() and reset.card_id=stage.card_id
      and reset.receipt_fingerprint=stage.expected_receipt_fingerprint)
  then return new;end if;
  if tg_op='UPDATE' and old.state<>'PLANNED' then$new$);
end; $binding_guard$;

create function private.cutover_open_week2_props(
 p_week_id uuid,p_menu_hash text,p_readiness_sha text,p_release_sha text,p_idempotency_key text,p_reason text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare stage private.week2_props_stages%rowtype;prior private.week2_props_cutovers%rowtype;
 s private.seasons%rowtype;w private.season_weeks%rowtype;package private.prepared_player_props_rulesets%rowtype;
 snapshot_id uuid;reset jsonb;n timestamptz:=clock_timestamp();
begin
 if p_menu_hash is null or p_menu_hash!~'^[0-9a-f]{64}$' or p_readiness_sha is null or p_readiness_sha!~'^[0-9a-f]{64}$'
 or p_release_sha is null or p_release_sha!~'^[0-9a-f]{40}$' or p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 120
 or p_reason is null or char_length(btrim(p_reason)) not between 8 and 500 then
 raise exception using errcode='22023',message='Exact reviewed menu, readiness evidence, deployed release and operation identity are required.';end if;
 select * into strict stage from private.week2_props_stages where week_id=p_week_id;
 select * into strict s from private.seasons where id=stage.season_id and league_id=stage.league_id for update;
 select * into strict w from private.season_weeks where id=p_week_id and season_id=s.id for update;
 perform 1 from private.sports_events where week_id=w.id order by id for update;
 perform 1 from private.weekly_cards where week_id=w.id order by id for update;
 select * into prior from private.week2_props_cutovers where week_id=w.id;
 if found then
 if prior.idempotency_key<>p_idempotency_key or prior.menu_hash<>p_menu_hash or prior.readiness_sha<>p_readiness_sha or prior.release_sha<>p_release_sha or prior.reason<>p_reason then
 raise exception using errcode='22000',message='Week 2 already has a different completed amendment.';end if;
 return jsonb_build_object('status','ACTIVATED','weekId',w.id,'resetId',prior.reset_id,'rulesetVersion','1.4','replayed',true);
 end if;
 if not private.week2_props_stage_current(w.id) then
 raise exception using errcode='55000',message='The exact unstarted Week 2 card or original rules have changed.';end if;
 perform private.require_week2_props_readiness(true);
 if not private.player_catalog_complete(w.id) or not private.player_props_menu_reviewed(w.id)
 or p_menu_hash<>private.week2_props_menu_hash(w.id)
 or exists(select 1 from private.week_player_menu where week_id=w.id and frozen_at is not null) then
 raise exception using errcode='55000',message='The complete current player slate must be reviewed once before the Week 2 reset.';end if;
 if not exists(select 1 from private.player_prop_leagues where league_id=s.league_id and season_id=s.id and catalog_enabled
 and not rules_enabled and not enabled and catalog_hold_from_week is null) then
 raise exception using errcode='55000',message='The exact Week 2 catalog scope is required.';end if;
 select * into strict package from private.prepared_player_props_rulesets where mode='LIVE';
 if package.sha256_hash<>'7a2721afb0c0d366367cfbb8a90fba6e4061df0bd02893f5722c5ba838ecd8f5'
 or encode(extensions.digest(private.canonical_ruleset_json(package.canonical_json),'sha256'),'hex')<>package.sha256_hash
 or exists(select 1 from private.authoritative_season_rulesets a where a.ruleset_version<>'1.3' or a.canonical_json is distinct from private.rolling_ruleset_package(a.mode)) then
 raise exception using errcode='55000',message='The tested rules package or original global catalog has changed.';end if;
 reset:=private.reset_prestart_week2_card(stage.league_id,stage.season_id,stage.week_id,stage.card_id,
 stage.expected_receipt_ids,stage.expected_receipt_fingerprint,'props-reset:'||substr(p_idempotency_key,1,100),p_release_sha,stage.approval_reference,p_reason);
 insert into private.season_ruleset_snapshots(ruleset_id,ruleset_version,product_bible_id,product_bible_version,mode,canonical_json,sha256_hash,published_at,frozen_at)
 values(package.canonical_json->>'id','1.4',package.canonical_json->>'productBibleId','3.3','LIVE',package.canonical_json,package.sha256_hash,n,n)
 returning id into snapshot_id;
 perform private.season_card_rules(snapshot_id,'LIVE');
 insert into private.week2_props_cutovers(week_id,previous_ruleset_snapshot_id,new_ruleset_snapshot_id,reset_id,menu_hash,readiness_sha,release_sha,idempotency_key,approval_reference,reason)
 values(w.id,w.ruleset_snapshot_id,snapshot_id,(reset->>'resetId')::uuid,p_menu_hash,p_readiness_sha,p_release_sha,p_idempotency_key,stage.approval_reference,p_reason);
 update private.season_weeks set ruleset_snapshot_id=snapshot_id where id=w.id;
 update private.week_player_menu set frozen_at=n where week_id=w.id;
 update private.player_prop_leagues set enabled=true,rules_enabled=true,first_enabled_week=2,activated_at=n,release_sha=p_release_sha,approval_reference=stage.approval_reference
 where league_id=s.league_id and season_id=s.id;
 update private.player_prop_controls set offers_enabled=true,updated_at=n;
 return jsonb_build_object('status','ACTIVATED','weekId',w.id,'resetId',reset->>'resetId','cardId',stage.card_id,'cardGeneration',1,
 'remainingCredits',1000,'rulesetVersion','1.4','replayed',false);
end; $$;
revoke all on function private.week2_props_stage_current(uuid),private.week2_props_menu_hash(uuid),
 private.stage_open_week2_props(uuid,uuid,uuid,uuid,uuid[],text,text),private.require_week2_props_readiness(boolean),
 private.start_open_week2_props_catalog(uuid),private.cutover_open_week2_props(uuid,text,text,text,text,text)
 from public,anon,authenticated,service_role;
