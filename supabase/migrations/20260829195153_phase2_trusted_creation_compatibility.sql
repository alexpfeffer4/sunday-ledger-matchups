-- Temporary Phase 2 compatibility for the deployed pre-Phase-2 member UI.
--
-- PostgREST does not support overloaded functions reliably, so expose one
-- create_league signature whose legacy Ruleset parameters are optional and
-- deliberately ignored. The trusted implementation remains the only code
-- that constructs the persisted, mode-specific Ruleset snapshot.

revoke execute on function api.create_league(text, text, text, integer)
from public, anon, authenticated;

alter function api.create_league(text, text, text, integer)
set schema private;

alter function private.create_league(text, text, text, integer)
rename to create_league_from_authoritative_ruleset;

revoke execute on function private.create_league_from_authoritative_ruleset(
  text, text, text, integer
) from public, anon, authenticated;

create function api.create_league(
  p_name text,
  p_slug text,
  p_mode text,
  p_nfl_year integer,
  p_ruleset_id text default null,
  p_ruleset_version text default null,
  p_product_bible_id text default null,
  p_product_bible_version text default null,
  p_canonical_ruleset jsonb default null,
  p_ruleset_sha256 text default null
)
returns table (league_id uuid, season_id uuid, league_slug text)
language sql
security definer
set search_path = ''
as $$
  select trusted.league_id, trusted.season_id, trusted.league_slug
  from private.create_league_from_authoritative_ruleset(
    p_name,
    p_slug,
    p_mode,
    p_nfl_year
  ) as trusted;
$$;

comment on function api.create_league(
  text, text, text, integer, text, text, text, text, jsonb, text
) is
  'Phase 2 trusted creation boundary. Optional legacy Ruleset parameters are ignored; the database selects the authoritative mode-specific identity.';

revoke execute on function api.create_league(
  text, text, text, integer, text, text, text, text, jsonb, text
) from public, anon;
grant execute on function api.create_league(
  text, text, text, integer, text, text, text, text, jsonb, text
) to authenticated;

notify pgrst, 'reload schema';
