-- Cover the composite season/league foreign key used by playoff publications.

create index playoff_publications_season_league_fk_idx
  on private.playoff_publications (season_id, league_id);
