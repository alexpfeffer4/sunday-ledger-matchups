import { describe, expect, it, vi } from "vitest";
import { projectPairedMatchup } from "@/application/queries/project-paired-matchup";
import {
  easternTime,
  scoreFreshness,
} from "@/application/queries/score-freshness";
import { timedCommissionerAction } from "@/application/queries/commissioner-next-action";
import { makePhase6State } from "../fixtures/phase6-paired-matchup";
import type { Stage1CommissionerControlState } from "@/components/commissioner/stage1-controls";

vi.mock("server-only", () => ({}));

describe("checkpoint freshness, without continuous score promises", () => {
  it("expects no further scores between confirmed start and the four-hour check", () => {
    const { state, operations, now } = makePhase6State("LIVE");
    expect(scoreFreshness(operations, now).delayed).toBe(false);
    expect(projectPairedMatchup(state, operations, now)?.phase).toBe("LIVE");
  });
  it("marks an aging LIVE game delayed without re-hiding its revealed receipts", () => {
    const { state, operations } = makePhase6State("LIVE");
    // Make the other selected game genuinely future; only the LIVE game is overdue.
    state.slate[1].scheduledStartAt = "2026-09-14T23:00:00Z";
    operations.events[1].scheduledStartAt = state.slate[1].scheduledStartAt;
    const view = projectPairedMatchup(
      state,
      operations,
      new Date("2026-09-13T23:00:00Z"),
    );
    expect(view?.phase).toBe("DELAYED");
    expect(view?.rows.IN_PROGRESS.some((row) => row.side === "OPPONENT")).toBe(
      true,
    );
    expect(view?.futureSealed).toBe(true);
    expect(view?.scorePath.opponentRemainingMaximumCenticredits).toBeNull();
  });
  it("a fresh fetch of old provider scores is explicitly delayed", () => {
    const { operations } = makePhase6State("LIVE");
    operations.events = [operations.events[0]];
    operations.events[0].scoreCheck = {
      attemptedAt: "2026-09-13T22:02:00Z",
      fetchedAt: "2026-09-13T22:03:00Z",
      sourceUpdatedAt: "2026-09-13T18:03:00Z",
      nextCheckAt: "2026-09-13T22:30:00Z",
      state: "CHECKED",
    };
    expect(
      scoreFreshness(operations, new Date("2026-09-13T22:04:00Z")).delayed,
    ).toBe(true);
  });
  it("does not relabel roster opening or card lock as a successful score check", () => {
    const { state, operations, now } = makePhase6State("LOCKED");
    operations.latestImportAt = null;
    expect(
      projectPairedMatchup(state, operations, now)?.freshness.updatedAt,
    ).toBeNull();
  });
  it("formats operational timestamps in Eastern with seasonal zone labels", () => {
    expect(easternTime("2026-09-13T17:00:00Z")).toMatch(/Sep 13.*1:00 PM EDT/);
    expect(easternTime("2026-12-13T18:00:00Z")).toMatch(/Dec 13.*1:00 PM EST/);
  });
  it("makes lock and correction actions time-aware", () => {
    const { state } = makePhase6State("PREGAME");
    const control = {
      ...state,
      slate: state.slate.map((event) => ({
        ...event,
        latestObservedAt: "2026-09-13T16:00:00Z",
      })),
    } as Stage1CommissionerControlState;
    expect(
      timedCommissionerAction(control, null, new Date("2026-09-14T00:00:00Z"))
        ?.title,
    ).toBe("Lock the week now");
    control.week!.state = "PROVISIONAL";
    control.week!.correctionWindowClosesAt = "2026-09-15T03:00:00Z";
    expect(
      timedCommissionerAction(control, null, new Date("2026-09-14T00:00:00Z"))
        ?.title,
    ).toBe("Review provisional results");
    expect(
      timedCommissionerAction(control, null, new Date("2026-09-16T00:00:00Z"))
        ?.title,
    ).toBe("Review and finalize the week");
  });
});
