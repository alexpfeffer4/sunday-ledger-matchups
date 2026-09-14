-- Operator-only metadata. No member identities, picks, stakes or results are read.
-- Run only against the intended verified database. Keep output out of public logs.
begin transaction isolation level repeatable read read only;
set local statement_timeout='10s';
select clock_timestamp() as observed_at, current_database() as database_name;
select mode, ruleset_version, product_bible_version, sha256_hash
from private.authoritative_season_rulesets order by mode;
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
select rows as adoption_inventory,
  encode(extensions.digest(rows::text,'sha256'),'hex') as inventory_sha256
from inventory;
rollback;
