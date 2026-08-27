"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Json } from "@/adapters/supabase/database.types";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import type { AppActionState } from "@/application/actions/action-state";
import { canonicalizeRuleset, hashRuleset } from "@/rulesets/canonicalize";
import { simulationSeason1Ruleset } from "@/rulesets/simulation-season-1";

const createLeagueSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

const joinLeagueSchema = z.object({
  token: z.string().trim().min(16).max(120),
});

export async function createLeagueAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const parsed = createLeagueSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message:
        "Enter a league name and a lowercase URL slug such as west-21st-ledger.",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const canonicalRuleset = canonicalizeRuleset(simulationSeason1Ruleset);
    const rulesetHash = await hashRuleset(simulationSeason1Ruleset);
    const result = await supabase.schema("api").rpc("create_league", {
      p_name: parsed.data.name,
      p_slug: parsed.data.slug,
      p_mode: "SIMULATION",
      p_nfl_year: 2026,
      p_ruleset_id: simulationSeason1Ruleset.id,
      p_ruleset_version: simulationSeason1Ruleset.version,
      p_product_bible_id: simulationSeason1Ruleset.productBibleId,
      p_product_bible_version: simulationSeason1Ruleset.productBibleVersion,
      p_canonical_ruleset: JSON.parse(canonicalRuleset) as Json,
      p_ruleset_sha256: rulesetHash,
    });
    if (result.error || !result.data[0]) {
      return {
        status: "error",
        message:
          "That league could not be created. The URL slug may already be in use.",
      };
    }

    revalidatePath("/leagues");
    return {
      status: "success",
      message:
        "League created. Invite members, then choose a full simulated season or the eight-member interactive Week 1 demo.",
      href: `/l/${result.data[0].league_slug}/commissioner`,
      hrefLabel: "Open commissioner setup",
    };
  } catch {
    return {
      status: "error",
      message: "The league could not be created. Sign in again and retry.",
    };
  }
}

export async function joinLeagueAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const parsed = joinLeagueSchema.safeParse({ token: formData.get("token") });
  if (!parsed.success) {
    return { status: "error", message: "Enter the complete invitation code." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const result = await supabase.schema("api").rpc("join_league", {
      p_token: parsed.data.token,
    });
    if (result.error || !result.data[0]) {
      return {
        status: "error",
        message: "That invitation is invalid, expired, or already fully used.",
      };
    }

    revalidatePath("/leagues");
    return {
      status: "success",
      message: result.data[0].joined
        ? "You joined the league."
        : "You are already a member of this league.",
      href: `/l/${result.data[0].league_slug}/matchup`,
      hrefLabel: "Open league",
    };
  } catch {
    return {
      status: "error",
      message: "The invitation could not be accepted. Sign in again and retry.",
    };
  }
}
