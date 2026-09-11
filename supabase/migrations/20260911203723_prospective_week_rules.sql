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
    ($old$  select card.* into strict v_card$old$,$new$  v_rules := private.season_card_rules(v_season.ruleset_snapshot_id, v_season.mode);
  if jsonb_array_length(p_positions) not between (v_rules#>>'{card,minimumPositions}')::integer and (v_rules#>>'{card,maximumPositions}')::integer
    or exists(select 1 from jsonb_array_elements(p_positions) item where
      jsonb_typeof(item->'stakeCredits') is distinct from 'number'
      or (item->>'stakeCredits')::numeric is distinct from trunc((item->>'stakeCredits')::numeric))
  then raise exception using errcode='22023', message='Invalid card positions under the frozen season rules.'; end if;
  select card.* into strict v_card$new$),
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
    ($old$'allocatedCredits', 1000,$old$,$new$'allocatedCredits', (v_rules#>>'{card,weeklyAllocationCredits}')::integer,$new$)
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

-- Owner direction, September 11: development seasons adopt approved updates
-- for future play. An opened week's rules, receipts and results never move.
alter table private.season_weeks add column ruleset_snapshot_id uuid
  references private.season_ruleset_snapshots(id);
create index season_weeks_ruleset_snapshot_id_idx
  on private.season_weeks(ruleset_snapshot_id);

-- Record the rules already in force, including open and completed weeks.
-- This changes no snapshot, accepted term, score, standings or publication.
do $migration$
begin
  if exists (
    select 1 from private.position_receipts r
    join private.season_weeks w on w.id=r.week_id
    join private.seasons s on s.id=w.season_id
    where r.ruleset_snapshot_id is distinct from s.ruleset_snapshot_id
  ) then raise exception 'Existing receipt rules require explicit reconciliation'; end if;
end;
$migration$;
update private.season_weeks w set ruleset_snapshot_id=s.ruleset_snapshot_id
from private.seasons s where s.id=w.season_id;
alter table private.season_weeks alter column ruleset_snapshot_id set not null;

create function private.pin_week_rules()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
  v_season private.seasons%rowtype;
  v_previous private.season_ruleset_snapshots%rowtype;
  v_catalog private.authoritative_season_rulesets%rowtype;
  v_snapshot_id uuid;
begin
  if tg_op='UPDATE' and old.state<>'PLANNED' then
    if new.ruleset_snapshot_id is distinct from old.ruleset_snapshot_id
      or new.season_id is distinct from old.season_id
      or new.nfl_week is distinct from old.nfl_week or new.state='PLANNED'
    then raise exception using errcode='55000', message='An opened week keeps its original rules.'; end if;
    return new;
  end if;
  select * into strict v_season from private.seasons where id=new.season_id for update;
  if new.state<>'OPEN' then
    -- Planned slates have no accepted play. Historical fixture/import records
    -- retain their season baseline; public APIs cannot insert table rows.
    new.ruleset_snapshot_id:=coalesce(new.ruleset_snapshot_id,v_season.ruleset_snapshot_id);
    return new;
  end if;
  select r.* into strict v_previous from private.season_ruleset_snapshots r
  where r.id=coalesce((select w.ruleset_snapshot_id from private.season_weeks w
    where w.season_id=new.season_id and w.nfl_week<new.nfl_week and w.state<>'PLANNED'
    order by w.nfl_week desc limit 1),v_season.ruleset_snapshot_id);
  select * into strict v_catalog from private.authoritative_season_rulesets where mode=v_season.mode for share;

  if v_previous.canonical_json=v_catalog.canonical_json
    and v_previous.sha256_hash=v_catalog.sha256_hash
    and v_previous.ruleset_version=v_catalog.ruleset_version
  then
    new.ruleset_snapshot_id:=v_previous.id;
    return new;
  end if;
  -- Finite, implemented upgrade. A future release extends this gate together
  -- with application and SQL support; changing a label cannot enable new rules.
  perform private.season_card_rules(v_previous.id,v_season.mode);
  if v_previous.ruleset_version not in ('1.0','1.1') or v_catalog.ruleset_version<>'1.2'
    or v_catalog.sha256_hash<>case v_season.mode
      when 'LIVE' then '6d9c85a0763b8c140296bda409ed3eecbe0ac4b91466b3504dd23ff4489e4ac7'
      else 'd7b74cb761ca652fad2ffff32f6e20a16326434d7e0f19d86a7e32b6a818ef8b' end
  then raise exception using errcode='22023',message='UNSUPPORTED_WEEK_RULE_UPGRADE'; end if;
  insert into private.season_ruleset_snapshots(
    ruleset_id,ruleset_version,product_bible_id,product_bible_version,mode,
    canonical_json,sha256_hash,published_at,frozen_at
  ) values (
    v_catalog.ruleset_id,v_catalog.ruleset_version,v_catalog.product_bible_id,
    v_catalog.product_bible_version,v_catalog.mode,v_catalog.canonical_json,
    v_catalog.sha256_hash,clock_timestamp(),clock_timestamp()
  ) returning id into v_snapshot_id;
  perform private.season_card_rules(v_snapshot_id,v_season.mode);
  new.ruleset_snapshot_id:=v_snapshot_id;
  return new;
end;
$$;
revoke all on function private.pin_week_rules() from public,anon,authenticated;
create trigger pin_week_rules before insert or update on private.season_weeks
for each row execute function private.pin_week_rules();

-- The Rules page can read only snapshots belonging to a member's season/week.
create policy week_ruleset_snapshots_select_member
on private.season_ruleset_snapshots for select to authenticated
using (exists(select 1 from private.season_weeks w
  where w.ruleset_snapshot_id=private.season_ruleset_snapshots.id
    and (select private.is_league_member(w.league_id))));

-- Keep existing authorization, signatures, quotes, replay and correction logic.
-- Guarded edits abort if a known baseline has changed.
do $migration$
declare v_definition text; v_change record;
begin
  select pg_get_functiondef('private.accept_authoritative_card_for_actor(uuid,text,jsonb,text)'::regprocedure) into v_definition;
  -- Card validation must follow selection/locking of this exact week.
  for v_change in select * from (values
    ($old$private.season_card_rules(v_season.ruleset_snapshot_id, v_season.mode)$old$,
     $new$private.season_card_rules(v_week.ruleset_snapshot_id, v_season.mode)$new$),
    ($old$|| v_season.ruleset_snapshot_id::text,$old$,$new$|| v_week.ruleset_snapshot_id::text,$new$),
    ($old$v_now, v_season.ruleset_snapshot_id,$old$,$new$v_now, v_week.ruleset_snapshot_id,$new$)
  ) as edits(old_text,new_text) loop
    if strpos(v_definition,v_change.old_text)=0 then raise exception 'Weekly acceptance baseline changed'; end if;
    v_definition:=replace(v_definition,v_change.old_text,v_change.new_text);
  end loop;
  execute v_definition;

  select pg_get_functiondef('api.review_live_card_quotes(text,jsonb)'::regprocedure) into v_definition;
  if strpos(v_definition,'private.season_card_rules(s.ruleset_snapshot_id,s.mode)')=0 then raise exception 'Weekly review baseline changed'; end if;
  execute replace(v_definition,'private.season_card_rules(s.ruleset_snapshot_id,s.mode)',
    'private.season_card_rules(v_week.ruleset_snapshot_id,s.mode)');

  select pg_get_functiondef('api.get_stage1_state(text)'::regprocedure) into v_definition;
  if strpos(v_definition,$old$'rulesetSnapshotId', v_season.ruleset_snapshot_id$old$)=0 then raise exception 'Weekly card read baseline changed'; end if;
  v_definition:=replace(v_definition,'v_season.ruleset_snapshot_id','coalesce(v_week.ruleset_snapshot_id,v_season.ruleset_snapshot_id)');
  if strpos(v_definition,$old$'standings', coalesce(($old$)=0 then raise exception 'Standings provenance baseline changed'; end if;
  execute replace(v_definition,$old$'standings', coalesce(($old$,$new$'standingsThroughWeek', (select standings.through_week from private.standings_snapshots standings
      where standings.season_id=v_season.id and standings.through_week<=v_week.nfl_week
      order by standings.through_week desc,standings.created_at desc,standings.id desc limit 1),
    'standings', coalesce(($new$);

  select pg_get_functiondef('private.build_regular_standings(uuid)'::regprocedure) into v_definition;
  if strpos(v_definition,'snapshot.id = season.ruleset_snapshot_id')=0 then raise exception 'Weekly standings baseline changed'; end if;
  execute replace(v_definition,'snapshot.id = season.ruleset_snapshot_id','snapshot.id = week.ruleset_snapshot_id');

  select pg_get_functiondef('api.publish_playoff_qualification(uuid,text)'::regprocedure) into v_definition;
  if strpos(v_definition,'ruleset.id = v_season.ruleset_snapshot_id')=0 then raise exception 'Qualification rules baseline changed'; end if;
  execute replace(v_definition,'ruleset.id = v_season.ruleset_snapshot_id','ruleset.id = v_week.ruleset_snapshot_id');

  select pg_get_functiondef('api.get_season_ruleset(text)'::regprocedure) into v_definition;
  if strpos(v_definition,'snapshot.id = season.ruleset_snapshot_id')=0
    or strpos(v_definition,$old$'frozenAt', snapshot.frozen_at$old$)=0
  then raise exception 'Rules page baseline changed'; end if;
  v_definition:=replace(v_definition,'snapshot.id = season.ruleset_snapshot_id',
    'snapshot.id = coalesce((select w.ruleset_snapshot_id from private.season_weeks w where w.season_id=season.id and w.state<>''PLANNED'' order by w.nfl_week desc limit 1),season.ruleset_snapshot_id)');
  v_definition:=replace(v_definition,$old$'frozenAt', snapshot.frozen_at$old$,$new$'frozenAt', snapshot.frozen_at,
    'throughWeek', (select max(w.nfl_week) from private.season_weeks w where w.season_id=season.id and w.state<>'PLANNED'),
    'weekRules', coalesce((select jsonb_agg(jsonb_build_object('week',w.nfl_week,'version',r.ruleset_version,'snapshotId',r.id,'sha256Hash',r.sha256_hash) order by w.nfl_week)
      from private.season_weeks w join private.season_ruleset_snapshots r on r.id=w.ruleset_snapshot_id
      where w.season_id=season.id and w.state<>'PLANNED'),'[]'::jsonb),
    'priorRules', coalesce((select jsonb_agg(jsonb_build_object(
      'rulesetId',r.ruleset_id,'rulesetVersion',r.ruleset_version,'productBibleId',r.product_bible_id,
      'productBibleVersion',r.product_bible_version,'mode',r.mode,'canonicalJson',r.canonical_json,
      'sha256Hash',r.sha256_hash,'publishedAt',r.published_at,'frozenAt',r.frozen_at))
      from private.season_ruleset_snapshots r where r.id<>snapshot.id and exists(
        select 1 from private.season_weeks w where w.season_id=season.id and w.state<>'PLANNED' and w.ruleset_snapshot_id=r.id)),
      '[]'::jsonb)$new$);
  execute v_definition;

  select pg_get_functiondef('private.build_season_archive_v2(uuid,uuid,uuid,integer,uuid,uuid,timestamptz)'::regprocedure) into v_definition;
  if strpos(v_definition,$old$'ruleset', jsonb_build_object($old$)=0 then raise exception 'Archive rules baseline changed'; end if;
  execute replace(v_definition,$old$'ruleset', jsonb_build_object($old$,$new$'weekRules', (select jsonb_agg(jsonb_build_object('week',w.nfl_week,'version',r.ruleset_version,'snapshotId',r.id,'sha256Hash',r.sha256_hash) order by w.nfl_week)
      from private.season_weeks w join private.season_ruleset_snapshots r on r.id=w.ruleset_snapshot_id where w.season_id=v_season.id),
    'ruleset', jsonb_build_object($new$);
end;
$migration$;
