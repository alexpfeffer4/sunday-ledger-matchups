"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createFullSeasonSimulationArchive,
  fullSeasonSimulationSlug,
} from "@/adapters/simulation/full-season";
import type { Json } from "@/adapters/supabase/database.types";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import type { AppActionState } from "@/application/actions/action-state";
import { isDemoSeasonEnabled } from "@/application/demo/demo-season-availability";
import { simulationSeasonArchiveSchema } from "@/application/queries/season-archive-dtos";
import { createLeagueSlug } from "@/domain/leagues/league-slug";
import { canonicalizeRuleset, hashRuleset } from "@/rulesets/canonicalize";
import { pocSeason1Ruleset } from "@/rulesets/poc-season-1";

const createLeagueSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

const joinLeagueSchema = z.object({
  token: z.string().trim().min(16).max(120),
});

const leagueSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const renameLeagueSchema = z.object({
  leagueSlug: leagueSlugSchema,
  name: z.string().trim().min(1).max(80),
});

const archiveLeagueSchema = z.object({
  leagueSlug: leagueSlugSchema,
  archived: z.enum(["true", "false"]),
});

const deleteLeagueSchema = z.object({
  leagueSlug: leagueSlugSchema,
  confirmationName: z.string().min(1).max(80),
});

const memberLeagueSchema = z.object({
  leagueSlug: leagueSlugSchema,
  userId: z.uuid(),
});

const leaveLeagueSchema = z.object({ leagueSlug: leagueSlugSchema });

function lifecycleMutationError(message: string): AppActionState {
  if (message.includes("confirmation does not match")) {
    return {
      status: "error",
      message: "Type the exact league name to confirm.",
    };
  }
  if (message.includes("untouched one-member Draft league")) {
    return {
      status: "error",
      message:
        "This league already has setup activity or members. Archive it instead.",
    };
  }
  if (message.includes("after roster lock")) {
    return {
      status: "error",
      message: "Membership cannot change after the roster is locked.",
    };
  }
  if (message.includes("Transfer commissioner ownership")) {
    return {
      status: "error",
      message:
        "Transfer commissioner ownership before leaving or removing this account.",
    };
  }
  if (message.includes("Commissioner membership required")) {
    return {
      status: "error",
      message: "Only the league commissioner can make that change.",
    };
  }
  return { status: "error", message: "The league could not be updated." };
}

export async function runDemoSeasonAction(): Promise<never> {
  if (!isDemoSeasonEnabled()) {
    redirect("/leagues");
  }

  const supabase = await createSupabaseServerClient();
  const claims = await supabase.auth.getClaims();
  if (!claims.data?.claims?.sub) {
    redirect("/auth/sign-in?next=%2Fleagues");
  }

  const archive = simulationSeasonArchiveSchema.parse(
    createFullSeasonSimulationArchive(),
  );
  const outputReceipt = createHash("sha256")
    .update(JSON.stringify(archive))
    .digest("hex")
    .slice(0, 12);

  redirect(`/l/${fullSeasonSimulationSlug}/matchup?demoRun=${outputReceipt}`);
}

export async function createLeagueAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const parsed = createLeagueSchema.safeParse({
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Enter a league name using 80 characters or fewer.",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const ruleset = pocSeason1Ruleset;
    const canonicalRuleset = canonicalizeRuleset(ruleset);
    const rulesetHash = await hashRuleset(ruleset);
    const slug = createLeagueSlug(
      parsed.data.name,
      randomBytes(3).toString("hex"),
    );
    const result = await supabase.schema("api").rpc("create_league", {
      p_name: parsed.data.name,
      p_slug: slug,
      p_mode: "LIVE",
      p_nfl_year: 2026,
      p_ruleset_id: ruleset.id,
      p_ruleset_version: ruleset.version,
      p_product_bible_id: ruleset.productBibleId,
      p_product_bible_version: ruleset.productBibleVersion,
      p_canonical_ruleset: JSON.parse(canonicalRuleset) as Json,
      p_ruleset_sha256: rulesetHash,
    });
    if (result.error || !result.data[0]) {
      return {
        status: "error",
        message: "That league could not be created. Try again.",
      };
    }

    revalidatePath("/leagues");
    return {
      status: "success",
      message:
        "League created. Invite members, then prepare Week 1 from the Commissioner page.",
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

  let leagueSlug: string;
  try {
    const supabase = await createSupabaseServerClient();
    const claims = await supabase.auth.getClaims();
    if (!claims.data?.claims?.sub) {
      return {
        status: "error",
        message: "Sign in before accepting this invitation.",
      };
    }
    const result = await supabase.schema("api").rpc("join_league", {
      p_token: parsed.data.token,
    });
    if (result.error || !result.data[0]) {
      return {
        status: "error",
        message: "That invitation is invalid, expired, or already fully used.",
      };
    }

    leagueSlug = result.data[0].league_slug;
  } catch {
    return {
      status: "error",
      message: "The invitation could not be accepted. Sign in again and retry.",
    };
  }

  revalidatePath("/leagues");
  redirect(`/l/${leagueSlug}/matchup`);
}

export async function renameLeagueAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const parsed = renameLeagueSchema.safeParse({
    leagueSlug: formData.get("leagueSlug"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Enter a league name using 80 characters or fewer.",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const result = await supabase.schema("api").rpc("rename_league", {
      p_league_slug: parsed.data.leagueSlug,
      p_name: parsed.data.name,
    });
    if (result.error) return lifecycleMutationError(result.error.message);

    revalidatePath("/leagues");
    revalidatePath("/l/[leagueSlug]", "layout");
    return { status: "success", message: "League name updated." };
  } catch {
    return {
      status: "error",
      message: "The league name could not be updated.",
    };
  }
}

export async function setLeagueArchivedAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const parsed = archiveLeagueSchema.safeParse({
    leagueSlug: formData.get("leagueSlug"),
    archived: formData.get("archived"),
  });
  if (!parsed.success) {
    return { status: "error", message: "The archive request is invalid." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const result = await supabase.schema("api").rpc("set_league_archived", {
      p_league_slug: parsed.data.leagueSlug,
      p_archived: parsed.data.archived === "true",
    });
    if (result.error) return lifecycleMutationError(result.error.message);
  } catch {
    return {
      status: "error",
      message: "The league archive could not be updated.",
    };
  }

  revalidatePath("/leagues");
  revalidatePath("/l/[leagueSlug]", "layout");
  redirect("/leagues");
}

export async function deleteLeagueAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const parsed = deleteLeagueSchema.safeParse({
    leagueSlug: formData.get("leagueSlug"),
    confirmationName: formData.get("confirmationName"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Type the exact league name to confirm.",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const result = await supabase
      .schema("api")
      .rpc("delete_empty_draft_league", {
        p_league_slug: parsed.data.leagueSlug,
        p_confirmation_name: parsed.data.confirmationName,
      });
    if (result.error) return lifecycleMutationError(result.error.message);
  } catch {
    return {
      status: "error",
      message: "The empty league could not be deleted.",
    };
  }

  revalidatePath("/leagues");
  redirect("/leagues");
}

export async function removeLeagueMemberAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const parsed = memberLeagueSchema.safeParse({
    leagueSlug: formData.get("leagueSlug"),
    userId: formData.get("userId"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Choose a current league member." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const result = await supabase.schema("api").rpc("remove_league_member", {
      p_league_slug: parsed.data.leagueSlug,
      p_user_id: parsed.data.userId,
    });
    if (result.error) return lifecycleMutationError(result.error.message);

    revalidatePath("/leagues");
    revalidatePath(`/l/${parsed.data.leagueSlug}/commissioner`);
    return {
      status: "success",
      message: "Member removed from the Draft league.",
    };
  } catch {
    return { status: "error", message: "The member could not be removed." };
  }
}

export async function transferLeagueCommissionerAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const parsed = memberLeagueSchema.safeParse({
    leagueSlug: formData.get("leagueSlug"),
    userId: formData.get("userId"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Choose a current league member." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const result = await supabase
      .schema("api")
      .rpc("transfer_league_commissioner", {
        p_league_slug: parsed.data.leagueSlug,
        p_user_id: parsed.data.userId,
      });
    if (result.error) return lifecycleMutationError(result.error.message);
  } catch {
    return {
      status: "error",
      message: "Commissioner ownership could not be transferred.",
    };
  }

  revalidatePath("/leagues");
  revalidatePath("/l/[leagueSlug]", "layout");
  redirect(`/l/${parsed.data.leagueSlug}/matchup`);
}

export async function leaveLeagueAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const parsed = leaveLeagueSchema.safeParse({
    leagueSlug: formData.get("leagueSlug"),
  });
  if (!parsed.success) {
    return { status: "error", message: "The league request is invalid." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const result = await supabase.schema("api").rpc("leave_league", {
      p_league_slug: parsed.data.leagueSlug,
    });
    if (result.error) return lifecycleMutationError(result.error.message);
  } catch {
    return { status: "error", message: "You could not leave this league." };
  }

  revalidatePath("/leagues");
  redirect("/leagues");
}
