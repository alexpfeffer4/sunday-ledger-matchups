-- Exact covering indexes for every Stage 1 composite foreign key. Prefix-only
-- query indexes do not cover referential actions across the full key.

create index event_result_versions_event_week_league_fk_idx
  on private.event_result_versions (event_id, week_id, league_id);

create index market_snapshots_event_week_league_fk_idx
  on private.market_snapshots (event_id, week_id, league_id);

create index matchups_publication_season_league_fk_idx
  on private.matchups (schedule_publication_id, season_id, league_id);

create index matchups_side_a_season_league_fk_idx
  on private.matchups (side_a_entry_id, season_id, league_id);

create index matchups_side_b_season_league_fk_idx
  on private.matchups (side_b_entry_id, season_id, league_id);

create index matchups_week_season_league_fk_idx
  on private.matchups (week_id, season_id, league_id);

create index position_receipts_card_week_league_fk_idx
  on private.position_receipts (card_id, week_id, league_id);

create index schedule_publications_season_league_fk_idx
  on private.schedule_publications (season_id, league_id);

create index season_weeks_season_league_fk_idx
  on private.season_weeks (season_id, league_id);

create index slate_items_slate_week_league_fk_idx
  on private.slate_items (slate_id, week_id, league_id);

create index slates_week_season_league_fk_idx
  on private.slates (week_id, season_id, league_id);

create index sports_events_week_season_league_fk_idx
  on private.sports_events (week_id, season_id, league_id);

create index weekly_cards_league_owner_fk_idx
  on private.weekly_cards (league_id, owner_user_id);

create index weekly_cards_week_season_league_fk_idx
  on private.weekly_cards (week_id, season_id, league_id);
