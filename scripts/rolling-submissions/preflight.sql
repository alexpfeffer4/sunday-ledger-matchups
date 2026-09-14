-- Operator-only metadata. No member identities, picks, stakes or results are read.
-- Run only against the intended verified database. Keep output out of public logs.
-- Requires all reviewed support migrations, but does not activate them.
-- Database readiness does not certify deployed application code, CI or Preview.
begin transaction isolation level repeatable read read only;
set local statement_timeout='15s';
do $readiness$
declare
  v_package record;
  v_catalog record;
  v_snapshot record;
  v_expected_hash text;
  v_relation text;
  v_role text;
  v_function text;
begin
  if (select count(*) from private.prepared_rolling_rulesets) <> 2
    or (select count(*) from private.authoritative_season_rulesets) <> 2 then
    raise exception 'Expected exactly one LIVE and one SIMULATION rules package';
  end if;

  for v_package in select * from private.prepared_rolling_rulesets order by mode loop
    v_expected_hash := case v_package.mode
      when 'LIVE' then 'e96725423ca2a02a3922ccd05e0ea99916375da199b2438f42be17a1a7a29b65'
      when 'SIMULATION' then '2f033f52a0ae85afe49f314c11e0f6cf4783300bc7b71b71c079b61d08aeced5'
    end;
    if v_package.sha256_hash is distinct from v_expected_hash
      or encode(extensions.digest(private.canonical_ruleset_json(v_package.canonical_json), 'sha256'), 'hex') is distinct from v_expected_hash
      or v_package.canonical_json->>'version' is distinct from '1.3'
      or v_package.canonical_json->>'productBibleVersion' is distinct from '3.2'
      or v_package.canonical_json->>'mode' is distinct from v_package.mode
      or private.rolling_ruleset_package(v_package.mode) is distinct from v_package.canonical_json then
      raise exception 'Prepared % package does not match the reviewed application 1.3 hash', v_package.mode;
    end if;
  end loop;

  for v_catalog in select * from private.authoritative_season_rulesets order by mode loop
    v_expected_hash := case v_catalog.mode
      when 'LIVE' then '6d9c85a0763b8c140296bda409ed3eecbe0ac4b91466b3504dd23ff4489e4ac7'
      when 'SIMULATION' then 'd7b74cb761ca652fad2ffff32f6e20a16326434d7e0f19d86a7e32b6a818ef8b'
    end;
    if not (
      (v_catalog.ruleset_version='1.2' and v_catalog.product_bible_version='3.1'
        and v_catalog.sha256_hash=v_expected_hash
        and encode(extensions.digest(private.canonical_ruleset_json(v_catalog.canonical_json), 'sha256'), 'hex')=v_expected_hash)
      or (v_catalog.ruleset_version='1.3' and v_catalog.product_bible_version='3.2'
        and exists (select 1 from private.prepared_rolling_rulesets p where p.mode=v_catalog.mode
          and p.canonical_json=v_catalog.canonical_json and p.sha256_hash=v_catalog.sha256_hash))
    ) then
      raise exception 'Unexpected active catalog for %; no upgrade or downgrade inferred', v_catalog.mode;
    end if;
  end loop;
  if (select count(distinct ruleset_version) from private.authoritative_season_rulesets) <> 1 then
    raise exception 'Mixed active mode versions require separate review';
  end if;

  foreach v_relation in array array['private.prepared_rolling_rulesets', 'private.authoritative_season_rulesets'] loop
    if not (select relrowsecurity from pg_class where oid=v_relation::regclass) then
      raise exception 'RLS is not enabled for %', v_relation;
    end if;
    foreach v_role in array array['anon','authenticated'] loop
      if has_table_privilege(v_role, v_relation, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
        raise exception 'Unexpected participant privilege on % for %', v_relation, v_role;
      end if;
    end loop;
  end loop;
  if not exists (select 1 from pg_trigger
    where tgrelid='private.prepared_rolling_rulesets'::regclass
      and tgname='prepared_rolling_rulesets_append_only' and tgenabled in ('O','A')) then
    raise exception 'Prepared package immutability trigger missing or disabled';
  end if;

  foreach v_function in array array[
    'private.rolling_ruleset_package(text)', 'private.is_rolling_week(uuid)',
    'private.event_entry_closes_at(uuid)', 'private.week_entry_closes_at(uuid)',
    'private.event_accepts_entries(uuid)', 'private.rolling_week_entries_closed(uuid)',
    'private.rolling_card_can_submit(uuid)', 'private.refresh_rolling_week_compliance(uuid)',
    'private.rolling_card_public_fields(uuid,uuid)'
  ] loop
    if to_regprocedure(v_function) is null then
      raise exception 'Required rolling support missing: %', v_function;
    end if;
    foreach v_role in array array['anon','authenticated'] loop
      if has_function_privilege(v_role, v_function, 'EXECUTE') then
        raise exception 'Internal helper exposed to %: %', v_role, v_function;
      end if;
    end loop;
  end loop;

  if strpos(lower(pg_get_functiondef('private.pin_week_rules()'::regprocedure)), 'for share')=0
    or strpos(pg_get_functiondef('private.pin_week_rules()'::regprocedure), 'private.prepared_rolling_rulesets')=0
    or strpos(pg_get_functiondef('private.season_card_rules(uuid,text)'::regprocedure), 'private.rolling_ruleset_package')=0 then
    raise exception 'Supported week upgrade or catalog serialization guard missing';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid='private.season_weeks'::regclass
    and tgname='pin_week_rules' and tgenabled in ('O','A')) then
    raise exception 'Week rules pinning trigger missing or disabled';
  end if;
  if strpos(pg_get_functiondef('private.guard_frozen_ruleset()'::regprocedure),
    $marker$new.ruleset_version='1.2' and new.product_bible_version='3.1'$marker$)=0
    or strpos(pg_get_functiondef('private.pin_week_rules()'::regprocedure),
      'if v_previous.frozen_at is null then')=0 then
    raise exception 'Preexisting 1.2 draft season freeze compatibility is missing';
  end if;
  if strpos(pg_get_functiondef('api.get_stage1_state(text)'::regprocedure), 'opponentSelectedGames')=0
    or strpos(pg_get_functiondef('api.get_stage1_state(text)'::regprocedure), 'rollingSubmissionsEnabled')=0
    or strpos(pg_get_functiondef('api.get_league_matchup_cards(text,uuid)'::regprocedure), 'private.rolling_card_public_fields')=0
    or strpos(pg_get_functiondef('api.get_commissioner_card_status(text)'::regprocedure), 'rollingSubmissionsEnabled')=0 then
    raise exception 'Immediate game visibility and versioned status support is missing';
  end if;

  -- Validate historical write contexts without querying any member's bets.
  for v_snapshot in
    select r.* from private.season_ruleset_snapshots r
    where exists (select 1 from private.seasons s where s.ruleset_snapshot_id=r.id)
      or exists (select 1 from private.season_weeks w where w.ruleset_snapshot_id=r.id)
  loop
    if v_snapshot.frozen_at is not null then
      perform private.season_card_rules(v_snapshot.id, v_snapshot.mode);
    else
      -- Preexisting drafts have no frozen card context yet. Validate their exact
      -- identity/package; do not call a helper that rightly requires a freeze.
      v_expected_hash := case v_snapshot.mode
        when 'LIVE' then '6d9c85a0763b8c140296bda409ed3eecbe0ac4b91466b3504dd23ff4489e4ac7'
        when 'SIMULATION' then 'd7b74cb761ca652fad2ffff32f6e20a16326434d7e0f19d86a7e32b6a818ef8b'
      end;
      if not coalesce(
        v_snapshot.ruleset_id=v_snapshot.canonical_json->>'id'
        and v_snapshot.mode=v_snapshot.canonical_json->>'mode'
        and v_snapshot.ruleset_version=v_snapshot.canonical_json->>'version'
        and v_snapshot.product_bible_id=v_snapshot.canonical_json->>'productBibleId'
        and v_snapshot.product_bible_version=v_snapshot.canonical_json->>'productBibleVersion'
        and v_snapshot.sha256_hash=encode(extensions.digest(private.canonical_ruleset_json(v_snapshot.canonical_json),'sha256'),'hex')
        and ((v_snapshot.ruleset_version='1.2' and v_snapshot.product_bible_version='3.1'
            and v_snapshot.sha256_hash=v_expected_hash)
          or (v_snapshot.ruleset_version='1.3' and v_snapshot.product_bible_version='3.2'
            and exists(select 1 from private.prepared_rolling_rulesets p where p.mode=v_snapshot.mode
              and p.canonical_json=v_snapshot.canonical_json and p.sha256_hash=v_snapshot.sha256_hash))), false)
        or exists(select 1 from private.season_weeks w where w.ruleset_snapshot_id=v_snapshot.id
          and w.state<>'PLANNED') then
        raise exception 'Unsupported unfrozen snapshot or opened week using unfrozen rules';
      end if;
    end if;
  end loop;
  raise notice 'Rolling database support checks passed; activation and application readiness are separate.';
end;
$readiness$;
select mode, ruleset_version, product_bible_version, sha256_hash
from private.authoritative_season_rulesets order by mode;
select mode, sha256_hash as prepared_1_3_sha256
from private.prepared_rolling_rulesets order by mode;
with progress as (
  select s.id as season_id, s.league_id, l.slug as league_slug, s.mode,
    s.nfl_year, s.lifecycle, r.ruleset_version as season_ruleset_version,
    (select max(w.nfl_week) from private.season_weeks w
      where w.season_id=s.id and w.state<>'PLANNED') as latest_opened_week,
    (select h.status from private.owner_rehearsals h where h.season_id=s.id) as rehearsal_status
  from private.seasons s
  join private.leagues l on l.id=s.league_id
  join private.season_ruleset_snapshots r on r.id=s.ruleset_snapshot_id
), boundaries as (
  select p.*, case when p.lifecycle='FINAL' or p.rehearsal_status='RESET'
      or coalesce(p.latest_opened_week,0)>=18 then null
    else coalesce(p.latest_opened_week,0)+1 end as first_eligible_week
  from progress p
), inventory as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'seasonId', b.season_id, 'leagueId', b.league_id, 'leagueSlug', b.league_slug,
    'mode', b.mode, 'nflYear', b.nfl_year, 'lifecycle', b.lifecycle,
    'seasonRulesetVersion', b.season_ruleset_version,
    'latestOpenedWeek', b.latest_opened_week,
    'rehearsalStatus', b.rehearsal_status,
    'firstEligibleWeek', b.first_eligible_week,
    'candidateState', case when b.first_eligible_week is null then 'NO_FUTURE_WEEK'
      else coalesce(w.state,'NOT_MATERIALIZED') end,
    'candidateCurrentRulesetVersion', wr.ruleset_version
  ) order by b.season_id), '[]'::jsonb) as rows
  from boundaries b
  left join private.season_weeks w on w.season_id=b.season_id and w.nfl_week=b.first_eligible_week
  left join private.season_ruleset_snapshots wr on wr.id=w.ruleset_snapshot_id
)
select clock_timestamp() as observed_at, rows as adoption_inventory,
  encode(extensions.digest(rows::text,'sha256'),'hex') as inventory_sha256
from inventory;
rollback;
