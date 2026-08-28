"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  stage1CorrectionResult,
  stage1InitialResults,
  stage1WeekOneFixture,
} from "@/adapters/simulation/stage1-week-one";
import {
  fetchNflOdds,
  fetchNflScores,
  OddsProviderRequestError,
} from "@/adapters/providers/the-odds-api/client";
import { OddsProviderPayloadError } from "@/adapters/providers/the-odds-api/normalize";
import type { Json } from "@/adapters/supabase/database.types";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import type { AppActionState } from "@/application/actions/action-state";
import { getLiveStage1League } from "@/application/queries/get-live-stage1-league";
import { validateDraftCard } from "@/domain/cards/validate-card-draft";
import { maximumStakeForOdds } from "@/domain/cards/validate-position";
import {
  simulateSeason,
  type SimulationMember,
} from "@/domain/season/simulate";
import { simulationSeason1Ruleset } from "@/rulesets/simulation-season-1";

const contextSchema = z.object({
  leagueId: z.uuid(),
  leagueSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

function parseContext(formData: FormData) {
  return contextSchema.safeParse({
    leagueId: formData.get("leagueId"),
    leagueSlug: formData.get("leagueSlug"),
  });
}

function idempotencyKey(command: string): string {
  return `${command}:${crypto.randomUUID()}`;
}

function mutationError(message: string): AppActionState {
  if (message.includes("QUOTE_CHANGED")) {
    return {
      status: "error",
      message:
        "The quote changed. Review the current terms before confirming again.",
    };
  }
  if (message.includes("exactly eight")) {
    return {
      status: "error",
      message:
        "Stage 1 starts when exactly eight members have joined this league.",
    };
  }
  if (message.includes("even roster") || message.includes("4 through 16")) {
    return {
      status: "error",
      message: "The season requires an even roster from 4 through 16 members.",
    };
  }
  if (message.includes("before interactive play begins")) {
    return {
      status: "error",
      message:
        "The full-season simulation can publish only before interactive Week 1 begins.",
    };
  }
  if (message.includes("Common lock has not arrived")) {
    return {
      status: "error",
      message:
        "Advance the simulation clock to common lock before locking cards.",
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
      message: "Allocate exactly 1,000 credits before sealing the card.",
    };
  }
  if (message.includes("live odds event count")) {
    return {
      status: "error",
      message:
        "The provider returned too many games for one weekly import. No odds were stored.",
    };
  }
  if (message.includes("Select between one and 32")) {
    return {
      status: "error",
      message: "Select at least one imported NFL event before publishing.",
    };
  }
  if (message.includes("already reached common lock")) {
    return {
      status: "error",
      message:
        "At least one selected event has reached common lock. Import current markets and review a future slate.",
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
        "A newer NFL market import is available. Refresh the commissioner page and review it before publishing.",
    };
  }
  if (message.includes("live score batch must match")) {
    return {
      status: "error",
      message:
        "The provider did not return every published game. The existing quotes remain current and unchanged.",
    };
  }
  if (message.includes("cannot change a published event")) {
    return {
      status: "error",
      message:
        "The provider changed a published game identity or kickoff. No quote was refreshed.",
    };
  }
  if (message.includes("cannot move an observation backward")) {
    return {
      status: "error",
      message:
        "The provider returned an older observation. The newer stored quotes remain current.",
    };
  }
  if (message.includes("reached common lock")) {
    return {
      status: "error",
      message: "Odds cannot refresh after the published common lock.",
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
      message:
        "Week 14 is complete; the next operation is playoff qualification.",
    };
  }
  if (message.includes("Week 14 must be final")) {
    return {
      status: "error",
      message:
        "Finalize Week 14 and its correction window before freezing playoff qualification.",
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
      message:
        "The provider did not return every published game. No result was imported.",
    };
  }
  if (message.includes("live score import is not fresh")) {
    return {
      status: "error",
      message:
        "The provider result batch was stale. Request current scores again.",
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
    message: "The command was rejected without changing competitive history.",
  };
}

function initials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "SL";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

export async function publishSimulationSeasonArchiveAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  if (!context.success) return mutationError("invalid context");

  const state = await getLiveStage1League(context.data.leagueSlug);
  if (
    !state ||
    state.league.id !== context.data.leagueId ||
    !state.commissioner.isCommissioner
  ) {
    return mutationError("Commissioner membership required.");
  }
  if (state.league.lifecycle !== "DRAFT" || state.week) {
    return mutationError(
      "A simulation archive must publish before interactive play begins.",
    );
  }
  if (
    state.league.memberCount < 4 ||
    state.league.memberCount > 16 ||
    state.league.memberCount % 2 !== 0
  ) {
    return mutationError(
      "A simulation archive requires an even roster from 4 through 16.",
    );
  }
  if (state.members.some((member) => member.entryId === null)) {
    return mutationError("The season roster is not ready.");
  }

  const members: SimulationMember[] = state.members.map((member) => {
    const entryId = member.entryId as string;
    return {
      entryId,
      displayName: member.displayName,
      initials: initials(member.displayName),
      deterministicTiebreak: createHash("sha256")
        .update(`${state.season.scheduleSeed}:${entryId}:standings`)
        .digest("hex"),
    };
  });
  const archive = simulateSeason({
    members,
    scheduleSeed: state.season.scheduleSeed,
    nflYear: state.league.nflYear,
    viewerEntryId: state.viewer.entryId,
  });
  const archiveHash = createHash("sha256")
    .update(JSON.stringify(archive))
    .digest("hex");

  const supabase = await createSupabaseServerClient();
  const result = await supabase
    .schema("api")
    .rpc("publish_simulation_season_archive", {
      p_league_id: context.data.leagueId,
      p_archive_json: archive as unknown as Json,
      p_idempotency_key: `publish-season:${archiveHash}`,
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

  const champion = members.find(
    (member) => member.entryId === archive.playoffs.championEntryId,
  );
  return {
    status: "success",
    message: `The 14-week season, playoffs, and Week 18 exhibitions are final. ${champion?.displayName ?? "The champion"} won the league.`,
    href: `/l/${context.data.leagueSlug}/matchup`,
    hrefLabel: "Open the completed season",
  };
}

async function finish(slug: string, message: string): Promise<AppActionState> {
  revalidatePath(`/l/${slug}`);
  revalidatePath(`/l/${slug}/matchup`);
  revalidatePath(`/l/${slug}/card`);
  revalidatePath(`/l/${slug}/live`);
  revalidatePath(`/l/${slug}/standings`);
  revalidatePath(`/l/${slug}/commissioner`);
  return { status: "success", message };
}

export async function createLeagueInviteAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  if (!context.success) return mutationError("invalid context");

  const supabase = await createSupabaseServerClient();
  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const result = await supabase.schema("api").rpc("create_league_invite", {
    p_league_id: context.data.leagueId,
    p_expires_at: expiresAt,
    p_max_uses: 15,
  });
  if (result.error) return mutationError(result.error.message);

  return {
    status: "success",
    message:
      "Invitation created for up to 15 joins. Share it privately; it expires in seven days.",
    value: result.data,
  };
}

export async function importLiveOddsAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  if (!context.success) return mutationError("invalid context");

  const state = await getLiveStage1League(context.data.leagueSlug);
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
    const result = await supabase.schema("api").rpc("store_live_odds_import", {
      p_league_id: context.data.leagueId,
      p_import: liveImport as unknown as Json,
      p_idempotency_key: `live-odds:${payloadHash}`,
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
          "The provider response failed validation. No odds were stored or published.",
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

  const state = await getLiveStage1League(context.data.leagueSlug);
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

  const supabase = await createSupabaseServerClient();
  const result = await supabase.schema("api").rpc("publish_live_week_slate", {
    p_league_id: context.data.leagueId,
    p_import_id: selection.data.importId,
    p_external_event_ids: selection.data.externalEventIds,
    p_idempotency_key: idempotencyKey("publish-live-slate"),
  });
  if (result.error) return mutationError(result.error.message);

  revalidatePath(`/l/${context.data.leagueSlug}`);
  revalidatePath(`/l/${context.data.leagueSlug}/slate`);
  revalidatePath(`/l/${context.data.leagueSlug}/commissioner`);
  return {
    status: "success",
    message: `${selection.data.externalEventIds.length} NFL events published to the immutable Week 1 slate. Cards remain closed until the roster and schedule are locked.`,
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

  const state = await getLiveStage1League(context.data.leagueSlug);
  if (
    !state ||
    state.league.id !== context.data.leagueId ||
    !state.commissioner.isCommissioner ||
    state.league.mode !== "LIVE" ||
    state.league.lifecycle !== "REGULAR" ||
    state.week?.state !== "FINAL" ||
    state.week.nflWeek >= 14
  ) {
    return mutationError(
      "The current week must be final before the next week can publish.",
    );
  }

  const nextWeek = state.week.nflWeek + 1;
  const supabase = await createSupabaseServerClient();
  const result = await supabase
    .schema("api")
    .rpc("publish_next_live_week_slate", {
      p_league_id: context.data.leagueId,
      p_import_id: selection.data.importId,
      p_external_event_ids: selection.data.externalEventIds,
      p_idempotency_key: idempotencyKey(`publish-live-week-${nextWeek}`),
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
    message: `Week ${nextWeek} is open: the frozen matchup and fresh 1,000-credit cards are published with ${selection.data.externalEventIds.length} NFL events.`,
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

  const state = await getLiveStage1League(context.data.leagueSlug);
  if (
    !state ||
    state.league.id !== context.data.leagueId ||
    !state.commissioner.isCommissioner ||
    state.league.mode !== "LIVE" ||
    state.league.lifecycle !== "REGULAR" ||
    state.week?.state !== "FINAL" ||
    state.week.nflWeek !== 14
  ) {
    return mutationError(
      "Week 14 must be final before playoff qualification can publish.",
    );
  }

  const supabase = await createSupabaseServerClient();
  const result = await supabase
    .schema("api")
    .rpc("publish_live_playoff_qualification", {
      p_league_id: context.data.leagueId,
      p_idempotency_key: idempotencyKey("publish-live-playoff-qualification"),
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
      "The Week 14 ordering, attendance eligibility, qualification seeds, and bracket template are now immutable.",
    href: `/l/${context.data.leagueSlug}/playoffs`,
    hrefLabel: "Open the official bracket",
  };
}

const storedLiveImportSchema = z.object({ importId: z.uuid() });

class LiveQuoteRefreshRejectedError extends Error {}

async function refreshPublishedLiveQuoteHeads(params: {
  eventIds: string[];
  leagueId: string;
}): Promise<number> {
  const liveImport = await fetchNflOdds({ eventIds: params.eventIds });
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(liveImport))
    .digest("hex");
  const supabase = await createSupabaseServerClient();
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
      p_idempotency_key: `refresh-live:${payloadHash}`,
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

  return liveImport.events.length;
}

export async function refreshLiveWeekQuotesAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  if (!context.success) return mutationError("invalid context");

  const state = await getLiveStage1League(context.data.leagueSlug);
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
    const eventCount = await refreshPublishedLiveQuoteHeads({
      leagueId: context.data.leagueId,
      eventIds: state.slate.map((event) => event.key),
    });

    revalidatePath(`/l/${context.data.leagueSlug}`);
    revalidatePath(`/l/${context.data.leagueSlug}/slate`);
    revalidatePath(`/l/${context.data.leagueSlug}/card`);
    revalidatePath(`/l/${context.data.leagueSlug}/commissioner`);
    return {
      status: "success",
      message: `${eventCount} published games refreshed. The eligible games and common lock did not change.`,
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
          "The provider did not return a complete valid quote set. Existing published quotes were not changed.",
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

  const state = await getLiveStage1League(context.data.leagueSlug);
  if (
    !state ||
    state.league.id !== context.data.leagueId ||
    !state.commissioner.isCommissioner ||
    state.league.mode !== "LIVE" ||
    state.league.lifecycle !== "DRAFT" ||
    state.week?.state !== "PLANNED" ||
    state.slate.length === 0
  ) {
    return mutationError("A planned Live Week 1 slate is required.");
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
    await refreshPublishedLiveQuoteHeads({
      leagueId: context.data.leagueId,
      eventIds: state.slate.map((event) => event.key),
    });

    const supabase = await createSupabaseServerClient();
    const locked = await supabase
      .schema("api")
      .rpc("lock_live_roster_and_open_week", {
        p_league_id: context.data.leagueId,
        p_idempotency_key: idempotencyKey("lock-live-roster"),
      });
    if (locked.error) return mutationError(locked.error.message);

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
          "The provider did not return a complete valid quote set. The roster remains unlocked.",
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

  const state = await getLiveStage1League(context.data.leagueSlug);
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
    const imported = await supabase.schema("api").rpc("import_live_scores", {
      p_league_id: context.data.leagueId,
      p_import: scoreImport as unknown as Json,
      p_idempotency_key: `live-scores:${payloadHash}`,
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
        message:
          "The provider returned an incomplete or inconsistent score slate. No result was imported.",
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

  const supabase = await createSupabaseServerClient();
  const result = await supabase.schema("api").rpc("correct_live_event_result", {
    p_event_id: correction.data.eventId,
    p_status: "FINAL",
    p_away_score: correction.data.awayScore,
    p_home_score: correction.data.homeScore,
    p_reason: correction.data.reason,
    p_idempotency_key: idempotencyKey("correct-live-result"),
  });
  if (result.error) return mutationError(result.error.message);
  return finish(
    context.data.leagueSlug,
    "The objective correction was appended. Receipts remained immutable while every downstream competitive version replayed.",
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

  const supabase = await createSupabaseServerClient();
  const result = await supabase
    .schema("api")
    .rpc("void_live_event_after_postponement_window", {
      p_event_id: eventId.data,
      p_reason:
        "No on-field official result was available within 48 hours of the original scheduled start.",
      p_idempotency_key: idempotencyKey("void-live-event"),
    });
  if (result.error) return mutationError(result.error.message);
  return finish(
    context.data.leagueSlug,
    "The event was visibly voided after the 48-hour window. Stakes return to weekly scores without redeployment.",
  );
}

export async function initializeStage1WeekAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  if (!context.success) return mutationError("invalid context");

  const supabase = await createSupabaseServerClient();
  const result = await supabase.schema("api").rpc("initialize_stage1_week", {
    p_league_id: context.data.leagueId,
    p_fixture: stage1WeekOneFixture as unknown as Json,
    p_idempotency_key: idempotencyKey("initialize"),
  });
  if (result.error) return mutationError(result.error.message);
  return finish(
    context.data.leagueSlug,
    "Week 1 published: four matchups, eight 1,000-credit grants, and the deterministic slate are stored.",
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

  const state = await getLiveStage1League(context.data.leagueSlug);
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

  const supabase = await createSupabaseServerClient();
  const result = await supabase.schema("api").rpc("accept_stage1_card", {
    p_league_slug: context.data.leagueSlug,
    p_positions: context.data.positions as unknown as Json,
    p_idempotency_key: idempotencyKey("card"),
  });
  if (result.error) return mutationError(result.error.message);
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

  const supabase = await createSupabaseServerClient();
  const result = await supabase.schema("api").rpc("advance_stage1_clock", {
    p_league_id: context.data.leagueId,
    p_target: target.data,
    p_idempotency_key: idempotencyKey("clock"),
  });
  if (result.error) return mutationError(result.error.message);
  return finish(
    context.data.leagueSlug,
    "Simulation clock advanced. No result was created automatically.",
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

  const supabase = await createSupabaseServerClient();
  const result = await supabase.schema("api").rpc("set_stage1_event_live", {
    p_event_id: parsed.data.eventId,
    p_actual_started_at: parsed.data.actualStartedAt,
    p_idempotency_key: idempotencyKey("live"),
  });
  if (result.error) return mutationError(result.error.message);
  return finish(
    context.data.leagueSlug,
    "Actual kickoff confirmed. Associated positions are now revealable.",
  );
}

export async function lockStage1WeekAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  if (!context.success) return mutationError("invalid context");
  const state = await getLiveStage1League(context.data.leagueSlug);
  const weekNumber = state?.week?.nflWeek ?? 1;

  const supabase = await createSupabaseServerClient();
  const result = await supabase.schema("api").rpc("lock_stage1_week", {
    p_league_id: context.data.leagueId,
    p_idempotency_key: idempotencyKey("lock"),
  });
  if (result.error) return mutationError(result.error.message);
  return finish(
    context.data.leagueSlug,
    `Week ${weekNumber} locked. Only readiness—not sealed terms—is now visible.`,
  );
}

export async function recordStage1ResultAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  const parsed = z
    .object({ eventId: z.uuid(), eventKey: z.string() })
    .safeParse({
      eventId: formData.get("eventId"),
      eventKey: formData.get("eventKey"),
    });
  if (!context.success || !parsed.success)
    return mutationError("invalid result");
  const fixtureResult = stage1InitialResults.find(
    (result) => result.eventKey === parsed.data.eventKey,
  );
  if (!fixtureResult) return mutationError("unknown fixture result");

  const supabase = await createSupabaseServerClient();
  const result = await supabase.schema("api").rpc("record_stage1_result", {
    p_event_id: parsed.data.eventId,
    p_status: fixtureResult.status,
    p_away_score: fixtureResult.awayScore,
    p_home_score: fixtureResult.homeScore,
    p_reason: fixtureResult.reason,
    p_source: "SIMULATION_FIXTURE",
    p_idempotency_key: idempotencyKey(`result:${parsed.data.eventKey}`),
  });
  if (result.error) return mutationError(result.error.message);
  return finish(
    context.data.leagueSlug,
    "Objective result stored and the affected competitive versions replayed.",
  );
}

export async function correctStage1ResultAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  const eventId = z.uuid().safeParse(formData.get("eventId"));
  if (!context.success || !eventId.success)
    return mutationError("invalid correction");

  const supabase = await createSupabaseServerClient();
  const result = await supabase.schema("api").rpc("record_stage1_result", {
    p_event_id: eventId.data,
    p_status: stage1CorrectionResult.status,
    p_away_score: stage1CorrectionResult.awayScore,
    p_home_score: stage1CorrectionResult.homeScore,
    p_reason: stage1CorrectionResult.reason,
    p_source: "SIMULATION_FIXTURE",
    p_idempotency_key: idempotencyKey("correction:buf-nyj"),
  });
  if (result.error) return mutationError(result.error.message);
  return finish(
    context.data.leagueSlug,
    "Correction appended. Receipts stayed immutable while settlements and standings replayed.",
  );
}

export async function finalizeStage1WeekAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = parseContext(formData);
  if (!context.success) return mutationError("invalid context");
  const state = await getLiveStage1League(context.data.leagueSlug);
  const weekNumber = state?.week?.nflWeek ?? 1;

  const supabase = await createSupabaseServerClient();
  const result = await supabase.schema("api").rpc("finalize_stage1_week", {
    p_league_id: context.data.leagueId,
    p_idempotency_key: idempotencyKey("finalize"),
  });
  if (result.error) return mutationError(result.error.message);
  return finish(
    context.data.leagueSlug,
    `Week ${weekNumber} finalized with append-only final score, matchup, and cumulative standings versions.`,
  );
}
