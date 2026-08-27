"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  stage1CorrectionResult,
  stage1InitialResults,
  stage1WeekOneFixture,
} from "@/adapters/simulation/stage1-week-one";
import type { Json } from "@/adapters/supabase/database.types";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import type { AppActionState } from "@/application/actions/action-state";
import { getLiveStage1League } from "@/application/queries/get-live-stage1-league";
import { validateProposedPosition } from "@/domain/cards/validate-position";
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
      message:
        "A full-season simulation requires an even roster from 4 through 16 members.",
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
  if (message.includes("correction window")) {
    return {
      status: "error",
      message:
        "Advance the simulation clock beyond the correction window first.",
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

export async function acceptStage1PositionAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const parsed = z
    .object({
      leagueSlug: z.string(),
      marketSnapshotId: z.uuid(),
      payloadHash: z.string().length(64),
      stakeCredits: z.coerce.number().int(),
    })
    .safeParse({
      leagueSlug: formData.get("leagueSlug"),
      marketSnapshotId: formData.get("marketSnapshotId"),
      payloadHash: formData.get("payloadHash"),
      stakeCredits: formData.get("stakeCredits"),
    });
  if (!parsed.success) {
    return { status: "error", message: "Enter a whole-credit position." };
  }

  const state = await getLiveStage1League(parsed.data.leagueSlug);
  const selected = state?.slate
    .flatMap((event) => event.markets.map((market) => ({ event, market })))
    .find(({ market }) => market.id === parsed.data.marketSnapshotId);
  if (!state?.ownerCard || !selected) return mutationError("missing card");

  const validation = validateProposedPosition({
    acceptedPositions: state.ownerCard.positions.map((position) => ({
      eventId: position.eventId,
      marketType: position.marketType,
      stakeCredits: position.stakeCredits,
      americanOdds: position.americanOdds,
    })),
    proposedPosition: {
      eventId: selected.event.id,
      marketType: selected.market.marketType,
      stakeCredits: parsed.data.stakeCredits,
      americanOdds: selected.market.americanOdds,
    },
    eligibleOpportunities: state.slate.flatMap((event) =>
      event.markets
        .filter((market) => market.qualityStatus === "HEALTHY")
        .map((market) => ({
          eventId: event.id,
          marketType: market.marketType,
          americanOdds: market.americanOdds,
        })),
    ),
    ruleset: simulationSeason1Ruleset,
  });
  if (!validation.accepted) {
    return { status: "error", message: validation.message };
  }

  const supabase = await createSupabaseServerClient();
  const result = await supabase.schema("api").rpc("accept_stage1_position", {
    p_league_slug: parsed.data.leagueSlug,
    p_market_snapshot_id: parsed.data.marketSnapshotId,
    p_stake_credits: parsed.data.stakeCredits,
    p_expected_payload_hash: parsed.data.payloadHash,
    p_idempotency_key: idempotencyKey("position"),
  });
  if (result.error) return mutationError(result.error.message);
  return finish(
    parsed.data.leagueSlug,
    "Position accepted and sealed with an immutable receipt.",
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

  const supabase = await createSupabaseServerClient();
  const result = await supabase.schema("api").rpc("lock_stage1_week", {
    p_league_id: context.data.leagueId,
    p_idempotency_key: idempotencyKey("lock"),
  });
  if (result.error) return mutationError(result.error.message);
  return finish(
    context.data.leagueSlug,
    "Week 1 locked. Only readiness—not sealed terms—is now visible.",
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

  const supabase = await createSupabaseServerClient();
  const result = await supabase.schema("api").rpc("finalize_stage1_week", {
    p_league_id: context.data.leagueId,
    p_idempotency_key: idempotencyKey("finalize"),
  });
  if (result.error) return mutationError(result.error.message);
  return finish(
    context.data.leagueSlug,
    "Week 1 finalized with append-only final score, matchup, and standings versions.",
  );
}
