-- Owner Guided Rehearsal
--
-- This is a private orchestration layer over the authoritative Simulation
-- lifecycle. It owns no schedule, card, receipt, result, standings, playoff,
-- correction, champion, or archive implementation.

create table private.owner_rehearsal_entitlements (
  user_id uuid primary key references private.profiles (id) on delete cascade,
  granted_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  note text not null default 'Owner Guided Rehearsal',
  check (revoked_at is null or revoked_at >= granted_at)
);

create table private.owner_rehearsals (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references private.profiles (id),
  league_id uuid not null unique references private.leagues (id),
  season_id uuid not null unique,
  generation integer not null check (generation > 0),
  rehearsal_seed text not null check (char_length(rehearsal_seed) between 16 and 160),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'RESET')),
  checkpoint text not null default 'FORMATION_EMPTY' check (checkpoint in (
    'FORMATION_EMPTY', 'FORMATION_READY',
    'WEEK_1_OPEN', 'WEEK_1_PARTIAL', 'WEEK_1_PROVISIONAL', 'WEEK_1_FINAL',
    'WEEK_2_OPEN', 'WEEK_2_FINAL',
    'WEEK_5_OPEN', 'WEEK_5_FINAL',
    'WEEK_8_OPEN', 'WEEK_8_PROVISIONAL', 'WEEK_8_CORRECTED',
    'WEEK_14_OPEN', 'WEEK_14_FINAL',
    'WEEK_15_OPEN', 'WEEK_15_FINAL',
    'WEEK_16_OPEN', 'WEEK_16_FINAL',
    'WEEK_17_OPEN', 'WEEK_17_CHAMPION',
    'WEEK_18_OPEN', 'COMPLETE'
  )),
  checkpoint_ordinal integer not null default 0 check (checkpoint_ordinal between 0 and 22),
  started_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  reset_at timestamptz,
  foreign key (season_id, league_id)
    references private.seasons (id, league_id),
  unique (owner_user_id, generation),
  check (
    (status = 'ACTIVE' and reset_at is null)
    or (status = 'RESET' and reset_at is not null)
  )
);

create unique index owner_rehearsals_one_active_per_owner_idx
  on private.owner_rehearsals (owner_user_id)
  where status = 'ACTIVE';
create index owner_rehearsals_active_league_idx
  on private.owner_rehearsals (league_id, owner_user_id)
  where status = 'ACTIVE';

create table private.owner_rehearsal_bots (
  rehearsal_id uuid not null references private.owner_rehearsals (id),
  bot_number integer not null check (bot_number between 1 and 9),
  bot_user_id uuid not null unique references auth.users (id),
  display_name text not null check (char_length(display_name) between 1 and 60),
  created_at timestamptz not null default clock_timestamp(),
  primary key (rehearsal_id, bot_number),
  unique (rehearsal_id, display_name)
);

create index owner_rehearsal_bots_rehearsal_user_idx
  on private.owner_rehearsal_bots (rehearsal_id, bot_user_id);

create table private.owner_rehearsal_events (
  id uuid primary key default gen_random_uuid(),
  rehearsal_id uuid not null references private.owner_rehearsals (id),
  checkpoint text not null,
  checkpoint_ordinal integer not null check (checkpoint_ordinal between 0 and 22),
  operation_key text not null check (char_length(operation_key) between 8 and 120),
  created_at timestamptz not null default clock_timestamp(),
  unique (rehearsal_id, operation_key)
);

create index owner_rehearsal_events_timeline_idx
  on private.owner_rehearsal_events (rehearsal_id, checkpoint_ordinal, created_at);

create table private.owner_rehearsal_card_choices (
  rehearsal_id uuid not null references private.owner_rehearsals (id),
  nfl_week integer not null check (nfl_week between 1 and 18),
  choice text not null check (choice in ('MANUAL', 'SAMPLE')),
  sealed_at timestamptz not null,
  primary key (rehearsal_id, nfl_week)
);

alter table private.owner_rehearsal_entitlements enable row level security;
alter table private.owner_rehearsals enable row level security;
alter table private.owner_rehearsal_bots enable row level security;
alter table private.owner_rehearsal_events enable row level security;
alter table private.owner_rehearsal_card_choices enable row level security;

revoke all on table private.owner_rehearsal_entitlements from public, anon, authenticated;
revoke all on table private.owner_rehearsals from public, anon, authenticated;
revoke all on table private.owner_rehearsal_bots from public, anon, authenticated;
revoke all on table private.owner_rehearsal_events from public, anon, authenticated;
revoke all on table private.owner_rehearsal_card_choices from public, anon, authenticated;

create or replace function private.owner_rehearsal_entitled(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1
    from private.owner_rehearsal_entitlements as entitlement
    where entitlement.user_id = p_user_id
      and entitlement.revoked_at is null
  );
$$;

revoke all on function private.owner_rehearsal_entitled(uuid)
from public, anon, authenticated;

-- Rehearsal memberships are readable and commandable only by the active,
-- entitled owner. Credentialless bots and retired rehearsals receive no
-- member-shaped read exception.
create or replace function private.is_league_member(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from private.league_memberships as membership
      where membership.league_id = p_league_id
        and membership.user_id = (select auth.uid())
    )
    and (
      not exists (
        select 1
        from private.owner_rehearsals as rehearsal
        where rehearsal.league_id = p_league_id
      )
      or exists (
        select 1
        from private.owner_rehearsals as rehearsal
        where rehearsal.league_id = p_league_id
          and rehearsal.owner_user_id = (select auth.uid())
          and rehearsal.status = 'ACTIVE'
          and private.owner_rehearsal_entitled(rehearsal.owner_user_id)
      )
    );
$$;

create or replace function private.is_league_commissioner(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_league_member(p_league_id)
    and exists (
      select 1
      from private.league_memberships as membership
      where membership.league_id = p_league_id
        and membership.user_id = (select auth.uid())
        and membership.role = 'COMMISSIONER'
    );
$$;

revoke all on function private.is_league_member(uuid) from public, anon;
revoke all on function private.is_league_commissioner(uuid) from public, anon;
grant execute on function private.is_league_member(uuid) to authenticated;
grant execute on function private.is_league_commissioner(uuid) to authenticated;

-- Owner rehearsals stay out of the normal league switcher. Their only entry is
-- the entitled Owner tools route.
create or replace view api.my_leagues as
select
  league.id,
  league.name,
  league.slug,
  membership.role,
  membership.joined_at,
  season.mode,
  season.nfl_year,
  season.lifecycle,
  league.archived_at,
  (
    select count(*)::integer
    from private.league_memberships as member_count
    where member_count.league_id = league.id
  ) as member_count,
  (
    select max(week.nfl_week)
    from private.season_weeks as week
    where week.season_id = season.id
  ) as current_week,
  membership.role = 'COMMISSIONER'
    and private.can_delete_empty_draft_league(league.id) as can_delete
from private.league_memberships as membership
join private.leagues as league on league.id = membership.league_id
join lateral (
  select current_season.id,
         current_season.mode,
         current_season.nfl_year,
         current_season.lifecycle
  from private.seasons as current_season
  where current_season.league_id = league.id
  order by current_season.created_at desc
  limit 1
) as season on true
where membership.user_id = (select auth.uid())
  and not exists (
    select 1 from private.owner_rehearsals as rehearsal
    where rehearsal.league_id = league.id
  );

revoke all on api.my_leagues from anon;
grant select on api.my_leagues to authenticated;

create or replace function private.guard_owner_rehearsal_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league_id uuid := coalesce(new.league_id, old.league_id);
  v_rehearsal_id uuid;
begin
  select rehearsal.id into v_rehearsal_id
  from private.owner_rehearsals as rehearsal
  where rehearsal.league_id = v_league_id;
  if v_rehearsal_id is not null and coalesce(
    current_setting('sunday_ledger.owner_rehearsal_operation', true), ''
  ) <> v_rehearsal_id::text then
    raise exception using errcode = '42501', message = 'Owner rehearsal membership is managed only by the guided rehearsal.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger owner_rehearsal_membership_guard
before insert or update or delete on private.league_memberships
for each row execute function private.guard_owner_rehearsal_membership();

create or replace function private.guard_owner_rehearsal_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from private.owner_rehearsals as rehearsal
    where rehearsal.league_id = new.league_id
  ) then
    raise exception using errcode = '42501', message = 'Owner rehearsals do not send invitations.';
  end if;
  return new;
end;
$$;

create trigger owner_rehearsal_invite_guard
before insert on private.league_invites
for each row execute function private.guard_owner_rehearsal_invite();

create or replace function private.guard_owner_rehearsal_league()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rehearsal_id uuid;
begin
  select rehearsal.id into v_rehearsal_id
  from private.owner_rehearsals as rehearsal
  where rehearsal.league_id = old.id;
  if v_rehearsal_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'Owner rehearsal history is retired through Reset rehearsal.';
  end if;
  if new.name is distinct from old.name
    or new.slug is distinct from old.slug
    or new.created_by is distinct from old.created_by
    or (
      new.archived_at is distinct from old.archived_at
      and coalesce(current_setting('sunday_ledger.owner_rehearsal_operation', true), '')
        <> v_rehearsal_id::text
    ) then
    raise exception using errcode = '42501', message = 'Owner rehearsal identity is fixed.';
  end if;
  return new;
end;
$$;

create trigger owner_rehearsal_league_guard
before update or delete on private.leagues
for each row execute function private.guard_owner_rehearsal_league();

create or replace function private.guard_owner_rehearsal_season_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from private.owner_rehearsals as rehearsal
    where rehearsal.season_id = old.id
  ) and (
    new.mode is distinct from old.mode
    or new.league_id is distinct from old.league_id
    or new.ruleset_snapshot_id is distinct from old.ruleset_snapshot_id
  ) then
    raise exception using errcode = '42501', message = 'Owner rehearsal season identity is fixed.';
  end if;
  return new;
end;
$$;

create trigger owner_rehearsal_season_identity_guard
before update on private.seasons
for each row execute function private.guard_owner_rehearsal_season_identity();

create or replace function private.guard_owner_rehearsal_bot_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from private.owner_rehearsal_bots as bot
    where bot.bot_user_id = coalesce(new.user_id, old.user_id)
  ) then
    raise exception using errcode = '42501', message = 'Owner rehearsal bots cannot authenticate.';
  end if;
  return new;
end;
$$;

create trigger owner_rehearsal_bot_identity_guard
before insert or update on auth.identities
for each row execute function private.guard_owner_rehearsal_bot_identity();

create or replace function private.guard_owner_rehearsal_bot_user_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from private.owner_rehearsal_bots as bot
    where bot.bot_user_id = old.id
  ) then
    raise exception using errcode = '42501', message = 'Owner rehearsal bot principals are credentialless and immutable.';
  end if;
  return new;
end;
$$;

create trigger owner_rehearsal_bot_user_update_guard
before update on auth.users
for each row execute function private.guard_owner_rehearsal_bot_user_update();

create trigger owner_rehearsal_bots_append_only
before update or delete on private.owner_rehearsal_bots
for each row execute function private.reject_competitive_mutation();
create trigger owner_rehearsal_events_append_only
before update or delete on private.owner_rehearsal_events
for each row execute function private.reject_competitive_mutation();
create trigger owner_rehearsal_card_choices_append_only
before update or delete on private.owner_rehearsal_card_choices
for each row execute function private.reject_competitive_mutation();

revoke all on function private.guard_owner_rehearsal_membership()
from public, anon, authenticated;
revoke all on function private.guard_owner_rehearsal_invite()
from public, anon, authenticated;
revoke all on function private.guard_owner_rehearsal_league()
from public, anon, authenticated;
revoke all on function private.guard_owner_rehearsal_season_identity()
from public, anon, authenticated;
revoke all on function private.guard_owner_rehearsal_bot_identity()
from public, anon, authenticated;
revoke all on function private.guard_owner_rehearsal_bot_user_update()
from public, anon, authenticated;

-- One implementation accepts a whole authoritative card for either the real
-- caller or a credentialless rehearsal participant. The public wrapper always
-- supplies auth.uid(); only private rehearsal orchestration can supply a bot.
create or replace function private.accept_authoritative_card_for_actor(
  p_actor_user_id uuid,
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
  v_user_id uuid := p_actor_user_id;
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
    extensions.digest(lower(p_league_slug) || ':' || p_positions::text, 'sha256'),
    'hex'
  );

  select command.* into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'ACCEPT_STAGE1_CARD'
    and command.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json || jsonb_build_object('replayed', true);
  end if;

  select league.* into strict v_league
  from private.leagues as league
  where league.slug = lower(p_league_slug);

  if not exists (
    select 1 from private.league_memberships as membership
    where membership.league_id = v_league.id
      and membership.user_id = v_user_id
  ) then
    raise exception using errcode = '42501', message = 'League membership required.';
  end if;
  if exists (
    select 1 from private.owner_rehearsals as rehearsal
    where rehearsal.league_id = v_league.id
  ) and not exists (
    select 1 from private.owner_rehearsals as rehearsal
    where rehearsal.league_id = v_league.id
      and rehearsal.status = 'ACTIVE'
      and (
        (
          rehearsal.owner_user_id = v_user_id
          and private.owner_rehearsal_entitled(v_user_id)
        )
        or exists (
          select 1 from private.owner_rehearsal_bots as bot
          where bot.rehearsal_id = rehearsal.id
            and bot.bot_user_id = v_user_id
        )
      )
  ) then
    raise exception using errcode = '42501', message = 'Owner rehearsal not found.';
  end if;

  select season.* into strict v_season
  from private.seasons as season
  where season.league_id = v_league.id
    and season.lifecycle in ('REGULAR', 'PLAYOFFS', 'CHAMPION_FINAL', 'WEEK_18_EXHIBITION')
  order by season.created_at desc
  limit 1;

  select week.* into strict v_week
  from private.season_weeks as week
  where week.season_id = v_season.id
    and week.nfl_week = (
      select max(current_week.nfl_week)
      from private.season_weeks as current_week
      where current_week.season_id = v_season.id
    )
  for update;

  select card.* into strict v_card
  from private.weekly_cards as card
  where card.week_id = v_week.id
    and card.owner_user_id = v_user_id
  for update;

  if v_week.nfl_week = 2 and exists (
    select 1 from private.owner_rehearsals as rehearsal
    where rehearsal.season_id = v_season.id
      and rehearsal.owner_user_id = v_user_id
      and rehearsal.status = 'ACTIVE'
  ) and not exists (
    select 1 from private.command_receipts as command
    where command.league_id = v_league.id
      and command.actor_user_id = v_user_id
      and command.command_name = 'OWNER_REHEARSAL_QUOTE_REVIEW'
  ) then
    raise exception using errcode = '40001', message = 'QUOTE_REVIEW_REQUIRED';
  end if;

  v_now := private.stage1_season_time(v_season.id);
  if v_week.state <> 'OPEN'
    or v_now < v_week.opens_at
    or v_now >= v_week.common_lock_at then
    raise exception using errcode = '55000', message = 'The current card is not open.';
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
   and slate_item.week_id = v_week.id
   and private.is_effective_slate_item(slate_item.id);

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
     and private.is_effective_slate_item(slate_item.id)
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
      extensions.digest(v_request_hash || ':' || v_item.position_number::text, 'sha256'),
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
      id, card_id, week_id, league_id, entry_id, owner_user_id,
      event_id, market_snapshot_id, market_type, outcome_key, proposition,
      line_milli, american_odds, stake_credits, quote_observed_at, accepted_at,
      ruleset_snapshot_id, idempotency_key, request_hash, receipt_hash
    ) values (
      v_receipt_id, v_card.id, v_week.id, v_league.id, v_card.entry_id,
      v_user_id, v_snapshot.event_id, v_snapshot.id, v_snapshot.market_type,
      v_snapshot.outcome_key, v_snapshot.proposition, v_snapshot.line_milli,
      v_snapshot.american_odds, v_item.stake_credits, v_snapshot.observed_at,
      v_now, v_season.ruleset_snapshot_id,
      'card:' || substr(v_position_request_hash, 1, 58) || ':'
        || lpad(v_item.position_number::text, 2, '0'),
      v_position_request_hash, v_receipt_hash
    );

    v_receipts := v_receipts || jsonb_build_array(jsonb_build_object(
      'receiptId', v_receipt_id,
      'receiptHash', v_receipt_hash,
      'marketSnapshotId', v_snapshot.id,
      'stakeCredits', v_item.stake_credits
    ));
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
    league_id, actor_user_id, command_name, idempotency_key,
    request_hash, response_json
  ) values (
    v_league.id, v_user_id, 'ACCEPT_STAGE1_CARD', p_idempotency_key,
    v_request_hash, v_response
  );

  return v_response;
end;
$$;

revoke all on function private.accept_authoritative_card_for_actor(
  uuid, text, jsonb, text
) from public, anon, authenticated;

create or replace function private.record_owner_rehearsal_card_choice(
  p_owner_user_id uuid,
  p_league_slug text,
  p_choice text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rehearsal private.owner_rehearsals%rowtype;
  v_week private.season_weeks%rowtype;
begin
  select rehearsal.* into v_rehearsal
  from private.owner_rehearsals as rehearsal
  join private.leagues as league on league.id = rehearsal.league_id
  where rehearsal.owner_user_id = p_owner_user_id
    and rehearsal.status = 'ACTIVE'
    and league.slug = lower(p_league_slug);
  if not found then
    return;
  end if;
  select week.* into strict v_week
  from private.season_weeks as week
  where week.season_id = v_rehearsal.season_id
  order by week.nfl_week desc limit 1;
  if 1000 <> (
    select coalesce(sum(receipt.stake_credits), 0)
    from private.position_receipts as receipt
    join private.weekly_cards as card on card.id = receipt.card_id
    where card.week_id = v_week.id and card.owner_user_id = p_owner_user_id
  ) then
    return;
  end if;
  insert into private.owner_rehearsal_card_choices (
    rehearsal_id, nfl_week, choice, sealed_at
  ) values (
    v_rehearsal.id, v_week.nfl_week, upper(p_choice),
    private.stage1_season_time(v_rehearsal.season_id)
  ) on conflict (rehearsal_id, nfl_week) do nothing;
end;
$$;

revoke all on function private.record_owner_rehearsal_card_choice(
  uuid, text, text
) from public, anon, authenticated;

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
  v_response jsonb;
begin
  v_response := private.accept_authoritative_card_for_actor(
    v_user_id, p_league_slug, p_positions, p_idempotency_key
  );
  perform private.record_owner_rehearsal_card_choice(
    v_user_id, p_league_slug, 'MANUAL'
  );
  return v_response;
end;
$$;

revoke all on function api.accept_stage1_card(text, jsonb, text)
from public, anon;
grant execute on function api.accept_stage1_card(text, jsonb, text)
to authenticated;

-- Rehearsal quote review delegates to the existing immutable quote-observation
-- ledger and current-head authority. Ordinary Simulation remains unchanged.
do $rehearsal_quote_authority$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(
    'api.refresh_live_week_quotes(uuid,uuid,text)'::regprocedure
  ) into strict v_definition;
  v_old := 'if v_season.mode <> ''LIVE'' or v_season.lifecycle not in (''DRAFT'', ''REGULAR'') then';
  v_new := $guard$if (
    v_season.mode = 'LIVE'
    and v_season.lifecycle not in ('DRAFT', 'REGULAR')
  ) or (
    v_season.mode = 'SIMULATION'
    and (
      v_season.lifecycle not in ('DRAFT', 'REGULAR')
      or not exists (
        select 1 from private.owner_rehearsals as rehearsal
        where rehearsal.season_id = v_season.id
          and rehearsal.owner_user_id = v_user_id
          and rehearsal.status = 'ACTIVE'
          and private.owner_rehearsal_entitled(v_user_id)
      )
    )
  ) or v_season.mode not in ('LIVE', 'SIMULATION') then$guard$;
  if strpos(v_definition, v_old) = 0 then
    raise exception 'refresh_live_week_quotes mode guard changed; migration refused';
  end if;
  execute replace(v_definition, v_old, v_new);

  select pg_get_functiondef('api.get_live_quote_heads(text)'::regprocedure)
  into strict v_definition;
  v_old := 'if v_season.mode <> ''LIVE'' then';
  v_new := $guard$if v_season.mode <> 'LIVE' and not exists (
    select 1 from private.owner_rehearsals as rehearsal
    where rehearsal.season_id = v_season.id
      and rehearsal.owner_user_id = v_user_id
      and rehearsal.status = 'ACTIVE'
      and private.owner_rehearsal_entitled(v_user_id)
  ) then$guard$;
  if strpos(v_definition, v_old) = 0 then
    raise exception 'get_live_quote_heads mode guard changed; migration refused';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$rehearsal_quote_authority$;

create or replace function private.enforce_live_current_quote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from private.season_weeks as week
    join private.seasons as season on season.id = week.season_id
    where week.id = new.week_id
      and week.league_id = new.league_id
      and (
        season.mode = 'LIVE'
        or exists (
          select 1 from private.owner_rehearsals as rehearsal
          where rehearsal.season_id = season.id
            and rehearsal.status = 'ACTIVE'
        )
      )
  ) and not exists (
    select 1
    from private.live_quote_heads as head
    where head.event_id = new.event_id
      and head.week_id = new.week_id
      and head.league_id = new.league_id
      and head.market_type = new.market_type
      and head.outcome_key = new.outcome_key
      and head.market_snapshot_id = new.market_snapshot_id
  ) then
    raise exception using errcode = '40001', message = 'QUOTE_CHANGED';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_live_current_quote()
from public, anon, authenticated;

create or replace function api.prepare_owner_rehearsal_quote_review(
  p_league_slug text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_rehearsal private.owner_rehearsals%rowtype;
  v_week private.season_weeks%rowtype;
  v_command private.command_receipts%rowtype;
  v_payload jsonb;
  v_payload_hash text;
  v_import_id uuid;
  v_request_hash text;
  v_response jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;
  if not private.owner_rehearsal_entitled(v_user_id) then
    raise exception using errcode = '42501', message = 'Not found.';
  end if;
  if char_length(p_idempotency_key) not between 8 and 120 then
    raise exception using errcode = '22023', message = 'Quote review reference is invalid.';
  end if;
  select rehearsal.* into v_rehearsal
  from private.owner_rehearsals as rehearsal
  join private.leagues as league on league.id = rehearsal.league_id
  where rehearsal.owner_user_id = v_user_id
    and rehearsal.status = 'ACTIVE'
    and league.slug = lower(p_league_slug)
  for update of rehearsal;
  if not found or v_rehearsal.checkpoint <> 'WEEK_2_OPEN' then
    return jsonb_build_object('changed', false, 'replayed', false);
  end if;
  select week.* into strict v_week
  from private.season_weeks as week
  where week.season_id = v_rehearsal.season_id and week.nfl_week = 2
  for update;
  if v_week.state <> 'OPEN' then
    return jsonb_build_object('changed', false, 'replayed', false);
  end if;

  v_request_hash := encode(extensions.digest(
    v_rehearsal.id::text || ':WEEK_2_QUOTE_REVIEW', 'sha256'
  ), 'hex');
  select command.* into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'OWNER_REHEARSAL_QUOTE_REVIEW'
    and command.idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json || jsonb_build_object('replayed', true);
  end if;

  select jsonb_build_object(
    'source', 'SIMULATION_FIXTURE',
    'fetchedAt', private.stage1_season_time(v_rehearsal.season_id),
    'events', jsonb_agg(jsonb_build_object(
      'source', 'SIMULATION_FIXTURE',
      'externalEventId', event.fixture_event_key,
      'sportKey', 'americanfootball_nfl',
      'awayTeam', event.away_team,
      'homeTeam', event.home_team,
      'scheduledStartAt', event.scheduled_start_at,
      'markets', (
        select jsonb_agg(jsonb_build_object(
          'sourceBook', snapshot.book_key,
          'marketType', snapshot.market_type,
          'outcomeKey', snapshot.outcome_key,
          'proposition', snapshot.proposition,
          'lineMilli', snapshot.line_milli,
          'americanOdds', snapshot.american_odds
            + case when snapshot.american_odds > 0 then 7 else -7 end,
          'observedAt', private.stage1_season_time(v_rehearsal.season_id)
        ) order by snapshot.market_type, snapshot.outcome_key)
        from private.live_quote_heads as head
        join private.market_snapshots as snapshot
          on snapshot.id = head.market_snapshot_id
        where head.event_id = event.id and head.week_id = v_week.id
      )
    ) order by event.scheduled_start_at, event.id)
  ) into strict v_payload
  from private.sports_events as event
  where event.week_id = v_week.id;

  v_payload_hash := encode(extensions.digest(v_payload::text, 'sha256'), 'hex');
  insert into private.live_odds_imports (
    season_id, league_id, source, sport_key, fetched_at, normalized_json,
    payload_hash, event_count, imported_by
  ) values (
    v_rehearsal.season_id, v_rehearsal.league_id, 'SIMULATION_FIXTURE',
    'americanfootball_nfl', private.stage1_season_time(v_rehearsal.season_id),
    v_payload, v_payload_hash, 8, v_user_id
  ) returning id into strict v_import_id;

  perform api.refresh_live_week_quotes(
    v_rehearsal.league_id,
    v_import_id,
    'rehearsal-quote-refresh:' || substr(v_rehearsal.id::text, 1, 18)
  );

  v_response := jsonb_build_object(
    'changed', true,
    'replayed', false,
    'week', 2
  );
  insert into private.command_receipts (
    league_id, actor_user_id, command_name, idempotency_key,
    request_hash, response_json
  ) values (
    v_rehearsal.league_id, v_user_id, 'OWNER_REHEARSAL_QUOTE_REVIEW',
    p_idempotency_key, v_request_hash, v_response
  );
  return v_response;
end;
$$;

revoke all on function api.prepare_owner_rehearsal_quote_review(text, text)
from public, anon;
grant execute on function api.prepare_owner_rehearsal_quote_review(text, text)
to authenticated;

create or replace function private.owner_rehearsal_checkpoint(
  p_rehearsal_id uuid,
  p_checkpoint text,
  p_ordinal integer,
  p_operation_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.owner_rehearsals
  set checkpoint = p_checkpoint,
      checkpoint_ordinal = p_ordinal,
      updated_at = clock_timestamp()
  where id = p_rehearsal_id and status = 'ACTIVE';
  if not found then
    raise exception using errcode = '42501', message = 'Owner rehearsal not found.';
  end if;
  insert into private.owner_rehearsal_events (
    rehearsal_id, checkpoint, checkpoint_ordinal, operation_key
  ) values (p_rehearsal_id, p_checkpoint, p_ordinal, p_operation_key)
  on conflict (rehearsal_id, operation_key) do nothing;
end;
$$;

revoke all on function private.owner_rehearsal_checkpoint(uuid, text, integer, text)
from public, anon, authenticated;

create or replace function api.has_owner_rehearsal_entitlement()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.owner_rehearsal_entitled((select auth.uid()));
$$;

revoke all on function api.has_owner_rehearsal_entitlement()
from public, anon;
grant execute on function api.has_owner_rehearsal_entitlement()
to authenticated;

create or replace function api.get_owner_rehearsal()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_rehearsal private.owner_rehearsals%rowtype;
  v_league private.leagues%rowtype;
  v_season private.seasons%rowtype;
  v_week private.season_weeks%rowtype;
  v_owner_card_sealed boolean := false;
begin
  if v_user_id is null or not private.owner_rehearsal_entitled(v_user_id) then
    raise exception using errcode = '42501', message = 'Not found.';
  end if;
  select rehearsal.* into v_rehearsal
  from private.owner_rehearsals as rehearsal
  where rehearsal.owner_user_id = v_user_id and rehearsal.status = 'ACTIVE';
  if not found then
    return null;
  end if;
  select league.* into strict v_league
  from private.leagues as league where league.id = v_rehearsal.league_id;
  select season.* into strict v_season
  from private.seasons as season where season.id = v_rehearsal.season_id;
  select week.* into v_week
  from private.season_weeks as week
  where week.season_id = v_rehearsal.season_id
  order by week.nfl_week desc limit 1;
  if v_week.id is not null then
    select coalesce(sum(receipt.stake_credits), 0) = 1000
    into v_owner_card_sealed
    from private.weekly_cards as card
    left join private.position_receipts as receipt on receipt.card_id = card.id
    where card.week_id = v_week.id and card.owner_user_id = v_user_id
    group by card.id;
  end if;
  return jsonb_build_object(
    'leagueName', v_league.name,
    'leagueSlug', v_league.slug,
    'checkpoint', v_rehearsal.checkpoint,
    'checkpointOrdinal', v_rehearsal.checkpoint_ordinal,
    'totalCheckpoints', 22,
    'generation', v_rehearsal.generation,
    'botCount', (
      select count(*) from private.owner_rehearsal_bots as bot
      where bot.rehearsal_id = v_rehearsal.id
    ),
    'currentWeek', v_week.nfl_week,
    'weekState', v_week.state,
    'lifecycle', v_season.lifecycle,
    'ownerCardSealed', coalesce(v_owner_card_sealed, false),
    'ownerCardChoice', (
      select choice.choice
      from private.owner_rehearsal_card_choices as choice
      where choice.rehearsal_id = v_rehearsal.id
        and choice.nfl_week = v_week.nfl_week
    ),
    'quoteReviewPending', v_rehearsal.checkpoint = 'WEEK_2_OPEN' and not exists (
      select 1 from private.command_receipts as command
      where command.league_id = v_rehearsal.league_id
        and command.actor_user_id = v_user_id
        and command.command_name = 'OWNER_REHEARSAL_QUOTE_REVIEW'
    ),
    'startedAt', v_rehearsal.started_at,
    'updatedAt', v_rehearsal.updated_at
  );
end;
$$;

revoke all on function api.get_owner_rehearsal() from public, anon;
grant execute on function api.get_owner_rehearsal() to authenticated;

create or replace function api.start_owner_rehearsal(p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_existing private.owner_rehearsals%rowtype;
  v_command private.command_receipts%rowtype;
  v_created record;
  v_rehearsal_id uuid := gen_random_uuid();
  v_generation integer;
  v_slug text;
  v_seed text;
  v_request_hash text;
  v_response jsonb;
begin
  if v_user_id is null or not private.owner_rehearsal_entitled(v_user_id) then
    raise exception using errcode = '42501', message = 'Not found.';
  end if;
  if char_length(p_idempotency_key) not between 8 and 120 then
    raise exception using errcode = '22023', message = 'Start reference is invalid.';
  end if;
  v_request_hash := encode(extensions.digest(
    v_user_id::text || ':START_OWNER_REHEARSAL', 'sha256'
  ), 'hex');
  select command.* into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'START_OWNER_REHEARSAL'
    and command.idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json || jsonb_build_object('replayed', true);
  end if;
  select rehearsal.* into v_existing
  from private.owner_rehearsals as rehearsal
  where rehearsal.owner_user_id = v_user_id and rehearsal.status = 'ACTIVE'
  for update;
  if found then
    return jsonb_build_object(
      'leagueSlug', (select slug from private.leagues where id = v_existing.league_id),
      'checkpoint', v_existing.checkpoint,
      'replayed', true
    );
  end if;

  select coalesce(max(rehearsal.generation), 0) + 1 into v_generation
  from private.owner_rehearsals as rehearsal
  where rehearsal.owner_user_id = v_user_id;
  v_seed := 'owner-guided-rehearsal-v1:' || encode(extensions.digest(
    v_user_id::text || ':' || v_generation::text, 'sha256'
  ), 'hex');
  v_slug := 'owner-rehearsal-' || substr(encode(extensions.digest(
    v_user_id::text, 'sha256'
  ), 'hex'), 1, 10) || '-' || v_generation::text;

  select * into strict v_created
  from private.create_league_from_authoritative_ruleset(
    'Sunday Ledger Owner Rehearsal', v_slug, 'SIMULATION', 2026
  );
  update private.seasons
  set roster_seed = encode(extensions.digest(v_seed || ':roster', 'sha256'), 'hex'),
      schedule_seed = encode(extensions.digest(v_seed || ':schedule', 'sha256'), 'hex'),
      simulated_now = '2026-09-01 00:00:00+00'
  where id = v_created.season_id;
  update private.season_entries
  set standing_tiebreak = encode(extensions.digest(v_seed || ':entry:1', 'sha256'), 'hex')
  where season_id = v_created.season_id and user_id = v_user_id;

  insert into private.owner_rehearsals (
    id, owner_user_id, league_id, season_id, generation, rehearsal_seed
  ) values (
    v_rehearsal_id, v_user_id, v_created.league_id,
    v_created.season_id, v_generation, v_seed
  );
  insert into private.owner_rehearsal_events (
    rehearsal_id, checkpoint, checkpoint_ordinal, operation_key
  ) values (
    v_rehearsal_id, 'FORMATION_EMPTY', 0, p_idempotency_key
  );
  v_response := jsonb_build_object(
    'leagueSlug', v_created.league_slug,
    'checkpoint', 'FORMATION_EMPTY',
    'replayed', false
  );
  insert into private.command_receipts (
    league_id, actor_user_id, command_name, idempotency_key,
    request_hash, response_json
  ) values (
    v_created.league_id, v_user_id, 'START_OWNER_REHEARSAL',
    p_idempotency_key, v_request_hash, v_response
  );
  return v_response;
end;
$$;

create or replace function api.fill_owner_rehearsal_bots(p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_rehearsal private.owner_rehearsals%rowtype;
  v_command private.command_receipts%rowtype;
  v_bot_number integer;
  v_bot_user_id uuid;
  v_name text;
  v_names constant text[] := array[
    'Cedar Eleven', 'Harbor Eleven', 'Northline Eleven',
    'Orchard Eleven', 'Summit Eleven', 'Riverlight Eleven',
    'Westfield Eleven', 'Stonebridge Eleven', 'Pine Eleven'
  ];
  v_request_hash text;
  v_response jsonb;
begin
  if v_user_id is null or not private.owner_rehearsal_entitled(v_user_id) then
    raise exception using errcode = '42501', message = 'Not found.';
  end if;
  if char_length(p_idempotency_key) not between 8 and 120 then
    raise exception using errcode = '22023', message = 'Bot-fill reference is invalid.';
  end if;
  select rehearsal.* into strict v_rehearsal
  from private.owner_rehearsals as rehearsal
  where rehearsal.owner_user_id = v_user_id and rehearsal.status = 'ACTIVE'
  for update;
  v_request_hash := encode(extensions.digest(
    v_rehearsal.id::text || ':FILL_OWNER_REHEARSAL_BOTS', 'sha256'
  ), 'hex');
  select command.* into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'FILL_OWNER_REHEARSAL_BOTS'
    and command.idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json || jsonb_build_object('replayed', true);
  end if;
  if v_rehearsal.checkpoint <> 'FORMATION_EMPTY' then
    raise exception using errcode = '55000', message = 'Rehearsal seats are already filled.';
  end if;
  perform set_config(
    'sunday_ledger.owner_rehearsal_operation', v_rehearsal.id::text, true
  );
  for v_bot_number in 1..9 loop
    v_bot_user_id := md5(
      v_rehearsal.rehearsal_seed || ':bot:' || v_bot_number::text
    )::uuid;
    v_name := v_names[v_bot_number];
    insert into auth.users (id) values (v_bot_user_id);
    insert into private.profiles (id, display_name)
    values (v_bot_user_id, v_name);
    insert into private.owner_rehearsal_bots (
      rehearsal_id, bot_number, bot_user_id, display_name
    ) values (
      v_rehearsal.id, v_bot_number, v_bot_user_id, v_name
    );
    insert into private.league_memberships (league_id, user_id, role)
    values (v_rehearsal.league_id, v_bot_user_id, 'MEMBER');
    insert into private.season_entries (
      season_id, league_id, user_id, standing_tiebreak
    ) values (
      v_rehearsal.season_id, v_rehearsal.league_id, v_bot_user_id,
      encode(extensions.digest(
        v_rehearsal.rehearsal_seed || ':entry:' || (v_bot_number + 1)::text,
        'sha256'
      ), 'hex')
    );
  end loop;
  perform private.owner_rehearsal_checkpoint(
    v_rehearsal.id, 'FORMATION_READY', 1, p_idempotency_key
  );
  v_response := jsonb_build_object(
    'checkpoint', 'FORMATION_READY', 'memberCount', 10, 'replayed', false
  );
  insert into private.command_receipts (
    league_id, actor_user_id, command_name, idempotency_key,
    request_hash, response_json
  ) values (
    v_rehearsal.league_id, v_user_id, 'FILL_OWNER_REHEARSAL_BOTS',
    p_idempotency_key, v_request_hash, v_response
  );
  return v_response;
end;
$$;

revoke all on function api.start_owner_rehearsal(text) from public, anon;
revoke all on function api.fill_owner_rehearsal_bots(text) from public, anon;
grant execute on function api.start_owner_rehearsal(text) to authenticated;
grant execute on function api.fill_owner_rehearsal_bots(text) to authenticated;

create or replace function private.owner_rehearsal_manifest_time(
  p_week integer,
  p_moment text
)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case upper(p_moment)
    when 'OPEN' then max((fixture_week.value ->> 'opensAt')::timestamptz)
    when 'LIVE_MIN' then min((result.value ->> 'availableAt')::timestamptz)
    when 'LIVE_MAX' then max((result.value ->> 'availableAt')::timestamptz)
    when 'FINAL' then max((result.value ->> 'availableAt')::timestamptz)
    when 'CORRECTION' then max((result.value ->> 'availableAt')::timestamptz)
  end
  from private.simulation_fixture_manifests as manifest
  cross join lateral jsonb_array_elements(manifest.manifest_json -> 'weeks')
    as fixture_week(value)
  left join lateral jsonb_array_elements(fixture_week.value -> 'events')
    as event(value) on upper(p_moment) <> 'OPEN'
  left join lateral jsonb_array_elements(event.value -> 'resultVersions')
    as result(value) on (
      (upper(p_moment) in ('LIVE_MIN', 'LIVE_MAX')
        and (result.value ->> 'version')::integer = 1)
      or (upper(p_moment) = 'FINAL'
        and (result.value ->> 'version')::integer = 2)
      or (upper(p_moment) = 'CORRECTION'
        and (result.value ->> 'version')::integer = 3)
    )
  where manifest.pack_id = 'sunday-ledger-authoritative-2026-v1'
    and (fixture_week.value ->> 'week')::integer = p_week;
$$;

create or replace function private.owner_rehearsal_open_week(
  p_rehearsal private.owner_rehearsals,
  p_week integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := 'rehearsal:' || substr(p_rehearsal.id::text, 1, 12)
    || ':week:' || p_week::text;
begin
  perform api.advance_simulated_time(
    p_rehearsal.league_id,
    private.owner_rehearsal_manifest_time(p_week, 'OPEN'),
    v_key || ':open-time'
  );
  perform api.publish_simulation_fixture_week(
    p_rehearsal.league_id, p_week,
    'sunday-ledger-authoritative-2026-v1',
    v_key || ':publish'
  );
  if p_week = 1 then
    perform api.lock_live_roster_and_open_week(
      p_rehearsal.league_id, v_key || ':lock-roster'
    );
  end if;
end;
$$;

create or replace function private.owner_rehearsal_sample_card(
  p_rehearsal private.owner_rehearsals,
  p_week integer,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seed integer;
  v_event_ordinal integer;
  v_market_type text;
  v_outcome_key text;
  v_snapshot private.market_snapshots%rowtype;
  v_entry_id uuid;
  v_week_id uuid;
  v_existing integer;
  v_matchup_display_order integer;
begin
  select entry.id into strict v_entry_id
  from private.season_entries as entry
  where entry.season_id = p_rehearsal.season_id
    and entry.user_id = p_actor_user_id;
  select week.id into strict v_week_id
  from private.season_weeks as week
  where week.season_id = p_rehearsal.season_id and week.nfl_week = p_week;
  select coalesce(sum(receipt.stake_credits), 0) into v_existing
  from private.weekly_cards as card
  left join private.position_receipts as receipt on receipt.card_id = card.id
  where card.week_id = v_week_id and card.entry_id = v_entry_id;
  if v_existing = 1000 then
    return jsonb_build_object('alreadyCompleted', true);
  elsif v_existing <> 0 then
    raise exception using errcode = '55000', message = 'The existing card is not in an atomic state.';
  end if;

  select coalesce(bot.bot_number + 1, 1) into v_seed
  from (values (1)) as seed(value)
  left join private.owner_rehearsal_bots as bot
    on bot.rehearsal_id = p_rehearsal.id
   and bot.bot_user_id = p_actor_user_id;
  if p_week = 4 then
    select matchup.display_order into strict v_matchup_display_order
    from private.matchups as matchup
    where matchup.week_id = v_week_id
      and v_entry_id in (matchup.side_a_entry_id, matchup.side_b_entry_id);
    v_event_ordinal := 1 + ((v_matchup_display_order - 1) % 8);
    v_market_type := 'MONEYLINE';
    v_outcome_key := 'HOME';
  elsif v_seed = 1 then
    v_event_ordinal := case
      when p_week = 2 then 4
      when p_week = 3 then 3
      when p_week = 8 then 5
      when p_week = 17 then 6
      else 1
    end;
    v_market_type := case when p_week = 2 then 'SPREAD' else 'MONEYLINE' end;
    v_outcome_key := case
      when p_week = 2 then 'AWAY'
      when p_week = 1 and get_byte(
        extensions.digest(p_rehearsal.rehearsal_seed, 'sha256'), 0
      ) % 2 = 0 then 'HOME'
      else 'AWAY'
    end;
  else
    v_event_ordinal := 1 + ((p_week + v_seed * 3) % 8);
    v_market_type := case (p_week + v_seed) % 3
      when 0 then 'MONEYLINE'
      when 1 then 'SPREAD'
      else 'TOTAL'
    end;
    v_outcome_key := case
      when v_market_type = 'TOTAL' and (p_week + v_seed) % 2 = 0 then 'OVER'
      when v_market_type = 'TOTAL' then 'UNDER'
      when (p_week + v_seed) % 2 = 0 then 'HOME'
      else 'AWAY'
    end;
  end if;

  select snapshot.* into strict v_snapshot
  from (
    select event.id,
      row_number() over (order by event.fixture_event_key) as event_ordinal
    from private.sports_events as event
    where event.week_id = v_week_id
  ) as ordered_event
  join private.live_quote_heads as head on head.event_id = ordered_event.id
  join private.market_snapshots as snapshot on snapshot.id = head.market_snapshot_id
  where ordered_event.event_ordinal = v_event_ordinal
    and snapshot.market_type = v_market_type
    and snapshot.outcome_key = v_outcome_key
  order by snapshot.observed_at desc, snapshot.id desc
  limit 1;

  return private.accept_authoritative_card_for_actor(
    p_actor_user_id,
    (select league.slug from private.leagues as league
      where league.id = p_rehearsal.league_id),
    jsonb_build_array(jsonb_build_object(
      'marketSnapshotId', v_snapshot.id,
      'stakeCredits', 1000,
      'payloadHash', v_snapshot.payload_hash
    )),
    'rehearsal-card:' || substr(p_rehearsal.id::text, 1, 12)
      || ':w' || p_week::text || ':s' || v_seed::text
  );
end;
$$;

create or replace function private.owner_rehearsal_seal_bots(
  p_rehearsal private.owner_rehearsals,
  p_week integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bot record;
  v_skip_entry uuid;
begin
  if p_week = 15 then
    select candidate.entry_id into v_skip_entry
    from (
      select matchup.side_a_entry_id as entry_id, matchup.display_order
      from private.matchups as matchup
      join private.season_weeks as week on week.id = matchup.week_id
      where week.season_id = p_rehearsal.season_id
        and week.nfl_week = 15
        and matchup.postseason_role = 'CHAMPIONSHIP'
        and private.is_effective_postseason_matchup(matchup.id)
      union all
      select matchup.side_b_entry_id, matchup.display_order
      from private.matchups as matchup
      join private.season_weeks as week on week.id = matchup.week_id
      where week.season_id = p_rehearsal.season_id
        and week.nfl_week = 15
        and matchup.postseason_role = 'CHAMPIONSHIP'
        and private.is_effective_postseason_matchup(matchup.id)
    ) as candidate
    join private.season_entries as entry on entry.id = candidate.entry_id
    where entry.user_id <> p_rehearsal.owner_user_id
    order by candidate.display_order, candidate.entry_id
    limit 1;
  end if;
  for v_bot in
    select bot.bot_number, bot.bot_user_id, entry.id as entry_id
    from private.owner_rehearsal_bots as bot
    join private.season_entries as entry
      on entry.season_id = p_rehearsal.season_id
     and entry.user_id = bot.bot_user_id
    where bot.rehearsal_id = p_rehearsal.id
    order by bot.bot_number
  loop
    if (p_week in (5, 6, 14) and v_bot.bot_number = 9)
      or (p_week = 15 and v_bot.entry_id = v_skip_entry) then
      continue;
    end if;
    perform private.owner_rehearsal_sample_card(
      p_rehearsal, p_week, v_bot.bot_user_id
    );
  end loop;
end;
$$;

create or replace function private.owner_rehearsal_settle_current_week(
  p_rehearsal private.owner_rehearsals,
  p_week integer,
  p_finalize boolean,
  p_apply_correction boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := 'rehearsal:' || substr(p_rehearsal.id::text, 1, 12)
    || ':week:' || p_week::text;
  v_week private.season_weeks%rowtype;
begin
  perform private.owner_rehearsal_seal_bots(p_rehearsal, p_week);
  perform api.advance_simulated_time(
    p_rehearsal.league_id,
    private.owner_rehearsal_manifest_time(p_week, 'LIVE_MAX'),
    v_key || ':live-time'
  );
  perform api.lock_stage1_week(p_rehearsal.league_id, v_key || ':lock');
  perform api.apply_simulation_fixture_results(
    p_rehearsal.league_id, p_week, 'LIVE',
    'sunday-ledger-authoritative-2026-v1', v_key || ':live-results'
  );
  perform api.advance_simulated_time(
    p_rehearsal.league_id,
    private.owner_rehearsal_manifest_time(p_week, 'FINAL'),
    v_key || ':final-time'
  );
  perform api.apply_simulation_fixture_results(
    p_rehearsal.league_id, p_week, 'FINAL',
    'sunday-ledger-authoritative-2026-v1', v_key || ':final-results'
  );
  if p_apply_correction then
    perform api.advance_simulated_time(
      p_rehearsal.league_id,
      private.owner_rehearsal_manifest_time(p_week, 'CORRECTION'),
      v_key || ':correction-time'
    );
    perform api.apply_simulation_fixture_results(
      p_rehearsal.league_id, p_week, 'CORRECTION',
      'sunday-ledger-authoritative-2026-v1', v_key || ':correction-results'
    );
  end if;
  if p_finalize then
    select week.* into strict v_week
    from private.season_weeks as week
    where week.season_id = p_rehearsal.season_id and week.nfl_week = p_week;
    perform api.advance_simulated_time(
      p_rehearsal.league_id,
      v_week.correction_window_closes_at + interval '1 second',
      v_key || ':close-time'
    );
    perform api.finalize_stage1_week(
      p_rehearsal.league_id, v_key || ':finalize'
    );
  end if;
end;
$$;

create or replace function private.owner_rehearsal_run_sample_week(
  p_rehearsal private.owner_rehearsals,
  p_week integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.owner_rehearsal_open_week(p_rehearsal, p_week);
  perform private.owner_rehearsal_sample_card(
    p_rehearsal, p_week, p_rehearsal.owner_user_id
  );
  insert into private.owner_rehearsal_card_choices (
    rehearsal_id, nfl_week, choice, sealed_at
  ) values (
    p_rehearsal.id, p_week, 'SAMPLE',
    private.stage1_season_time(p_rehearsal.season_id)
  ) on conflict (rehearsal_id, nfl_week) do nothing;
  perform private.owner_rehearsal_settle_current_week(
    p_rehearsal, p_week, true, p_week = 8
  );
end;
$$;

revoke all on function private.owner_rehearsal_manifest_time(integer, text)
from public, anon, authenticated;
revoke all on function private.owner_rehearsal_open_week(private.owner_rehearsals, integer)
from public, anon, authenticated;
revoke all on function private.owner_rehearsal_sample_card(private.owner_rehearsals, integer, uuid)
from public, anon, authenticated;
revoke all on function private.owner_rehearsal_seal_bots(private.owner_rehearsals, integer)
from public, anon, authenticated;
revoke all on function private.owner_rehearsal_settle_current_week(private.owner_rehearsals, integer, boolean, boolean)
from public, anon, authenticated;
revoke all on function private.owner_rehearsal_run_sample_week(private.owner_rehearsals, integer)
from public, anon, authenticated;

create or replace function api.use_owner_rehearsal_sample_card(
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_rehearsal private.owner_rehearsals%rowtype;
  v_week integer;
  v_command private.command_receipts%rowtype;
  v_request_hash text;
  v_card_response jsonb;
  v_response jsonb;
begin
  if v_user_id is null or not private.owner_rehearsal_entitled(v_user_id) then
    raise exception using errcode = '42501', message = 'Not found.';
  end if;
  if char_length(p_idempotency_key) not between 8 and 120 then
    raise exception using errcode = '22023', message = 'Sample-card reference is invalid.';
  end if;
  select rehearsal.* into strict v_rehearsal
  from private.owner_rehearsals as rehearsal
  where rehearsal.owner_user_id = v_user_id and rehearsal.status = 'ACTIVE'
  for update;
  select week.nfl_week into strict v_week
  from private.season_weeks as week
  where week.season_id = v_rehearsal.season_id
  order by week.nfl_week desc limit 1;
  if v_rehearsal.checkpoint not in (
    'WEEK_1_OPEN', 'WEEK_2_OPEN', 'WEEK_5_OPEN', 'WEEK_8_OPEN',
    'WEEK_14_OPEN', 'WEEK_15_OPEN', 'WEEK_16_OPEN',
    'WEEK_17_OPEN', 'WEEK_18_OPEN'
  ) then
    raise exception using errcode = '55000', message = 'A sample card is not available at this checkpoint.';
  end if;
  v_request_hash := encode(extensions.digest(
    v_rehearsal.id::text || ':SAMPLE_CARD:' || v_week::text, 'sha256'
  ), 'hex');
  select command.* into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'USE_OWNER_REHEARSAL_SAMPLE_CARD'
    and command.idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json || jsonb_build_object('replayed', true);
  end if;
  v_card_response := private.owner_rehearsal_sample_card(
    v_rehearsal, v_week, v_user_id
  );
  perform private.record_owner_rehearsal_card_choice(
    v_user_id,
    (select league.slug from private.leagues as league
      where league.id = v_rehearsal.league_id),
    'SAMPLE'
  );
  v_response := jsonb_build_object(
    'week', v_week, 'sealed', true, 'card', v_card_response, 'replayed', false
  );
  insert into private.command_receipts (
    league_id, actor_user_id, command_name, idempotency_key,
    request_hash, response_json
  ) values (
    v_rehearsal.league_id, v_user_id, 'USE_OWNER_REHEARSAL_SAMPLE_CARD',
    p_idempotency_key, v_request_hash, v_response
  );
  return v_response;
end;
$$;

revoke all on function api.use_owner_rehearsal_sample_card(text)
from public, anon;
grant execute on function api.use_owner_rehearsal_sample_card(text)
to authenticated;

create or replace function api.advance_owner_rehearsal(
  p_expected_checkpoint text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_rehearsal private.owner_rehearsals%rowtype;
  v_command private.command_receipts%rowtype;
  v_week private.season_weeks%rowtype;
  v_event record;
  v_request_hash text;
  v_next_checkpoint text;
  v_next_ordinal integer;
  v_response jsonb;
  v_owner_card_credits integer;
begin
  if v_user_id is null or not private.owner_rehearsal_entitled(v_user_id) then
    raise exception using errcode = '42501', message = 'Not found.';
  end if;
  if char_length(p_idempotency_key) not between 8 and 120 then
    raise exception using errcode = '22023', message = 'Advance reference is invalid.';
  end if;
  v_request_hash := encode(extensions.digest(
    v_user_id::text || ':ADVANCE_OWNER_REHEARSAL:' || p_expected_checkpoint,
    'sha256'
  ), 'hex');
  select command.* into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'ADVANCE_OWNER_REHEARSAL'
    and command.idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json || jsonb_build_object('replayed', true);
  end if;
  select rehearsal.* into strict v_rehearsal
  from private.owner_rehearsals as rehearsal
  where rehearsal.owner_user_id = v_user_id and rehearsal.status = 'ACTIVE'
  for update;
  if v_rehearsal.checkpoint <> p_expected_checkpoint then
    raise exception using errcode = '40001', message = 'The rehearsal has already moved to another checkpoint.';
  end if;

  if v_rehearsal.checkpoint like 'WEEK\_%\_OPEN' escape '\' then
    select week.* into strict v_week
    from private.season_weeks as week
    where week.season_id = v_rehearsal.season_id
    order by week.nfl_week desc limit 1;
    select coalesce(sum(receipt.stake_credits), 0)
    into v_owner_card_credits
    from private.weekly_cards as card
    left join private.position_receipts as receipt on receipt.card_id = card.id
    where card.week_id = v_week.id and card.owner_user_id = v_user_id;
    if v_owner_card_credits <> 1000 then
      raise exception using errcode = '55000', message = 'Seal your card or confirm a sample card before advancing.';
    end if;
    if v_week.nfl_week = 2 and not exists (
      select 1 from private.command_receipts as command
      where command.league_id = v_rehearsal.league_id
        and command.actor_user_id = v_user_id
        and command.command_name = 'OWNER_REHEARSAL_QUOTE_REVIEW'
    ) then
      raise exception using errcode = '55000', message = 'Review the updated Week 2 quote before advancing.';
    end if;
  end if;

  case v_rehearsal.checkpoint
    when 'FORMATION_READY' then
      perform private.owner_rehearsal_open_week(v_rehearsal, 1);
      v_next_checkpoint := 'WEEK_1_OPEN'; v_next_ordinal := 2;

    when 'WEEK_1_OPEN' then
      perform private.owner_rehearsal_seal_bots(v_rehearsal, 1);
      perform api.advance_simulated_time(
        v_rehearsal.league_id,
        private.owner_rehearsal_manifest_time(1, 'LIVE_MIN'),
        'rehearsal:' || substr(v_rehearsal.id::text, 1, 12) || ':week:1:partial-time'
      );
      perform api.lock_stage1_week(
        v_rehearsal.league_id,
        'rehearsal:' || substr(v_rehearsal.id::text, 1, 12) || ':week:1:lock'
      );
      for v_event in
        select event.id, event.scheduled_start_at
        from private.sports_events as event
        join private.season_weeks as week on week.id = event.week_id
        join private.simulation_fixture_manifests as manifest
          on manifest.pack_id = 'sunday-ledger-authoritative-2026-v1'
        cross join lateral jsonb_array_elements(manifest.manifest_json -> 'weeks')
          as fixture_week(value)
        cross join lateral jsonb_array_elements(fixture_week.value -> 'events')
          as fixture_event(value)
        cross join lateral jsonb_array_elements(fixture_event.value -> 'resultVersions')
          as fixture_result(value)
        where week.season_id = v_rehearsal.season_id
          and week.nfl_week = 1
          and (fixture_week.value ->> 'week')::integer = 1
          and fixture_event.value ->> 'externalEventId' = event.fixture_event_key
          and (fixture_result.value ->> 'version')::integer = 1
          and (fixture_result.value ->> 'availableAt')::timestamptz
            = private.owner_rehearsal_manifest_time(1, 'LIVE_MIN')
        order by event.fixture_event_key
      loop
        perform api.set_stage1_event_live(
          v_event.id, v_event.scheduled_start_at,
          'rehearsal:' || substr(v_rehearsal.id::text, 1, 12)
            || ':week:1:partial:' || substr(v_event.id::text, 1, 8)
        );
      end loop;
      v_next_checkpoint := 'WEEK_1_PARTIAL'; v_next_ordinal := 3;

    when 'WEEK_1_PARTIAL' then
      perform private.owner_rehearsal_settle_current_week(
        v_rehearsal, 1, false, false
      );
      v_next_checkpoint := 'WEEK_1_PROVISIONAL'; v_next_ordinal := 4;

    when 'WEEK_1_PROVISIONAL' then
      select week.* into strict v_week
      from private.season_weeks as week
      where week.season_id = v_rehearsal.season_id and week.nfl_week = 1;
      perform api.advance_simulated_time(
        v_rehearsal.league_id,
        v_week.correction_window_closes_at + interval '1 second',
        'rehearsal:' || substr(v_rehearsal.id::text, 1, 12) || ':week:1:close-time'
      );
      perform api.finalize_stage1_week(
        v_rehearsal.league_id,
        'rehearsal:' || substr(v_rehearsal.id::text, 1, 12) || ':week:1:finalize'
      );
      v_next_checkpoint := 'WEEK_1_FINAL'; v_next_ordinal := 5;

    when 'WEEK_1_FINAL' then
      perform private.owner_rehearsal_open_week(v_rehearsal, 2);
      v_next_checkpoint := 'WEEK_2_OPEN'; v_next_ordinal := 6;

    when 'WEEK_2_OPEN' then
      perform private.owner_rehearsal_settle_current_week(
        v_rehearsal, 2, true, false
      );
      v_next_checkpoint := 'WEEK_2_FINAL'; v_next_ordinal := 7;

    when 'WEEK_2_FINAL' then
      perform private.owner_rehearsal_run_sample_week(v_rehearsal, 3);
      perform private.owner_rehearsal_run_sample_week(v_rehearsal, 4);
      perform private.owner_rehearsal_open_week(v_rehearsal, 5);
      v_next_checkpoint := 'WEEK_5_OPEN'; v_next_ordinal := 8;

    when 'WEEK_5_OPEN' then
      perform private.owner_rehearsal_settle_current_week(
        v_rehearsal, 5, true, false
      );
      v_next_checkpoint := 'WEEK_5_FINAL'; v_next_ordinal := 9;

    when 'WEEK_5_FINAL' then
      perform private.owner_rehearsal_run_sample_week(v_rehearsal, 6);
      perform private.owner_rehearsal_run_sample_week(v_rehearsal, 7);
      perform private.owner_rehearsal_open_week(v_rehearsal, 8);
      v_next_checkpoint := 'WEEK_8_OPEN'; v_next_ordinal := 10;

    when 'WEEK_8_OPEN' then
      perform private.owner_rehearsal_settle_current_week(
        v_rehearsal, 8, false, false
      );
      v_next_checkpoint := 'WEEK_8_PROVISIONAL'; v_next_ordinal := 11;

    when 'WEEK_8_PROVISIONAL' then
      perform api.advance_simulated_time(
        v_rehearsal.league_id,
        private.owner_rehearsal_manifest_time(8, 'CORRECTION'),
        'rehearsal:' || substr(v_rehearsal.id::text, 1, 12) || ':week:8:correction-time'
      );
      perform api.apply_simulation_fixture_results(
        v_rehearsal.league_id, 8, 'CORRECTION',
        'sunday-ledger-authoritative-2026-v1',
        'rehearsal:' || substr(v_rehearsal.id::text, 1, 12) || ':week:8:correction-results'
      );
      v_next_checkpoint := 'WEEK_8_CORRECTED'; v_next_ordinal := 12;

    when 'WEEK_8_CORRECTED' then
      select week.* into strict v_week
      from private.season_weeks as week
      where week.season_id = v_rehearsal.season_id and week.nfl_week = 8;
      perform api.advance_simulated_time(
        v_rehearsal.league_id,
        v_week.correction_window_closes_at + interval '1 second',
        'rehearsal:' || substr(v_rehearsal.id::text, 1, 12) || ':week:8:close-time'
      );
      perform api.finalize_stage1_week(
        v_rehearsal.league_id,
        'rehearsal:' || substr(v_rehearsal.id::text, 1, 12) || ':week:8:finalize'
      );
      perform private.owner_rehearsal_run_sample_week(v_rehearsal, 9);
      perform private.owner_rehearsal_run_sample_week(v_rehearsal, 10);
      perform private.owner_rehearsal_run_sample_week(v_rehearsal, 11);
      perform private.owner_rehearsal_run_sample_week(v_rehearsal, 12);
      perform private.owner_rehearsal_run_sample_week(v_rehearsal, 13);
      perform private.owner_rehearsal_open_week(v_rehearsal, 14);
      v_next_checkpoint := 'WEEK_14_OPEN'; v_next_ordinal := 13;

    when 'WEEK_14_OPEN' then
      perform private.owner_rehearsal_settle_current_week(
        v_rehearsal, 14, true, false
      );
      perform api.publish_playoff_qualification(
        v_rehearsal.league_id,
        'rehearsal:' || substr(v_rehearsal.id::text, 1, 12) || ':qualification'
      );
      v_next_checkpoint := 'WEEK_14_FINAL'; v_next_ordinal := 14;

    when 'WEEK_14_FINAL' then
      perform private.owner_rehearsal_open_week(v_rehearsal, 15);
      v_next_checkpoint := 'WEEK_15_OPEN'; v_next_ordinal := 15;

    when 'WEEK_15_OPEN' then
      perform private.owner_rehearsal_settle_current_week(
        v_rehearsal, 15, true, false
      );
      v_next_checkpoint := 'WEEK_15_FINAL'; v_next_ordinal := 16;

    when 'WEEK_15_FINAL' then
      perform private.owner_rehearsal_open_week(v_rehearsal, 16);
      v_next_checkpoint := 'WEEK_16_OPEN'; v_next_ordinal := 17;

    when 'WEEK_16_OPEN' then
      perform private.owner_rehearsal_settle_current_week(
        v_rehearsal, 16, true, false
      );
      v_next_checkpoint := 'WEEK_16_FINAL'; v_next_ordinal := 18;

    when 'WEEK_16_FINAL' then
      perform private.owner_rehearsal_open_week(v_rehearsal, 17);
      v_next_checkpoint := 'WEEK_17_OPEN'; v_next_ordinal := 19;

    when 'WEEK_17_OPEN' then
      perform private.owner_rehearsal_settle_current_week(
        v_rehearsal, 17, true, false
      );
      perform api.finalize_champion_bracket(
        v_rehearsal.league_id,
        'rehearsal:' || substr(v_rehearsal.id::text, 1, 12) || ':champion-final'
      );
      v_next_checkpoint := 'WEEK_17_CHAMPION'; v_next_ordinal := 20;

    when 'WEEK_17_CHAMPION' then
      perform private.owner_rehearsal_open_week(v_rehearsal, 18);
      v_next_checkpoint := 'WEEK_18_OPEN'; v_next_ordinal := 21;

    when 'WEEK_18_OPEN' then
      perform private.owner_rehearsal_settle_current_week(
        v_rehearsal, 18, true, false
      );
      perform api.finalize_season_archive(
        v_rehearsal.league_id,
        'rehearsal:' || substr(v_rehearsal.id::text, 1, 12) || ':archive-final'
      );
      v_next_checkpoint := 'COMPLETE'; v_next_ordinal := 22;

    else
      raise exception using errcode = '55000', message = 'No guided advance is available at this checkpoint.';
  end case;

  perform private.owner_rehearsal_checkpoint(
    v_rehearsal.id, v_next_checkpoint, v_next_ordinal, p_idempotency_key
  );
  v_response := jsonb_build_object(
    'checkpoint', v_next_checkpoint,
    'checkpointOrdinal', v_next_ordinal,
    'replayed', false
  );
  insert into private.command_receipts (
    league_id, actor_user_id, command_name, idempotency_key,
    request_hash, response_json
  ) values (
    v_rehearsal.league_id, v_user_id, 'ADVANCE_OWNER_REHEARSAL',
    p_idempotency_key, v_request_hash, v_response
  );
  return v_response;
end;
$$;

create or replace function api.reset_owner_rehearsal(
  p_confirmation_name text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_rehearsal private.owner_rehearsals%rowtype;
  v_league private.leagues%rowtype;
  v_command private.command_receipts%rowtype;
  v_request_hash text;
  v_response jsonb;
begin
  if v_user_id is null or not private.owner_rehearsal_entitled(v_user_id) then
    raise exception using errcode = '42501', message = 'Not found.';
  end if;
  if char_length(p_idempotency_key) not between 8 and 120 then
    raise exception using errcode = '22023', message = 'Reset reference is invalid.';
  end if;
  v_request_hash := encode(extensions.digest(
    v_user_id::text || ':RESET_OWNER_REHEARSAL:' || p_confirmation_name,
    'sha256'
  ), 'hex');
  select command.* into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'RESET_OWNER_REHEARSAL'
    and command.idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json || jsonb_build_object('replayed', true);
  end if;
  select rehearsal.* into strict v_rehearsal
  from private.owner_rehearsals as rehearsal
  where rehearsal.owner_user_id = v_user_id and rehearsal.status = 'ACTIVE'
  for update;
  select league.* into strict v_league
  from private.leagues as league where league.id = v_rehearsal.league_id
  for update;
  if p_confirmation_name is distinct from v_league.name then
    raise exception using errcode = '22023', message = 'Rehearsal name confirmation does not match.';
  end if;
  perform set_config(
    'sunday_ledger.owner_rehearsal_operation', v_rehearsal.id::text, true
  );
  insert into private.owner_rehearsal_events (
    rehearsal_id, checkpoint, checkpoint_ordinal, operation_key
  ) values (
    v_rehearsal.id, 'RESET', v_rehearsal.checkpoint_ordinal,
    p_idempotency_key
  );
  v_response := jsonb_build_object(
    'reset', true, 'leagueName', v_league.name, 'replayed', false
  );
  insert into private.command_receipts (
    league_id, actor_user_id, command_name, idempotency_key,
    request_hash, response_json
  ) values (
    v_rehearsal.league_id, v_user_id, 'RESET_OWNER_REHEARSAL',
    p_idempotency_key, v_request_hash, v_response
  );
  update private.leagues
  set archived_at = coalesce(archived_at, clock_timestamp())
  where id = v_rehearsal.league_id;
  update private.owner_rehearsals
  set status = 'RESET', reset_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = v_rehearsal.id;
  return v_response;
end;
$$;

revoke all on function api.advance_owner_rehearsal(text, text)
from public, anon;
revoke all on function api.reset_owner_rehearsal(text, text)
from public, anon;
grant execute on function api.advance_owner_rehearsal(text, text)
to authenticated;
grant execute on function api.reset_owner_rehearsal(text, text)
to authenticated;

comment on table private.owner_rehearsals is
  'Strong identity and resumable checkpoint for one private owner-only rehearsal; never a public Simulation mode.';
comment on table private.owner_rehearsal_bots is
  'Credentialless synthetic participants. Rows have no email, password, identity provider, or public command access.';
comment on function api.advance_owner_rehearsal(text, text) is
  'Moves the active entitled owner rehearsal to its next valid checkpoint by composing authoritative lifecycle commands.';
comment on function api.reset_owner_rehearsal(text, text) is
  'Retires only the caller active owner rehearsal and preserves its immutable synthetic ledger for audit.';

notify pgrst, 'reload schema';
