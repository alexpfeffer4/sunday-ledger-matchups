-- Audit A12: supported-version compatibility; no snapshot or history rewrite.
-- Apply before the app release. Existing public signatures and grants are kept.
create function private.season_card_rules(p_snapshot_id uuid, p_mode text)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_snapshot private.season_ruleset_snapshots%rowtype;
  v_json jsonb;
  v_card jsonb := '{"weeklyAllocationCredits":1000,"minimumStakeCredits":50,"minimumPositions":1,"maximumPositions":20,"stakePrecision":"WHOLE_CREDITS"}'::jsonb;
  v_concentration jsonb := '{"heavyFavoriteThresholdAmerican":-200,"heavyFavoriteSinglePositionCapCredits":750,"standardSinglePositionCapCredits":1000,"eligibleOddsMinimum":null,"eligibleOddsMaximum":null,"aggregateFavoriteExposureCapCredits":null}'::jsonb;
begin
  select * into v_snapshot from private.season_ruleset_snapshots where id=p_snapshot_id;
  v_json := v_snapshot.canonical_json;
  if not coalesce(
    v_snapshot.frozen_at is not null
    and v_snapshot.ruleset_version in ('1.0','1.1','1.2')
    and p_mode in ('LIVE','SIMULATION') and v_snapshot.mode=p_mode
    and v_json->>'mode'=p_mode
    and v_json->>'version'=v_snapshot.ruleset_version
    and v_json->>'id'=v_snapshot.ruleset_id
    and v_snapshot.ruleset_id=case p_mode when 'LIVE' then 'SUNDAY-LEDGER-POC-SEASON-RULESET-V1' else 'SUNDAY-LEDGER-SIMULATION-SEASON-RULESET-V1' end
    and v_json->>'productBibleId'=v_snapshot.product_bible_id
    and v_snapshot.product_bible_id='SUNDAY-LEDGER-PRODUCT-BIBLE-V3'
    and v_json->>'productBibleVersion'=v_snapshot.product_bible_version
    and v_snapshot.product_bible_version=case v_snapshot.ruleset_version when '1.2' then '3.1' else '3.0' end
    and v_json->>'format'='SUNDAY_LEDGER_MATCHUPS' and v_json->>'sport'='NFL'
    and v_snapshot.sha256_hash ~ '^[0-9a-f]{64}$', false)
  then raise exception using errcode='22023', message='UNSUPPORTED_SEASON_CARD_RULES'; end if;
  if v_snapshot.ruleset_version in ('1.1','1.2') then
    v_card := v_card || '{"carryoverCredits":false,"acceptanceUnit":"WHOLE_CARD_ATOMIC","irreversibleAction":"CONFIRM_AND_SEAL_CARD"}'::jsonb;
    v_concentration := v_concentration || '{"status":"SETTLED_FOR_POC_V1"}'::jsonb;
  end if;
  if v_json->'card' is distinct from v_card
    or v_json->'concentration' is distinct from v_concentration
    or v_json->'markets' is distinct from '{"eligible":["MONEYLINE","SPREAD","TOTAL"],"referenceBook":"draftkings"}'::jsonb
  then raise exception using errcode='22023', message='UNSUPPORTED_SEASON_CARD_RULES'; end if;
  return jsonb_build_object('card',v_json->'card','concentration',v_json->'concentration','markets',v_json->'markets');
end;
$$;
revoke all on function private.season_card_rules(uuid,text) from public, anon, authenticated;

-- Preserve the shared acceptance engine and every freshness, privacy, replay,
-- event-start and rehearsal guard. Changed baselines abort this migration.
do $migration$
declare v_definition text; v_change record;
begin
  select pg_get_functiondef('private.accept_authoritative_card_for_actor(uuid,text,jsonb,text)'::regprocedure) into v_definition;
  for v_change in select * from (values
    ($old$  v_cap integer;$old$,$new$  v_cap integer;
  v_rules jsonb;$new$),
    ($old$jsonb_array_length(p_positions) not between 1 and 20$old$,$new$jsonb_array_length(p_positions) not between 1 and 100$new$),
    ($old$message = 'A card draft requires 1 through 20 positions.'$old$,$new$message = 'Invalid card draft payload.'$new$),
    ($old$  select week.* into strict v_week$old$,$new$  v_rules := private.season_card_rules(v_season.ruleset_snapshot_id, v_season.mode);
  if jsonb_array_length(p_positions) not between (v_rules#>>'{card,minimumPositions}')::integer and (v_rules#>>'{card,maximumPositions}')::integer
    or exists(select 1 from jsonb_array_elements(p_positions) item where
      jsonb_typeof(item->'stakeCredits') is distinct from 'number'
      or (item->>'stakeCredits')::numeric is distinct from trunc((item->>'stakeCredits')::numeric))
  then raise exception using errcode='22023', message='Invalid card positions under the frozen season rules.'; end if;
  select week.* into strict v_week$new$),
    ($old$v_existing_count + v_draft_count > 20$old$,$new$v_existing_count + v_draft_count > (v_rules#>>'{card,maximumPositions}')::integer$new$),
    ($old$message = 'A card may contain at most 20 positions.'$old$,$new$message = 'The card exceeds the frozen season pick limit.'$new$),
    ($old$v_existing_credits + v_draft_credits <> 1000$old$,$new$v_existing_credits + v_draft_credits <> (v_rules#>>'{card,weeklyAllocationCredits}')::integer$new$),
    ($old$v_item.stake_credits < 50$old$,$new$v_item.stake_credits < (v_rules#>>'{card,minimumStakeCredits}')::integer$new$),
    ($old$v_cap := case when v_snapshot.american_odds < -200 then 750 else 1000 end;$old$,$new$if not ((v_rules#>'{markets,eligible}') ? v_snapshot.market_type) then
      raise exception using errcode='22023', message='The market is not eligible under the frozen season rules.';
    end if;
    v_cap := case when v_snapshot.american_odds < (v_rules#>>'{concentration,heavyFavoriteThresholdAmerican}')::integer
      then (v_rules#>>'{concentration,heavyFavoriteSinglePositionCapCredits}')::integer
      else (v_rules#>>'{concentration,standardSinglePositionCapCredits}')::integer end;$new$),
    ($old
  ) as changes(old_text,new_text)
  loop
    if strpos(v_definition,v_change.old_text)=0 then raise exception 'Frozen card acceptance baseline changed: %', v_change.old_text; end if;
    v_definition := replace(v_definition,v_change.old_text,v_change.new_text);
  end loop;
  execute v_definition;
end;
$migration$;

-- Include the snapshot referenced by this exact season, behind the existing
-- membership/rehearsal checks. Reads never invoke the card-writing guard.
do $migration$
declare v_definition text; v_old text := $old$'rulesetSnapshotId', v_season.ruleset_snapshot_id$old$;
begin
  select pg_get_functiondef('api.get_stage1_state(text)'::regprocedure) into v_definition;
  if strpos(v_definition,v_old)=0 then raise exception 'Season read-model baseline changed'; end if;
  v_definition := replace(v_definition,v_old,$new$'rulesetSnapshotId', v_season.ruleset_snapshot_id,
      'rulesetSnapshot', (select jsonb_build_object(
        'rulesetId', r.ruleset_id, 'rulesetVersion', r.ruleset_version,
        'productBibleId', r.product_bible_id, 'productBibleVersion', r.product_bible_version,
        'mode', r.mode, 'canonicalJson', r.canonical_json,
        'sha256Hash', r.sha256_hash, 'publishedAt', r.published_at, 'frozenAt', r.frozen_at
      ) from private.season_ruleset_snapshots r where r.id=v_season.ruleset_snapshot_id)$new$);
  execute v_definition;
end;
$migration$;

-- Review checks the same supported frozen package before issuing a review.
do $migration$
declare v_definition text; v_change record;
begin
  select pg_get_functiondef('api.review_live_card_quotes(text,jsonb)'::regprocedure) into v_definition;
  for v_change in select * from (values
    ($old$  v_id uuid;$old$,$new$  v_id uuid;
  v_rules jsonb;$new$),
    ($old$jsonb_array_length(p_positions) not between 1 and 20$old$,$new$jsonb_array_length(p_positions) not between 1 and 100$new$),
    ($old$  select * into strict v_card from private.weekly_cards$old$,$new$  select private.season_card_rules(s.ruleset_snapshot_id,s.mode) into v_rules from private.seasons s where s.id=v_week.season_id;
  if jsonb_array_length(p_positions) not between (v_rules#>>'{card,minimumPositions}')::integer and (v_rules#>>'{card,maximumPositions}')::integer
    or exists(select 1 from jsonb_array_elements(p_positions) item where
      jsonb_typeof(item->'stakeCredits') is distinct from 'number'
      or (item->>'stakeCredits')::numeric is distinct from trunc((item->>'stakeCredits')::numeric)
      or (item->>'stakeCredits')::numeric < (v_rules#>>'{card,minimumStakeCredits}')::integer)
    or (select sum((item->>'stakeCredits')::numeric) from jsonb_array_elements(p_positions) item) is distinct from (v_rules#>>'{card,weeklyAllocationCredits}')::numeric
  then raise exception using errcode='22023', message='Invalid card positions under the frozen season rules.'; end if;
  select * into strict v_card from private.weekly_cards$new$)
  ) as changes(old_text,new_text)
  loop
    if strpos(v_definition,v_change.old_text)=0 then raise exception 'Frozen card review baseline changed'; end if;
    v_definition := replace(v_definition,v_change.old_text,v_change.new_text);
  end loop;
  execute v_definition;
end;
$migration$;
allocatedCredits', 1000,$old$,$new
  ) as changes(old_text,new_text)
  loop
    if strpos(v_definition,v_change.old_text)=0 then raise exception 'Frozen card acceptance baseline changed: %', v_change.old_text; end if;
    v_definition := replace(v_definition,v_change.old_text,v_change.new_text);
  end loop;
  execute v_definition;
end;
$migration$;

-- Include the snapshot referenced by this exact season, behind the existing
-- membership/rehearsal checks. Reads never invoke the card-writing guard.
do $migration$
declare v_definition text; v_old text := $old$'rulesetSnapshotId', v_season.ruleset_snapshot_id$old$;
begin
  select pg_get_functiondef('api.get_stage1_state(text)'::regprocedure) into v_definition;
  if strpos(v_definition,v_old)=0 then raise exception 'Season read-model baseline changed'; end if;
  v_definition := replace(v_definition,v_old,$new$'rulesetSnapshotId', v_season.ruleset_snapshot_id,
      'rulesetSnapshot', (select jsonb_build_object(
        'rulesetId', r.ruleset_id, 'rulesetVersion', r.ruleset_version,
        'productBibleId', r.product_bible_id, 'productBibleVersion', r.product_bible_version,
        'mode', r.mode, 'canonicalJson', r.canonical_json,
        'sha256Hash', r.sha256_hash, 'publishedAt', r.published_at, 'frozenAt', r.frozen_at
      ) from private.season_ruleset_snapshots r where r.id=v_season.ruleset_snapshot_id)$new$);
  execute v_definition;
end;
$migration$;

-- Review checks the same supported frozen package before issuing a review.
do $migration$
declare v_definition text; v_change record;
begin
  select pg_get_functiondef('api.review_live_card_quotes(text,jsonb)'::regprocedure) into v_definition;
  for v_change in select * from (values
    ($old$  v_id uuid;$old$,$new$  v_id uuid;
  v_rules jsonb;$new$),
    ($old$jsonb_array_length(p_positions) not between 1 and 20$old$,$new$jsonb_array_length(p_positions) not between 1 and 100$new$),
    ($old$  select * into strict v_card from private.weekly_cards$old$,$new$  select private.season_card_rules(s.ruleset_snapshot_id,s.mode) into v_rules from private.seasons s where s.id=v_week.season_id;
  if jsonb_array_length(p_positions) not between (v_rules#>>'{card,minimumPositions}')::integer and (v_rules#>>'{card,maximumPositions}')::integer
    or exists(select 1 from jsonb_array_elements(p_positions) item where
      jsonb_typeof(item->'stakeCredits') is distinct from 'number'
      or (item->>'stakeCredits')::numeric is distinct from trunc((item->>'stakeCredits')::numeric)
      or (item->>'stakeCredits')::numeric < (v_rules#>>'{card,minimumStakeCredits}')::integer)
    or (select sum((item->>'stakeCredits')::numeric) from jsonb_array_elements(p_positions) item) is distinct from (v_rules#>>'{card,weeklyAllocationCredits}')::numeric
  then raise exception using errcode='22023', message='Invalid card positions under the frozen season rules.'; end if;
  select * into strict v_card from private.weekly_cards$new$)
  ) as changes(old_text,new_text)
  loop
    if strpos(v_definition,v_change.old_text)=0 then raise exception 'Frozen card review baseline changed'; end if;
    v_definition := replace(v_definition,v_change.old_text,v_change.new_text);
  end loop;
  execute v_definition;
end;
$migration$;
allocatedCredits', (v_rules#>>'{card,weeklyAllocationCredits}')::integer,$new$)
  ) as changes(old_text,new_text)
  loop
    if strpos(v_definition,v_change.old_text)=0 then raise exception 'Frozen card acceptance baseline changed: %', v_change.old_text; end if;
    v_definition := replace(v_definition,v_change.old_text,v_change.new_text);
  end loop;
  execute v_definition;
end;
$migration$;

-- Include the snapshot referenced by this exact season, behind the existing
-- membership/rehearsal checks. Reads never invoke the card-writing guard.
do $migration$
declare v_definition text; v_old text := $old$'rulesetSnapshotId', v_season.ruleset_snapshot_id$old$;
begin
  select pg_get_functiondef('api.get_stage1_state(text)'::regprocedure) into v_definition;
  if strpos(v_definition,v_old)=0 then raise exception 'Season read-model baseline changed'; end if;
  v_definition := replace(v_definition,v_old,$new$'rulesetSnapshotId', v_season.ruleset_snapshot_id,
      'rulesetSnapshot', (select jsonb_build_object(
        'rulesetId', r.ruleset_id, 'rulesetVersion', r.ruleset_version,
        'productBibleId', r.product_bible_id, 'productBibleVersion', r.product_bible_version,
        'mode', r.mode, 'canonicalJson', r.canonical_json,
        'sha256Hash', r.sha256_hash, 'publishedAt', r.published_at, 'frozenAt', r.frozen_at
      ) from private.season_ruleset_snapshots r where r.id=v_season.ruleset_snapshot_id)$new$);
  execute v_definition;
end;
$migration$;

-- Review checks the same supported frozen package before issuing a review.
do $migration$
declare v_definition text; v_change record;
begin
  select pg_get_functiondef('api.review_live_card_quotes(text,jsonb)'::regprocedure) into v_definition;
  for v_change in select * from (values
    ($old$  v_id uuid;$old$,$new$  v_id uuid;
  v_rules jsonb;$new$),
    ($old$jsonb_array_length(p_positions) not between 1 and 20$old$,$new$jsonb_array_length(p_positions) not between 1 and 100$new$),
    ($old$  select * into strict v_card from private.weekly_cards$old$,$new$  select private.season_card_rules(s.ruleset_snapshot_id,s.mode) into v_rules from private.seasons s where s.id=v_week.season_id;
  if jsonb_array_length(p_positions) not between (v_rules#>>'{card,minimumPositions}')::integer and (v_rules#>>'{card,maximumPositions}')::integer
    or exists(select 1 from jsonb_array_elements(p_positions) item where
      jsonb_typeof(item->'stakeCredits') is distinct from 'number'
      or (item->>'stakeCredits')::numeric is distinct from trunc((item->>'stakeCredits')::numeric)
      or (item->>'stakeCredits')::numeric < (v_rules#>>'{card,minimumStakeCredits}')::integer)
    or (select sum((item->>'stakeCredits')::numeric) from jsonb_array_elements(p_positions) item) is distinct from (v_rules#>>'{card,weeklyAllocationCredits}')::numeric
  then raise exception using errcode='22023', message='Invalid card positions under the frozen season rules.'; end if;
  select * into strict v_card from private.weekly_cards$new$)
  ) as changes(old_text,new_text)
  loop
    if strpos(v_definition,v_change.old_text)=0 then raise exception 'Frozen card review baseline changed'; end if;
    v_definition := replace(v_definition,v_change.old_text,v_change.new_text);
  end loop;
  execute v_definition;
end;
$migration$;
