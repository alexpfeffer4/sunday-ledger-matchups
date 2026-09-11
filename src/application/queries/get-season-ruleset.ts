import "server-only";

import { cache } from "react";
import { isSupabaseConfigured } from "@/adapters/supabase/config";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import { hashRuleset } from "@/rulesets/canonicalize";
import {
  seasonRulesetSnapshotSchema,
  type SeasonRulesetSnapshotDto,
} from "@/application/queries/season-ruleset-dtos";

export const getSeasonRuleset = cache(
  async (leagueSlug: string): Promise<SeasonRulesetSnapshotDto | null> => {
    if (!isSupabaseConfigured()) return null;

    const supabase = await createSupabaseServerClient();
    const claims = await supabase.auth.getClaims();
    if (!claims.data?.claims?.sub) return null;

    const result = await supabase.schema("api").rpc("get_season_ruleset", {
      p_league_slug: leagueSlug,
    });
    if (result.error) {
      if (["42501", "P0002", "PGRST202"].includes(result.error.code ?? "")) {
        return null;
      }
      throw new Error("The season rules could not be loaded.");
    }
    if (result.data === null) return null;
    const snapshot = seasonRulesetSnapshotSchema.parse(result.data);
    // Hash the original JSON: parsing must not hide an altered or extra field.
    const source = result.data as {
      canonicalJson: unknown;
      priorRules?: { canonicalJson: unknown }[];
    };
    const hashes = await Promise.all(
      [source, ...(source.priorRules ?? [])].map((entry) =>
        hashRuleset(entry.canonicalJson),
      ),
    );
    if (
      [snapshot, ...(snapshot.priorRules ?? [])].some(
        (entry, index) => entry.sha256Hash !== hashes[index],
      )
    ) {
      throw new Error("The season rules failed their integrity check.");
    }
    return snapshot;
  },
);
