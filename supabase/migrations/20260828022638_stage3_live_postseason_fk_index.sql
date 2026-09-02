-- Cover the composite season-week foreign key used by postseason publication
-- deletes and integrity checks. The unique week_id index alone does not cover
-- all referenced columns for the database advisor.

create index playoff_round_publications_week_fk_idx
  on private.playoff_round_publications (week_id, season_id, league_id);
