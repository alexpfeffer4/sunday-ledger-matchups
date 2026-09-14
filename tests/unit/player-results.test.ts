import { describe, expect, it } from "vitest";
import { normalizeApiSportsPlayerResults } from "@/adapters/providers/api-sports/normalize-player-results";
import {
  normalizeNflversePlayerResults,
  parseNflverseCsv,
} from "@/adapters/providers/nflverse/normalize-player-results";
import { nextPlayerResultAttempt } from "@/application/providers/player-results";
import { settleReceipt, weeklyScore } from "@/domain/settlement/settle";
import type {
  PlayerReceipt,
  PlayerResultEvidence,
} from "@/domain/settlement/types";

const subjectId = "a0000000-0000-4000-8000-000000000001";
const mapping = {
  subjectId,
  externalPlayerId: "123",
  team: "Test Home",
  statistic: "RECEIVING_YARDS" as const,
};
const context = {
  externalEventId: "odds-event",
  sourceEventId: "456",
  gameDate: "2026-09-13",
  fetchedAt: "2026-09-13T23:10:00.000Z",
  sourceUpdatedAt: "2026-09-13T23:05:00.000Z",
  final: true,
  completeBoxScore: true,
  mappings: [mapping],
};
function box(yards: string | null, receptions = "1") {
  return {
    errors: [],
    parameters: { id: "456" },
    response: [
      {
        team: { id: 1, name: "Test Home" },
        players: [
          {
            player: { id: 123, name: "A. Verified Player" },
            groups: [
              {
                name: "Receiving",
                statistics: [
                  { name: "yards", value: yards },
                  { name: "receptions", value: receptions },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}
const receipt: PlayerReceipt = {
  id: "r",
  eventId: "event",
  marketType: "PLAYER_RECEIVING_YARDS",
  subjectId,
  statistic: "RECEIVING_YARDS",
  period: "FULL_GAME",
  selectedSide: "OVER",
  lineMilli: 50_000,
  americanOdds: -110,
  stakeCredits: 100,
};
const final = {
  eventId: "event",
  status: "FINAL" as const,
  homeScore: 21,
  awayScore: 24,
};
const evidence: PlayerResultEvidence = {
  eventId: "event",
  subjectId,
  statistic: "RECEIVING_YARDS",
  period: "FULL_GAME",
  value: 51,
  complete: true,
  participation: "OFFENSE",
  participationComplete: true,
};

describe("individual yardage evidence", () => {
  it.each([0, -4, 151])("preserves complete integer yardage %i", (value) => {
    const [result] = normalizeApiSportsPlayerResults(
      box(String(value)),
      context,
    );
    expect(result).toMatchObject({
      value,
      complete: true,
      participation: "OFFENSE",
    });
  });
  it("does not turn an empty or partial row into DNP or zero", () => {
    expect(
      normalizeApiSportsPlayerResults(box(null, "0"), context)[0],
    ).toMatchObject({ value: null, complete: false, participation: "UNKNOWN" });
    expect(
      normalizeApiSportsPlayerResults(
        { errors: [], parameters: { id: "456" }, response: [] },
        context,
      )[0],
    ).toMatchObject({ value: null, participation: "UNKNOWN" });
    expect(
      normalizeApiSportsPlayerResults(box("0", "0"), context)[0].participation,
    ).toBe("UNKNOWN");
    expect(
      normalizeApiSportsPlayerResults(box("4"), {
        ...context,
        completeBoxScore: false,
      })[0].complete,
    ).toBe(false);
  });
  it("rejects same-name wrong-ID/team/event data and ambiguous duplicates", () => {
    expect(() =>
      normalizeApiSportsPlayerResults(box("1"), {
        ...context,
        sourceEventId: "other",
      }),
    ).toThrow("EVENT_MISMATCH");
    expect(() =>
      normalizeApiSportsPlayerResults(box("1"), {
        ...context,
        mappings: [{ ...mapping, team: "Other" }],
      }),
    ).toThrow("MAPPING_MISMATCH");
    const duplicate = box("1");
    duplicate.response[0].players.push(duplicate.response[0].players[0]);
    expect(() => normalizeApiSportsPlayerResults(duplicate, context)).toThrow(
      "MAPPING_MISMATCH",
    );
  });
  it("same content retried at a later fetch time has the same evidence hash", () => {
    const a = normalizeApiSportsPlayerResults(box("80"), context)[0];
    const b = normalizeApiSportsPlayerResults(box("80"), {
      ...context,
      fetchedAt: "2026-09-13T23:11:00.000Z",
    })[0];
    expect(a.contentHash).toBe(b.contentHash);
  });
});

describe("nflverse explicit identity and offensive participation", () => {
  const nfl = {
    ...context,
    sourceEventId: "2026_01_A_B",
    statsComplete: true,
    snapsComplete: true,
    mappings: [
      {
        ...mapping,
        externalPlayerId: "00-123",
        pfrPlayerId: "TestAa00",
        sourceTeam: "B",
      },
    ],
    statsCsv:
      "game_id,player_id,team,receiving_yards\n2026_01_A_B,00-123,B,0\n",
    snapsCsv:
      "game_id,pfr_player_id,team,offense_snaps,st_snaps\n2026_01_A_B,TestAa00,B,30,0\n",
  };
  it("grades an offensive complete zero but voids verified special-teams-only participation", () => {
    expect(normalizeNflversePlayerResults(nfl)[0]).toMatchObject({
      value: 0,
      complete: true,
      participation: "OFFENSE",
    });
    expect(
      normalizeNflversePlayerResults({
        ...nfl,
        snapsCsv: nfl.snapsCsv.replace(",30,0", ",0,6"),
      })[0],
    ).toMatchObject({
      value: 0,
      participation: "NO_OFFENSE",
      participationComplete: true,
    });
  });
  it("positive snaps with no stat row, missing snaps, or absent both remain pending", () => {
    expect(
      normalizeNflversePlayerResults({
        ...nfl,
        statsCsv: "game_id,player_id,team,receiving_yards\n",
      })[0],
    ).toMatchObject({ value: null, complete: false, participation: "OFFENSE" });
    expect(
      normalizeNflversePlayerResults({ ...nfl, snapsCsv: "" })[0].participation,
    ).toBe("UNKNOWN");
    expect(
      normalizeNflversePlayerResults({ ...nfl, statsCsv: "", snapsCsv: "" })[0],
    ).toMatchObject({ value: null, complete: false, participation: "UNKNOWN" });
  });
  it("does not guess a PFR crosswalk from display names", () => {
    expect(
      normalizeNflversePlayerResults({
        ...nfl,
        mappings: [{ ...nfl.mappings[0], pfrPlayerId: null }],
      })[0].participation,
    ).toBe("UNKNOWN");
  });
  it("handles actual CSV quoting and rejects truncated artifacts", () => {
    expect(parseNflverseCsv('id,name\r\n1,"Last, First"\r\n')[0].name).toBe(
      "Last, First",
    );
    expect(() => parseNflverseCsv('id,name\n1,"oops')).toThrow(
      "INCOMPLETE_CSV",
    );
    expect(() => parseNflverseCsv("id,name\n1")).toThrow("INCOMPLETE_CSV_ROW");
  });
});

describe("same authoritative settlement with player evidence", () => {
  it.each([
    [51, "WIN"],
    [50, "PUSH"],
    [49, "LOSS"],
    [0, "LOSS"],
    [-3, "LOSS"],
  ] as const)("settles final yardage %i as %s", (value, outcome) => {
    expect(settleReceipt(receipt, final, { ...evidence, value }).outcome).toBe(
      outcome,
    );
  });
  it("early injury after offense still grades; verified nonparticipation voids", () => {
    expect(
      settleReceipt(receipt, final, { ...evidence, value: 1 }).outcome,
    ).toBe("LOSS");
    expect(
      settleReceipt(receipt, final, {
        ...evidence,
        value: null,
        complete: false,
        participation: "NO_OFFENSE",
      }),
    ).toMatchObject({ outcome: "VOID", returnedCenticredits: 10_000n });
  });
  it("a final team score is not enough to settle a prop or complete weekly score", () => {
    const result = settleReceipt(receipt, final);
    expect(result).toMatchObject({
      outcome: "PENDING",
      returnedCenticredits: null,
    });
    expect(weeklyScore([result])).toBeNull();
    expect(
      settleReceipt(receipt, final, { ...evidence, complete: false }).outcome,
    ).toBe("PENDING");
    expect(
      settleReceipt(receipt, { eventId: "event", status: "LIVE" }, evidence)
        .outcome,
    ).toBe("PENDING");
  });
  it("stat-only and participation-only revisions change returns without changing team scores", () => {
    expect(settleReceipt(receipt, final, evidence).outcome).toBe("WIN");
    expect(
      settleReceipt(receipt, final, { ...evidence, value: 49 }).outcome,
    ).toBe("LOSS");
    expect(
      settleReceipt(receipt, final, {
        ...evidence,
        participation: "NO_OFFENSE",
      }).outcome,
    ).toBe("VOID");
  });
  it("rejects a different subject/statistic evidence bundle", () => {
    expect(() =>
      settleReceipt(receipt, final, { ...evidence, subjectId: "other" }),
    ).toThrow("identity");
    expect(() =>
      settleReceipt(receipt, final, {
        ...evidence,
        statistic: "PASSING_YARDS",
      }),
    ).toThrow("identity");
  });
  it("existing authoritative game void applies to props without invented DNP", () => {
    expect(
      settleReceipt(receipt, { eventId: "event", status: "VOID" }).outcome,
    ).toBe("VOID");
  });
  it("bounds retries to final+0/5/15/30/60 then opens an incident", () => {
    const finalAt = new Date("2026-09-13T23:00:00Z");
    expect(
      [0, 1, 2, 3, 4].map((attempt) =>
        nextPlayerResultAttempt(finalAt, attempt)?.getUTCMinutes(),
      ),
    ).toEqual([0, 5, 15, 30, 0]);
    expect(nextPlayerResultAttempt(finalAt, 5)).toBeNull();
  });
});
