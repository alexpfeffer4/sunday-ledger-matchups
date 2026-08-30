import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  projectRivalry,
  projectSeasonMemory,
} from "@/domain/history/project-season-memory";
import { makePhase7State, phase7Ids } from "../fixtures/phase7-season-memory";

describe("Phase 7 deterministic season memory", () => {
  it("bridges the current stored result to official standings and next opponent", () => {
    const memory = projectSeasonMemory(makePhase7State());

    expect(memory.recordBridge?.matchup.status).toBe("PROVISIONAL");
    expect(memory.recordBridge?.matchup.nflWeek).toBe(2);
    expect(memory.recordBridge?.before).toMatchObject({
      wins: 1,
      losses: 0,
      ties: 0,
      pointsForCenticredits: 40_000,
      seed: 1,
    });
    expect(memory.recordBridge?.after).toMatchObject({
      wins: 1,
      losses: 0,
      ties: 1,
      pointsForCenticredits: 55_000,
      seed: 1,
    });
    expect(memory.recordBridge?.nextOpponent).toEqual({
      entryId: phase7Ids.entryD,
      name: "Devon Next",
      nflWeek: 3,
      scope: "REGULAR",
    });
  });

  it("keeps active history final-only and preserves correction lineage", () => {
    const memory = projectSeasonMemory(makePhase7State());

    expect(memory.activeHistory).toHaveLength(1);
    expect(memory.activeHistory[0]).toMatchObject({
      nflWeek: 1,
      status: "FINAL",
      versionId: phase7Ids.result1,
      supersedesVersionId: phase7Ids.previousResult1,
      corrected: true,
    });
    expect(memory.activeHistory[0]?.corrections[0]).toMatchObject({
      actorName: "Commissioner Morgan",
      reason: "Provider corrected the final home score.",
      beforeEvent: "20–20",
      afterEvent: "20–23",
      beforeSideAScoreCenticredits: 30_000,
      afterSideAScoreCenticredits: 40_000,
    });
  });

  it("derives factual all-time rivalry facts without contaminating competitive H2H", () => {
    const memory = projectSeasonMemory(makePhase7State());
    const rivalry = projectRivalry(memory, phase7Ids.entryA, phase7Ids.entryB);

    expect(rivalry).not.toBeNull();
    expect(rivalry?.meetings).toHaveLength(4);
    expect(rivalry?.competitiveMeetings).toHaveLength(2);
    expect(rivalry).toMatchObject({
      memberAWins: 1,
      memberBWins: 1,
      ties: 0,
      averageMarginCenticredits: 20_000,
      playoffMeetings: 1,
      placementMeetings: 1,
      exhibitionMeetings: 1,
      streak: { name: "Alex Ledger", count: 1 },
    });
    expect(
      rivalry?.meetings.find((meeting) => meeting.scope === "EXHIBITION"),
    ).toBeDefined();
  });

  it("does not treat ordinary finalization supersession as a correction", () => {
    const state = makePhase7State();
    state.corrections = [];
    const memory = projectSeasonMemory(state);
    const finalized = memory.finalizedMatchups.find(
      (matchup) => matchup.id === phase7Ids.matchup1,
    );

    expect(finalized?.supersedesVersionId).toBe(phase7Ids.previousResult1);
    expect(finalized?.corrected).toBe(false);
  });

  it("rejects rivalry parameters that are not two current authorized members", () => {
    const memory = projectSeasonMemory(makePhase7State());
    expect(
      projectRivalry(memory, phase7Ids.entryA, phase7Ids.entryA),
    ).toBeNull();
    expect(
      projectRivalry(
        memory,
        phase7Ids.entryA,
        "90000000-0000-4000-8000-000000000099",
      ),
    ).toBeNull();
  });
});

describe("Phase 7 read-model authorization and lineage contract", () => {
  const sql = readFileSync(
    "supabase/migrations/20260830153000_phase7_weekly_close_read_model.sql",
    "utf8",
  );

  it("requires authentication and exact league membership", () => {
    expect(sql).toContain("v_user_id uuid := (select auth.uid())");
    expect(sql).toContain("private.is_league_member(v_league.id)");
    expect(sql).toContain("entry.league_id = v_league.id");
    expect(sql).toContain("revoke execute");
    expect(sql).toContain("to authenticated");
  });

  it("selects terminal leaves and stops on every competing official result class", () => {
    expect(sql.match(/not exists \(/g)?.length).toBeGreaterThanOrEqual(6);
    expect(sql.match(/having count\(\*\) > 1/g)).toHaveLength(4);
    expect(sql).toContain("Competing official event results");
    expect(sql).toContain("Competing official weekly scores");
    expect(sql).toContain("Competing official matchup results");
    expect(sql).toContain("Competing official standings");
    expect(sql).toContain("parent.matchup_id <> child.matchup_id");
  });

  it("keeps the migration additive and D-015 closed", () => {
    expect(sql).not.toMatch(/\b(update|delete from|alter table|drop)\b/i);
    const phase7Ui = [
      "src/components/history/weekly-close-module.tsx",
      "src/components/history/history-ledger.tsx",
      "src/components/history/rivalry-header.tsx",
    ]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(phase7Ui).not.toContain("navigator.clipboard");
    expect(phase7Ui).not.toContain("Share result");
    expect(phase7Ui).not.toContain("public link");
  });
});
