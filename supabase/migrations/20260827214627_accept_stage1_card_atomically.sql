-- Stage 2 Card Builder: validate and accept every draft position in one
-- transaction. Existing receipts remain immutable and individually auditable.

create or replace function api.accept_stage1_card(
  p_league_slug text,
  p_positions jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_command private.command_receipts%rowtype;
  v_league private.leagues%rowtype;
  v_season private.seasons%rowtype;
  v_week private.season_weeks%rowtype;
  v_card private.weekly_cards%rowtype;
  v_snapshot private.market_snapshots%rowtype;
  v_item record;
  v_now timestamptz;
  v_existing_credits integer;
  v_existing_count integer;
  v_draft_credits integer;
  v_draft_count integer;
  v_matched_count integer;
  v_cap integer;
  v_request_hash text;
  v_position_request_hash text;
  v_receipt_id uuid;
  v_receipt_hash text;
  v_receipts jsonb := '[]'::jsonb;
  v_response jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;
  if p_positions is null
    or jsonb_typeof(p_positions) <> 'array'
    or jsonb_array_length(p_positions) not between 1 and 20 then
    raise exception using errcode = '22023', message = 'A card draft requires 1 through 20 positions.';
  end if;
  if p_idempotency_key is null
    or char_length(p_idempotency_key) not between 8 and 120 then
    raise exception using errcode = '22023', message = 'Idempotency key is invalid.';
  end if;

  v_request_hash := encode(
    extensions.digest(
      lower(p_league_slug) || ':' || p_positions::text,
      'sha256'
    ),
    'hex'
  );

  select * into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'ACCEPT_STAGE1_CARD'
    and command.idempotency_key = p_idempotency_key;

  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json || jsonb_build_object('replayed', true);
  end if;

  select league.* into strict v_league
  from private.leagues as league
  where league.slug = lower(p_league_slug);

  if not private.is_league_member(v_league.id) then
    raise exception using errcode = '42501', message = 'League membership required.';
  end if;

  select season.* into strict v_season
  from private.seasons as season
  where season.league_id = v_league.id
    and season.lifecycle = 'REGULAR'
  order by season.created_at desc
  limit 1;

  select week.* into strict v_week
  from private.season_weeks as week
  where week.season_id = v_season.id
    and week.nfl_week = 1
  for update;

  select card.* into strict v_card
  from private.weekly_cards as card
  where card.week_id = v_week.id
    and card.owner_user_id = v_user_id
  for update;

  v_now := private.stage1_season_time(v_season.id);
  if v_week.state <> 'OPEN'
    or v_now < v_week.opens_at
    or v_now >= v_week.common_lock_at then
    raise exception using errcode = '55000', message = 'The Week 1 card is not open.';
  end if;

  select coalesce(sum(receipt.stake_credits), 0), count(*)
  into v_existing_credits, v_existing_count
  from private.position_receipts as receipt
  where receipt.card_id = v_card.id;

  select coalesce(sum((item.value ->> 'stakeCredits')::integer), 0), count(*)
  into v_draft_credits, v_draft_count
  from jsonb_array_elements(p_positions) as item(value);

  if v_existing_count + v_draft_count > 20 then
    raise exception using errcode = '22023', message = 'A card may contain at most 20 positions.';
  end if;
  if v_existing_credits + v_draft_credits <> 1000 then
    raise exception using errcode = '22023', message = 'The complete card must allocate exactly 1,000 credits.';
  end if;

  select count(*) into v_matched_count
  from jsonb_array_elements(p_positions) as item(value)
  join private.market_snapshots as snapshot
    on snapshot.id = (item.value ->> 'marketSnapshotId')::uuid
  join private.slate_items as slate_item
    on slate_item.market_snapshot_id = snapshot.id
   and slate_item.week_id = v_week.id;

  if v_matched_count <> v_draft_count then
    raise exception using errcode = '22023', message = 'Every draft position must use the current eligible slate.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_positions) as item(value)
    join private.market_snapshots as snapshot
      on snapshot.id = (item.value ->> 'marketSnapshotId')::uuid
    group by snapshot.event_id, snapshot.market_type
    having count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'A card cannot contain opposing sides of one event and market.';
  end if;

  for v_item in
    select
      item.ordinality::integer as position_number,
      (item.value ->> 'marketSnapshotId')::uuid as market_snapshot_id,
      (item.value ->> 'stakeCredits')::integer as stake_credits,
      item.value ->> 'payloadHash' as payload_hash
    from jsonb_array_elements(p_positions) with ordinality as item(value, ordinality)
    order by item.ordinality
  loop
    if v_item.stake_credits is null or v_item.stake_credits < 50 then
      raise exception using errcode = '22023', message = 'Positions require at least 50 whole credits.';
    end if;
    if v_item.payload_hash is null or v_item.payload_hash !~ '^[0-9a-f]{64}$' then
      raise exception using errcode = '22023', message = 'The quote fingerprint is invalid.';
    end if;

    select snapshot.* into strict v_snapshot
    from private.market_snapshots as snapshot
    join private.slate_items as slate_item
      on slate_item.market_snapshot_id = snapshot.id
     and slate_item.week_id = v_week.id
    where snapshot.id = v_item.market_snapshot_id;

    if v_snapshot.payload_hash <> v_item.payload_hash then
      raise exception using errcode = '40001', message = 'QUOTE_CHANGED';
    end if;
    if v_snapshot.quality_status <> 'HEALTHY' then
      raise exception using errcode = '55000', message = 'This market is not currently eligible.';
    end if;
    if v_snapshot.observed_at > v_now
      or v_snapshot.observed_at < v_now - interval '2 minutes' then
      raise exception using errcode = '55000', message = 'A quote is stale and the card must be reviewed again.';
    end if;

    v_cap := case when v_snapshot.american_odds < -200 then 750 else 1000 end;
    if v_item.stake_credits > v_cap then
      raise exception using errcode = '22023', message = 'The selected odds cap a position below the requested stake.';
    end if;

    if exists (
      select 1
      from private.position_receipts as receipt
      where receipt.card_id = v_card.id
        and receipt.event_id = v_snapshot.event_id
        and receipt.market_type = v_snapshot.market_type
    ) then
      raise exception using errcode = '23505', message = 'This event and market is already on the card.';
    end if;
  end loop;

  for v_item in
    select
      item.ordinality::integer as position_number,
      (item.value ->> 'marketSnapshotId')::uuid as market_snapshot_id,
      (item.value ->> 'stakeCredits')::integer as stake_credits
    from jsonb_array_elements(p_positions) with ordinality as item(value, ordinality)
    order by item.ordinality
  loop
    select snapshot.* into strict v_snapshot
    from private.market_snapshots as snapshot
    where snapshot.id = v_item.market_snapshot_id;

    v_receipt_id := gen_random_uuid();
    v_position_request_hash := encode(
      extensions.digest(
        v_request_hash || ':' || v_item.position_number::text,
        'sha256'
      ),
      'hex'
    );
    v_receipt_hash := encode(
      extensions.digest(
        v_receipt_id::text || ':' || v_card.id::text || ':'
        || v_snapshot.id::text || ':' || v_item.stake_credits::text || ':'
        || v_now::text || ':' || v_season.ruleset_snapshot_id::text,
        'sha256'
      ),
      'hex'
    );

    insert into private.position_receipts (
      id,
      card_id,
      week_id,
      league_id,
      entry_id,
      owner_user_id,
      event_id,
      market_snapshot_id,
      market_type,
      outcome_key,
      proposition,
      line_milli,
      american_odds,
      stake_credits,
      quote_observed_at,
      accepted_at,
      ruleset_snapshot_id,
      idempotency_key,
      request_hash,
      receipt_hash
    ) values (
      v_receipt_id,
      v_card.id,
      v_week.id,
      v_league.id,
      v_card.entry_id,
      v_user_id,
      v_snapshot.event_id,
      v_snapshot.id,
      v_snapshot.market_type,
      v_snapshot.outcome_key,
      v_snapshot.proposition,
      v_snapshot.line_milli,
      v_snapshot.american_odds,
      v_item.stake_credits,
      v_snapshot.observed_at,
      v_now,
      v_season.ruleset_snapshot_id,
      'card:' || substr(v_position_request_hash, 1, 58) || ':'
        || lpad(v_item.position_number::text, 2, '0'),
      v_position_request_hash,
      v_receipt_hash
    );

    v_receipts := v_receipts || jsonb_build_array(
      jsonb_build_object(
        'receiptId', v_receipt_id,
        'receiptHash', v_receipt_hash,
        'marketSnapshotId', v_snapshot.id,
        'stakeCredits', v_item.stake_credits
      )
    );
  end loop;

  update private.slates
  set frozen_at = coalesce(frozen_at, v_now)
  where week_id = v_week.id;

  v_response := jsonb_build_object(
    'receipts', v_receipts,
    'allocatedCredits', 1000,
    'remainingCredits', 0,
    'positionCount', v_existing_count + v_draft_count,
    'acceptedPositionCount', v_draft_count,
    'replayed', false
  );

  insert into private.command_receipts (
    league_id,
    actor_user_id,
    command_name,
    idempotency_key,
    request_hash,
    response_json
  ) values (
    v_league.id,
    v_user_id,
    'ACCEPT_STAGE1_CARD',
    p_idempotency_key,
    v_request_hash,
    v_response
  );

  return v_response;
end;
$$;

revoke execute on function api.accept_stage1_card(text, jsonb, text) from public, anon;
grant execute on function api.accept_stage1_card(text, jsonb, text) to authenticated;

-- Keep the legacy function for historical migration replay, but remove the
-- participant-facing piecemeal command now that full-card acceptance exists.
revoke execute on function api.accept_stage1_position(text, uuid, integer, text, text) from authenticated;
