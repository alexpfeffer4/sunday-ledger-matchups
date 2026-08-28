create index live_quote_heads_event_week_league_fk_idx
  on private.live_quote_heads (event_id, week_id, league_id);
