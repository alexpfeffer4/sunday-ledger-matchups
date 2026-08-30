import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { projectPairedMatchup } from "@/application/queries/project-paired-matchup";
import {
  makePhase6Matchup,
  makePhase6State,
} from "../fixtures/phase6-paired-matchup";

describe("Phase 6 paired matchup projection", () => {
  it.each([
    "PREGAME",
    "LOCKED",
    "PARTIAL_REVEAL",
    "LIVE",
    "DELAYED",
    "PROVISIONAL",
    "FINAL",
    "CORRECTED",
  ] as const)("projects the %s variant from stored facts", (phase) => {
    expect(makePhase6Matchup(phase).phase).toBe(phase);
  });

  it("keeps own and authorized opponent rows in stable event order", () => {
    const partial = makePhase6Matchup("PARTIAL_REVEAL");

    expect(
      partial.rows.SETTLED.map((row) => [row.eventLabel, row.side]),
    ).toEqual([
      ["Harbor Club at Lake Club", "SELF"],
      ["Harbor Club at Lake Club", "OPPONENT"],
    ]);
    expect(partial.rows.REMAINING.map((row) => row.side)).toEqual(["SELF"]);
    expect(partial.futureSealed).toBe(true);
  });

  it("derives partial returns but omits an inexact opponent path", () => {
    const partial = makePhase6Matchup("PARTIAL_REVEAL");

    expect(partial.self.scoreCenticredits).toBe(20_000);
    expect(partial.opponent.scoreCenticredits).toBe(0);
    expect(partial.scorePath.selfRemainingMaximumCenticredits).toBe(20_000);
    expect(partial.scorePath.opponentRemainingMaximumCenticredits).toBeNull();
    expect(partial.scorePath.sentence).toMatch(/exact remaining path is not/);
  });

  it("uses the latest official matchup result for provisional and final scores", () => {
    const provisional = makePhase6Matchup("PROVISIONAL");
    const final = makePhase6Matchup("FINAL");

    expect(provisional.self.scoreCenticredits).toBe(40_000);
    expect(provisional.opponent.scoreCenticredits).toBe(20_000);
    expect(provisional.scorePath.opponentRemainingMaximumCenticredits).toBe(0);
    expect(final.scorePath.sentence).toBe(
      "Alex Ledger leads the official result by 200.00 credits.",
    );
  });

  it("stops when an official paired score cannot be reproduced", () => {
    const { now, operations, state } = makePhase6State("FINAL");
    if (!state.matchup?.result)
      throw new Error("Final fixture result missing.");
    state.matchup.result.selfPointsForCenticredits += 1;

    expect(() => projectPairedMatchup(state, operations, now)).toThrow(
      /does not reproduce from authorized settlements/,
    );
  });

  it("stops when a completed authorized receipt lacks a settlement", () => {
    const { now, operations, state } = makePhase6State("PARTIAL_REVEAL");
    if (!state.ownerCard) throw new Error("Partial fixture card missing.");
    state.ownerCard.positions[0].settlement = null;

    expect(() => projectPairedMatchup(state, operations, now)).toThrow(
      /missing its official settlement/,
    );
  });

  it("does not reveal from scheduled time alone", () => {
    const { now, operations, state } = makePhase6State("DELAYED");
    expect(state.matchup?.opponentRevealedPositions).toEqual([]);

    const matchup = projectPairedMatchup(state, operations, now);
    expect(matchup?.phase).toBe("DELAYED");
    expect(matchup?.rows.IN_PROGRESS).toEqual([]);
    expect(matchup?.futureSealed).toBe(true);
    expect(matchup?.freshness.message).toMatch(/reliable Live state/);
  });

  it("marks corrected official state without changing row identity", () => {
    const corrected = makePhase6Matchup("CORRECTED");

    expect(corrected.correctedCount).toBe(1);
    expect(corrected.rows.SETTLED.map((row) => row.id)).toEqual(
      makePhase6Matchup("FINAL").rows.SETTLED.map((row) => row.id),
    );
    expect(corrected.rows.SETTLED.filter((row) => row.corrected)).toHaveLength(
      2,
    );
  });
});

describe("Phase 6 future-sealed migration", () => {
  it("projects the generic marker from public slate state, not hidden receipts", () => {
    const sql = readFileSync(
      "supabase/migrations/20260830044648_phase6_future_sealed_projection.sql",
      "utf8",
    );
    const replacement = sql.match(
      /v_new constant text := \$new\$([\s\S]*?)\$new\$/,
    )?.[1];

    expect(replacement).toContain("private.sports_events");
    expect(replacement).toContain("event.week_id = v_week.id");
    expect(replacement).not.toContain("position_receipts");
    expect(replacement).not.toContain("v_opponent_card_id");
    expect(sql).toContain("v_occurrences <> 1");
  });
});
