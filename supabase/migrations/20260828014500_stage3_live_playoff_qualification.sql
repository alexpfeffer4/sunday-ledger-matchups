-- Stage 3: freeze the Live playoff field from the final Week 14 standings.
-- Qualification is an immutable competitive artifact; Week 15 publication is
-- a later operation and cannot change this field or its bracket template.

create table private.playoff_publications (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  league_id uuid not null,
  week14_standings_snapshot_id uuid not null unique
    references private.standings_snapshots (id),
  ruleset_snapshot_id uuid not null
    references private.season_ruleset_snapshots (id),
  roster_size integer not null check (roster_size in (4, 6, 8, 10, 12, 14, 16)),
  expected_qualifier_count integer not null check (expected_qualifier_count in (4, 6)),
  standings_json jsonb not null check (jsonb_typeof(standings_json) = 'array'),
  qualifiers jsonb not null check (jsonb_typeof(qualifiers) = 'array'),
  bracket_json jsonb not null check (jsonb_typeof(bracket_json) = 'object'),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references private.profiles (id),
  published_at timestamptz not null default clock_timestamp(),
  foreign key (season_id, league_id)
    references private.seasons (id, league_id) on delete cascade,
  unique (season_id),
  unique (season_id, input_hash),
  unique (id, season_id, league_id),
  check (jsonb_array_length(standings_json) = roster_size),
  check (jsonb_array_length(qualifiers) <= expected_qualifier_count)
);

create index playoff_publications_league_id_idx
  on private.playoff_publications (league_id, published_at desc);

create index playoff_publications_created_by_idx
  on private.playoff_publications (created_by);

create index playoff_publications_ruleset_snapshot_id_idx
  on private.playoff_publications (ruleset_snapshot_id);

alter table private.playoff_publications enable row level security;

create policy playoff_publications_select_member
on private.playoff_publications for select to authenticated
using ((select private.is_league_member(league_id)));

revoke all on table private.playoff_publications from public, anon, authenticated;
grant select on table private.playoff_publications to authenticated;

create trigger playoff_publications_append_only
before update or delete on private.playoff_publications
for each row execute function private.reject_competitive_mutation();

create or replace function private.playoff_entry_by_seed(
  p_qualifiers jsonb,
  p_seed integer
)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select qualifier.value
  from jsonb_array_elements(p_qualifiers) as qualifier(value)
  where (qualifier.value ->> 'qualificationSeed')::integer = p_seed
  limit 1;
$$;

create or replace function private.build_live_playoff_publication(
  p_ordered_rows jsonb,
  p_roster_size integer
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_expected_qualifier_count integer;
  v_qualifiers jsonb;
  v_week15_exhibitions jsonb;
  v_bracket jsonb;
begin
  if p_roster_size not in (4, 6, 8, 10, 12, 14, 16)
    or jsonb_typeof(p_ordered_rows) <> 'array'
    or jsonb_array_length(p_ordered_rows) <> p_roster_size then
    raise exception using errcode = '22023', message = 'The final standings do not match a supported frozen roster.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_ordered_rows) with ordinality as standing(value, ordinality)
    where jsonb_typeof(standing.value) <> 'object'
      or (standing.value ->> 'seed')::integer <> standing.ordinality
      or standing.value ->> 'entryId' is null
      or standing.value ->> 'displayName' is null
      or (standing.value ->> 'attendanceMisses')::integer < 0
  ) or (
    select count(distinct standing.value ->> 'entryId')
    from jsonb_array_elements(p_ordered_rows) as standing(value)
  ) <> p_roster_size then
    raise exception using errcode = '22023', message = 'The final standings are not a complete deterministic ordering.';
  end if;

  v_expected_qualifier_count := case when p_roster_size <= 8 then 4 else 6 end;

  select coalesce(jsonb_agg(
    eligible.value || jsonb_build_object(
      'qualificationSeed', eligible.qualification_seed,
      'regularSeasonSeed', (eligible.value ->> 'seed')::integer
    ) order by eligible.qualification_seed
  ), '[]'::jsonb)
  into v_qualifiers
  from (
    select
      standing.value,
      row_number() over (order by (standing.value ->> 'seed')::integer)::integer
        as qualification_seed
    from jsonb_array_elements(p_ordered_rows) as standing(value)
    where (standing.value ->> 'attendanceMisses')::integer < 3
    order by (standing.value ->> 'seed')::integer
    limit v_expected_qualifier_count
  ) as eligible;

  if p_roster_size <= 8 then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'game', ((side_a.ordinality + 1) / 2)::integer,
        'scope', 'EXHIBITION',
        'label', 'Week 15 exhibition',
        'sideA', jsonb_build_object(
          'entryId', side_a.value ->> 'entryId',
          'displayName', side_a.value ->> 'displayName',
          'regularSeasonSeed', (side_a.value ->> 'seed')::integer
        ),
        'sideB', jsonb_build_object(
          'entryId', side_b.value ->> 'entryId',
          'displayName', side_b.value ->> 'displayName',
          'regularSeasonSeed', (side_b.value ->> 'seed')::integer
        )
      ) order by side_a.ordinality
    ), '[]'::jsonb)
    into v_week15_exhibitions
    from jsonb_array_elements(p_ordered_rows) with ordinality as side_a(value, ordinality)
    join jsonb_array_elements(p_ordered_rows) with ordinality as side_b(value, ordinality)
      on side_b.ordinality = side_a.ordinality + 1
    where side_a.ordinality % 2 = 1;

    v_bracket := jsonb_build_object(
      'format', 'SMALL_FOUR',
      'tieRule', 'HIGHER_QUALIFICATION_SEED_ADVANCES',
      'stages', jsonb_build_array(
        jsonb_build_object(
          'week', 15,
          'label', 'Exhibitions',
          'scope', 'EXHIBITION',
          'games', v_week15_exhibitions
        ),
        jsonb_build_object(
          'week', 16,
          'label', 'Semifinals',
          'scope', 'PLAYOFF',
          'games', jsonb_build_array(
            jsonb_build_object(
              'game', 1,
              'label', 'Semifinal · 1 vs 4',
              'sideA', private.playoff_entry_by_seed(v_qualifiers, 1),
              'sideB', private.playoff_entry_by_seed(v_qualifiers, 4)
            ),
            jsonb_build_object(
              'game', 2,
              'label', 'Semifinal · 2 vs 3',
              'sideA', private.playoff_entry_by_seed(v_qualifiers, 2),
              'sideB', private.playoff_entry_by_seed(v_qualifiers, 3)
            )
          )
        ),
        jsonb_build_object(
          'week', 17,
          'label', 'Finals',
          'scope', 'PLAYOFF',
          'games', jsonb_build_array(
            jsonb_build_object('game', 1, 'label', 'Championship', 'sideA', null, 'sideB', null),
            jsonb_build_object('game', 2, 'label', 'Third place', 'sideA', null, 'sideB', null)
          )
        )
      )
    );
  else
    v_bracket := jsonb_build_object(
      'format', 'LARGE_SIX',
      'tieRule', 'HIGHER_QUALIFICATION_SEED_ADVANCES',
      'stages', jsonb_build_array(
        jsonb_build_object(
          'week', 15,
          'label', 'Opening round',
          'scope', 'PLAYOFF',
          'byes', jsonb_build_array(
            private.playoff_entry_by_seed(v_qualifiers, 1),
            private.playoff_entry_by_seed(v_qualifiers, 2)
          ),
          'games', jsonb_build_array(
            jsonb_build_object(
              'game', 1,
              'label', 'Opening round · 3 vs 6',
              'sideA', private.playoff_entry_by_seed(v_qualifiers, 3),
              'sideB', private.playoff_entry_by_seed(v_qualifiers, 6)
            ),
            jsonb_build_object(
              'game', 2,
              'label', 'Opening round · 4 vs 5',
              'sideA', private.playoff_entry_by_seed(v_qualifiers, 4),
              'sideB', private.playoff_entry_by_seed(v_qualifiers, 5)
            )
          )
        ),
        jsonb_build_object(
          'week', 16,
          'label', 'Reseeded semifinals',
          'scope', 'PLAYOFF',
          'reseedRule', 'NO_1_FACES_LOWEST_REMAINING_SEED',
          'games', jsonb_build_array(
            jsonb_build_object(
              'game', 1,
              'label', 'Semifinal · No. 1 seed',
              'sideA', private.playoff_entry_by_seed(v_qualifiers, 1),
              'sideB', null
            ),
            jsonb_build_object(
              'game', 2,
              'label', 'Semifinal · No. 2 seed',
              'sideA', private.playoff_entry_by_seed(v_qualifiers, 2),
              'sideB', null
            )
          )
        ),
        jsonb_build_object(
          'week', 17,
          'label', 'Finals',
          'scope', 'PLAYOFF',
          'games', jsonb_build_array(
            jsonb_build_object('game', 1, 'label', 'Championship', 'sideA', null, 'sideB', null),
            jsonb_build_object('game', 2, 'label', 'Third place', 'sideA', null, 'sideB', null)
          )
        )
      )
    );
  end if;

  return jsonb_build_object(
    'expectedQualifierCount', v_expected_qualifier_count,
    'actualQualifierCount', jsonb_array_length(v_qualifiers),
    'qualifiers', v_qualifiers,
    'bracket', v_bracket
  );
end;
$$;

revoke execute on function private.playoff_entry_by_seed(jsonb, integer)
from public, anon, authenticated;
revoke execute on function private.build_live_playoff_publication(jsonb, integer)
from public, anon, authenticated;

create or replace function api.publish_live_playoff_qualification(
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
  v_standings private.standings_snapshots%rowtype;
  v_publication private.playoff_publications%rowtype;
  v_command private.command_receipts%rowtype;
  v_roster_size integer;
  v_generated jsonb;
  v_input_hash text;
  v_request_hash text;
  v_response jsonb;
begin
  if v_user_id is null or not private.is_league_commissioner(p_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;
  if char_length(p_idempotency_key) not between 8 and 120 then
    raise exception using errcode = '22023', message = 'Idempotency key is invalid.';
  end if;

  select season.* into strict v_season
  from private.seasons as season
  where season.league_id = p_league_id
    and season.mode = 'LIVE'
    and season.lifecycle in ('REGULAR', 'PLAYOFFS')
  order by season.created_at desc
  limit 1
  for update;

  select week.* into strict v_week
  from private.season_weeks as week
  where week.season_id = v_season.id
    and week.nfl_week = 14
    and week.scope = 'REGULAR'
  for share;

  if v_week.state <> 'FINAL' then
    raise exception using errcode = '55000', message = 'Week 14 must be final before playoff qualification can publish.';
  end if;

  select standings.* into strict v_standings
  from private.standings_snapshots as standings
  where standings.season_id = v_season.id
    and standings.week_id = v_week.id
    and standings.through_week = 14
    and standings.status = 'FINAL'
  order by standings.created_at desc, standings.id desc
  limit 1
  for share;

  select count(*) into v_roster_size
  from private.season_entries as entry
  where entry.season_id = v_season.id;

  v_generated := private.build_live_playoff_publication(
    v_standings.ordered_rows,
    v_roster_size
  );
  v_input_hash := encode(
    extensions.digest(
      v_season.id::text || ':' || v_standings.id::text || ':'
      || v_standings.input_hash || ':' || v_season.ruleset_snapshot_id::text
      || ':' || v_generated::text,
      'sha256'
    ),
    'hex'
  );
  v_request_hash := encode(
    extensions.digest(p_league_id::text || ':' || v_input_hash, 'sha256'),
    'hex'
  );

  select command.* into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'PUBLISH_LIVE_PLAYOFF_QUALIFICATION'
    and command.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json;
  end if;

  insert into private.playoff_publications (
    season_id,
    league_id,
    week14_standings_snapshot_id,
    ruleset_snapshot_id,
    roster_size,
    expected_qualifier_count,
    standings_json,
    qualifiers,
    bracket_json,
    input_hash,
    created_by
  ) values (
    v_season.id,
    p_league_id,
    v_standings.id,
    v_season.ruleset_snapshot_id,
    v_roster_size,
    (v_generated ->> 'expectedQualifierCount')::integer,
    v_standings.ordered_rows,
    v_generated -> 'qualifiers',
    v_generated -> 'bracket',
    v_input_hash,
    v_user_id
  )
  on conflict (season_id) do nothing
  returning * into v_publication;

  if v_publication.id is null then
    select publication.* into strict v_publication
    from private.playoff_publications as publication
    where publication.season_id = v_season.id;
    if v_publication.input_hash <> v_input_hash then
      raise exception using errcode = '55000', message = 'The playoff field is already frozen from a different standings input.';
    end if;
  end if;

  update private.seasons
  set lifecycle = 'PLAYOFFS'
  where id = v_season.id and lifecycle = 'REGULAR';

  v_response := jsonb_build_object(
    'publicationId', v_publication.id,
    'seasonId', v_publication.season_id,
    'leagueId', v_publication.league_id,
    'lifecycle', 'PLAYOFFS',
    'rosterSize', v_publication.roster_size,
    'expectedQualifierCount', v_publication.expected_qualifier_count,
    'actualQualifierCount', jsonb_array_length(v_publication.qualifiers),
    'format', v_publication.bracket_json ->> 'format',
    'publishedAt', v_publication.published_at,
    'inputHash', v_publication.input_hash
  );

  insert into private.command_receipts (
    league_id, actor_user_id, command_name, idempotency_key, request_hash, response_json
  ) values (
    p_league_id, v_user_id, 'PUBLISH_LIVE_PLAYOFF_QUALIFICATION',
    p_idempotency_key, v_request_hash, v_response
  );

  return v_response;
end;
$$;

create or replace function api.get_live_playoff_state(p_league_slug text)
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
  v_publication private.playoff_publications%rowtype;
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

  select season.* into strict v_season
  from private.seasons as season
  where season.league_id = v_league.id and season.mode = 'LIVE'
  order by season.created_at desc
  limit 1;

  select publication.* into v_publication
  from private.playoff_publications as publication
  where publication.season_id = v_season.id;

  if v_publication.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'league', jsonb_build_object(
      'id', v_league.id,
      'name', v_league.name,
      'slug', v_league.slug,
      'nflYear', v_season.nfl_year,
      'lifecycle', v_season.lifecycle
    ),
    'publication', jsonb_build_object(
      'id', v_publication.id,
      'publishedAt', v_publication.published_at,
      'inputHash', v_publication.input_hash,
      'rosterSize', v_publication.roster_size,
      'expectedQualifierCount', v_publication.expected_qualifier_count,
      'actualQualifierCount', jsonb_array_length(v_publication.qualifiers),
      'standings', v_publication.standings_json,
      'qualifiers', v_publication.qualifiers,
      'bracket', v_publication.bracket_json,
      'tieRule', 'HIGHER_QUALIFICATION_SEED_ADVANCES',
      'attendanceMissLimit', 3
    ),
    'viewer', jsonb_build_object(
      'userId', v_user_id,
      'isCommissioner', private.is_league_commissioner(v_league.id)
    )
  );
end;
$$;

revoke all on function api.publish_live_playoff_qualification(uuid, text)
from public, anon;
revoke all on function api.get_live_playoff_state(text)
from public, anon;

grant execute on function api.publish_live_playoff_qualification(uuid, text)
to authenticated;
grant execute on function api.get_live_playoff_state(text)
to authenticated;
