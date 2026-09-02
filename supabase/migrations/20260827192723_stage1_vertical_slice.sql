-- Stage 1: one deterministic, production-shaped Week 1 vertical slice.
-- Base relations remain in the non-exposed private schema. The api schema
-- exposes only authenticated commands and a sealed read model.

alter table private.season_entries
  add constraint season_entries_id_season_league_key
  unique (id, season_id, league_id);

create table private.season_weeks (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  league_id uuid not null,
  nfl_week integer not null check (nfl_week between 1 and 18),
  scope text not null default 'REGULAR'
    check (scope in ('REGULAR', 'PLAYOFF', 'PLACEMENT', 'EXHIBITION')),
  state text not null default 'PLANNED'
    check (state in ('PLANNED', 'OPEN', 'LOCKED', 'PROVISIONAL', 'FINAL')),
  opens_at timestamptz not null,
  common_lock_at timestamptz not null,
  locked_at timestamptz,
  correction_window_closes_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (season_id, league_id)
    references private.seasons (id, league_id) on delete cascade,
  unique (season_id, nfl_week),
  unique (id, season_id, league_id),
  check (opens_at < common_lock_at)
);

create index season_weeks_league_id_idx
  on private.season_weeks (league_id, nfl_week);

create table private.schedule_publications (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  league_id uuid not null,
  version integer not null check (version > 0),
  algorithm_version text not null,
  seed text not null,
  ordered_entry_ids uuid[] not null,
  output_hash text not null check (output_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references private.profiles (id),
  published_at timestamptz not null default now(),
  foreign key (season_id, league_id)
    references private.seasons (id, league_id) on delete cascade,
  unique (season_id, version),
  unique (season_id, output_hash),
  unique (id, season_id, league_id)
);

create index schedule_publications_league_id_idx
  on private.schedule_publications (league_id, published_at desc);

create index schedule_publications_created_by_idx
  on private.schedule_publications (created_by);

create table private.matchups (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null,
  season_id uuid not null,
  league_id uuid not null,
  schedule_publication_id uuid not null,
  side_a_entry_id uuid not null,
  side_b_entry_id uuid not null,
  scope text not null default 'REGULAR'
    check (scope in ('REGULAR', 'PLAYOFF', 'PLACEMENT', 'EXHIBITION')),
  display_order integer not null check (display_order > 0),
  created_at timestamptz not null default now(),
  foreign key (week_id, season_id, league_id)
    references private.season_weeks (id, season_id, league_id) on delete cascade,
  foreign key (schedule_publication_id, season_id, league_id)
    references private.schedule_publications (id, season_id, league_id),
  foreign key (side_a_entry_id, season_id, league_id)
    references private.season_entries (id, season_id, league_id),
  foreign key (side_b_entry_id, season_id, league_id)
    references private.season_entries (id, season_id, league_id),
  unique (week_id, display_order),
  unique (id, week_id, league_id),
  check (side_a_entry_id <> side_b_entry_id)
);

create index matchups_week_id_idx
  on private.matchups (week_id, display_order);

create index matchups_side_a_entry_id_idx
  on private.matchups (side_a_entry_id, week_id);

create index matchups_side_b_entry_id_idx
  on private.matchups (side_b_entry_id, week_id);

create index matchups_schedule_publication_id_idx
  on private.matchups (schedule_publication_id);

create table private.sports_events (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null,
  season_id uuid not null,
  league_id uuid not null,
  fixture_event_key text not null,
  away_team text not null check (char_length(away_team) between 1 and 60),
  home_team text not null check (char_length(home_team) between 1 and 60),
  scheduled_start_at timestamptz not null,
  actual_started_at timestamptz,
  state text not null default 'SCHEDULED'
    check (state in ('SCHEDULED', 'LIVE', 'FINAL', 'VOID', 'CORRECTED')),
  provider_health text not null default 'HEALTHY'
    check (provider_health in ('HEALTHY', 'DEGRADED')),
  created_at timestamptz not null default now(),
  foreign key (week_id, season_id, league_id)
    references private.season_weeks (id, season_id, league_id) on delete cascade,
  unique (season_id, fixture_event_key),
  unique (id, week_id, league_id)
);

create index sports_events_week_start_idx
  on private.sports_events (week_id, scheduled_start_at);

create table private.market_snapshots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  week_id uuid not null,
  league_id uuid not null,
  book_key text not null default 'draftkings',
  market_type text not null check (market_type in ('MONEYLINE', 'SPREAD', 'TOTAL')),
  outcome_key text not null,
  proposition text not null,
  line_milli integer,
  american_odds integer not null check (american_odds <> 0),
  quality_status text not null default 'HEALTHY'
    check (quality_status in ('HEALTHY', 'STALE', 'OUTLIER', 'SUSPENDED', 'PROVIDER_DEGRADED')),
  observed_at timestamptz not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  foreign key (event_id, week_id, league_id)
    references private.sports_events (id, week_id, league_id) on delete cascade,
  unique (event_id, book_key, market_type, outcome_key, line_milli, payload_hash),
  unique (id, event_id, week_id, league_id),
  check (
    (market_type = 'MONEYLINE' and line_milli is null)
    or (market_type in ('SPREAD', 'TOTAL') and line_milli is not null)
  )
);

create index market_snapshots_event_observed_idx
  on private.market_snapshots (event_id, observed_at desc);

create index market_snapshots_week_quality_idx
  on private.market_snapshots (week_id, quality_status, market_type);

create table private.slates (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null,
  season_id uuid not null,
  league_id uuid not null,
  version integer not null check (version > 0),
  fixture_id text not null,
  common_lock_at timestamptz not null,
  published_at timestamptz not null default now(),
  frozen_at timestamptz,
  foreign key (week_id, season_id, league_id)
    references private.season_weeks (id, season_id, league_id) on delete cascade,
  unique (week_id, version),
  unique (id, week_id, league_id)
);

create index slates_league_id_idx
  on private.slates (league_id, published_at desc);

create table private.slate_items (
  id uuid primary key default gen_random_uuid(),
  slate_id uuid not null,
  event_id uuid not null,
  market_snapshot_id uuid not null,
  week_id uuid not null,
  league_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (slate_id, week_id, league_id)
    references private.slates (id, week_id, league_id) on delete cascade,
  foreign key (market_snapshot_id, event_id, week_id, league_id)
    references private.market_snapshots (id, event_id, week_id, league_id),
  unique (slate_id, market_snapshot_id)
);

create index slate_items_event_id_idx
  on private.slate_items (event_id, slate_id);

create index slate_items_week_id_idx
  on private.slate_items (week_id, market_snapshot_id);

create index slate_items_market_snapshot_id_idx
  on private.slate_items (market_snapshot_id, event_id, week_id, league_id);

create table private.weekly_cards (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null,
  season_id uuid not null,
  league_id uuid not null,
  entry_id uuid not null,
  owner_user_id uuid not null,
  granted_credits integer not null default 1000 check (granted_credits = 1000),
  granted_at timestamptz not null,
  compliance text not null default 'PENDING'
    check (compliance in ('PENDING', 'COMPLIANT', 'INCOMPLETE')),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (week_id, season_id, league_id)
    references private.season_weeks (id, season_id, league_id) on delete cascade,
  foreign key (entry_id, season_id, league_id)
    references private.season_entries (id, season_id, league_id),
  foreign key (league_id, owner_user_id)
    references private.league_memberships (league_id, user_id),
  unique (week_id, entry_id),
  unique (id, week_id, league_id)
);

create index weekly_cards_owner_week_idx
  on private.weekly_cards (owner_user_id, week_id);

create index weekly_cards_league_week_idx
  on private.weekly_cards (league_id, week_id, compliance);

create index weekly_cards_entry_id_idx
  on private.weekly_cards (entry_id, season_id, league_id);

create table private.position_receipts (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null,
  week_id uuid not null,
  league_id uuid not null,
  entry_id uuid not null,
  owner_user_id uuid not null,
  event_id uuid not null,
  market_snapshot_id uuid not null,
  market_type text not null check (market_type in ('MONEYLINE', 'SPREAD', 'TOTAL')),
  outcome_key text not null,
  proposition text not null,
  line_milli integer,
  american_odds integer not null check (american_odds <> 0),
  stake_credits integer not null check (stake_credits between 50 and 1000),
  quote_observed_at timestamptz not null,
  accepted_at timestamptz not null,
  ruleset_snapshot_id uuid not null references private.season_ruleset_snapshots (id),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 120),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  receipt_hash text not null check (receipt_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  foreign key (card_id, week_id, league_id)
    references private.weekly_cards (id, week_id, league_id),
  foreign key (entry_id)
    references private.season_entries (id),
  foreign key (market_snapshot_id, event_id, week_id, league_id)
    references private.market_snapshots (id, event_id, week_id, league_id),
  unique (card_id, event_id, market_type),
  unique (owner_user_id, idempotency_key),
  unique (receipt_hash)
);

create index position_receipts_card_accepted_idx
  on private.position_receipts (card_id, accepted_at);

create index position_receipts_event_id_idx
  on private.position_receipts (event_id, card_id);

create index position_receipts_ruleset_snapshot_id_idx
  on private.position_receipts (ruleset_snapshot_id);

create index position_receipts_entry_id_idx
  on private.position_receipts (entry_id);

create index position_receipts_market_snapshot_id_idx
  on private.position_receipts (market_snapshot_id, event_id, week_id, league_id);

create table private.event_result_versions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  week_id uuid not null,
  league_id uuid not null,
  version integer not null check (version > 0),
  status text not null check (status in ('FINAL', 'VOID')),
  away_score integer check (away_score >= 0),
  home_score integer check (home_score >= 0),
  source text not null check (source in ('SIMULATION_FIXTURE', 'MANUAL_OBJECTIVE')),
  reason text not null check (char_length(reason) between 3 and 500),
  recorded_by uuid not null references private.profiles (id),
  supersedes_id uuid references private.event_result_versions (id),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (event_id, week_id, league_id)
    references private.sports_events (id, week_id, league_id),
  unique (event_id, version),
  unique (event_id, input_hash),
  check (
    (status = 'VOID' and away_score is null and home_score is null)
    or (status = 'FINAL' and away_score is not null and home_score is not null)
  )
);

create index event_result_versions_event_latest_idx
  on private.event_result_versions (event_id, version desc);

create index event_result_versions_recorded_by_idx
  on private.event_result_versions (recorded_by);

create index event_result_versions_supersedes_id_idx
  on private.event_result_versions (supersedes_id);

create table private.settlement_versions (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references private.position_receipts (id),
  result_version_id uuid not null references private.event_result_versions (id),
  week_id uuid not null,
  league_id uuid not null,
  owner_user_id uuid not null,
  outcome text not null check (outcome in ('WIN', 'LOSS', 'PUSH', 'VOID')),
  returned_centicredits bigint not null check (returned_centicredits >= 0),
  supersedes_id uuid references private.settlement_versions (id),
  created_at timestamptz not null default clock_timestamp(),
  unique (receipt_id, result_version_id)
);

create index settlement_versions_receipt_latest_idx
  on private.settlement_versions (receipt_id, created_at desc);

create index settlement_versions_result_version_id_idx
  on private.settlement_versions (result_version_id);

create index settlement_versions_week_id_idx
  on private.settlement_versions (week_id, owner_user_id);

create index settlement_versions_supersedes_id_idx
  on private.settlement_versions (supersedes_id);

create table private.weekly_score_versions (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references private.weekly_cards (id),
  week_id uuid not null,
  league_id uuid not null,
  entry_id uuid not null references private.season_entries (id),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  compliance text not null check (compliance in ('COMPLIANT', 'INCOMPLETE')),
  score_centicredits bigint not null check (score_centicredits >= 0),
  is_complete boolean not null,
  status text not null check (status in ('PROVISIONAL', 'FINAL')),
  supersedes_id uuid references private.weekly_score_versions (id),
  created_at timestamptz not null default clock_timestamp(),
  unique (card_id, input_hash)
);

create index weekly_score_versions_card_latest_idx
  on private.weekly_score_versions (card_id, created_at desc);

create index weekly_score_versions_week_id_idx
  on private.weekly_score_versions (week_id, entry_id);

create index weekly_score_versions_entry_id_idx
  on private.weekly_score_versions (entry_id);

create index weekly_score_versions_supersedes_id_idx
  on private.weekly_score_versions (supersedes_id);

create table private.matchup_result_versions (
  id uuid primary key default gen_random_uuid(),
  matchup_id uuid not null references private.matchups (id),
  week_id uuid not null,
  league_id uuid not null,
  side_a_score_version_id uuid not null references private.weekly_score_versions (id),
  side_b_score_version_id uuid not null references private.weekly_score_versions (id),
  side_a_decision text not null check (side_a_decision in ('WIN', 'LOSS', 'TIE')),
  side_b_decision text not null check (side_b_decision in ('WIN', 'LOSS', 'TIE')),
  side_a_points_for_centicredits bigint not null check (side_a_points_for_centicredits >= 0),
  side_b_points_for_centicredits bigint not null check (side_b_points_for_centicredits >= 0),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('PROVISIONAL', 'FINAL')),
  supersedes_id uuid references private.matchup_result_versions (id),
  created_at timestamptz not null default clock_timestamp(),
  unique (matchup_id, input_hash)
);

create index matchup_result_versions_matchup_latest_idx
  on private.matchup_result_versions (matchup_id, created_at desc);

create index matchup_result_versions_week_id_idx
  on private.matchup_result_versions (week_id, matchup_id);

create index matchup_result_versions_side_a_score_idx
  on private.matchup_result_versions (side_a_score_version_id);

create index matchup_result_versions_side_b_score_idx
  on private.matchup_result_versions (side_b_score_version_id);

create index matchup_result_versions_supersedes_id_idx
  on private.matchup_result_versions (supersedes_id);

create table private.standings_snapshots (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references private.seasons (id),
  week_id uuid not null references private.season_weeks (id),
  league_id uuid not null references private.leagues (id),
  through_week integer not null check (through_week between 1 and 18),
  ordered_rows jsonb not null,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('PROVISIONAL', 'FINAL')),
  supersedes_id uuid references private.standings_snapshots (id),
  created_at timestamptz not null default clock_timestamp(),
  unique (season_id, through_week, input_hash)
);

create index standings_snapshots_week_latest_idx
  on private.standings_snapshots (week_id, created_at desc);

create index standings_snapshots_league_id_idx
  on private.standings_snapshots (league_id, through_week);

create index standings_snapshots_supersedes_id_idx
  on private.standings_snapshots (supersedes_id);

create table private.corrections (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references private.leagues (id),
  week_id uuid not null references private.season_weeks (id),
  event_id uuid not null references private.sports_events (id),
  original_result_version_id uuid not null references private.event_result_versions (id),
  corrected_result_version_id uuid not null references private.event_result_versions (id),
  reason text not null check (char_length(reason) between 3 and 500),
  actor_user_id uuid not null references private.profiles (id),
  before_summary jsonb not null,
  after_summary jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);

create index corrections_league_week_idx
  on private.corrections (league_id, week_id, created_at desc);

create index corrections_event_id_idx
  on private.corrections (event_id, created_at desc);

create index corrections_actor_user_id_idx
  on private.corrections (actor_user_id);

create index corrections_week_id_idx
  on private.corrections (week_id);

create index corrections_original_result_version_id_idx
  on private.corrections (original_result_version_id);

create index corrections_corrected_result_version_id_idx
  on private.corrections (corrected_result_version_id);

create table private.command_receipts (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references private.leagues (id),
  actor_user_id uuid not null references private.profiles (id),
  command_name text not null,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 120),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  response_json jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (actor_user_id, command_name, idempotency_key)
);

create index command_receipts_league_id_idx
  on private.command_receipts (league_id, created_at desc);

alter table private.season_weeks enable row level security;
alter table private.schedule_publications enable row level security;
alter table private.matchups enable row level security;
alter table private.sports_events enable row level security;
alter table private.market_snapshots enable row level security;
alter table private.slates enable row level security;
alter table private.slate_items enable row level security;
alter table private.weekly_cards enable row level security;
alter table private.position_receipts enable row level security;
alter table private.event_result_versions enable row level security;
alter table private.settlement_versions enable row level security;
alter table private.weekly_score_versions enable row level security;
alter table private.matchup_result_versions enable row level security;
alter table private.standings_snapshots enable row level security;
alter table private.corrections enable row level security;
alter table private.command_receipts enable row level security;

create policy season_weeks_select_member
on private.season_weeks for select to authenticated
using ((select private.is_league_member(league_id)));

create policy schedule_publications_select_member
on private.schedule_publications for select to authenticated
using ((select private.is_league_member(league_id)));

create policy matchups_select_member
on private.matchups for select to authenticated
using ((select private.is_league_member(league_id)));

create policy sports_events_select_member
on private.sports_events for select to authenticated
using ((select private.is_league_member(league_id)));

create policy market_snapshots_select_member
on private.market_snapshots for select to authenticated
using ((select private.is_league_member(league_id)));

create policy slates_select_member
on private.slates for select to authenticated
using ((select private.is_league_member(league_id)));

create policy slate_items_select_member
on private.slate_items for select to authenticated
using ((select private.is_league_member(league_id)));

create policy weekly_cards_select_owner
on private.weekly_cards for select to authenticated
using (owner_user_id = (select auth.uid()));

create policy position_receipts_select_owner
on private.position_receipts for select to authenticated
using (owner_user_id = (select auth.uid()));

create policy event_result_versions_select_member
on private.event_result_versions for select to authenticated
using ((select private.is_league_member(league_id)));

create policy settlement_versions_select_owner
on private.settlement_versions for select to authenticated
using (owner_user_id = (select auth.uid()));

create policy weekly_score_versions_select_member
on private.weekly_score_versions for select to authenticated
using ((select private.is_league_member(league_id)));

create policy matchup_result_versions_select_member
on private.matchup_result_versions for select to authenticated
using ((select private.is_league_member(league_id)));

create policy standings_snapshots_select_member
on private.standings_snapshots for select to authenticated
using ((select private.is_league_member(league_id)));

create policy corrections_select_member
on private.corrections for select to authenticated
using ((select private.is_league_member(league_id)));

create policy command_receipts_select_actor
on private.command_receipts for select to authenticated
using (actor_user_id = (select auth.uid()));

revoke all on table
  private.season_weeks,
  private.schedule_publications,
  private.matchups,
  private.sports_events,
  private.market_snapshots,
  private.slates,
  private.slate_items,
  private.weekly_cards,
  private.position_receipts,
  private.event_result_versions,
  private.settlement_versions,
  private.weekly_score_versions,
  private.matchup_result_versions,
  private.standings_snapshots,
  private.corrections,
  private.command_receipts
from anon, authenticated;

grant select on table
  private.season_weeks,
  private.schedule_publications,
  private.matchups,
  private.sports_events,
  private.market_snapshots,
  private.slates,
  private.slate_items,
  private.weekly_cards,
  private.position_receipts,
  private.event_result_versions,
  private.settlement_versions,
  private.weekly_score_versions,
  private.matchup_result_versions,
  private.standings_snapshots,
  private.corrections,
  private.command_receipts
to authenticated;

create or replace function private.guard_stage1_roster_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season private.seasons%rowtype;
  v_member_count integer;
begin
  perform 1
  from private.leagues
  where id = new.league_id
  for update;

  select season.* into v_season
  from private.seasons as season
  where season.league_id = new.league_id
  order by season.created_at desc
  limit 1;

  -- create_league inserts the commissioner before it creates the season.
  if v_season.id is null then
    return new;
  end if;
  if v_season.lifecycle <> 'DRAFT' then
    raise exception using errcode = '55000', message = 'The season roster is locked.';
  end if;

  if v_season.mode = 'SIMULATION' then
    select count(*) into v_member_count
    from private.league_memberships
    where league_id = new.league_id;

    if v_member_count >= 8 then
      raise exception using errcode = '22023', message = 'Stage 1 supports exactly eight members.';
    end if;
  end if;

  return new;
end;
$$;

create trigger guard_stage1_roster_membership
before insert on private.league_memberships
for each row execute function private.guard_stage1_roster_membership();

create or replace function private.reject_competitive_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = format('%s is append-only.', tg_table_name);
end;
$$;

create or replace function api.finalize_stage1_week(
  p_league_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_season private.seasons%rowtype;
  v_week private.season_weeks%rowtype;
  v_command private.command_receipts%rowtype;
  v_request_hash text;
  v_previous_score private.weekly_score_versions%rowtype;
  v_previous_matchup private.matchup_result_versions%rowtype;
  v_previous_standings private.standings_snapshots%rowtype;
  v_side_a_score_id uuid;
  v_side_b_score_id uuid;
  v_new_hash text;
  v_response jsonb;
begin
  if v_user_id is null or not private.is_league_commissioner(p_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;

  v_request_hash := encode(
    extensions.digest(p_league_id::text || ':FINALIZE:WEEK1', 'sha256'),
    'hex'
  );

  select * into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'FINALIZE_STAGE1_WEEK'
    and command.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json;
  end if;

  select season.* into strict v_season
  from private.seasons as season
  where season.league_id = p_league_id
    and season.lifecycle = 'REGULAR'
  order by season.created_at desc
  limit 1
  for update;

  select week.* into strict v_week
  from private.season_weeks as week
  where week.season_id = v_season.id and week.nfl_week = 1
  for update;

  if v_week.state <> 'PROVISIONAL'
    or v_week.correction_window_closes_at is null
    or private.stage1_season_time(v_season.id) < v_week.correction_window_closes_at then
    raise exception using
      errcode = '55000',
      message = 'Week 1 cannot finalize before its correction window closes.';
  end if;

  for v_previous_score in
    select distinct on (score.card_id) score.*
    from private.weekly_score_versions as score
    where score.week_id = v_week.id
    order by score.card_id, score.created_at desc, score.id desc
  loop
    v_new_hash := encode(
      extensions.digest(v_previous_score.input_hash || ':FINAL', 'sha256'),
      'hex'
    );
    insert into private.weekly_score_versions (
      card_id,
      week_id,
      league_id,
      entry_id,
      input_hash,
      compliance,
      score_centicredits,
      is_complete,
      status,
      supersedes_id
    ) values (
      v_previous_score.card_id,
      v_previous_score.week_id,
      v_previous_score.league_id,
      v_previous_score.entry_id,
      v_new_hash,
      v_previous_score.compliance,
      v_previous_score.score_centicredits,
      v_previous_score.is_complete,
      'FINAL',
      v_previous_score.id
    )
    on conflict (card_id, input_hash) do nothing;
  end loop;

  for v_previous_matchup in
    select distinct on (result.matchup_id) result.*
    from private.matchup_result_versions as result
    where result.week_id = v_week.id
    order by result.matchup_id, result.created_at desc, result.id desc
  loop
    select score.id into strict v_side_a_score_id
    from private.weekly_score_versions as score
    join private.matchups as matchup
      on matchup.id = v_previous_matchup.matchup_id
     and matchup.side_a_entry_id = score.entry_id
    where score.week_id = v_week.id and score.status = 'FINAL'
    order by score.created_at desc, score.id desc
    limit 1;

    select score.id into strict v_side_b_score_id
    from private.weekly_score_versions as score
    join private.matchups as matchup
      on matchup.id = v_previous_matchup.matchup_id
     and matchup.side_b_entry_id = score.entry_id
    where score.week_id = v_week.id and score.status = 'FINAL'
    order by score.created_at desc, score.id desc
    limit 1;

    v_new_hash := encode(
      extensions.digest(
        v_previous_matchup.input_hash || ':FINAL:'
        || v_side_a_score_id::text || ':' || v_side_b_score_id::text,
        'sha256'
      ),
      'hex'
    );

    insert into private.matchup_result_versions (
      matchup_id,
      week_id,
      league_id,
      side_a_score_version_id,
      side_b_score_version_id,
      side_a_decision,
      side_b_decision,
      side_a_points_for_centicredits,
      side_b_points_for_centicredits,
      input_hash,
      status,
      supersedes_id
    ) values (
      v_previous_matchup.matchup_id,
      v_previous_matchup.week_id,
      v_previous_matchup.league_id,
      v_side_a_score_id,
      v_side_b_score_id,
      v_previous_matchup.side_a_decision,
      v_previous_matchup.side_b_decision,
      v_previous_matchup.side_a_points_for_centicredits,
      v_previous_matchup.side_b_points_for_centicredits,
      v_new_hash,
      'FINAL',
      v_previous_matchup.id
    )
    on conflict (matchup_id, input_hash) do nothing;
  end loop;

  select * into strict v_previous_standings
  from private.standings_snapshots as standings
  where standings.week_id = v_week.id
  order by standings.created_at desc, standings.id desc
  limit 1;

  v_new_hash := encode(
    extensions.digest(v_previous_standings.input_hash || ':FINAL', 'sha256'),
    'hex'
  );

  insert into private.standings_snapshots (
    season_id,
    week_id,
    league_id,
    through_week,
    ordered_rows,
    input_hash,
    status,
    supersedes_id
  ) values (
    v_previous_standings.season_id,
    v_previous_standings.week_id,
    v_previous_standings.league_id,
    v_previous_standings.through_week,
    v_previous_standings.ordered_rows,
    v_new_hash,
    'FINAL',
    v_previous_standings.id
  );

  update private.season_weeks
  set state = 'FINAL'
  where id = v_week.id;

  v_response := jsonb_build_object(
    'weekId', v_week.id,
    'state', 'FINAL',
    'finalizedAt', private.stage1_season_time(v_season.id)
  );

  insert into private.command_receipts (
    league_id, actor_user_id, command_name, idempotency_key, request_hash, response_json
  ) values (
    p_league_id,
    v_user_id,
    'FINALIZE_STAGE1_WEEK',
    p_idempotency_key,
    v_request_hash,
    v_response
  );

  return v_response;
end;
$$;

create or replace function api.advance_stage1_clock(
  p_league_id uuid,
  p_target timestamptz,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_season private.seasons%rowtype;
  v_command private.command_receipts%rowtype;
  v_request_hash text;
  v_response jsonb;
begin
  if v_user_id is null or not private.is_league_commissioner(p_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;

  v_request_hash := encode(
    extensions.digest(p_league_id::text || ':' || p_target::text, 'sha256'),
    'hex'
  );

  select * into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'ADVANCE_STAGE1_CLOCK'
    and command.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json;
  end if;

  select season.* into strict v_season
  from private.seasons as season
  where season.league_id = p_league_id
    and season.lifecycle = 'REGULAR'
  order by season.created_at desc
  limit 1
  for update;

  if v_season.mode <> 'SIMULATION' then
    raise exception using errcode = '22023', message = 'Only Simulation seasons use the fixture clock.';
  end if;
  if p_target < v_season.simulated_now then
    raise exception using errcode = '22023', message = 'Simulation time is monotonic.';
  end if;

  update private.seasons
  set simulated_now = p_target
  where id = v_season.id;

  v_response := jsonb_build_object(
    'leagueId', p_league_id,
    'previousTime', v_season.simulated_now,
    'simulatedNow', p_target
  );

  insert into private.command_receipts (
    league_id, actor_user_id, command_name, idempotency_key, request_hash, response_json
  ) values (
    p_league_id, v_user_id, 'ADVANCE_STAGE1_CLOCK', p_idempotency_key, v_request_hash, v_response
  );

  return v_response;
end;
$$;

create or replace function api.set_stage1_event_live(
  p_event_id uuid,
  p_actual_started_at timestamptz,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_event private.sports_events%rowtype;
  v_season private.seasons%rowtype;
  v_command private.command_receipts%rowtype;
  v_request_hash text;
  v_response jsonb;
begin
  select event.* into strict v_event
  from private.sports_events as event
  where event.id = p_event_id
  for update;

  if v_user_id is null or not private.is_league_commissioner(v_event.league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;

  select * into strict v_season
  from private.seasons
  where id = v_event.season_id;

  if p_actual_started_at < v_event.scheduled_start_at - interval '6 hours'
    or p_actual_started_at > private.stage1_season_time(v_season.id) then
    raise exception using errcode = '22023', message = 'Actual kickoff is invalid.';
  end if;

  v_request_hash := encode(
    extensions.digest(p_event_id::text || ':' || p_actual_started_at::text, 'sha256'),
    'hex'
  );

  select * into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'SET_STAGE1_EVENT_LIVE'
    and command.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json;
  end if;

  if v_event.state not in ('SCHEDULED', 'LIVE') then
    raise exception using errcode = '55000', message = 'A finalized event cannot return to live.';
  end if;

  update private.sports_events
  set state = 'LIVE', actual_started_at = p_actual_started_at
  where id = p_event_id;

  v_response := jsonb_build_object(
    'eventId', p_event_id,
    'state', 'LIVE',
    'actualStartedAt', p_actual_started_at
  );

  insert into private.command_receipts (
    league_id, actor_user_id, command_name, idempotency_key, request_hash, response_json
  ) values (
    v_event.league_id, v_user_id, 'SET_STAGE1_EVENT_LIVE', p_idempotency_key, v_request_hash, v_response
  );

  return v_response;
end;
$$;

create or replace function api.lock_stage1_week(
  p_league_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_season private.seasons%rowtype;
  v_week private.season_weeks%rowtype;
  v_command private.command_receipts%rowtype;
  v_request_hash text;
  v_now timestamptz;
  v_ready_count integer;
  v_response jsonb;
begin
  if v_user_id is null or not private.is_league_commissioner(p_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;

  v_request_hash := encode(
    extensions.digest(p_league_id::text || ':WEEK1', 'sha256'),
    'hex'
  );

  select * into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'LOCK_STAGE1_WEEK'
    and command.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json;
  end if;

  select season.* into strict v_season
  from private.seasons as season
  where season.league_id = p_league_id
    and season.lifecycle = 'REGULAR'
  order by season.created_at desc
  limit 1
  for update;

  select week.* into strict v_week
  from private.season_weeks as week
  where week.season_id = v_season.id and week.nfl_week = 1
  for update;

  v_now := private.stage1_season_time(v_season.id);
  if v_now < v_week.common_lock_at then
    raise exception using errcode = '55000', message = 'Common lock has not arrived.';
  end if;
  if v_week.state <> 'OPEN' then
    raise exception using errcode = '55000', message = 'Week 1 is not open.';
  end if;

  update private.weekly_cards as card
  set
    compliance = case
      when (
        select coalesce(sum(receipt.stake_credits), 0)
        from private.position_receipts as receipt
        where receipt.card_id = card.id
      ) = 1000 then 'COMPLIANT'
      else 'INCOMPLETE'
    end,
    locked_at = v_now
  where card.week_id = v_week.id;

  update private.season_weeks
  set state = 'LOCKED', locked_at = v_now
  where id = v_week.id;

  select count(*) into v_ready_count
  from private.weekly_cards
  where week_id = v_week.id and compliance = 'COMPLIANT';

  v_response := jsonb_build_object(
    'weekId', v_week.id,
    'state', 'LOCKED',
    'lockedAt', v_now,
    'readyCount', v_ready_count,
    'cardCount', 8
  );

  insert into private.command_receipts (
    league_id, actor_user_id, command_name, idempotency_key, request_hash, response_json
  ) values (
    p_league_id, v_user_id, 'LOCK_STAGE1_WEEK', p_idempotency_key, v_request_hash, v_response
  );

  return v_response;
end;
$$;

create or replace function api.record_stage1_result(
  p_event_id uuid,
  p_status text,
  p_away_score integer,
  p_home_score integer,
  p_reason text,
  p_source text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_event private.sports_events%rowtype;
  v_week private.season_weeks%rowtype;
  v_previous_result private.event_result_versions%rowtype;
  v_result_id uuid := gen_random_uuid();
  v_result_version integer;
  v_command private.command_receipts%rowtype;
  v_request_hash text;
  v_before_summary jsonb;
  v_after_summary jsonb;
  v_response jsonb;
begin
  select event.* into strict v_event
  from private.sports_events as event
  where event.id = p_event_id
  for update;

  if v_user_id is null or not private.is_league_commissioner(v_event.league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;

  select week.* into strict v_week
  from private.season_weeks as week
  where week.id = v_event.week_id
  for update;

  if v_week.state not in ('LOCKED', 'PROVISIONAL') then
    raise exception using errcode = '55000', message = 'Results require a locked, unfinalized week.';
  end if;
  if upper(p_status) not in ('FINAL', 'VOID')
    or upper(p_source) not in ('SIMULATION_FIXTURE', 'MANUAL_OBJECTIVE')
    or char_length(btrim(p_reason)) not between 3 and 500 then
    raise exception using errcode = '22023', message = 'Result status, source, or reason is invalid.';
  end if;
  if upper(p_status) = 'FINAL'
    and (p_away_score is null or p_home_score is null or p_away_score < 0 or p_home_score < 0) then
    raise exception using errcode = '22023', message = 'Final scores are invalid.';
  end if;
  if upper(p_status) = 'VOID' and (p_away_score is not null or p_home_score is not null) then
    raise exception using errcode = '22023', message = 'Void results cannot include scores.';
  end if;
  if private.stage1_season_time(v_event.season_id) < v_event.scheduled_start_at then
    raise exception using errcode = '55000', message = 'An event cannot settle before its scheduled start.';
  end if;

  v_request_hash := encode(
    extensions.digest(
      p_event_id::text || ':' || upper(p_status) || ':'
      || coalesce(p_away_score::text, 'NULL') || ':'
      || coalesce(p_home_score::text, 'NULL') || ':'
      || btrim(p_reason) || ':' || upper(p_source),
      'sha256'
    ),
    'hex'
  );

  select * into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'RECORD_STAGE1_RESULT'
    and command.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json;
  end if;

  select * into v_previous_result
  from private.event_result_versions as result
  where result.event_id = p_event_id
  order by result.version desc
  limit 1;

  if v_previous_result.id is null
    and upper(p_status) = 'FINAL'
    and (v_event.state <> 'LIVE' or v_event.actual_started_at is null) then
    raise exception using errcode = '55000', message = 'A final result requires reliable actual kickoff.';
  end if;
  if v_previous_result.id is not null
    and (
      v_week.correction_window_closes_at is null
      or private.stage1_season_time(v_event.season_id) >= v_week.correction_window_closes_at
    ) then
    raise exception using errcode = '55000', message = 'The correction window is closed.';
  end if;

  v_result_version := coalesce(v_previous_result.version, 0) + 1;
  v_before_summary := jsonb_build_object(
    'eventState', v_event.state,
    'resultVersionId', v_previous_result.id,
    'standingsSnapshotId', (
      select standings.id
      from private.standings_snapshots as standings
      where standings.week_id = v_week.id
      order by standings.created_at desc, standings.id desc
      limit 1
    )
  );

  insert into private.event_result_versions (
    id,
    event_id,
    week_id,
    league_id,
    version,
    status,
    away_score,
    home_score,
    source,
    reason,
    recorded_by,
    supersedes_id,
    input_hash
  ) values (
    v_result_id,
    p_event_id,
    v_week.id,
    v_event.league_id,
    v_result_version,
    upper(p_status),
    case when upper(p_status) = 'FINAL' then p_away_score else null end,
    case when upper(p_status) = 'FINAL' then p_home_score else null end,
    upper(p_source),
    btrim(p_reason),
    v_user_id,
    v_previous_result.id,
    v_request_hash
  );

  update private.sports_events
  set
    state = case
      when v_previous_result.id is not null then 'CORRECTED'
      when upper(p_status) = 'VOID' then 'VOID'
      else 'FINAL'
    end,
    actual_started_at = case
      when upper(p_status) = 'FINAL' then coalesce(actual_started_at, scheduled_start_at)
      else actual_started_at
    end
  where id = p_event_id;

  perform private.recompute_stage1_week(v_week.id, v_result_id);

  v_after_summary := jsonb_build_object(
    'eventState', (
      select state from private.sports_events where id = p_event_id
    ),
    'resultVersionId', v_result_id,
    'standingsSnapshotId', (
      select standings.id
      from private.standings_snapshots as standings
      where standings.week_id = v_week.id
      order by standings.created_at desc, standings.id desc
      limit 1
    )
  );

  if v_previous_result.id is not null then
    insert into private.corrections (
      league_id,
      week_id,
      event_id,
      original_result_version_id,
      corrected_result_version_id,
      reason,
      actor_user_id,
      before_summary,
      after_summary
    ) values (
      v_event.league_id,
      v_week.id,
      p_event_id,
      v_previous_result.id,
      v_result_id,
      btrim(p_reason),
      v_user_id,
      v_before_summary,
      v_after_summary
    );
  end if;

  v_response := jsonb_build_object(
    'eventId', p_event_id,
    'resultVersionId', v_result_id,
    'version', v_result_version,
    'corrected', v_previous_result.id is not null,
    'weekState', (select state from private.season_weeks where id = v_week.id)
  );

  insert into private.command_receipts (
    league_id, actor_user_id, command_name, idempotency_key, request_hash, response_json
  ) values (
    v_event.league_id,
    v_user_id,
    'RECORD_STAGE1_RESULT',
    p_idempotency_key,
    v_request_hash,
    v_response
  );

  return v_response;
end;
$$;

create or replace function api.initialize_stage1_week(
  p_league_id uuid,
  p_fixture jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_season private.seasons%rowtype;
  v_snapshot private.season_ruleset_snapshots%rowtype;
  v_command private.command_receipts%rowtype;
  v_request_hash text;
  v_week_id uuid := gen_random_uuid();
  v_publication_id uuid := gen_random_uuid();
  v_slate_id uuid := gen_random_uuid();
  v_opens_at timestamptz;
  v_common_lock_at timestamptz;
  v_ordered_entry_ids uuid[];
  v_output_hash text;
  v_event_json jsonb;
  v_market_json jsonb;
  v_event_id uuid;
  v_snapshot_id uuid;
  v_market_type text;
  v_quality_status text;
  v_line_milli integer;
  v_event_count integer;
  v_response jsonb;
begin
  if v_user_id is null or not private.is_league_commissioner(p_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;
  if char_length(p_idempotency_key) not between 8 and 120 then
    raise exception using errcode = '22023', message = 'Idempotency key is invalid.';
  end if;

  v_request_hash := encode(
    extensions.digest(p_league_id::text || ':' || p_fixture::text, 'sha256'),
    'hex'
  );

  select * into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'INITIALIZE_STAGE1_WEEK'
    and command.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json;
  end if;

  select season.* into strict v_season
  from private.seasons as season
  where season.league_id = p_league_id
    and season.lifecycle = 'DRAFT'
  order by season.created_at desc
  limit 1
  for update;

  if v_season.mode <> 'SIMULATION' then
    raise exception using errcode = '22023', message = 'Stage 1 fixtures require a Simulation season.';
  end if;

  select snapshot.* into strict v_snapshot
  from private.season_ruleset_snapshots as snapshot
  where snapshot.id = v_season.ruleset_snapshot_id
  for update;

  select array_agg(entry.id order by entry.standing_tiebreak, entry.id)
  into v_ordered_entry_ids
  from private.season_entries as entry
  where entry.season_id = v_season.id;

  if coalesce(array_length(v_ordered_entry_ids, 1), 0) <> 8 then
    raise exception using
      errcode = '22023',
      message = 'Stage 1 initialization requires exactly eight season entries.';
  end if;

  if p_fixture ->> 'id' <> 'stage1-week-1-v1'
    or jsonb_typeof(p_fixture -> 'events') <> 'array'
    or jsonb_array_length(p_fixture -> 'events') <> 8
    or encode(extensions.digest(p_fixture::text, 'sha256'), 'hex')
      <> '24e7a5618bfd84a86306a9d3f09e2e5960e093d9a0dc5efadfe7a76c2cc44780' then
    raise exception using errcode = '22023', message = 'The Stage 1 fixture contract is invalid.';
  end if;

  v_opens_at := (p_fixture ->> 'opensAt')::timestamptz;
  v_common_lock_at := (p_fixture ->> 'commonLockAt')::timestamptz;

  if extract(isodow from v_opens_at at time zone 'America/New_York') <> 2
    or to_char(v_opens_at at time zone 'America/New_York', 'HH24:MI') <> '06:00' then
    raise exception using
      errcode = '22023',
      message = 'The weekly grant must open Tuesday at 6:00 a.m. Eastern.';
  end if;

  insert into private.season_weeks (
    id,
    season_id,
    league_id,
    nfl_week,
    scope,
    state,
    opens_at,
    common_lock_at
  ) values (
    v_week_id,
    v_season.id,
    p_league_id,
    1,
    'REGULAR',
    'OPEN',
    v_opens_at,
    v_common_lock_at
  );

  v_output_hash := encode(
    extensions.digest(
      v_season.schedule_seed || ':' || array_to_string(v_ordered_entry_ids, ','),
      'sha256'
    ),
    'hex'
  );

  insert into private.schedule_publications (
    id,
    season_id,
    league_id,
    version,
    algorithm_version,
    seed,
    ordered_entry_ids,
    output_hash,
    created_by
  ) values (
    v_publication_id,
    v_season.id,
    p_league_id,
    1,
    'stage1-circle-v1',
    v_season.schedule_seed,
    v_ordered_entry_ids,
    v_output_hash,
    v_user_id
  );

  insert into private.matchups (
    week_id,
    season_id,
    league_id,
    schedule_publication_id,
    side_a_entry_id,
    side_b_entry_id,
    scope,
    display_order
  ) values
    (v_week_id, v_season.id, p_league_id, v_publication_id, v_ordered_entry_ids[1], v_ordered_entry_ids[8], 'REGULAR', 1),
    (v_week_id, v_season.id, p_league_id, v_publication_id, v_ordered_entry_ids[2], v_ordered_entry_ids[7], 'REGULAR', 2),
    (v_week_id, v_season.id, p_league_id, v_publication_id, v_ordered_entry_ids[3], v_ordered_entry_ids[6], 'REGULAR', 3),
    (v_week_id, v_season.id, p_league_id, v_publication_id, v_ordered_entry_ids[4], v_ordered_entry_ids[5], 'REGULAR', 4);

  insert into private.slates (
    id,
    week_id,
    season_id,
    league_id,
    version,
    fixture_id,
    common_lock_at
  ) values (
    v_slate_id,
    v_week_id,
    v_season.id,
    p_league_id,
    1,
    p_fixture ->> 'id',
    v_common_lock_at
  );

  for v_event_json in
    select value from jsonb_array_elements(p_fixture -> 'events')
  loop
    if jsonb_typeof(v_event_json -> 'markets') <> 'array'
      or jsonb_array_length(v_event_json -> 'markets') < 1 then
      raise exception using errcode = '22023', message = 'Every fixture event requires markets.';
    end if;

    v_event_id := gen_random_uuid();
    insert into private.sports_events (
      id,
      week_id,
      season_id,
      league_id,
      fixture_event_key,
      away_team,
      home_team,
      scheduled_start_at,
      provider_health
    ) values (
      v_event_id,
      v_week_id,
      v_season.id,
      p_league_id,
      v_event_json ->> 'key',
      v_event_json ->> 'awayTeam',
      v_event_json ->> 'homeTeam',
      (v_event_json ->> 'scheduledStartAt')::timestamptz,
      upper(coalesce(v_event_json ->> 'providerHealth', 'HEALTHY'))
    );

    for v_market_json in
      select value from jsonb_array_elements(v_event_json -> 'markets')
    loop
      v_snapshot_id := gen_random_uuid();
      v_market_type := upper(v_market_json ->> 'marketType');
      v_quality_status := upper(coalesce(v_market_json ->> 'qualityStatus', 'HEALTHY'));
      v_line_milli := nullif(v_market_json ->> 'lineMilli', '')::integer;

      insert into private.market_snapshots (
        id,
        event_id,
        week_id,
        league_id,
        book_key,
        market_type,
        outcome_key,
        proposition,
        line_milli,
        american_odds,
        quality_status,
        observed_at,
        payload_hash
      ) values (
        v_snapshot_id,
        v_event_id,
        v_week_id,
        p_league_id,
        lower(coalesce(v_market_json ->> 'bookKey', 'draftkings')),
        v_market_type,
        upper(v_market_json ->> 'outcomeKey'),
        v_market_json ->> 'proposition',
        v_line_milli,
        (v_market_json ->> 'americanOdds')::integer,
        v_quality_status,
        (v_market_json ->> 'observedAt')::timestamptz,
        encode(extensions.digest(v_market_json::text, 'sha256'), 'hex')
      );

      if lower(coalesce(v_market_json ->> 'bookKey', 'draftkings')) = 'draftkings'
        and coalesce((v_market_json ->> 'eligible')::boolean, true) then
        insert into private.slate_items (
          slate_id,
          event_id,
          market_snapshot_id,
          week_id,
          league_id
        ) values (
          v_slate_id,
          v_event_id,
          v_snapshot_id,
          v_week_id,
          p_league_id
        );
      end if;
    end loop;
  end loop;

  select count(*) into v_event_count
  from private.sports_events
  where week_id = v_week_id;

  if v_event_count <> 8
    or v_common_lock_at <> (
      select min(event.scheduled_start_at) - interval '5 minutes'
      from private.sports_events as event
      where event.week_id = v_week_id
    ) then
    raise exception using errcode = '22023', message = 'Fixture lock or event count is invalid.';
  end if;

  insert into private.weekly_cards (
    week_id,
    season_id,
    league_id,
    entry_id,
    owner_user_id,
    granted_credits,
    granted_at
  )
  select
    v_week_id,
    v_season.id,
    p_league_id,
    entry.id,
    entry.user_id,
    1000,
    v_opens_at
  from private.season_entries as entry
  where entry.season_id = v_season.id;

  update private.season_ruleset_snapshots
  set frozen_at = v_opens_at
  where id = v_snapshot.id;

  update private.seasons
  set
    lifecycle = 'REGULAR',
    roster_locked_at = v_opens_at,
    simulated_now = v_opens_at
  where id = v_season.id;

  v_response := jsonb_build_object(
    'leagueId', p_league_id,
    'seasonId', v_season.id,
    'weekId', v_week_id,
    'week', 1,
    'entryCount', 8,
    'matchupCount', 4,
    'grantedCreditsPerEntry', 1000,
    'scheduleSeed', v_season.schedule_seed,
    'scheduleOutputHash', v_output_hash,
    'fixtureId', p_fixture ->> 'id'
  );

  insert into private.command_receipts (
    league_id,
    actor_user_id,
    command_name,
    idempotency_key,
    request_hash,
    response_json
  ) values (
    p_league_id,
    v_user_id,
    'INITIALIZE_STAGE1_WEEK',
    p_idempotency_key,
    v_request_hash,
    v_response
  );

  return v_response;
end;
$$;

create or replace function api.accept_stage1_position(
  p_league_slug text,
  p_market_snapshot_id uuid,
  p_stake_credits integer,
  p_expected_payload_hash text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_league private.leagues%rowtype;
  v_season private.seasons%rowtype;
  v_week private.season_weeks%rowtype;
  v_card private.weekly_cards%rowtype;
  v_snapshot private.market_snapshots%rowtype;
  v_existing private.position_receipts%rowtype;
  v_now timestamptz;
  v_allocated integer;
  v_position_count integer;
  v_remaining integer;
  v_cap integer;
  v_completion_possible boolean;
  v_request_hash text;
  v_receipt_id uuid := gen_random_uuid();
  v_receipt_hash text;
  v_response jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;
  if p_stake_credits is null or p_stake_credits <> trunc(p_stake_credits)
    or p_stake_credits < 50 then
    raise exception using errcode = '22023', message = 'Positions require at least 50 whole credits.';
  end if;
  if char_length(p_idempotency_key) not between 8 and 120 then
    raise exception using errcode = '22023', message = 'Idempotency key is invalid.';
  end if;

  v_request_hash := encode(
    extensions.digest(
      lower(p_league_slug) || ':' || p_market_snapshot_id::text || ':'
      || p_stake_credits::text || ':' || p_expected_payload_hash,
      'sha256'
    ),
    'hex'
  );

  select * into v_existing
  from private.position_receipts as receipt
  where receipt.owner_user_id = v_user_id
    and receipt.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return jsonb_build_object(
      'receiptId', v_existing.id,
      'receiptHash', v_existing.receipt_hash,
      'stakeCredits', v_existing.stake_credits,
      'replayed', true
    );
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
  if v_week.state <> 'OPEN' or v_now < v_week.opens_at or v_now >= v_week.common_lock_at then
    raise exception using errcode = '55000', message = 'The Week 1 card is not open.';
  end if;

  select snapshot.* into strict v_snapshot
  from private.market_snapshots as snapshot
  join private.slate_items as item
    on item.market_snapshot_id = snapshot.id
   and item.week_id = v_week.id
  where snapshot.id = p_market_snapshot_id;

  if v_snapshot.payload_hash <> p_expected_payload_hash then
    raise exception using errcode = '40001', message = 'QUOTE_CHANGED';
  end if;
  if v_snapshot.quality_status <> 'HEALTHY' then
    raise exception using errcode = '55000', message = 'This market is not currently eligible.';
  end if;
  if v_snapshot.observed_at > v_now
    or v_snapshot.observed_at < v_now - interval '2 minutes' then
    raise exception using errcode = '55000', message = 'The quote is stale and must be reviewed again.';
  end if;

  v_cap := case when v_snapshot.american_odds < -200 then 750 else 1000 end;
  if p_stake_credits > v_cap then
    raise exception using errcode = '22023', message = 'The selected odds cap this position below the requested stake.';
  end if;

  select coalesce(sum(receipt.stake_credits), 0), count(*)
  into v_allocated, v_position_count
  from private.position_receipts as receipt
  where receipt.card_id = v_card.id;

  if v_position_count >= 20 then
    raise exception using errcode = '22023', message = 'A card may contain at most 20 positions.';
  end if;
  if v_allocated + p_stake_credits > 1000 then
    raise exception using errcode = '22023', message = 'This position exceeds the 1,000-credit allocation.';
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

  v_remaining := 1000 - v_allocated - p_stake_credits;
  if v_remaining = 0 then
    v_completion_possible := true;
  elsif v_remaining < 50 or 20 - v_position_count - 1 <= 0 then
    v_completion_possible := false;
  else
    with opportunities as (
      select
        snapshot.event_id,
        snapshot.market_type,
        max(case when snapshot.american_odds < -200 then 750 else 1000 end) as cap
      from private.slate_items as item
      join private.market_snapshots as snapshot on snapshot.id = item.market_snapshot_id
      where item.week_id = v_week.id
        and snapshot.quality_status = 'HEALTHY'
        and not (
          snapshot.event_id = v_snapshot.event_id
          and snapshot.market_type = v_snapshot.market_type
        )
        and not exists (
          select 1
          from private.position_receipts as receipt
          where receipt.card_id = v_card.id
            and receipt.event_id = snapshot.event_id
            and receipt.market_type = snapshot.market_type
        )
      group by snapshot.event_id, snapshot.market_type
    ), capacity as (
      select
        row_number() over (order by cap desc, event_id, market_type)::integer as positions,
        sum(cap) over (order by cap desc, event_id, market_type) as cumulative_cap
      from opportunities
    )
    select exists (
      select 1
      from capacity
      where positions <= 20 - v_position_count - 1
        and 50 * positions <= v_remaining
        and v_remaining <= cumulative_cap
    ) into v_completion_possible;
  end if;

  if not v_completion_possible then
    raise exception using
      errcode = '22023',
      message = 'This position leaves no legal path to complete the 1,000-credit card.';
  end if;

  v_receipt_hash := encode(
    extensions.digest(
      v_receipt_id::text || ':' || v_card.id::text || ':'
      || v_snapshot.id::text || ':' || p_stake_credits::text || ':'
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
    p_stake_credits,
    v_snapshot.observed_at,
    v_now,
    v_season.ruleset_snapshot_id,
    p_idempotency_key,
    v_request_hash,
    v_receipt_hash
  );

  update private.slates
  set frozen_at = coalesce(frozen_at, v_now)
  where week_id = v_week.id;

  v_response := jsonb_build_object(
    'receiptId', v_receipt_id,
    'receiptHash', v_receipt_hash,
    'stakeCredits', p_stake_credits,
    'allocatedCredits', v_allocated + p_stake_credits,
    'remainingCredits', v_remaining,
    'positionCount', v_position_count + 1,
    'replayed', false
  );

  return v_response;
end;
$$;

create trigger schedule_publications_append_only
before update or delete on private.schedule_publications
for each row execute function private.reject_competitive_mutation();

create trigger matchups_append_only
before update or delete on private.matchups
for each row execute function private.reject_competitive_mutation();

create trigger market_snapshots_append_only
before update or delete on private.market_snapshots
for each row execute function private.reject_competitive_mutation();

create trigger slate_items_append_only
before update or delete on private.slate_items
for each row execute function private.reject_competitive_mutation();

create trigger position_receipts_append_only
before update or delete on private.position_receipts
for each row execute function private.reject_competitive_mutation();

create trigger event_result_versions_append_only
before update or delete on private.event_result_versions
for each row execute function private.reject_competitive_mutation();

create trigger settlement_versions_append_only
before update or delete on private.settlement_versions
for each row execute function private.reject_competitive_mutation();

create trigger weekly_score_versions_append_only
before update or delete on private.weekly_score_versions
for each row execute function private.reject_competitive_mutation();

create trigger matchup_result_versions_append_only
before update or delete on private.matchup_result_versions
for each row execute function private.reject_competitive_mutation();

create trigger standings_snapshots_append_only
before update or delete on private.standings_snapshots
for each row execute function private.reject_competitive_mutation();

create trigger corrections_append_only
before update or delete on private.corrections
for each row execute function private.reject_competitive_mutation();

create trigger command_receipts_append_only
before update or delete on private.command_receipts
for each row execute function private.reject_competitive_mutation();

create or replace function private.stage1_season_time(p_season_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when season.mode = 'SIMULATION' then season.simulated_now
    else now()
  end
  from private.seasons as season
  where season.id = p_season_id;
$$;

create or replace function private.stage1_return_centicredits(
  p_stake_credits integer,
  p_american_odds integer,
  p_outcome text
)
returns bigint
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_stake_centicredits bigint := p_stake_credits::bigint * 100;
  v_profit_centicredits bigint;
begin
  if p_outcome = 'LOSS' then
    return 0;
  end if;
  if p_outcome in ('PUSH', 'VOID') then
    return v_stake_centicredits;
  end if;
  if p_outcome <> 'WIN' then
    raise exception using errcode = '22023', message = 'Unsupported settlement outcome.';
  end if;

  if p_american_odds > 0 then
    v_profit_centicredits := p_stake_credits::bigint * p_american_odds::bigint;
  else
    -- Half-up rounding of stake * 10,000 / abs(odds).
    v_profit_centicredits :=
      (
        p_stake_credits::bigint * 10000 * 2
        + abs(p_american_odds)::bigint
      ) / (abs(p_american_odds)::bigint * 2);
  end if;

  return v_stake_centicredits + v_profit_centicredits;
end;
$$;

create or replace function private.grade_stage1_receipt(
  p_market_type text,
  p_outcome_key text,
  p_line_milli integer,
  p_american_odds integer,
  p_stake_credits integer,
  p_result_status text,
  p_away_score integer,
  p_home_score integer
)
returns table (outcome text, returned_centicredits bigint)
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_comparison integer;
begin
  if p_result_status = 'VOID' then
    outcome := 'VOID';
  elsif p_result_status <> 'FINAL' or p_away_score is null or p_home_score is null then
    raise exception using errcode = '22023', message = 'A final or void result is required.';
  elsif p_market_type = 'MONEYLINE' then
    if p_away_score = p_home_score then
      outcome := 'PUSH';
    elsif p_outcome_key = 'AWAY' then
      outcome := case when p_away_score > p_home_score then 'WIN' else 'LOSS' end;
    elsif p_outcome_key = 'HOME' then
      outcome := case when p_home_score > p_away_score then 'WIN' else 'LOSS' end;
    else
      raise exception using errcode = '22023', message = 'Invalid moneyline outcome.';
    end if;
  elsif p_market_type = 'SPREAD' then
    if p_outcome_key = 'AWAY' then
      v_comparison := p_away_score * 1000 + p_line_milli - p_home_score * 1000;
    elsif p_outcome_key = 'HOME' then
      v_comparison := p_home_score * 1000 + p_line_milli - p_away_score * 1000;
    else
      raise exception using errcode = '22023', message = 'Invalid spread outcome.';
    end if;
    outcome := case
      when v_comparison > 0 then 'WIN'
      when v_comparison < 0 then 'LOSS'
      else 'PUSH'
    end;
  elsif p_market_type = 'TOTAL' then
    v_comparison := (p_away_score + p_home_score) * 1000 - p_line_milli;
    if p_outcome_key = 'OVER' then
      outcome := case
        when v_comparison > 0 then 'WIN'
        when v_comparison < 0 then 'LOSS'
        else 'PUSH'
      end;
    elsif p_outcome_key = 'UNDER' then
      outcome := case
        when v_comparison < 0 then 'WIN'
        when v_comparison > 0 then 'LOSS'
        else 'PUSH'
      end;
    else
      raise exception using errcode = '22023', message = 'Invalid total outcome.';
    end if;
  else
    raise exception using errcode = '22023', message = 'Unsupported market type.';
  end if;

  returned_centicredits := private.stage1_return_centicredits(
    p_stake_credits,
    p_american_odds,
    outcome
  );
  return next;
end;
$$;

create or replace function private.recompute_stage1_week(
  p_week_id uuid,
  p_result_version_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_week private.season_weeks%rowtype;
  v_result private.event_result_versions%rowtype;
  v_receipt private.position_receipts%rowtype;
  v_previous_settlement private.settlement_versions%rowtype;
  v_graded record;
  v_card private.weekly_cards%rowtype;
  v_previous_score private.weekly_score_versions%rowtype;
  v_score_centicredits bigint;
  v_receipt_count integer;
  v_settled_count integer;
  v_score_complete boolean;
  v_score_input text;
  v_score_hash text;
  v_matchup private.matchups%rowtype;
  v_side_a_card private.weekly_cards%rowtype;
  v_side_b_card private.weekly_cards%rowtype;
  v_side_a_score private.weekly_score_versions%rowtype;
  v_side_b_score private.weekly_score_versions%rowtype;
  v_previous_matchup private.matchup_result_versions%rowtype;
  v_side_a_decision text;
  v_side_b_decision text;
  v_side_a_points bigint;
  v_side_b_points bigint;
  v_matchup_hash text;
  v_matchup_count integer;
  v_completed_matchup_count integer;
  v_standings_rows jsonb;
  v_standings_input text;
  v_standings_hash text;
  v_previous_standings private.standings_snapshots%rowtype;
  v_all_events_complete boolean;
begin
  select * into strict v_week
  from private.season_weeks
  where id = p_week_id
  for update;

  select * into strict v_result
  from private.event_result_versions
  where id = p_result_version_id
    and week_id = p_week_id;

  for v_receipt in
    select receipt.*
    from private.position_receipts as receipt
    where receipt.event_id = v_result.event_id
    order by receipt.accepted_at, receipt.id
  loop
    select * into v_previous_settlement
    from private.settlement_versions as settlement
    where settlement.receipt_id = v_receipt.id
    order by settlement.created_at desc, settlement.id desc
    limit 1;

    select * into strict v_graded
    from private.grade_stage1_receipt(
      v_receipt.market_type,
      v_receipt.outcome_key,
      v_receipt.line_milli,
      v_receipt.american_odds,
      v_receipt.stake_credits,
      v_result.status,
      v_result.away_score,
      v_result.home_score
    );

    insert into private.settlement_versions (
      receipt_id,
      result_version_id,
      week_id,
      league_id,
      owner_user_id,
      outcome,
      returned_centicredits,
      supersedes_id
    ) values (
      v_receipt.id,
      v_result.id,
      v_receipt.week_id,
      v_receipt.league_id,
      v_receipt.owner_user_id,
      v_graded.outcome,
      v_graded.returned_centicredits,
      v_previous_settlement.id
    )
    on conflict (receipt_id, result_version_id) do nothing;
  end loop;

  for v_card in
    select card.*
    from private.weekly_cards as card
    where card.week_id = p_week_id
    order by card.entry_id
  loop
    select count(*) into v_receipt_count
    from private.position_receipts as receipt
    where receipt.card_id = v_card.id;

    select
      count(settlement.id),
      coalesce(sum(settlement.returned_centicredits), 0),
      coalesce(
        string_agg(
          receipt.id::text || ':' || coalesce(settlement.id::text, 'PENDING'),
          ',' order by receipt.id
        ),
        ''
      )
    into v_settled_count, v_score_centicredits, v_score_input
    from private.position_receipts as receipt
    left join lateral (
      select candidate.id, candidate.returned_centicredits
      from private.settlement_versions as candidate
      where candidate.receipt_id = receipt.id
      order by candidate.created_at desc, candidate.id desc
      limit 1
    ) as settlement on true
    where receipt.card_id = v_card.id;

    v_score_complete :=
      v_card.compliance = 'INCOMPLETE'
      or (
        v_card.compliance = 'COMPLIANT'
        and v_receipt_count > 0
        and v_settled_count = v_receipt_count
      );

    if v_card.compliance = 'INCOMPLETE' then
      v_score_centicredits := 0;
    end if;

    v_score_hash := encode(
      extensions.digest(
        v_card.id::text || ':' || v_card.compliance || ':'
        || v_score_complete::text || ':' || v_score_centicredits::text
        || ':' || v_score_input,
        'sha256'
      ),
      'hex'
    );

    select * into v_previous_score
    from private.weekly_score_versions as score
    where score.card_id = v_card.id
    order by score.created_at desc, score.id desc
    limit 1;

    insert into private.weekly_score_versions (
      card_id,
      week_id,
      league_id,
      entry_id,
      input_hash,
      compliance,
      score_centicredits,
      is_complete,
      status,
      supersedes_id
    ) values (
      v_card.id,
      v_card.week_id,
      v_card.league_id,
      v_card.entry_id,
      v_score_hash,
      v_card.compliance,
      v_score_centicredits,
      v_score_complete,
      'PROVISIONAL',
      v_previous_score.id
    )
    on conflict (card_id, input_hash) do nothing;
  end loop;

  for v_matchup in
    select matchup.*
    from private.matchups as matchup
    where matchup.week_id = p_week_id
    order by matchup.display_order
  loop
    select * into strict v_side_a_card
    from private.weekly_cards
    where week_id = p_week_id and entry_id = v_matchup.side_a_entry_id;

    select * into strict v_side_b_card
    from private.weekly_cards
    where week_id = p_week_id and entry_id = v_matchup.side_b_entry_id;

    select * into strict v_side_a_score
    from private.weekly_score_versions
    where card_id = v_side_a_card.id
    order by created_at desc, id desc
    limit 1;

    select * into strict v_side_b_score
    from private.weekly_score_versions
    where card_id = v_side_b_card.id
    order by created_at desc, id desc
    limit 1;

    if not v_side_a_score.is_complete or not v_side_b_score.is_complete then
      continue;
    end if;

    v_side_a_points := case
      when v_side_a_score.compliance = 'COMPLIANT' then v_side_a_score.score_centicredits
      else 0
    end;
    v_side_b_points := case
      when v_side_b_score.compliance = 'COMPLIANT' then v_side_b_score.score_centicredits
      else 0
    end;

    if v_side_a_score.compliance = 'INCOMPLETE'
      and v_side_b_score.compliance = 'INCOMPLETE' then
      v_side_a_decision := 'LOSS';
      v_side_b_decision := 'LOSS';
    elsif v_side_a_score.compliance = 'INCOMPLETE' then
      v_side_a_decision := 'LOSS';
      v_side_b_decision := 'WIN';
    elsif v_side_b_score.compliance = 'INCOMPLETE' then
      v_side_a_decision := 'WIN';
      v_side_b_decision := 'LOSS';
    elsif v_side_a_score.score_centicredits = v_side_b_score.score_centicredits then
      v_side_a_decision := 'TIE';
      v_side_b_decision := 'TIE';
    elsif v_side_a_score.score_centicredits > v_side_b_score.score_centicredits then
      v_side_a_decision := 'WIN';
      v_side_b_decision := 'LOSS';
    else
      v_side_a_decision := 'LOSS';
      v_side_b_decision := 'WIN';
    end if;

    v_matchup_hash := encode(
      extensions.digest(
        v_matchup.id::text || ':' || v_side_a_score.id::text || ':'
        || v_side_b_score.id::text || ':' || v_side_a_decision || ':'
        || v_side_b_decision,
        'sha256'
      ),
      'hex'
    );

    select * into v_previous_matchup
    from private.matchup_result_versions as result
    where result.matchup_id = v_matchup.id
    order by result.created_at desc, result.id desc
    limit 1;

    insert into private.matchup_result_versions (
      matchup_id,
      week_id,
      league_id,
      side_a_score_version_id,
      side_b_score_version_id,
      side_a_decision,
      side_b_decision,
      side_a_points_for_centicredits,
      side_b_points_for_centicredits,
      input_hash,
      status,
      supersedes_id
    ) values (
      v_matchup.id,
      p_week_id,
      v_matchup.league_id,
      v_side_a_score.id,
      v_side_b_score.id,
      v_side_a_decision,
      v_side_b_decision,
      v_side_a_points,
      v_side_b_points,
      v_matchup_hash,
      'PROVISIONAL',
      v_previous_matchup.id
    )
    on conflict (matchup_id, input_hash) do nothing;
  end loop;

  select count(*) into v_matchup_count
  from private.matchups
  where week_id = p_week_id;

  select count(*) into v_completed_matchup_count
  from private.matchups as matchup
  where matchup.week_id = p_week_id
    and exists (
      select 1
      from private.matchup_result_versions as result
      where result.matchup_id = matchup.id
    );

  if v_matchup_count > 0 and v_completed_matchup_count = v_matchup_count then
    with latest_matchup_results as (
      select distinct on (result.matchup_id)
        result.*
      from private.matchup_result_versions as result
      where result.week_id = p_week_id
      order by result.matchup_id, result.created_at desc, result.id desc
    ), entry_results as (
      select
        matchup.side_a_entry_id as entry_id,
        result.side_a_decision as decision,
        result.side_a_points_for_centicredits as points_for_centicredits
      from latest_matchup_results as result
      join private.matchups as matchup on matchup.id = result.matchup_id
      union all
      select
        matchup.side_b_entry_id,
        result.side_b_decision,
        result.side_b_points_for_centicredits
      from latest_matchup_results as result
      join private.matchups as matchup on matchup.id = result.matchup_id
    ), latest_scores as (
      select distinct on (score.entry_id)
        score.entry_id,
        score.compliance,
        score.score_centicredits
      from private.weekly_score_versions as score
      where score.week_id = p_week_id
      order by score.entry_id, score.created_at desc, score.id desc
    ), all_play as (
      select
        score.entry_id,
        count(other.entry_id)::integer as comparison_count,
        coalesce(sum(
          case
            when score.score_centicredits > other.score_centicredits then 2
            when score.score_centicredits = other.score_centicredits then 1
            else 0
          end
        ), 0)::integer as half_win_units
      from latest_scores as score
      join latest_scores as other
        on other.entry_id <> score.entry_id
       and other.compliance = 'COMPLIANT'
      where score.compliance = 'COMPLIANT'
      group by score.entry_id
    ), ranked as (
      select
        entry.id as entry_id,
        profile.display_name,
        result.decision,
        result.points_for_centicredits,
        case when score.compliance = 'INCOMPLETE' then 1 else 0 end as attendance_misses,
        coalesce(all_play.half_win_units, 0) as all_play_half_win_units,
        coalesce(all_play.comparison_count, 0) as all_play_comparison_count,
        score.score_centicredits as highest_week_centicredits,
        entry.standing_tiebreak,
        row_number() over (
          order by
            case result.decision when 'WIN' then 2 when 'TIE' then 1 else 0 end desc,
            result.points_for_centicredits desc,
            (
              coalesce(all_play.half_win_units, 0)::numeric
              / nullif(coalesce(all_play.comparison_count, 0) * 2, 0)
            ) desc nulls last,
            case when score.compliance = 'INCOMPLETE' then 1 else 0 end asc,
            score.score_centicredits desc,
            entry.standing_tiebreak asc
        ) as seed
      from private.season_entries as entry
      join private.profiles as profile on profile.id = entry.user_id
      join entry_results as result on result.entry_id = entry.id
      join latest_scores as score on score.entry_id = entry.id
      left join all_play on all_play.entry_id = entry.id
      where entry.season_id = v_week.season_id
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'seed', ranked.seed,
          'entryId', ranked.entry_id,
          'displayName', ranked.display_name,
          'wins', case when ranked.decision = 'WIN' then 1 else 0 end,
          'losses', case when ranked.decision = 'LOSS' then 1 else 0 end,
          'ties', case when ranked.decision = 'TIE' then 1 else 0 end,
          'pointsForCenticredits', ranked.points_for_centicredits,
          'allPlayHalfWinUnits', ranked.all_play_half_win_units,
          'allPlayComparisonCount', ranked.all_play_comparison_count,
          'attendanceMisses', ranked.attendance_misses,
          'highestWeekCenticredits', ranked.highest_week_centicredits,
          'deterministicTiebreak', ranked.standing_tiebreak
        ) order by ranked.seed
      ),
      '[]'::jsonb
    ) into v_standings_rows
    from ranked;

    select coalesce(string_agg(result.id::text, ',' order by result.matchup_id), '')
    into v_standings_input
    from (
      select distinct on (candidate.matchup_id)
        candidate.id,
        candidate.matchup_id
      from private.matchup_result_versions as candidate
      where candidate.week_id = p_week_id
      order by candidate.matchup_id, candidate.created_at desc, candidate.id desc
    ) as result;

    v_standings_hash := encode(
      extensions.digest(v_week.id::text || ':' || v_standings_input, 'sha256'),
      'hex'
    );

    select * into v_previous_standings
    from private.standings_snapshots as standings
    where standings.week_id = p_week_id
    order by standings.created_at desc, standings.id desc
    limit 1;

    insert into private.standings_snapshots (
      season_id,
      week_id,
      league_id,
      through_week,
      ordered_rows,
      input_hash,
      status,
      supersedes_id
    ) values (
      v_week.season_id,
      v_week.id,
      v_week.league_id,
      v_week.nfl_week,
      v_standings_rows,
      v_standings_hash,
      'PROVISIONAL',
      v_previous_standings.id
    )
    on conflict (season_id, through_week, input_hash) do nothing;
  end if;

  select not exists (
    select 1
    from private.sports_events as event
    where event.week_id = p_week_id
      and not exists (
        select 1
        from private.event_result_versions as result
        where result.event_id = event.id
      )
  ) into v_all_events_complete;

  if v_all_events_complete and v_matchup_count = v_completed_matchup_count then
    update private.season_weeks
    set
      state = 'PROVISIONAL',
      correction_window_closes_at = coalesce(
        correction_window_closes_at,
        private.stage1_season_time(v_week.season_id) + interval '24 hours'
      )
    where id = p_week_id;
  end if;
end;
$$;

create or replace function api.get_stage1_state(p_league_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_league private.leagues%rowtype;
  v_season private.seasons%rowtype;
  v_week private.season_weeks%rowtype;
  v_entry private.season_entries%rowtype;
  v_card private.weekly_cards%rowtype;
  v_matchup private.matchups%rowtype;
  v_opponent_entry_id uuid;
  v_opponent_card_id uuid;
  v_is_commissioner boolean;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;

  select league.* into strict v_league
  from private.leagues as league
  where league.slug = lower(p_league_slug);

  if not private.is_league_member(v_league.id) then
    raise exception using errcode = '42501', message = 'League membership required.';
  end if;

  v_is_commissioner := private.is_league_commissioner(v_league.id);

  select season.* into strict v_season
  from private.seasons as season
  where season.league_id = v_league.id
  order by season.created_at desc
  limit 1;

  select entry.* into strict v_entry
  from private.season_entries as entry
  where entry.season_id = v_season.id and entry.user_id = v_user_id;

  select week.* into v_week
  from private.season_weeks as week
  where week.season_id = v_season.id and week.nfl_week = 1;

  if v_week.id is not null then
    select card.* into v_card
    from private.weekly_cards as card
    where card.week_id = v_week.id and card.entry_id = v_entry.id;

    select matchup.* into v_matchup
    from private.matchups as matchup
    where matchup.week_id = v_week.id
      and v_entry.id in (matchup.side_a_entry_id, matchup.side_b_entry_id);

    if v_matchup.id is not null then
      v_opponent_entry_id := case
        when v_matchup.side_a_entry_id = v_entry.id then v_matchup.side_b_entry_id
        else v_matchup.side_a_entry_id
      end;
      select card.id into v_opponent_card_id
      from private.weekly_cards as card
      where card.week_id = v_week.id and card.entry_id = v_opponent_entry_id;
    end if;
  end if;

  return jsonb_build_object(
    'league', jsonb_build_object(
      'id', v_league.id,
      'name', v_league.name,
      'slug', v_league.slug,
      'role', case when v_is_commissioner then 'COMMISSIONER' else 'MEMBER' end,
      'mode', v_season.mode,
      'nflYear', v_season.nfl_year,
      'lifecycle', v_season.lifecycle,
      'memberCount', (
        select count(*)
        from private.league_memberships as membership
        where membership.league_id = v_league.id
      )
    ),
    'season', jsonb_build_object(
      'id', v_season.id,
      'scheduleSeed', v_season.schedule_seed,
      'rosterLockedAt', v_season.roster_locked_at,
      'simulatedNow', v_season.simulated_now,
      'rulesetSnapshotId', v_season.ruleset_snapshot_id
    ),
    'viewer', (
      select jsonb_build_object(
        'userId', profile.id,
        'entryId', v_entry.id,
        'displayName', profile.display_name,
        'avatarUrl', profile.avatar_url
      )
      from private.profiles as profile
      where profile.id = v_user_id
    ),
    'members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'userId', membership.user_id,
          'entryId', entry.id,
          'displayName', profile.display_name,
          'role', membership.role,
          'joinedAt', membership.joined_at
        ) order by membership.joined_at, membership.user_id
      )
      from private.league_memberships as membership
      join private.profiles as profile on profile.id = membership.user_id
      left join private.season_entries as entry
        on entry.season_id = v_season.id and entry.user_id = membership.user_id
      where membership.league_id = v_league.id
    ), '[]'::jsonb),
    'week', case when v_week.id is null then null else jsonb_build_object(
      'id', v_week.id,
      'nflWeek', v_week.nfl_week,
      'state', v_week.state,
      'opensAt', v_week.opens_at,
      'commonLockAt', v_week.common_lock_at,
      'lockedAt', v_week.locked_at,
      'correctionWindowClosesAt', v_week.correction_window_closes_at
    ) end,
    'schedule', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', matchup.id,
          'displayOrder', matchup.display_order,
          'sideAEntryId', matchup.side_a_entry_id,
          'sideAName', side_a_profile.display_name,
          'sideBEntryId', matchup.side_b_entry_id,
          'sideBName', side_b_profile.display_name,
          'result', case when result.id is null then null else jsonb_build_object(
            'sideADecision', result.side_a_decision,
            'sideBDecision', result.side_b_decision,
            'sideAPointsForCenticredits', result.side_a_points_for_centicredits,
            'sideBPointsForCenticredits', result.side_b_points_for_centicredits,
            'status', result.status
          ) end
        ) order by matchup.display_order
      )
      from private.matchups as matchup
      join private.season_entries as side_a_entry on side_a_entry.id = matchup.side_a_entry_id
      join private.profiles as side_a_profile on side_a_profile.id = side_a_entry.user_id
      join private.season_entries as side_b_entry on side_b_entry.id = matchup.side_b_entry_id
      join private.profiles as side_b_profile on side_b_profile.id = side_b_entry.user_id
      left join lateral (
        select candidate.*
        from private.matchup_result_versions as candidate
        where candidate.matchup_id = matchup.id
        order by candidate.created_at desc, candidate.id desc
        limit 1
      ) as result on true
      where matchup.week_id = v_week.id
    ), '[]'::jsonb),
    'slate', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', event.id,
          'key', event.fixture_event_key,
          'awayTeam', event.away_team,
          'homeTeam', event.home_team,
          'scheduledStartAt', event.scheduled_start_at,
          'actualStartedAt', event.actual_started_at,
          'state', event.state,
          'providerHealth', event.provider_health,
          'markets', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', snapshot.id,
                'marketType', snapshot.market_type,
                'outcomeKey', snapshot.outcome_key,
                'proposition', snapshot.proposition,
                'lineMilli', snapshot.line_milli,
                'americanOdds', snapshot.american_odds,
                'qualityStatus', snapshot.quality_status,
                'observedAt', snapshot.observed_at,
                'payloadHash', snapshot.payload_hash,
                'maximumStakeCredits', case
                  when snapshot.american_odds < -200 then 750 else 1000
                end
              ) order by snapshot.market_type, snapshot.outcome_key, snapshot.line_milli
            )
            from private.slate_items as item
            join private.market_snapshots as snapshot on snapshot.id = item.market_snapshot_id
            where item.event_id = event.id and item.week_id = v_week.id
          ), '[]'::jsonb)
        ) order by event.scheduled_start_at, event.id
      )
      from private.sports_events as event
      where event.week_id = v_week.id
    ), '[]'::jsonb),
    'ownerCard', case when v_card.id is null then null else jsonb_build_object(
      'id', v_card.id,
      'entryId', v_card.entry_id,
      'grantedCredits', v_card.granted_credits,
      'grantedAt', v_card.granted_at,
      'compliance', v_card.compliance,
      'lockedAt', v_card.locked_at,
      'allocatedCredits', (
        select coalesce(sum(receipt.stake_credits), 0)
        from private.position_receipts as receipt
        where receipt.card_id = v_card.id
      ),
      'remainingCredits', 1000 - (
        select coalesce(sum(receipt.stake_credits), 0)
        from private.position_receipts as receipt
        where receipt.card_id = v_card.id
      ),
      'positions', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', receipt.id,
            'eventId', event.id,
            'eventKey', event.fixture_event_key,
            'eventLabel', event.away_team || ' at ' || event.home_team,
            'scheduledStartAt', event.scheduled_start_at,
            'marketType', receipt.market_type,
            'outcomeKey', receipt.outcome_key,
            'proposition', receipt.proposition,
            'lineMilli', receipt.line_milli,
            'americanOdds', receipt.american_odds,
            'stakeCredits', receipt.stake_credits,
            'quoteObservedAt', receipt.quote_observed_at,
            'acceptedAt', receipt.accepted_at,
            'receiptHash', receipt.receipt_hash,
            'settlement', case when settlement.id is null then null else jsonb_build_object(
              'outcome', settlement.outcome,
              'returnedCenticredits', settlement.returned_centicredits
            ) end
          ) order by receipt.accepted_at, receipt.id
        )
        from private.position_receipts as receipt
        join private.sports_events as event on event.id = receipt.event_id
        left join lateral (
          select candidate.*
          from private.settlement_versions as candidate
          where candidate.receipt_id = receipt.id
          order by candidate.created_at desc, candidate.id desc
          limit 1
        ) as settlement on true
        where receipt.card_id = v_card.id
      ), '[]'::jsonb)
    ) end,
    'matchup', case when v_matchup.id is null then null else jsonb_build_object(
      'id', v_matchup.id,
      'selfEntryId', v_entry.id,
      'opponentEntryId', v_opponent_entry_id,
      'opponentName', (
        select profile.display_name
        from private.season_entries as entry
        join private.profiles as profile on profile.id = entry.user_id
        where entry.id = v_opponent_entry_id
      ),
      'opponentReadiness', case
        when v_week.state = 'OPEN' then null
        else (
          select card.compliance
          from private.weekly_cards as card
          where card.id = v_opponent_card_id
        )
      end,
      'opponentRevealedPositions', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', receipt.id,
            'eventId', event.id,
            'eventLabel', event.away_team || ' at ' || event.home_team,
            'marketType', receipt.market_type,
            'proposition', receipt.proposition,
            'americanOdds', receipt.american_odds,
            'stakeCredits', receipt.stake_credits,
            'settlement', case when settlement.id is null then null else jsonb_build_object(
              'outcome', settlement.outcome,
              'returnedCenticredits', settlement.returned_centicredits
            ) end
          ) order by event.scheduled_start_at, receipt.accepted_at
        )
        from private.position_receipts as receipt
        join private.sports_events as event on event.id = receipt.event_id
        left join lateral (
          select candidate.*
          from private.settlement_versions as candidate
          where candidate.receipt_id = receipt.id
          order by candidate.created_at desc, candidate.id desc
          limit 1
        ) as settlement on true
        where receipt.card_id = v_opponent_card_id
          and event.state in ('LIVE', 'FINAL', 'VOID', 'CORRECTED')
      ), '[]'::jsonb),
      'futureSealed', case
        when v_week.state = 'OPEN' then true
        else exists (
          select 1
          from private.position_receipts as receipt
          join private.sports_events as event on event.id = receipt.event_id
          where receipt.card_id = v_opponent_card_id
            and event.state not in ('LIVE', 'FINAL', 'VOID', 'CORRECTED')
        )
      end,
      'result', (
        select jsonb_build_object(
          'selfDecision', case
            when v_matchup.side_a_entry_id = v_entry.id then result.side_a_decision
            else result.side_b_decision
          end,
          'opponentDecision', case
            when v_matchup.side_a_entry_id = v_entry.id then result.side_b_decision
            else result.side_a_decision
          end,
          'selfPointsForCenticredits', case
            when v_matchup.side_a_entry_id = v_entry.id then result.side_a_points_for_centicredits
            else result.side_b_points_for_centicredits
          end,
          'opponentPointsForCenticredits', case
            when v_matchup.side_a_entry_id = v_entry.id then result.side_b_points_for_centicredits
            else result.side_a_points_for_centicredits
          end,
          'status', result.status
        )
        from private.matchup_result_versions as result
        where result.matchup_id = v_matchup.id
        order by result.created_at desc, result.id desc
        limit 1
      )
    ) end,
    'standings', coalesce((
      select standings.ordered_rows
      from private.standings_snapshots as standings
      where standings.week_id = v_week.id
      order by standings.created_at desc, standings.id desc
      limit 1
    ), '[]'::jsonb),
    'commissioner', jsonb_build_object(
      'isCommissioner', v_is_commissioner,
      'readyCount', case when v_week.state in ('LOCKED', 'PROVISIONAL', 'FINAL') then (
        select count(*)
        from private.weekly_cards as card
        where card.week_id = v_week.id and card.compliance = 'COMPLIANT'
      ) else null end,
      'cardCount', case when v_week.id is null then 0 else (
        select count(*) from private.weekly_cards as card where card.week_id = v_week.id
      ) end,
      'correctionCount', case when v_week.id is null then 0 else (
        select count(*) from private.corrections as correction where correction.week_id = v_week.id
      ) end
    )
  );
end;
$$;

revoke execute on function api.initialize_stage1_week(uuid, jsonb, text) from public, anon;
revoke execute on function api.accept_stage1_position(text, uuid, integer, text, text) from public, anon;
revoke execute on function api.advance_stage1_clock(uuid, timestamptz, text) from public, anon;
revoke execute on function api.set_stage1_event_live(uuid, timestamptz, text) from public, anon;
revoke execute on function api.lock_stage1_week(uuid, text) from public, anon;
revoke execute on function api.record_stage1_result(uuid, text, integer, integer, text, text, text) from public, anon;
revoke execute on function api.finalize_stage1_week(uuid, text) from public, anon;
revoke execute on function api.get_stage1_state(text) from public, anon;

grant execute on function api.initialize_stage1_week(uuid, jsonb, text) to authenticated;
grant execute on function api.accept_stage1_position(text, uuid, integer, text, text) to authenticated;
grant execute on function api.advance_stage1_clock(uuid, timestamptz, text) to authenticated;
grant execute on function api.set_stage1_event_live(uuid, timestamptz, text) to authenticated;
grant execute on function api.lock_stage1_week(uuid, text) to authenticated;
grant execute on function api.record_stage1_result(uuid, text, integer, integer, text, text, text) to authenticated;
grant execute on function api.finalize_stage1_week(uuid, text) to authenticated;
grant execute on function api.get_stage1_state(text) to authenticated;
