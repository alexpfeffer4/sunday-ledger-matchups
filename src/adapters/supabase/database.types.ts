export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.17";
  };
  api: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      league_members: {
        Row: {
          avatar_url: string | null;
          display_name: string | null;
          joined_at: string | null;
          league_id: string | null;
          role: string | null;
          user_id: string | null;
        };
        Relationships: [];
      };
      my_leagues: {
        Row: {
          id: string | null;
          joined_at: string | null;
          name: string | null;
          role: string | null;
          slug: string | null;
        };
        Relationships: [];
      };
      my_profile: {
        Row: {
          avatar_url: string | null;
          display_name: string | null;
          id: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      create_league: {
        Args: {
          p_canonical_ruleset: Json;
          p_mode: string;
          p_name: string;
          p_nfl_year: number;
          p_product_bible_id: string;
          p_product_bible_version: string;
          p_ruleset_id: string;
          p_ruleset_sha256: string;
          p_ruleset_version: string;
          p_slug: string;
        };
        Returns: {
          league_id: string;
          league_slug: string;
          season_id: string;
        }[];
      };
      create_league_invite: {
        Args: {
          p_expires_at: string;
          p_league_id: string;
          p_max_uses?: number;
        };
        Returns: string;
      };
      ensure_profile: {
        Args: { p_display_name?: string };
        Returns: string;
      };
      join_league: {
        Args: { p_token: string };
        Returns: {
          joined: boolean;
          league_id: string;
          league_slug: string;
        }[];
      };
      get_live_odds_import: {
        Args: { p_league_slug: string };
        Returns: Json | null;
      };
      get_live_quote_heads: {
        Args: { p_league_slug: string };
        Returns: Json;
      };
      get_live_regular_season_schedule: {
        Args: { p_league_slug: string };
        Returns: Json | null;
      };
      lock_live_roster_and_open_week: {
        Args: {
          p_idempotency_key: string;
          p_league_id: string;
        };
        Returns: Json;
      };
      refresh_live_week_quotes: {
        Args: {
          p_idempotency_key: string;
          p_import_id: string;
          p_league_id: string;
        };
        Returns: Json;
      };
      store_live_odds_import: {
        Args: {
          p_idempotency_key: string;
          p_import: Json;
          p_league_id: string;
        };
        Returns: Json;
      };
      accept_stage1_position: {
        Args: {
          p_expected_payload_hash: string;
          p_idempotency_key: string;
          p_league_slug: string;
          p_market_snapshot_id: string;
          p_stake_credits: number;
        };
        Returns: Json;
      };
      accept_stage1_card: {
        Args: {
          p_idempotency_key: string;
          p_league_slug: string;
          p_positions: Json;
        };
        Returns: Json;
      };
      advance_stage1_clock: {
        Args: {
          p_idempotency_key: string;
          p_league_id: string;
          p_target: string;
        };
        Returns: Json;
      };
      finalize_stage1_week: {
        Args: { p_idempotency_key: string; p_league_id: string };
        Returns: Json;
      };
      get_stage1_state: {
        Args: { p_league_slug: string };
        Returns: Json;
      };
      get_simulation_season_archive: {
        Args: { p_league_slug: string };
        Returns: Json | null;
      };
      initialize_stage1_week: {
        Args: {
          p_fixture: Json;
          p_idempotency_key: string;
          p_league_id: string;
        };
        Returns: Json;
      };
      lock_stage1_week: {
        Args: { p_idempotency_key: string; p_league_id: string };
        Returns: Json;
      };
      record_stage1_result: {
        Args: {
          p_away_score: number | null;
          p_event_id: string;
          p_home_score: number | null;
          p_idempotency_key: string;
          p_reason: string;
          p_source: string;
          p_status: string;
        };
        Returns: Json;
      };
      set_stage1_event_live: {
        Args: {
          p_actual_started_at: string;
          p_event_id: string;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
      publish_simulation_season_archive: {
        Args: {
          p_archive_json: Json;
          p_idempotency_key: string;
          p_league_id: string;
        };
        Returns: Json;
      };
      publish_live_week_slate: {
        Args: {
          p_external_event_ids: string[];
          p_idempotency_key: string;
          p_import_id: string;
          p_league_id: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export const Constants = {
  api: { Enums: {} },
  public: { Enums: {} },
} as const;
