-- GLOBAL LIVE + SIMULATION catalog activation, not a pilot-only toggle.
-- Default execution validates and previews the operation without updating rows.
-- COMMIT of changes requires explicit settings supplied by the approved operator:
--   set sunday_ledger.rolling_apply = 'true';
--   set sunday_ledger.rolling_release_sha = '<verified deployed 40-character SHA>';
--   set sunday_ledger.rolling_approval_reference = '<recorded release approval>';
--   set sunday_ledger.rolling_inventory_sha = '<fresh preflight inventory_sha256>';
-- Later owner authorization permits release after required checks and blockers clear.
-- Record that clearance before supplying Production settings; this file is not evidence.
-- Never include credentials or participant data in the approval reference.
-- Run in a dedicated connection; do not paste this into an existing transaction.
begin transaction isolation level read committed;
set local lock_timeout='5s';
set local statement_timeout='20s';
do $activation$
declare
  v_package record;
  v_catalog record;
  v_snapshot record;
  v_expected_hash text;
  v_relation text;
  v_role text;
  v_function text;
  v_apply boolean := coalesce(nullif(current_setting('sunday_ledger.rolling_apply',true),'')::boolean,false);
  v_release_sha text := coalesce(current_setting('sunday_ledger.rolling_release_sha',true),'');
  v_approval_reference text := coalesce(current_setting('sunday_ledger.rolling_approval_reference',true),'');
  v_expected_inventory_sha text := coalesce(current_setting('sunday_ledger.rolling_inventory_sha',true),'');
  v_inventory jsonb;
  v_inventory_sha text;
  v_opened_bindings_before jsonb;
  v_opened_bindings_after jsonb;
  v_updated integer;
begin
  -- Week opening takes FOR SHARE on these rows. Taking only these locks avoids
  -- reversing its season -> week -> catalog lock order. An opening either sees
  -- the old package before this transaction or the complete new package after it.
  -- Do not lock seasons or weeks after taking these catalog locks.
  perform mode from private.authoritative_season_rulesets order by mode for update;
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
  select rows, encode(extensions.digest(rows::text,'sha256'),'hex')
    into v_inventory, v_inventory_sha from inventory;
  raise notice 'Activation inventory SHA256: %', v_inventory_sha;
  raise notice 'Scope: both mode catalogs; future unopened weeks and new seasons only.';

  if (select count(*) from private.authoritative_season_rulesets where ruleset_version='1.3')=2 then
    raise notice 'ALREADY_ACTIVE: exact 1.3 catalogs present; no mutation performed.';
    return;
  end if;
  if not v_apply then
    raise notice 'DRY_RUN: exact 1.2 catalogs retained. Save the metadata preflight for release approval.';
    return;
  end if;
  if v_release_sha !~ '^[0-9a-f]{40}$'
    or btrim(v_approval_reference)='' or char_length(v_approval_reference)>500 then
    raise exception 'Verified deployed SHA and recorded release approval are required to apply';
  end if;
  if v_expected_inventory_sha !~ '^[0-9a-f]{64}$'
    or v_expected_inventory_sha is distinct from v_inventory_sha then
    raise exception 'Adoption inventory changed or is missing; rerun the read-only preflight and review the boundary';
  end if;

  select coalesce(jsonb_agg(jsonb_build_array(w.id,w.season_id,w.nfl_week,w.ruleset_snapshot_id)
      order by w.id),'[]'::jsonb) into v_opened_bindings_before
  from private.season_weeks w where w.state<>'PLANNED';

  update private.authoritative_season_rulesets c
  set ruleset_version='1.3', product_bible_version='3.2',
      canonical_json=p.canonical_json, sha256_hash=p.sha256_hash
  from private.prepared_rolling_rulesets p
  where p.mode=c.mode and c.ruleset_version='1.2' and c.product_bible_version='3.1'
    and c.sha256_hash=case c.mode
      when 'LIVE' then '6d9c85a0763b8c140296bda409ed3eecbe0ac4b91466b3504dd23ff4489e4ac7'
      when 'SIMULATION' then 'd7b74cb761ca652fad2ffff32f6e20a16326434d7e0f19d86a7e32b6a818ef8b' end;
  get diagnostics v_updated=row_count;
  if v_updated<>2 then raise exception 'Expected exactly two catalog updates, got %',v_updated; end if;
  if exists(select 1 from private.authoritative_season_rulesets c
      join private.prepared_rolling_rulesets p on p.mode=c.mode
      where c.ruleset_version<>'1.3' or c.product_bible_version<>'3.2'
        or c.canonical_json<>p.canonical_json or c.sha256_hash<>p.sha256_hash) then
    raise exception 'Catalog verification failed; transaction must roll back';
  end if;

  select coalesce(jsonb_agg(jsonb_build_array(w.id,w.season_id,w.nfl_week,w.ruleset_snapshot_id)
      order by w.id),'[]'::jsonb) into v_opened_bindings_after
  from private.season_weeks w where w.state<>'PLANNED';
  if v_opened_bindings_after is distinct from v_opened_bindings_before then
    raise exception 'An opened week binding changed during activation; transaction must roll back';
  end if;
  raise notice 'ACTIVATED: exact 1.3 catalogs; deployed release %, approval reference %.',v_release_sha,v_approval_reference;
  raise notice 'Existing snapshots, weeks, receipts and results were not updated. Retain this release output privately.';
end;
$activation$;
select mode, ruleset_version, product_bible_version, sha256_hash
from private.authoritative_season_rulesets order by mode;
commit;
