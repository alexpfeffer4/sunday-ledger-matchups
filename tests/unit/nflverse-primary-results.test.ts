import { describe, expect, it } from "vitest";
import {
  normalizePublishedNflversePlayerResults,
  parseNflverseResultFiles,
} from "@/adapters/providers/nflverse/normalize-player-results";
import { playerObservationSchema } from "@/application/providers/player-results";
import {
  nflversePrimaryContext as context,
  nflversePrimaryFiles as files,
} from "../fixtures/nflverse-primary-results";

const rows = () => parseNflverseResultFiles(files);

describe("nflverse primary published per-game evidence", () => {
  it("qualifies explicit results from both team artifacts revised after reliable final", () => {
    expect(
      normalizePublishedNflversePlayerResults(context, rows())[0],
    ).toMatchObject({
      value: 51,
      complete: true,
      participation: "OFFENSE",
      participationComplete: true,
    });
  });
  it.each([
    { final: false },
    { finalObservedAt: "invalid" },
    { finalObservedAt: "2026-09-15T20:00:00.000Z" },
    { finalObservedAt: "2026-09-13T16:00:00.000Z" },
    { sourceUpdatedAt: "2026-09-13T20:00:00.000Z" },
    { participationSourceUpdatedAt: "2026-09-13T20:00:00.000Z" },
    { sourceUpdatedAt: "2026-09-14T13:00:00.000Z" },
    { participationSourceUpdatedAt: "2026-09-14T13:00:00.000Z" },
    { participationSourceUpdatedAt: undefined },
  ])(
    "withholds stale, missing or future final/publication evidence: %j",
    (patch) => {
      expect(() =>
        normalizePublishedNflversePlayerResults(
          { ...context, ...patch },
          rows(),
        ),
      ).toThrow("POST_FINAL_REVISION_REQUIRED");
    },
  );
  it.each([
    { homeTeam: "BAL" },
    { awayTeam: "PIT" },
    { sourceEventId: "2026_01_PIT_ATL" },
    { gameDate: "2026-09-14" },
  ])("rejects a mismatched game scope: %j", (patch) => {
    expect(() =>
      normalizePublishedNflversePlayerResults({ ...context, ...patch }, rows()),
    ).toThrow("GAME_SCOPE_MISMATCH");
  });
  it("uses the Eastern game date for a game beginning after UTC midnight", () => {
    expect(
      normalizePublishedNflversePlayerResults(
        {
          ...context,
          scheduledStartAt: "2026-09-14T00:20:00.000Z",
          finalObservedAt: "2026-09-14T03:30:00.000Z",
        },
        rows(),
      )[0].complete,
    ).toBe(true);
  });
  it.each(["stats", "snaps"] as const)(
    "rejects %s with only one team's evidence",
    (kind) => {
      const evidence = rows();
      evidence[kind] = evidence[kind].filter((row) => row.team !== "ATL");
      expect(() =>
        normalizePublishedNflversePlayerResults(context, evidence),
      ).toThrow("BOTH_TEAMS_REQUIRED");
    },
  );
  it.each([
    ["stats", "opponent_team", "BAL"],
    ["stats", "season", "2025"],
    ["stats", "week", "2"],
    ["stats", "season_type", "PRE"],
    ["stats", "passing_yards", "NaN"],
    ["stats", "receiving_yards", "1.5"],
    ["snaps", "pfr_game_id", "202609140pit"],
    ["snaps", "pfr_game_id", "202609130atl"],
    ["snaps", "team", "BAL"],
    ["snaps", "offense_snaps", "-1"],
    ["snaps", "offense_snaps", ""],
  ] as const)(
    "rejects contradictory or malformed %s.%s evidence",
    (kind, field, value) => {
      const evidence = rows();
      evidence[kind][0][field] = value;
      expect(() =>
        normalizePublishedNflversePlayerResults(context, evidence),
      ).toThrow("GAME_EVIDENCE_INVALID");
    },
  );
  it.each(["stats", "snaps"] as const)(
    "rejects duplicate identities in the full game's %s",
    (kind) => {
      const evidence = rows();
      evidence[kind].push({ ...evidence[kind][0] });
      expect(() =>
        normalizePublishedNflversePlayerResults(context, evidence),
      ).toThrow("GAME_EVIDENCE_INVALID");
    },
  );
  it("ignores an unrelated game's malformed mapping without weakening this game's checks", () => {
    const evidence = rows();
    evidence.stats.push({
      game_id: "2026_01_BAL_CIN",
      player_id: "00-other",
      team: "WRONG",
    });
    expect(
      normalizePublishedNflversePlayerResults(context, evidence)[0].complete,
    ).toBe(true);
  });
  it("excludes published anonymous all-zero aggregates without using them as player/team evidence", () => {
    const evidence = rows();
    evidence.stats.push({
      ...evidence.stats[0],
      player_id: "",
      passing_yards: "0",
      rushing_yards: "0",
      receiving_yards: "0",
    });
    expect(
      normalizePublishedNflversePlayerResults(context, evidence)[0].complete,
    ).toBe(true);
    evidence.stats.at(-1)!.receiving_yards = "4";
    expect(() =>
      normalizePublishedNflversePlayerResults(context, evidence),
    ).toThrow("GAME_EVIDENCE_INVALID");
    evidence.stats.at(-1)!.receiving_yards = "0";
    evidence.stats = evidence.stats.filter((row) => row.team !== "ATL");
    evidence.stats.push({
      ...rows().stats[1],
      player_id: "",
      passing_yards: "0",
    });
    expect(() =>
      normalizePublishedNflversePlayerResults(context, evidence),
    ).toThrow("BOTH_TEAMS_REQUIRED");
  });
  it("keeps a missing individual stat or snap unknown despite complete team coverage", () => {
    const missingStat = rows();
    delete missingStat.stats[0];
    missingStat.stats = missingStat.stats.filter(Boolean);
    missingStat.stats.push({ ...rows().stats[0], player_id: "00-other" });
    expect(
      normalizePublishedNflversePlayerResults(context, missingStat)[0],
    ).toMatchObject({ value: null, complete: false, participation: "OFFENSE" });
    const missingSnap = rows();
    missingSnap.snaps.shift();
    expect(
      normalizePublishedNflversePlayerResults(context, missingSnap)[0],
    ).toMatchObject({
      value: 51,
      participation: "UNKNOWN",
      participationComplete: false,
    });
    expect(
      normalizePublishedNflversePlayerResults(
        {
          ...context,
          mappings: [
            {
              ...context.mappings[0],
              externalPlayerId: "00-absent",
              pfrPlayerId: null,
            },
          ],
        },
        rows(),
      )[0],
    ).toMatchObject({ value: null, complete: false, participation: "UNKNOWN" });
  });
  it.each([0, -5])(
    "preserves explicit %i yardage with offensive participation",
    (value) => {
      const evidence = rows();
      evidence.stats[0].receiving_yards = String(value);
      expect(
        normalizePublishedNflversePlayerResults(context, evidence)[0],
      ).toMatchObject({ value, complete: true, participation: "OFFENSE" });
    },
  );
  it("permits explicit zero offensive snaps only without contradictory offensive yardage", () => {
    const evidence = rows();
    evidence.snaps[0].offense_snaps = "0";
    expect(() =>
      normalizePublishedNflversePlayerResults(context, evidence),
    ).toThrow("contradicts");
    evidence.stats[0].receiving_yards = "";
    expect(
      normalizePublishedNflversePlayerResults(context, evidence)[0],
    ).toMatchObject({
      value: null,
      complete: false,
      participation: "NO_OFFENSE",
      participationComplete: true,
    });
  });
  it("keeps retries idempotent and versions independent snap revisions", () => {
    const first = normalizePublishedNflversePlayerResults(context, rows())[0];
    const retry = normalizePublishedNflversePlayerResults(
      { ...context, fetchedAt: "2026-09-14T12:05:00.000Z" },
      rows(),
    )[0];
    const revision = normalizePublishedNflversePlayerResults(
      { ...context, participationSourceUpdatedAt: "2026-09-14T08:00:00.000Z" },
      rows(),
    )[0];
    expect(retry.contentHash).toBe(first.contentHash);
    expect(revision.contentHash).not.toBe(first.contentHash);
    expect(() =>
      playerObservationSchema.parse({
        ...first,
        participationSourceUpdatedAt: "2026-09-14T13:00:00.000Z",
      }),
    ).toThrow("newer than its fetch");
  });
});
