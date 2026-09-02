-- Cover the composite season ownership foreign key used by final Live archives.

create index live_season_archives_season_league_fk_idx
  on private.live_season_archives (season_id, league_id);
