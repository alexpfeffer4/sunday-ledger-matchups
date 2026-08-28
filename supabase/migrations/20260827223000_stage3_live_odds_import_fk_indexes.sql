drop index private.live_odds_imports_imported_by_idx;

create index live_odds_imports_imported_by_idx
  on private.live_odds_imports (league_id, imported_by);

create index live_odds_imports_season_league_idx
  on private.live_odds_imports (season_id, league_id);

