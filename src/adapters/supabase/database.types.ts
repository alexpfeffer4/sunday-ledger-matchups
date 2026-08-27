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
