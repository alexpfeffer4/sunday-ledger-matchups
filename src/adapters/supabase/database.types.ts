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
          archived_at: string | null;
          can_delete: boolean | null;
          current_week: number | null;
          id: string | null;
          joined_at: string | null;
          lifecycle: string | null;
          member_count: number | null;
          mode: string | null;
          name: string | null;
          nfl_year: number | null;
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
      claim_background_quote_run: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      claim_background_quote_request: {
        Args: { p_run_id: string };
        Returns: Json;
      };
      complete_background_quote_request: {
        Args: {
          p_failure?: string;
          p_import: Json;
          p_request_id: string;
          p_retry_after_seconds?: number;
          p_run_id: string;
          p_usage?: Json;
        };
        Returns: Json;
      };
      next_background_quote_application: {
        Args: { p_run_id: string };
        Returns: Json;
      };
      apply_background_quote_event: {
        Args: { p_event_id: string; p_request_ids: string[]; p_run_id: string };
        Returns: Json;
      };
      finish_background_quote_run: {
        Args: { p_run_id: string };
        Returns: undefined;
      };
      get_stored_quote_updates: {
        Args: { p_league_slug: string; p_week_id: string };
        Returns: Json;
      };
      get_season_automation: { Args: { p_league_slug: string }; Returns: Json };
      configure_season_automation: {
        Args: {
          p_command: string;
          p_effective_week?: number;
          p_league_slug: string;
          p_policy_hash?: string;
          p_slate_preset?: string;
        };
        Returns: Json;
      };
      claim_season_automation: {
        Args: never;
        Returns: Json;
      };
      claim_season_automation_odds: {
        Args: { p_run: string };
        Returns: string;
      };
      complete_season_automation: {
        Args: {
          p_failure?: string;
          p_import?: Json;
          p_run: string;
          p_schedule?: Json;
        };
        Returns: Json;
      };

      apply_live_quote_plan: {
        Args: { p_plan_id: string };
        Returns: Json;
      };
      bind_card_submission_intent: {
        Args: { p_intent_id: string; p_league_slug: string; p_positions: Json };
        Returns: Json;
      };
      claim_nflverse_reconciliation: {
        Args: never;
        Returns: Json;
      };
      claim_odds_account_probe: {
        Args: never;
        Returns: Json;
      };
      claim_odds_entitlement_probe: {
        Args: never;
        Returns: Json;
      };
      claim_player_catalog_job: {
        Args: { p_week_id?: string };
        Returns: Json;
      };
      claim_player_catalog_quote: {
        Args: { p_week_id: string };
        Returns: Json;
      };
      claim_player_catalog_source: {
        Args: { p_cache_key: string };
        Returns: Json;
      };
      claim_player_result_jobs: {
        Args: never;
        Returns: Json;
      };
      claim_player_statistics_status: {
        Args: never;
        Returns: Json;
      };
      claim_player_source_smoke: {
        Args: { p_operation_key: string };
        Returns: Json;
      };
      claim_shared_quote_request: {
        Args: { p_plan_id: string; p_request_id: string };
        Returns: Json;
      };
      complete_nflverse_reconciliation: {
        Args: { p_lease_id: string; p_observations?: Json };
        Returns: Json;
      };
      complete_odds_account_probe: {
        Args: { p_probe_id: string; p_usage?: Json };
        Returns: Json;
      };
      complete_odds_entitlement_probe: {
        Args: { p_probe_id: string; p_usage?: Json };
        Returns: Json;
      };
      complete_player_catalog_job: {
        Args: {
          p_error?: string;
          p_lease_id: string;
          p_missing_sources?: number;
          p_status: string;
        };
        Returns: undefined;
      };
      complete_player_catalog_source: {
        Args: { p_cache_key: string; p_lease_id: string; p_payload?: Json };
        Returns: undefined;
      };
      complete_player_result_request: {
        Args: {
          p_observations?: Json;
          p_rate_limit?: number;
          p_remaining?: number;
          p_request_id: string;
          p_retry_after_seconds?: number;
        };
        Returns: Json;
      };
      complete_player_statistics_status: {
        Args: {
          p_active: boolean;
          p_daily_limit: number;
          p_lease_id: string;
          p_observed_at: string;
          p_used: number;
        };
        Returns: undefined;
      };
      complete_player_source_smoke: {
        Args: {
          p_failure_code?: string;
          p_failure_stage?: string;
          p_report?: Json;
          p_run_id: string;
          p_sample?: Json;
          p_status: string;
        };
        Returns: Json;
      };
      complete_shared_quote_request: {
        Args: { p_import: Json; p_request_id: string; p_usage?: Json };
        Returns: Json;
      };
      configure_player_prop_odds_budget: {
        Args: { p_verified_entitlement: Json };
        Returns: Json;
      };
      confirm_progressive_player_prop_menu: {
        Args: {
          p_choices: Json;
          p_empty_slot_publication: string;
          p_league_slug: string;
        };
        Returns: Json;
      };
      confirm_player_prop_menu: {
        Args: { p_choices: Json; p_league_slug: string };
        Returns: Json;
      };
      enqueue_player_catalog: {
        Args: { p_league_slug: string };
        Returns: Json;
      };
      get_player_catalog_quotes: {
        Args: { p_week_id: string };
        Returns: Json;
      };
      get_player_prop_menu: {
        Args: { p_league_slug: string };
        Returns: Json;
      };
      import_player_catalog: {
        Args: { p_records: Json };
        Returns: Json;
      };
      import_player_result_observations: {
        Args: { p_observations: Json };
        Returns: Json;
      };
      open_reviewed_player_prop_week: {
        Args: { p_idempotency_key: string; p_league_slug: string };
        Returns: Json;
      };
      plan_live_quote_refresh: {
        Args: { p_league_id: string; p_positions?: Json };
        Returns: Json;
      };
      plan_player_menu_quotes: {
        Args: { p_event_id?: string; p_league_id: string };
        Returns: Json;
      };
      prepare_player_prop_menu: {
        Args: { p_league_slug: string };
        Returns: Json;
      };
      record_player_catalog_nominations: {
        Args: { p_lease_id: string; p_proposals: Json };
        Returns: Json;
      };
      register_player_result_event: {
        Args: { p_mapping: Json };
        Returns: undefined;
      };
      reserve_player_metadata_request: {
        Args: never;
        Returns: string;
      };
      reserve_player_source_smoke_request: {
        Args: { p_run_id: string };
        Returns: string;
      };
      resolve_finalized_week17_player_candidate: {
        Args: {
          p_candidate_id: string;
          p_participation_observation_id: string;
          p_reason: string;
          p_statistic_observation_id: string;
        };
        Returns: Json;
      };
      resolve_verified_player_result_exception: {
        Args: {
          p_actor_user_id: string;
          p_event_id: string;
          p_evidence_hash: string;
          p_idempotency_key: string;
          p_offensive_snaps: number;
          p_participation_source_url: string;
          p_reason: string;
          p_statistic: string;
          p_statistic_source_url: string;
          p_subject_id: string;
          p_value: number;
        };
        Returns: Json;
      };
      resolve_player_result_candidate: {
        Args: {
          p_candidate_id: string;
          p_participation_observation_id: string;
          p_reason: string;
          p_statistic_observation_id: string;
        };
        Returns: Json;
      };
      revalidate_card_submission_intent: {
        Args: { p_intent_id: string; p_review_id: string };
        Returns: Json;
      };

      get_league_matchup_cards: {
        Args: { p_league_slug: string; p_week_id: string };
        Returns: Json;
      };
      claim_provider_odds_request: {
        Args: { p_league_id: string };
        Returns: string;
      };
      claim_scheduled_score_refresh: {
        Args: never;
        Returns: Json;
      };
      claim_live_score_refresh: {
        Args: { p_league_id: string };
        Returns: Json;
      };
      complete_provider_request: {
        Args: {
          p_import: Json;
          p_request_id: string;
          p_requests_remaining?: number;
        };
        Returns: Json;
      };

      claim_live_quote_refresh: {
        Args: { p_league_id: string };
        Returns: Json;
      };
      complete_live_quote_refresh: {
        Args: {
          p_import: Json;
          p_lease_id: string;
          p_requests_remaining?: number;
        };
        Returns: Json;
      };
      review_live_card_quotes: {
        Args: { p_league_slug: string; p_positions: Json };
        Returns: Json;
      };

      advance_owner_rehearsal: {
        Args: {
          p_expected_checkpoint: string;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
      fill_owner_rehearsal_bots: {
        Args: { p_idempotency_key: string };
        Returns: Json;
      };
      get_owner_rehearsal: {
        Args: never;
        Returns: Json;
      };
      has_owner_rehearsal_entitlement: {
        Args: never;
        Returns: boolean;
      };
      prepare_owner_rehearsal_quote_review: {
        Args: { p_idempotency_key: string; p_league_slug: string };
        Returns: Json;
      };
      prepare_simulation_card_quotes: {
        Args: { p_league_slug: string };
        Returns: Json;
      };
      reset_owner_rehearsal: {
        Args: { p_confirmation_name: string; p_idempotency_key: string };
        Returns: Json;
      };
      start_owner_rehearsal: {
        Args: { p_idempotency_key: string };
        Returns: Json;
      };
      use_owner_rehearsal_sample_card: {
        Args: { p_idempotency_key: string };
        Returns: Json;
      };
      create_league: {
        Args: {
          p_canonical_ruleset?: Json;
          p_mode: string;
          p_name: string;
          p_nfl_year: number;
          p_product_bible_id?: string;
          p_product_bible_version?: string;
          p_ruleset_id?: string;
          p_ruleset_sha256?: string;
          p_ruleset_version?: string;
          p_slug: string;
        };
        Returns: {
          league_id: string;
          league_slug: string;
          season_id: string;
        }[];
      };
      delete_empty_draft_league: {
        Args: { p_confirmation_name: string; p_league_slug: string };
        Returns: boolean;
      };
      create_league_invite: {
        Args: {
          p_expires_at: string;
          p_league_id: string;
          p_max_uses?: number;
        };
        Returns: string;
      };
      create_league_invite_retry_safe: {
        Args: {
          p_expires_in_days: number;
          p_idempotency_key: string;
          p_league_id: string;
          p_max_uses: number;
        };
        Returns: Json;
      };
      get_my_command_receipt: {
        Args: { p_command_name: string; p_idempotency_key: string };
        Returns: Json | null;
      };
      get_league_invite_preview: {
        Args: { p_token: string };
        Returns: {
          commissioner_name: string;
          expires_at: string;
          league_name: string;
          member_count: number;
          mode: string;
          nfl_year: number;
        }[];
      };
      list_league_invites: {
        Args: { p_league_slug: string };
        Returns: {
          active: boolean;
          created_at: string;
          expires_at: string;
          id: string;
          max_uses: number;
          revoked_at: string | null;
          status: string;
          uses: number;
        }[];
      };
      revoke_league_invite: {
        Args: { p_invite_id: string; p_league_id: string };
        Returns: boolean;
      };
      ensure_profile: {
        Args: { p_display_name?: string };
        Returns: string;
      };
      update_profile_display_name: {
        Args: { p_display_name: string };
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
      leave_league: {
        Args: { p_league_slug: string };
        Returns: boolean;
      };
      remove_league_member: {
        Args: { p_league_slug: string; p_user_id: string };
        Returns: boolean;
      };
      rename_league: {
        Args: { p_league_slug: string; p_name: string };
        Returns: string;
      };
      set_league_archived: {
        Args: { p_archived: boolean; p_league_slug: string };
        Returns: string | null;
      };
      transfer_league_commissioner: {
        Args: { p_league_slug: string; p_user_id: string };
        Returns: boolean;
      };
      get_live_odds_import: {
        Args: { p_league_slug: string };
        Returns: Json | null;
      };
      get_live_playoff_state: {
        Args: { p_league_slug: string };
        Returns: Json | null;
      };
      get_playoff_state: {
        Args: { p_league_slug: string };
        Returns: Json | null;
      };
      get_season_archive: {
        Args: { p_league_slug: string };
        Returns: Json | null;
      };
      get_season_ruleset: {
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
      get_live_week_operations: {
        Args: { p_league_slug: string };
        Returns: Json | null;
      };
      get_commissioner_card_status: {
        Args: { p_league_slug: string };
        Returns: Json;
      };
      get_week17_correction_operations: {
        Args: { p_league_slug: string };
        Returns: Json | null;
      };
      import_live_scores: {
        Args: {
          p_idempotency_key: string;
          p_import: Json;
          p_league_id: string;
        };
        Returns: Json;
      };
      correct_live_event_result: {
        Args: {
          p_away_score: number | null;
          p_event_id: string;
          p_home_score: number | null;
          p_idempotency_key: string;
          p_reason: string;
          p_status: string;
        };
        Returns: Json;
      };
      correct_finalized_week17_result: {
        Args: {
          p_away_score: number | null;
          p_event_id: string;
          p_home_score: number | null;
          p_idempotency_key: string;
          p_reason: string;
          p_status: string;
        };
        Returns: Json;
      };
      void_live_event_after_postponement_window: {
        Args: {
          p_event_id: string;
          p_idempotency_key: string;
          p_reason: string;
        };
        Returns: Json;
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
      advance_simulated_time: {
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
      get_weekly_close_state: {
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
      publish_simulation_fixture_week: {
        Args: {
          p_idempotency_key: string;
          p_league_id: string;
          p_pack_id: string;
          p_week: number;
        };
        Returns: Json;
      };
      apply_simulation_fixture_results: {
        Args: {
          p_idempotency_key: string;
          p_league_id: string;
          p_pack_id: string;
          p_step: string;
          p_week: number;
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
      publish_next_live_week_slate: {
        Args: {
          p_external_event_ids: string[];
          p_idempotency_key: string;
          p_import_id: string;
          p_league_id: string;
        };
        Returns: Json;
      };
      publish_next_live_postseason_week: {
        Args: {
          p_external_event_ids: string[];
          p_idempotency_key: string;
          p_import_id: string;
          p_league_id: string;
        };
        Returns: Json;
      };
      publish_postseason_week: {
        Args: {
          p_external_event_ids: string[];
          p_idempotency_key: string;
          p_import_id: string;
          p_league_id: string;
        };
        Returns: Json;
      };
      publish_live_playoff_qualification: {
        Args: {
          p_idempotency_key: string;
          p_league_id: string;
        };
        Returns: Json;
      };
      publish_playoff_qualification: {
        Args: {
          p_idempotency_key: string;
          p_league_id: string;
        };
        Returns: Json;
      };
      publish_live_season_archive: {
        Args: {
          p_idempotency_key: string;
          p_league_id: string;
        };
        Returns: Json;
      };
      finalize_champion_bracket: {
        Args: {
          p_idempotency_key: string;
          p_league_id: string;
        };
        Returns: Json;
      };
      publish_week18_exhibition: {
        Args: {
          p_external_event_ids: string[];
          p_idempotency_key: string;
          p_import_id: string;
          p_league_id: string;
        };
        Returns: Json;
      };
      finalize_season_archive: {
        Args: {
          p_idempotency_key: string;
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
