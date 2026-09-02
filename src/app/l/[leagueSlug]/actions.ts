"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { canonicalSimulationFixturePackId } from "@/adapters/simulation";
import {
  fetchNflOdds,
  fetchNflScores,
  OddsProviderRequestError,
} from "@/adapters/providers/the-odds-api/client";
import { OddsProviderPayloadError } from "@/adapters/providers/the-odds-api/normalize";
import type { Json } from "@/adapters/supabase/database.types";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import type { AppActionState } from "@/application/actions/action-state";
import { stableOperationKey } from "@/application/actions/stable-operation-key";
import { getAuthoritativeLeagueState } from "@/application/queries/get-live-stage1-league";
import { validateDraftCard } from "@/domain/cards/validate-card-draft";
import { maximumStakeForOdds } from "@/domain/cards/validate-position";
import { simulationSeason1Ruleset } from "@/rulesets/simulation-season-1";

const contextSchema = z.object({
  leagueId: z.uuid(),
  leagueSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

const inviteSettingsSchema = z.object({
  expiresInDays: z.coerce.number().int().min(1).max(30),
  maxUses: z.coerce.number().int().min(1).max(15),
  operationId: z.uuid(),
});

const inviteReceiptSchema = z.object({
  token: z.string().min(16).max(120),
  expiresAt: z.iso.datetime(),
  maxUses: z.number().int().min(1).max(15),
  replayed: z.boolean(),
});

const revokeInviteSchema = z.object({ inviteId: z.uuid() });

function parseContext(formData: FormData) {
  return contextSchema.safeParse({
    leagueId: formData.get("leagueId"),
    leagueSlug: formData.get("leagueSlug"),
  });
}

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

async function operationAlreadyCompleted(
  supabase: SupabaseServerClient,
  commandName: string,
  operationKey: string,
): Promise<boolean> {
  const receipt = await supabase.schema("api").rpc("get_my_command_receipt", {
    p_command_name: commandName,
    p_idempotency_key: operationKey,
  });
  return !receipt.error && receipt.data !== null;
}

async function completed(
  slug: string,
  message: string,
  link?: { href: string; label: string },
): Promise<AppActionState> {
  const state = await finish(slug, `Already completed. ${message}`);
  return link ? { ...state, href: link.href, hrefLabel: link.label } : state;
}

async function reconcileCommandError(params: {
  commandName: string;
  completedMessage: string;
  errorMessage: string;
  link?: { href: string; label: string };
  operationKey: string;
  slug: string;
  supabase: SupabaseServerClient;
}): Promise<AppActionState> {
  if (
    await operationAlreadyCompleted(
      params.supabase,
      params.commandName,
      params.operationKey,
    )
  ) {
    return completed(params.slug, params.completedMessage, params.link);
  }
  return mutationError(params.errorMessage);
}

async function requestOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (origin) {
    const parsed = new URL(origin);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.origin;
    }
  }

  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  if (!host || (protocol !== "http" && protocol !== "https")) {
    throw new Error("The request origin could not be verified.");
  }
  return `${protocol}://${host}`;
}

function mutationError(message: string): AppActionState {
  if (message.includes("QUOTE_CHANGED")) {
    return {
      status: "error",
      message:
        "The quote changed. Review the current terms before confirming again.",
    };
  }
  if (message.includes("Idempotency key was reused")) {
    return {
      status: "error",
      message:
        "The reviewed inputs changed after the earlier attempt. Nothing new was accepted; review them before trying again.",
    };
  }
  if (
    message.includes("Commissioner membership required") ||
    message.includes("League membership required") ||
    message.includes("Authentication required")
  ) {
    return {
      status: "error",
      message:
        "You no longer have permission to do that. Sign in again or ask the league commissioner.",
    };
  }
  if (message.includes("exactly eight")) {
    return {
      status: "error",
      message:
        "Interactive Week 1 opens when exactly eight members have joined this league.",
    };
  }
  if (message.includes("even roster") || message.includes("4 through 16")) {
    return {
      status: "error",
      message: "The season requires an even roster from 4 through 16 members.",
    };
  }
  if (message.includes("Common lock has not arrived")) {
    return {
      status: "error",
      message:
        "Advance the practice clock to the card-lock time before locking cards.",
    };
  }
  if (message.includes("cannot finalize before its correction window")) {
    return {
      status: "error",
      message: "The 24-hour correction window is still open.",
    };
  }
  if (message.includes("correction window is closed")) {
    return {
      status: "error",
      message: "The visible correction window has closed.",
    };
  }
  if (message.includes("stale")) {
    return {
      status: "error",
      message:
        "At least one quote expired. Review the current card terms again.",
    };
  }
  if (message.includes("exactly 1,000")) {
    return {
      status: "error",
      message: "Use all 1,000 credits before sealing the card.",
    };
  }
  if (message.includes("live odds event count")) {
    return {
      status: "error",
      message: "Too many games were returned for one week. No odds were saved.",
    };
  }
  if (message.includes("Select between one and 32")) {
    return {
      status: "error",
      message: "Select at least one NFL game before publishing.",
    };
  }
  if (message.includes("already reached common lock")) {
    return {
      status: "error",
      message:
        "At least one selected game has reached the card-lock time. Import a future slate instead.",
    };
  }
  if (message.includes("already published")) {
    return {
      status: "error",
      message: "This season already has a published weekly slate.",
    };
  }
  if (message.includes("newer reviewed import")) {
    return {
      status: "error",
      message:
        "Newer NFL odds are available. Refresh the Commissioner page before publishing.",
    };
  }
  if (message.includes("live score batch must match")) {
    return {
      status: "error",
      message:
        "Not every published game was returned. The current odds were left unchanged.",
    };
  }
  if (message.includes("cannot change a published event")) {
    return {
      status: "error",
      message:
        "A published game or kickoff time changed unexpectedly. No odds were updated.",
    };
  }
  if (message.includes("cannot move an observation backward")) {
    return {
      status: "error",
      message:
        "The returned odds were older than the current ones, so nothing changed.",
    };
  }
  if (message.includes("reached common lock")) {
    return {
      status: "error",
      message: "Odds cannot refresh after cards lock.",
    };
  }
  if (message.includes("six fresh healthy current quotes")) {
    return {
      status: "error",
      message:
        "Every published game needs a complete current quote set. Refresh the odds and try the roster lock again.",
    };
  }
  if (message.includes("six fresh current quotes")) {
    return {
      status: "error",
      message:
        "The reviewed odds are no longer fresh enough to open cards. Import current NFL markets and publish again.",
    };
  }
  if (message.includes("current week must be final")) {
    return {
      status: "error",
      message: "Finalize the current week before publishing the next slate.",
    };
  }
  if (message.includes("14-week regular season is complete")) {
    return {
      status: "error",
      message: "Week 14 is complete. Confirm the playoff field next.",
    };
  }
  if (message.includes("Week 14 must be final")) {
    return {
      status: "error",
      message:
        "Finalize Week 14 after its correction window before confirming the playoff field.",
    };
  }
  if (message.includes("No additional competitive postseason")) {
    return {
      status: "error",
      message: "The championship round is already the final postseason week.",
    };
  }
  if (message.includes("Week 17 must be final")) {
    return {
      status: "error",
      message:
        "Finalize Week 17 and its correction window before publishing the season archive.",
    };
  }
  if (
    message.includes("regular-season weeks must be final") ||
    message.includes("postseason rounds must be final") ||
    message.includes("requires a final result") ||
    message.includes("requires a final weekly score") ||
    message.includes("requires settlement") ||
    message.includes("derived season archive is incomplete")
  ) {
    return {
      status: "error",
      message:
        "The final season record is incomplete. The season remains in the playoffs.",
    };
  }
  if (message.includes("frozen playoff field is incomplete")) {
    return {
      status: "error",
      message:
        "The playoff field is incomplete, and the rules do not allow a replacement qualifier.",
    };
  }
  if (
    message.includes("Week 15 opening-round matchups must be final") ||
    message.includes("Week 16 semifinals must be final")
  ) {
    return {
      status: "error",
      message:
        "Finalize both playoff matchups in the current round before publishing the next one.",
    };
  }
  if (message.includes("Import current NFL markets after the prior week")) {
    return {
      status: "error",
      message:
        "Import current NFL odds after the prior week before opening the next playoff round.",
    };
  }
  if (message.includes("locked cards and an unfinalized week")) {
    return {
      status: "error",
      message:
        "Lock every card in the current week before importing NFL results.",
    };
  }
  if (message.includes("exactly the published event set")) {
    return {
      status: "error",
      message: "Not every published game was returned. No scores were updated.",
    };
  }
  if (message.includes("live score import is not fresh")) {
    return {
      status: "error",
      message: "Those scores were out of date. Refresh them again.",
    };
  }
  if (message.includes("48-hour postponement window")) {
    return {
      status: "error",
      message: "This event cannot be voided before the 48-hour window closes.",
    };
  }
  if (message.includes("already has a recorded result")) {
    return {
      status: "error",
      message:
        "This event already has a result; use the visible correction flow.",
    };
  }
  if (message.includes("correction must change")) {
    return {
      status: "error",
      message: "Enter a changed objective score before recording a correction.",
    };
  }
  if (message.includes("visible correction reason")) {
    return {
      status: "error",
      message: "Explain the objective correction in at least 10 characters.",
    };
  }
  return {
    status: "error",
    message:
      "No safe change was confirmed. Refresh the page to check the current league state before trying again.",
  };
}

async function finish(slug: string, message: string): Promise<AppActionState> {
  for (const path of [
    `/l/${slug}`,
    `/l/${slug}/matchup`,
    `/l/${slug}/card`,
    `/l/${slug}/live`,
    `/l/${slug}/league`,
    `/l/${slug}/slate`,
    `/l/${slug}/standings`,
    `/l/${slug}/playoffs`,
    `/l/${slug}/commissioner`,
  ]) {
    revalidatePath(path);
  }
  return { status: "success", message };
}

export async function createLeagueInviteAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  if (!context.success) return mutationError("invalid context");

  const settings = inviteSettingsSchema.safeParse({
    expiresInDays: formData.get("expiresInDays"),
    maxUses: formData.get("maxUses"),
    operationId: formData.get("operationId"),
  });
  if (!settings.success) {
    return mutationError("Choose an expiry from 1–30 days and 1–15 uses.");
  }

  let origin: string;
  try {
    origin = await requestOrigin();
  } catch {
    return mutationError("The share-link address could not be verified.");
  }

  const supabase = await createSupabaseServerClient();
  const claims = await supabase.auth.getClaims();
  if (!claims.data?.claims?.sub) {
    return mutationError("Sign in again before creating an invitation.");
  }
  const operationKey = stableOperationKey({
    command: "CREATE_LEAGUE_INVITE",
    intentId: settings.data.operationId,
    leagueId: context.data.leagueId,
  });
  const result = await supabase
    .schema("api")
    .rpc("create_league_invite_retry_safe", {
      p_league_id: context.data.leagueId,
      p_expires_in_days: settings.data.expiresInDays,
      p_max_uses: settings.data.maxUses,
      p_idempotency_key: operationKey,
    });
  if (result.error) return mutationError(result.error.message);
  const receipt = inviteReceiptSchema.safeParse(result.data);
  if (!receipt.success) {
    return mutationError("The invitation receipt could not be verified.");
  }

  const inviteUrl = new URL(`/join/${receipt.data.token}`, origin).toString();

  revalidatePath(`/l/${context.data.leagueSlug}/commissioner`);

  return {
    status: "success",
    message: `${receipt.data.replayed ? "Already completed. The original private link is shown again." : "Private link created."} It allows ${settings.data.maxUses} ${settings.data.maxUses === 1 ? "join" : "joins"} and expires in ${settings.data.expiresInDays} ${settings.data.expiresInDays === 1 ? "day" : "days"}.`,
    value: inviteUrl,
  };
}

export async function revokeLeagueInviteAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  const invite = revokeInviteSchema.safeParse({
    inviteId: formData.get("inviteId"),
  });
  if (!context.success || !invite.success) {
    return mutationError("The invitation could not be identified.");
  }

  const supabase = await createSupabaseServerClient();
  const claims = await supabase.auth.getClaims();
  if (!claims.data?.claims?.sub) {
    return mutationError("Sign in again before changing an invitation.");
  }

  const result = await supabase.schema("api").rpc("revoke_league_invite", {
    p_invite_id: invite.data.inviteId,
    p_league_id: context.data.leagueId,
  });
  if (result.error) return mutationError(result.error.message);

  revalidatePath(`/l/${context.data.leagueSlug}/commissioner`);
  return {
    status: "success",
    message: result.data
      ? "Invitation revoked. Anyone opening that link can no longer join."
      : "That invitation was already inactive.",
  };
}

export async function importLiveOddsAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  if (!context.success) return mutationError("invalid context");

  const state = await getAuthoritativeLeagueState(context.data.leagueSlug);
  if (
    !state ||
    state.league.id !== context.data.leagueId ||
    !state.commissioner.isCommissioner ||
    state.league.mode !== "LIVE" ||
    state.league.lifecycle === "FINAL"
  ) {
    return mutationError("A Live-league commissioner is required.");
  }

  try {
    const liveImport = await fetchNflOdds();
    const payloadHash = createHash("sha256")
      .update(JSON.stringify(liveImport))
      .digest("hex");
    const supabase = await createSupabaseServerClient();
    const operationKey = `live-odds:${payloadHash}`;
    if (
      await operationAlreadyCompleted(
        supabase,
        "STORE_LIVE_ODDS_IMPORT",
        operationKey,
      )
    ) {
      return completed(
        context.data.leagueSlug,
        "Those NFL odds are already saved for commissioner review.",
      );
    }
    const result = await supabase.schema("api").rpc("store_live_odds_import", {
      p_league_id: context.data.leagueId,
      p_import: liveImport as unknown as Json,
      p_idempotency_key: operationKey,
    });
    if (result.error) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "Live odds import storage rejected",
          code: result.error.code,
          databaseMessage: result.error.message,
        }),
      );
      return mutationError(result.error.message);
    }

    revalidatePath(`/l/${context.data.leagueSlug}/commissioner`);
    return {
      status: "success",
      message: `${liveImport.events.length} NFL events imported for commissioner review. Nothing has been published to members yet.`,
    };
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Live odds import failed",
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      }),
    );
    if (error instanceof OddsProviderRequestError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof OddsProviderPayloadError) {
      return {
        status: "error",
        message:
          "The odds response was incomplete. No odds were saved or published.",
      };
    }
    return mutationError("The live odds import failed.");
  }
}

export async function publishLiveWeekSlateAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  const selection = z
    .object({
      importId: z.uuid(),
      externalEventIds: z.array(z.string().min(1).max(160)).min(1).max(32),
    })
    .safeParse({
      importId: formData.get("importId"),
      externalEventIds: formData.getAll("externalEventId"),
    });
  if (!context.success || !selection.success) {
    return mutationError("Select between one and 32 imported events.");
  }

  const operationKey = stableOperationKey({
    command: "PUBLISH_LIVE_WEEK_SLATE",
    externalEventIds: selection.data.externalEventIds,
    importId: selection.data.importId,
    leagueId: context.data.leagueId,
    week: 1,
  });
  const supabase = await createSupabaseServerClient();
  if (
    await operationAlreadyCompleted(
      supabase,
      "PUBLISH_LIVE_WEEK_SLATE",
      operationKey,
    )
  ) {
    return completed(
      context.data.leagueSlug,
      "Week 1 is available and member cards remain closed until roster lock.",
      {
        href: `/l/${context.data.leagueSlug}/slate`,
        label: "Review Week 1",
      },
    );
  }

  const state = await getAuthoritativeLeagueState(context.data.leagueSlug);
  if (
    !state ||
    state.league.id !== context.data.leagueId ||
    !state.commissioner.isCommissioner ||
    state.league.mode !== "LIVE" ||
    state.league.lifecycle !== "DRAFT" ||
    state.week
  ) {
    return mutationError("A Draft Live season without a slate is required.");
  }

  const result = await supabase.schema("api").rpc("publish_live_week_slate", {
    p_league_id: context.data.leagueId,
    p_import_id: selection.data.importId,
    p_external_event_ids: selection.data.externalEventIds,
    p_idempotency_key: operationKey,
  });
  if (result.error) return mutationError(result.error.message);

  revalidatePath(`/l/${context.data.leagueSlug}`);
  revalidatePath(`/l/${context.data.leagueSlug}/slate`);
  revalidatePath(`/l/${context.data.leagueSlug}/commissioner`);
  return {
    status: "success",
    message: `${selection.data.externalEventIds.length} NFL games published for Week 1. Cards remain closed until the roster is locked.`,
    href: `/l/${context.data.leagueSlug}/slate`,
    hrefLabel: "Review the published slate",
  };
}

export async function publishNextLiveWeekSlateAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  const selection = z
    .object({
      importId: z.uuid(),
      externalEventIds: z.array(z.string().min(1).max(160)).min(1).max(32),
    })
    .safeParse({
      importId: formData.get("importId"),
      externalEventIds: formData.getAll("externalEventId"),
    });
  if (!context.success || !selection.success) {
    return mutationError("Select between one and 32 imported events.");
  }

  const expectedWeek = z.coerce
    .number()
    .int()
    .min(1)
    .max(13)
    .safeParse(formData.get("expectedWeek"));
  if (!expectedWeek.success) return mutationError("The source week changed.");
  const nextWeek = expectedWeek.data + 1;
  const operationKey = stableOperationKey({
    command: "PUBLISH_NEXT_LIVE_WEEK_SLATE",
    externalEventIds: selection.data.externalEventIds,
    importId: selection.data.importId,
    leagueId: context.data.leagueId,
    week: nextWeek,
  });
  const supabase = await createSupabaseServerClient();
  if (
    await operationAlreadyCompleted(
      supabase,
      "PUBLISH_NEXT_LIVE_WEEK_SLATE",
      operationKey,
    )
  ) {
    return completed(
      context.data.leagueSlug,
      `Week ${nextWeek} is available with the original reviewed games.`,
      {
        href: `/l/${context.data.leagueSlug}/slate`,
        label: `Open Week ${nextWeek}`,
      },
    );
  }

  const state = await getAuthoritativeLeagueState(context.data.leagueSlug);
  if (
    !state ||
    state.league.id !== context.data.leagueId ||
    !state.commissioner.isCommissioner ||
    state.league.mode !== "LIVE" ||
    state.league.lifecycle !== "REGULAR" ||
    state.week?.state !== "FINAL" ||
    state.week.nflWeek !== expectedWeek.data
  ) {
    return mutationError(
      "The current week must be final before the next week can publish.",
    );
  }

  const result = await supabase
    .schema("api")
    .rpc("publish_next_live_week_slate", {
      p_league_id: context.data.leagueId,
      p_import_id: selection.data.importId,
      p_external_event_ids: selection.data.externalEventIds,
      p_idempotency_key: operationKey,
    });
  if (result.error) return mutationError(result.error.message);

  revalidatePath(`/l/${context.data.leagueSlug}`);
  revalidatePath(`/l/${context.data.leagueSlug}/matchup`);
  revalidatePath(`/l/${context.data.leagueSlug}/slate`);
  revalidatePath(`/l/${context.data.leagueSlug}/card`);
  revalidatePath(`/l/${context.data.leagueSlug}/schedule`);
  revalidatePath(`/l/${context.data.leagueSlug}/standings`);
  revalidatePath(`/l/${context.data.leagueSlug}/commissioner`);
  return {
    status: "success",
    message: `Week ${nextWeek} is open with ${selection.data.externalEventIds.length} NFL games and a fresh 1,000-credit card for every member.`,
    href: `/l/${context.data.leagueSlug}/slate`,
    hrefLabel: `Build the Week ${nextWeek} card`,
  };
}

export async function publishLivePlayoffQualificationAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  if (!context.success) return mutationError("invalid context");

  const operationKey = stableOperationKey({
    command: "PUBLISH_PLAYOFF_QUALIFICATION",
    leagueId: context.data.leagueId,
    throughWeek: 14,
  });
  const supabase = await createSupabaseServerClient();
  if (
    await operationAlreadyCompleted(
      supabase,
      "PUBLISH_PLAYOFF_QUALIFICATION",
      operationKey,
    )
  ) {
    return completed(
      context.data.leagueSlug,
      "The playoff field is already confirmed from the final Week 14 standings.",
      {
        href: `/l/${context.data.leagueSlug}/playoffs`,
        label: "Open the bracket",
      },
    );
  }

  const state = await getAuthoritativeLeagueState(context.data.leagueSlug);
  if (
    !state ||
    state.league.id !== context.data.leagueId ||
    !state.commissioner.isCommissioner ||
    !["REGULAR", "PLAYOFFS"].includes(state.league.lifecycle)
  ) {
    return mutationError(
      "Week 14 must be final before playoff qualification can publish.",
    );
  }

  const result = await supabase
    .schema("api")
    .rpc("publish_playoff_qualification", {
      p_league_id: context.data.leagueId,
      p_idempotency_key: operationKey,
    });
  if (result.error) return mutationError(result.error.message);

  for (const path of [
    `/l/${context.data.leagueSlug}`,
    `/l/${context.data.leagueSlug}/standings`,
    `/l/${context.data.leagueSlug}/playoffs`,
    `/l/${context.data.leagueSlug}/commissioner`,
    "/leagues",
  ]) {
    revalidatePath(path);
  }
  return {
    status: "success",
    message:
      "The playoff field is set from the final Week 14 standings and eligibility results.",
    href: `/l/${context.data.leagueSlug}/playoffs`,
    hrefLabel: "Open the official bracket",
  };
}

export async function publishNextLivePostseasonWeekAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  const selection = z
    .object({
      importId: z.uuid(),
      externalEventIds: z.array(z.string().min(1).max(160)).min(1).max(32),
    })
    .safeParse({
      importId: formData.get("importId"),
      externalEventIds: formData.getAll("externalEventId"),
    });
  if (!context.success || !selection.success) {
    return mutationError("Select between one and 32 imported events.");
  }

  const expectedWeek = z.coerce
    .number()
    .int()
    .min(14)
    .max(16)
    .safeParse(formData.get("expectedWeek"));
  if (!expectedWeek.success) return mutationError("The source week changed.");
  const nextWeek = expectedWeek.data + 1;
  const operationKey = stableOperationKey({
    command: "PUBLISH_POSTSEASON_WEEK",
    externalEventIds: selection.data.externalEventIds,
    importId: selection.data.importId,
    leagueId: context.data.leagueId,
    week: nextWeek,
  });
  const supabase = await createSupabaseServerClient();
  if (
    await operationAlreadyCompleted(
      supabase,
      "PUBLISH_POSTSEASON_WEEK",
      operationKey,
    )
  ) {
    return completed(
      context.data.leagueSlug,
      `Postseason Week ${nextWeek} is already available with its original matchups and games.`,
      {
        href: `/l/${context.data.leagueSlug}/playoffs`,
        label: `Open Week ${nextWeek}`,
      },
    );
  }

  const state = await getAuthoritativeLeagueState(context.data.leagueSlug);
  if (
    !state ||
    state.league.id !== context.data.leagueId ||
    !state.commissioner.isCommissioner ||
    state.league.lifecycle !== "PLAYOFFS" ||
    !state.week ||
    state.week.nflWeek !== expectedWeek.data ||
    state.week.state !== "FINAL"
  ) {
    return mutationError(
      "The current week must be final before the next postseason week can publish.",
    );
  }

  const result = await supabase.schema("api").rpc("publish_postseason_week", {
    p_league_id: context.data.leagueId,
    p_import_id: selection.data.importId,
    p_external_event_ids: selection.data.externalEventIds,
    p_idempotency_key: operationKey,
  });
  if (result.error) return mutationError(result.error.message);

  for (const path of [
    `/l/${context.data.leagueSlug}`,
    `/l/${context.data.leagueSlug}/matchup`,
    `/l/${context.data.leagueSlug}/slate`,
    `/l/${context.data.leagueSlug}/card`,
    `/l/${context.data.leagueSlug}/league`,
    `/l/${context.data.leagueSlug}/standings`,
    `/l/${context.data.leagueSlug}/playoffs`,
    `/l/${context.data.leagueSlug}/commissioner`,
  ]) {
    revalidatePath(path);
  }
  return {
    status: "success",
    message: `Postseason Week ${nextWeek} is open with one matchup and one 1,000-credit card for every member.`,
    href: `/l/${context.data.leagueSlug}/playoffs`,
    hrefLabel: `Review the Week ${nextWeek} bracket`,
  };
}

export async function finalizeChampionBracketAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  if (!context.success) return mutationError("invalid context");

  const operationKey = stableOperationKey({
    command: "FINALIZE_CHAMPION_BRACKET",
    leagueId: context.data.leagueId,
    week: 17,
  });
  const supabase = await createSupabaseServerClient();
  if (
    await operationAlreadyCompleted(
      supabase,
      "FINALIZE_CHAMPION_BRACKET",
      operationKey,
    )
  ) {
    return completed(
      context.data.leagueSlug,
      "The champion and final bracket are already confirmed.",
      {
        href: `/l/${context.data.leagueSlug}/playoffs`,
        label: "Open the final bracket",
      },
    );
  }

  const state = await getAuthoritativeLeagueState(context.data.leagueSlug);
  if (
    !state ||
    state.league.id !== context.data.leagueId ||
    !state.commissioner.isCommissioner ||
    state.league.lifecycle !== "PLAYOFFS" ||
    state.week?.nflWeek !== 17 ||
    state.week.state !== "FINAL"
  ) {
    return mutationError(
      "Week 17 and its correction window must be final before confirming the champion.",
    );
  }

  const result = await supabase.schema("api").rpc("finalize_champion_bracket", {
    p_league_id: context.data.leagueId,
    p_idempotency_key: operationKey,
  });
  if (result.error) return mutationError(result.error.message);
  return finish(
    context.data.leagueSlug,
    "The champion and final bracket are confirmed. The complete archive remains open until Week 18 ends.",
  );
}

export async function publishWeek18ExhibitionAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  const selection = z
    .object({
      importId: z.uuid(),
      externalEventIds: z.array(z.string().min(1).max(160)).min(1).max(32),
    })
    .safeParse({
      importId: formData.get("importId"),
      externalEventIds: formData.getAll("externalEventId"),
    });
  if (!context.success || !selection.success) {
    return mutationError("Select between one and 32 imported events.");
  }

  const operationKey = stableOperationKey({
    command: "PUBLISH_POSTSEASON_WEEK",
    externalEventIds: selection.data.externalEventIds,
    importId: selection.data.importId,
    leagueId: context.data.leagueId,
    week: 18,
  });
  const supabase = await createSupabaseServerClient();
  if (
    await operationAlreadyCompleted(
      supabase,
      "PUBLISH_POSTSEASON_WEEK",
      operationKey,
    )
  ) {
    return completed(
      context.data.leagueSlug,
      "Week 18 exhibitions are already available with the original pairings and games.",
      {
        href: `/l/${context.data.leagueSlug}/playoffs`,
        label: "Open Week 18",
      },
    );
  }

  const state = await getAuthoritativeLeagueState(context.data.leagueSlug);
  if (
    !state ||
    state.league.id !== context.data.leagueId ||
    !state.commissioner.isCommissioner ||
    state.league.mode !== "LIVE" ||
    state.league.lifecycle !== "CHAMPION_FINAL" ||
    state.week?.nflWeek !== 17 ||
    state.week.state !== "FINAL"
  ) {
    return mutationError("Confirm the champion before publishing Week 18.");
  }

  const result = await supabase.schema("api").rpc("publish_week18_exhibition", {
    p_league_id: context.data.leagueId,
    p_import_id: selection.data.importId,
    p_external_event_ids: selection.data.externalEventIds,
    p_idempotency_key: operationKey,
  });
  if (result.error) return mutationError(result.error.message);
  return finish(
    context.data.leagueSlug,
    "Week 18 exhibitions are open. Every member has one adjacent final-placement matchup and a normal card.",
  );
}

export async function publishLiveSeasonArchiveAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  if (!context.success) return mutationError("invalid context");

  const operationKey = stableOperationKey({
    command: "FINALIZE_SEASON_ARCHIVE",
    leagueId: context.data.leagueId,
    throughWeek: 18,
  });
  const supabase = await createSupabaseServerClient();
  if (
    await operationAlreadyCompleted(
      supabase,
      "FINALIZE_SEASON_ARCHIVE",
      operationKey,
    )
  ) {
    return completed(
      context.data.leagueSlug,
      "The complete season archive is already final through Week 18.",
      {
        href: `/l/${context.data.leagueSlug}/matchup`,
        label: "Open the completed season",
      },
    );
  }

  const state = await getAuthoritativeLeagueState(context.data.leagueSlug);
  if (
    !state ||
    state.league.id !== context.data.leagueId ||
    !state.commissioner.isCommissioner ||
    state.league.lifecycle !== "WEEK_18_EXHIBITION" ||
    state.week?.state !== "FINAL" ||
    state.week.nflWeek !== 18
  ) {
    return mutationError(
      "Week 18 must be final before the complete season archive can publish.",
    );
  }

  const result = await supabase.schema("api").rpc("finalize_season_archive", {
    p_league_id: context.data.leagueId,
    p_idempotency_key: operationKey,
  });
  if (result.error) return mutationError(result.error.message);

  for (const path of [
    `/l/${context.data.leagueSlug}`,
    `/l/${context.data.leagueSlug}/matchup`,
    `/l/${context.data.leagueSlug}/schedule`,
    `/l/${context.data.leagueSlug}/standings`,
    `/l/${context.data.leagueSlug}/playoffs`,
    `/l/${context.data.leagueSlug}/history`,
    `/l/${context.data.leagueSlug}/commissioner`,
    "/leagues",
  ]) {
    revalidatePath(path);
  }
  return {
    status: "success",
    message:
      "The complete season archive is final through Week 18. The champion and every prior version remain auditable.",
    href: `/l/${context.data.leagueSlug}/matchup`,
    hrefLabel: "Open the completed season",
  };
}

const storedLiveImportSchema = z.object({ importId: z.uuid() });

class LiveQuoteRefreshRejectedError extends Error {}

async function refreshPublishedLiveQuoteHeads(params: {
  eventIds: string[];
  leagueId: string;
}): Promise<{ eventCount: number; replayed: boolean }> {
  const liveImport = await fetchNflOdds({ eventIds: params.eventIds });
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(liveImport))
    .digest("hex");
  const supabase = await createSupabaseServerClient();
  const refreshOperationKey = `refresh-live:${payloadHash}`;
  if (
    await operationAlreadyCompleted(
      supabase,
      "REFRESH_LIVE_WEEK_QUOTES",
      refreshOperationKey,
    )
  ) {
    return { eventCount: liveImport.events.length, replayed: true };
  }
  const stored = await supabase.schema("api").rpc("store_live_odds_import", {
    p_league_id: params.leagueId,
    p_import: liveImport as unknown as Json,
    p_idempotency_key: `live-odds:${payloadHash}`,
  });
  if (stored.error) {
    throw new LiveQuoteRefreshRejectedError(stored.error.message);
  }

  const importReceipt = storedLiveImportSchema.safeParse(stored.data);
  if (!importReceipt.success) {
    throw new LiveQuoteRefreshRejectedError(
      "The stored import receipt is invalid.",
    );
  }
  const refreshed = await supabase
    .schema("api")
    .rpc("refresh_live_week_quotes", {
      p_league_id: params.leagueId,
      p_import_id: importReceipt.data.importId,
      p_idempotency_key: refreshOperationKey,
    });
  if (refreshed.error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Live quote refresh rejected",
        code: refreshed.error.code,
        databaseMessage: refreshed.error.message,
      }),
    );
    throw new LiveQuoteRefreshRejectedError(refreshed.error.message);
  }

  return { eventCount: liveImport.events.length, replayed: false };
}

export async function refreshLiveWeekQuotesAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  if (!context.success) return mutationError("invalid context");

  const state = await getAuthoritativeLeagueState(context.data.leagueSlug);
  if (
    !state ||
    state.league.id !== context.data.leagueId ||
    !state.commissioner.isCommissioner ||
    state.league.mode !== "LIVE" ||
    !state.week ||
    !["PLANNED", "OPEN"].includes(state.week.state) ||
    state.slate.length === 0
  ) {
    return mutationError("A published Live slate is required.");
  }

  try {
    const refresh = await refreshPublishedLiveQuoteHeads({
      leagueId: context.data.leagueId,
      eventIds: state.slate.map((event) => event.key),
    });

    revalidatePath(`/l/${context.data.leagueSlug}`);
    revalidatePath(`/l/${context.data.leagueSlug}/slate`);
    revalidatePath(`/l/${context.data.leagueSlug}/card`);
    revalidatePath(`/l/${context.data.leagueSlug}/commissioner`);
    return {
      status: "success",
      message: `${refresh.replayed ? "Already completed. " : ""}${refresh.eventCount} published games refreshed. The selected games and card-lock time did not change.`,
    };
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Live quote refresh failed",
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      }),
    );
    if (error instanceof OddsProviderRequestError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof OddsProviderPayloadError) {
      return {
        status: "error",
        message:
          "Complete current odds were not available. The published odds were left unchanged.",
      };
    }
    if (error instanceof LiveQuoteRefreshRejectedError) {
      return mutationError(error.message);
    }
    return mutationError("The live quote refresh failed.");
  }
}

export async function lockLiveRosterAndOpenWeekAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  if (!context.success) return mutationError("invalid context");

  const operationKey = stableOperationKey({
    command: "LOCK_LIVE_ROSTER_AND_OPEN_WEEK",
    leagueId: context.data.leagueId,
  });
  const supabase = await createSupabaseServerClient();
  if (
    await operationAlreadyCompleted(
      supabase,
      "LOCK_LIVE_ROSTER_AND_OPEN_WEEK",
      operationKey,
    )
  ) {
    return completed(
      context.data.leagueSlug,
      "The roster and 14-week schedule are frozen, and Week 1 cards are open.",
      {
        href: `/l/${context.data.leagueSlug}/card`,
        label: "Open Week 1",
      },
    );
  }

  const state = await getAuthoritativeLeagueState(context.data.leagueSlug);
  if (
    !state ||
    state.league.id !== context.data.leagueId ||
    !state.commissioner.isCommissioner ||
    state.league.lifecycle !== "DRAFT" ||
    state.week?.state !== "PLANNED" ||
    state.slate.length === 0
  ) {
    return mutationError("A planned authoritative Week 1 slate is required.");
  }
  if (
    state.league.memberCount < 4 ||
    state.league.memberCount > 16 ||
    state.league.memberCount % 2 !== 0 ||
    state.members.some((member) => member.entryId === null)
  ) {
    return mutationError(
      "Roster lock requires one season entry per member and an even roster from 4 through 16.",
    );
  }

  try {
    if (state.league.mode === "LIVE") {
      await refreshPublishedLiveQuoteHeads({
        leagueId: context.data.leagueId,
        eventIds: state.slate.map((event) => event.key),
      });
    }

    const locked = await supabase
      .schema("api")
      .rpc("lock_live_roster_and_open_week", {
        p_league_id: context.data.leagueId,
        p_idempotency_key: operationKey,
      });
    if (locked.error) {
      return reconcileCommandError({
        commandName: "LOCK_LIVE_ROSTER_AND_OPEN_WEEK",
        completedMessage:
          "The roster and 14-week schedule are frozen, and Week 1 cards are open.",
        errorMessage: locked.error.message,
        link: {
          href: `/l/${context.data.leagueSlug}/card`,
          label: "Open Week 1",
        },
        operationKey,
        slug: context.data.leagueSlug,
        supabase,
      });
    }

    revalidatePath(`/l/${context.data.leagueSlug}/schedule`);
    revalidatePath(`/l/${context.data.leagueSlug}/slate`);
    revalidatePath("/leagues");
    return finish(
      context.data.leagueSlug,
      `Roster locked at ${state.league.memberCount} members. The complete 14-week schedule is frozen and every Week 1 card is open with 1,000 credits.`,
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Live roster lock failed",
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      }),
    );
    if (error instanceof OddsProviderRequestError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof OddsProviderPayloadError) {
      return {
        status: "error",
        message:
          "Complete current odds were not available. The roster remains unlocked.",
      };
    }
    if (error instanceof LiveQuoteRefreshRejectedError) {
      return mutationError(error.message);
    }
    return mutationError("The Live roster lock failed.");
  }
}

const liveScoreImportReceiptSchema = z.object({
  eventCount: z.number().int().positive(),
  pendingCount: z.number().int().nonnegative(),
  liveCount: z.number().int().nonnegative(),
  settledCount: z.number().int().nonnegative(),
  correctedCount: z.number().int().nonnegative(),
  unchangedCount: z.number().int().nonnegative(),
  weekState: z.enum(["LOCKED", "PROVISIONAL"]),
});

export async function importLiveScoresAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  if (!context.success) return mutationError("invalid context");

  const state = await getAuthoritativeLeagueState(context.data.leagueSlug);
  if (
    !state ||
    state.league.id !== context.data.leagueId ||
    !state.commissioner.isCommissioner ||
    state.league.mode !== "LIVE" ||
    !state.week ||
    !["LOCKED", "PROVISIONAL"].includes(state.week.state) ||
    state.slate.length === 0
  ) {
    return mutationError(
      "Live score imports require locked cards and an unfinalized week.",
    );
  }

  try {
    const scoreImport = await fetchNflScores({
      eventIds: state.slate.map((event) => event.key),
    });
    const payloadHash = createHash("sha256")
      .update(JSON.stringify(scoreImport))
      .digest("hex");
    const supabase = await createSupabaseServerClient();
    const operationKey = `live-scores:${payloadHash}`;
    if (
      await operationAlreadyCompleted(
        supabase,
        "IMPORT_LIVE_SCORES",
        operationKey,
      )
    ) {
      return completed(
        context.data.leagueSlug,
        "That exact NFL score update is already recorded; no result or settlement was duplicated.",
        {
          href: `/l/${context.data.leagueSlug}/matchup`,
          label: "Review the current matchup",
        },
      );
    }
    const imported = await supabase.schema("api").rpc("import_live_scores", {
      p_league_id: context.data.leagueId,
      p_import: scoreImport as unknown as Json,
      p_idempotency_key: operationKey,
    });
    if (imported.error) return mutationError(imported.error.message);

    const receipt = liveScoreImportReceiptSchema.safeParse(imported.data);
    if (!receipt.success) {
      return mutationError("The stored live score receipt is invalid.");
    }

    return finish(
      context.data.leagueSlug,
      `${receipt.data.eventCount} NFL games checked: ${receipt.data.settledCount} newly settled, ${receipt.data.correctedCount} corrected, ${receipt.data.liveCount} live, ${receipt.data.pendingCount} pending, and ${receipt.data.unchangedCount} unchanged.`,
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Live score import failed",
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      }),
    );
    if (error instanceof OddsProviderRequestError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof OddsProviderPayloadError) {
      return {
        status: "error",
        message: "The score update was incomplete. No results were changed.",
      };
    }
    return mutationError("The live score import failed.");
  }
}

const objectiveScoreSchema = z
  .string()
  .regex(/^\d{1,3}$/)
  .transform(Number);

export async function correctLiveEventResultAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  const correction = z
    .object({
      eventId: z.uuid(),
      awayScore: objectiveScoreSchema,
      homeScore: objectiveScoreSchema,
      reason: z.string().trim().min(10).max(500),
    })
    .safeParse({
      eventId: formData.get("eventId"),
      awayScore: formData.get("awayScore"),
      homeScore: formData.get("homeScore"),
      reason: formData.get("reason"),
    });
  if (!context.success || !correction.success) {
    return {
      status: "error",
      message:
        "Enter both objective final scores and a correction reason of at least 10 characters.",
    };
  }

  const lateWeek17 = formData.get("correctionScope") === "FINALIZED_WEEK17";
  const commandName = lateWeek17
    ? "CORRECT_FINALIZED_WEEK17_RESULT"
    : "RECORD_STAGE1_RESULT";
  const operationKey = stableOperationKey({
    awayScore: correction.data.awayScore,
    command: commandName,
    eventId: correction.data.eventId,
    homeScore: correction.data.homeScore,
    reason: correction.data.reason,
  });
  const supabase = await createSupabaseServerClient();
  if (await operationAlreadyCompleted(supabase, commandName, operationKey)) {
    return completed(
      context.data.leagueSlug,
      lateWeek17
        ? "That Week 17 correction and its affected champion history are already recorded."
        : "That corrected result and its affected scores are already recorded.",
      {
        href: `/l/${context.data.leagueSlug}/matchup`,
        label: "Review the current result",
      },
    );
  }

  const state = await getAuthoritativeLeagueState(context.data.leagueSlug);
  if (
    !state ||
    state.league.id !== context.data.leagueId ||
    !state.commissioner.isCommissioner
  ) {
    return mutationError("A Live-league commissioner is required.");
  }
  if (
    lateWeek17 &&
    !["CHAMPION_FINAL", "WEEK_18_EXHIBITION", "FINAL"].includes(
      state.league.lifecycle,
    )
  ) {
    return mutationError(
      "Late Week 17 corrections require confirmed champion history.",
    );
  }
  const result = await supabase
    .schema("api")
    .rpc(
      lateWeek17
        ? "correct_finalized_week17_result"
        : "correct_live_event_result",
      {
        p_event_id: correction.data.eventId,
        p_status: "FINAL",
        p_away_score: correction.data.awayScore,
        p_home_score: correction.data.homeScore,
        p_reason: correction.data.reason,
        p_idempotency_key: operationKey,
      },
    );
  if (result.error) {
    return reconcileCommandError({
      commandName,
      completedMessage: lateWeek17
        ? "That Week 17 correction and its affected champion history are already recorded."
        : "That corrected result and its affected scores are already recorded.",
      errorMessage: result.error.message,
      link: {
        href: `/l/${context.data.leagueSlug}/matchup`,
        label: "Review the current result",
      },
      operationKey,
      slug: context.data.leagueSlug,
      supabase,
    });
  }
  return finish(
    context.data.leagueSlug,
    lateWeek17
      ? "The documented Week 17 correction and affected champion history were appended. Protected Week 18 facts were preserved."
      : "The correction was recorded, and the affected scores and standings were updated.",
  );
}

export async function voidLiveEventAfterPostponementAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  const eventId = z.uuid().safeParse(formData.get("eventId"));
  if (!context.success || !eventId.success) {
    return mutationError("invalid event");
  }

  const operationKey = stableOperationKey({
    command: "RECORD_STAGE1_RESULT",
    eventId: eventId.data,
    result: "VOID_AFTER_POSTPONEMENT",
  });
  const supabase = await createSupabaseServerClient();
  if (
    await operationAlreadyCompleted(
      supabase,
      "RECORD_STAGE1_RESULT",
      operationKey,
    )
  ) {
    return completed(
      context.data.leagueSlug,
      "That postponed event is already void and its stakes were returned.",
      {
        href: `/l/${context.data.leagueSlug}/matchup`,
        label: "Review the current matchup",
      },
    );
  }
  const result = await supabase
    .schema("api")
    .rpc("void_live_event_after_postponement_window", {
      p_event_id: eventId.data,
      p_reason:
        "No on-field official result was available within 48 hours of the original scheduled start.",
      p_idempotency_key: operationKey,
    });
  if (result.error) return mutationError(result.error.message);
  return finish(
    context.data.leagueSlug,
    "The event was visibly voided after the 48-hour window. Stakes return to weekly scores without redeployment.",
  );
}

const cardDraftPositionSchema = z.object({
  marketSnapshotId: z.uuid(),
  payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
  stakeCredits: z.number().int().min(50).max(1_000),
});

export async function acceptStage1CardAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = z
    .object({
      leagueSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      positions: z.array(cardDraftPositionSchema).min(1).max(20),
    })
    .safeParse({
      leagueSlug: formData.get("leagueSlug"),
      positions: (() => {
        try {
          return JSON.parse(String(formData.get("positions")));
        } catch {
          return null;
        }
      })(),
    });
  if (!context.success) {
    return {
      status: "error",
      message: "The card draft is invalid. Refresh the slate and try again.",
    };
  }

  const operationKey = stableOperationKey({
    command: "ACCEPT_STAGE1_CARD",
    leagueSlug: context.data.leagueSlug,
    positions: context.data.positions,
  });
  const supabase = await createSupabaseServerClient();
  if (
    await operationAlreadyCompleted(
      supabase,
      "ACCEPT_STAGE1_CARD",
      operationKey,
    )
  ) {
    return completed(
      context.data.leagueSlug,
      "Your original complete card is sealed; no pick was added twice.",
      {
        href: `/l/${context.data.leagueSlug}/card`,
        label: "Open your accepted card",
      },
    );
  }

  const state = await getAuthoritativeLeagueState(context.data.leagueSlug);
  if (!state?.week || !state.ownerCard || state.week.state !== "OPEN") {
    return mutationError("The Week 1 card is not open.");
  }

  const snapshots = new Map(
    state.slate.flatMap((event) =>
      event.markets.map((market) => [market.id, { event, market }] as const),
    ),
  );
  const selected = context.data.positions.flatMap((position) => {
    const snapshot = snapshots.get(position.marketSnapshotId);
    return snapshot ? [{ ...position, ...snapshot }] : [];
  });
  if (selected.length !== context.data.positions.length) {
    return {
      status: "error",
      message: "A selected quote is no longer on this slate. Review the card.",
    };
  }
  if (
    selected.some(
      ({ market, payloadHash }) =>
        market.qualityStatus !== "HEALTHY" ||
        market.payloadHash !== payloadHash,
    )
  ) {
    return mutationError("QUOTE_CHANGED");
  }

  const eligibleByMarket = new Map<
    string,
    {
      eventId: string;
      marketType: "MONEYLINE" | "SPREAD" | "TOTAL";
      americanOdds: number;
    }
  >();
  for (const event of state.slate) {
    for (const market of event.markets) {
      if (market.qualityStatus !== "HEALTHY") continue;
      const key = `${event.id}:${market.marketType}`;
      const current = eligibleByMarket.get(key);
      if (
        !current ||
        maximumStakeForOdds(market.americanOdds, simulationSeason1Ruleset) >
          maximumStakeForOdds(current.americanOdds, simulationSeason1Ruleset)
      ) {
        eligibleByMarket.set(key, {
          eventId: event.id,
          marketType: market.marketType,
          americanOdds: market.americanOdds,
        });
      }
    }
  }

  const validation = validateDraftCard({
    acceptedPositions: state.ownerCard.positions.map((position) => ({
      eventId: position.eventId,
      marketType: position.marketType,
      stakeCredits: position.stakeCredits,
      americanOdds: position.americanOdds,
    })),
    draftPositions: selected.map(({ event, market, stakeCredits }) => ({
      eventId: event.id,
      marketType: market.marketType,
      stakeCredits,
      americanOdds: market.americanOdds,
    })),
    eligibleOpportunities: [...eligibleByMarket.values()],
    ruleset: simulationSeason1Ruleset,
  });
  if (!validation.accepted) {
    return { status: "error", message: validation.message };
  }

  const result = await supabase.schema("api").rpc("accept_stage1_card", {
    p_league_slug: context.data.leagueSlug,
    p_positions: context.data.positions as unknown as Json,
    p_idempotency_key: operationKey,
  });
  if (result.error) {
    return reconcileCommandError({
      commandName: "ACCEPT_STAGE1_CARD",
      completedMessage:
        "Your original complete card is sealed; no pick was added twice.",
      errorMessage: result.error.message,
      link: {
        href: `/l/${context.data.leagueSlug}/card`,
        label: "Open your accepted card",
      },
      operationKey,
      slug: context.data.leagueSlug,
      supabase,
    });
  }
  return finish(
    context.data.leagueSlug,
    `${context.data.positions.length} positions accepted together. Your complete card is now sealed.`,
  );
}

export async function advanceStage1ClockAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  const target = z.iso.datetime().safeParse(formData.get("target"));
  if (!context.success || !target.success)
    return mutationError("invalid clock");

  const operationKey = stableOperationKey({
    command: "ADVANCE_STAGE1_CLOCK",
    leagueId: context.data.leagueId,
    target: target.data,
  });
  const supabase = await createSupabaseServerClient();
  if (
    await operationAlreadyCompleted(
      supabase,
      "ADVANCE_STAGE1_CLOCK",
      operationKey,
    )
  ) {
    return completed(
      context.data.leagueSlug,
      "The practice clock already reached that time.",
    );
  }
  const result = await supabase.schema("api").rpc("advance_simulated_time", {
    p_league_id: context.data.leagueId,
    p_target: target.data,
    p_idempotency_key: operationKey,
  });
  if (result.error) return mutationError(result.error.message);
  return finish(
    context.data.leagueSlug,
    "Simulation clock advanced. No competitive fact was created.",
  );
}

export async function publishSimulationFixtureWeekAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  const week = z.coerce
    .number()
    .int()
    .min(1)
    .max(18)
    .safeParse(formData.get("week"));
  if (!context.success || !week.success)
    return mutationError("invalid fixture week");
  const operationKey = stableOperationKey({
    command: "PUBLISH_SIMULATION_FIXTURE_WEEK",
    leagueId: context.data.leagueId,
    packId: canonicalSimulationFixturePackId,
    week: week.data,
  });
  const supabase = await createSupabaseServerClient();
  if (
    await operationAlreadyCompleted(
      supabase,
      "PUBLISH_SIMULATION_FIXTURE_WEEK",
      operationKey,
    )
  ) {
    return completed(
      context.data.leagueSlug,
      `Practice/test Week ${week.data} is already available from the approved fixture.`,
      {
        href: `/l/${context.data.leagueSlug}/slate`,
        label: `Open Week ${week.data}`,
      },
    );
  }
  const state = await getAuthoritativeLeagueState(context.data.leagueSlug);
  if (
    !state ||
    state.league.id !== context.data.leagueId ||
    !state.commissioner.isCommissioner ||
    state.league.mode !== "SIMULATION"
  ) {
    return mutationError("A Simulation-league commissioner is required.");
  }
  const result = await supabase
    .schema("api")
    .rpc("publish_simulation_fixture_week", {
      p_league_id: context.data.leagueId,
      p_week: week.data,
      p_pack_id: canonicalSimulationFixturePackId,
      p_idempotency_key: operationKey,
    });
  if (result.error) return mutationError(result.error.message);
  return finish(
    context.data.leagueSlug,
    `Approved Simulation fixture Week ${week.data} published through the shared slate authority.`,
  );
}

export async function applySimulationFixtureResultsAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  const parsed = z
    .object({
      week: z.coerce.number().int().min(1).max(18),
      step: z.enum(["LIVE", "FINAL", "CORRECTION"]),
    })
    .safeParse({ week: formData.get("week"), step: formData.get("step") });
  if (!context.success || !parsed.success)
    return mutationError("invalid fixture result step");
  const operationKey = stableOperationKey({
    command: "APPLY_SIMULATION_FIXTURE_RESULTS",
    leagueId: context.data.leagueId,
    packId: canonicalSimulationFixturePackId,
    step: parsed.data.step,
    week: parsed.data.week,
  });
  const supabase = await createSupabaseServerClient();
  if (
    await operationAlreadyCompleted(
      supabase,
      "APPLY_SIMULATION_FIXTURE_RESULTS",
      operationKey,
    )
  ) {
    return completed(
      context.data.leagueSlug,
      `${parsed.data.step.toLowerCase()} results for practice/test Week ${parsed.data.week} are already recorded.`,
      {
        href: `/l/${context.data.leagueSlug}/matchup`,
        label: "Review the current matchup",
      },
    );
  }
  const state = await getAuthoritativeLeagueState(context.data.leagueSlug);
  if (
    !state ||
    state.league.id !== context.data.leagueId ||
    !state.commissioner.isCommissioner ||
    state.league.mode !== "SIMULATION"
  ) {
    return mutationError("A Simulation-league commissioner is required.");
  }
  const result = await supabase
    .schema("api")
    .rpc("apply_simulation_fixture_results", {
      p_league_id: context.data.leagueId,
      p_week: parsed.data.week,
      p_step: parsed.data.step,
      p_pack_id: canonicalSimulationFixturePackId,
      p_idempotency_key: operationKey,
    });
  if (result.error) return mutationError(result.error.message);
  return finish(
    context.data.leagueSlug,
    `${parsed.data.step} evidence for Simulation Week ${parsed.data.week} applied from the approved fixture pack.`,
  );
}

export async function setStage1EventLiveAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  const parsed = z
    .object({ eventId: z.uuid(), actualStartedAt: z.iso.datetime() })
    .safeParse({
      eventId: formData.get("eventId"),
      actualStartedAt: formData.get("actualStartedAt"),
    });
  if (!context.success || !parsed.success)
    return mutationError("invalid event");

  const operationKey = stableOperationKey({
    actualStartedAt: parsed.data.actualStartedAt,
    command: "SET_STAGE1_EVENT_LIVE",
    eventId: parsed.data.eventId,
  });
  const supabase = await createSupabaseServerClient();
  if (
    await operationAlreadyCompleted(
      supabase,
      "SET_STAGE1_EVENT_LIVE",
      operationKey,
    )
  ) {
    return completed(
      context.data.leagueSlug,
      "That kickoff is already confirmed and its picks can reveal.",
    );
  }
  const result = await supabase.schema("api").rpc("set_stage1_event_live", {
    p_event_id: parsed.data.eventId,
    p_actual_started_at: parsed.data.actualStartedAt,
    p_idempotency_key: operationKey,
  });
  if (result.error) return mutationError(result.error.message);
  return finish(
    context.data.leagueSlug,
    "Kickoff confirmed. Picks for this game can now reveal.",
  );
}

export async function lockStage1WeekAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  if (!context.success) return mutationError("invalid context");
  const state = await getAuthoritativeLeagueState(context.data.leagueSlug);
  const weekNumber = state?.week?.nflWeek ?? 1;

  const operationKey = stableOperationKey({
    command: "LOCK_STAGE1_WEEK",
    leagueId: context.data.leagueId,
    week: weekNumber,
  });
  const supabase = await createSupabaseServerClient();
  if (
    await operationAlreadyCompleted(supabase, "LOCK_STAGE1_WEEK", operationKey)
  ) {
    return completed(
      context.data.leagueSlug,
      `Week ${weekNumber} cards are already locked.`,
      {
        href: `/l/${context.data.leagueSlug}/matchup`,
        label: "Open the matchup",
      },
    );
  }
  const result = await supabase.schema("api").rpc("lock_stage1_week", {
    p_league_id: context.data.leagueId,
    p_idempotency_key: operationKey,
  });
  if (result.error) return mutationError(result.error.message);
  return finish(
    context.data.leagueSlug,
    `Week ${weekNumber} locked. Only readiness—not sealed terms—is now visible.`,
  );
}

export async function finalizeStage1WeekAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  if (!context.success) return mutationError("invalid context");
  const state = await getAuthoritativeLeagueState(context.data.leagueSlug);
  const weekNumber = state?.week?.nflWeek ?? 1;

  const operationKey = stableOperationKey({
    command: "FINALIZE_STAGE1_WEEK",
    leagueId: context.data.leagueId,
    week: weekNumber,
  });
  const supabase = await createSupabaseServerClient();
  if (
    await operationAlreadyCompleted(
      supabase,
      "FINALIZE_STAGE1_WEEK",
      operationKey,
    )
  ) {
    return completed(
      context.data.leagueSlug,
      `Week ${weekNumber} is already final.`,
      {
        href: `/l/${context.data.leagueSlug}/matchup`,
        label: "Open the final matchup",
      },
    );
  }
  const result = await supabase.schema("api").rpc("finalize_stage1_week", {
    p_league_id: context.data.leagueId,
    p_idempotency_key: operationKey,
  });
  if (result.error) return mutationError(result.error.message);
  return finish(
    context.data.leagueSlug,
    `Week ${weekNumber} finalized with append-only final score, matchup, and cumulative standings versions.`,
  );
}
