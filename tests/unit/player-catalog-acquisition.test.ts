import { describe, expect, it } from "vitest";
import { buildPlayerCatalogBootstrap } from "@/application/players/catalog-bootstrap";
import {
  normalizeLiveCatalog,
  normalizeCatalogRoster,
  sanitizeNflverseCatalog,
  verifyCatalogCoverage,
} from "@/adapters/providers/player-catalog-normalizer";
import { playerCatalogWireFixture as fixture } from "../fixtures/player-catalog-wire";

// Sanitized wire fixtures use the shapes and parameter echoes in the official
// API-NFL guide and nflverse CSV dictionaries. They are not live2026 proof.
describe("automatic catalog wire acquisition and strict crosswalk", () => {
  it("builds all six role-correct candidates without a manual manifest; uses Eastern Sunday for UTC Monday", () => {
    const data = normalizeLiveCatalog(fixture());
    const prepared = buildPlayerCatalogBootstrap(data);
    expect(prepared.proposals).toHaveLength(6);
    expect(prepared.proposals.every((row) => row.proposedCanonicalKey)).toBe(
      true,
    );
    expect(prepared.records).toHaveLength(18);
    expect(prepared.resultEvents[0].gameDate).toBe("2026-09-20");
    expect(
      prepared.records.find((row) => row.position === "QB")!.roleEvidence,
    ).toContain("starting role unconfirmed");
  });
  it("rejects empty current-season coverage and errors even for HTTP200 shape", () => {
    const data = fixture();
    data.coverage.payload = {
      get: "leagues",
      parameters: { id: "1", season: "2026" },
      errors: [],
      results: 0,
      response: [],
    };
    expect(() =>
      verifyCatalogCoverage(data.coverage, 2026, data.now),
    ).toThrow();
    data.coverage.payload = {
      ...(data.coverage.payload as object),
      errors: { token: "invalid" },
    };
    expect(() =>
      verifyCatalogCoverage(data.coverage, 2026, data.now),
    ).toThrow();
  });
  it("rejects an API roster with wrong team parameter and duplicate provider IDs", () => {
    const data = fixture();
    expect(() =>
      normalizeCatalogRoster(data.rosters["1"], 2026, "2", data.now),
    ).toThrow("SCOPE");
    const payload = data.rosters["1"].payload as {
      response: unknown[];
      results: number;
    };
    payload.response.push(payload.response[0]);
    payload.results++;
    expect(() =>
      normalizeCatalogRoster(data.rosters["1"], 2026, "1", data.now),
    ).toThrow("AMBIGUOUS");
  });
  it("does not fuzzy match suffixes, guess positions, or map an ambiguous same name", () => {
    const data = fixture();
    const rows = (
      data.rosters["1"].payload as {
        response: { name: string; position: string }[];
      }
    ).response;
    rows[0].name += " Jr.";
    rows[1].position = "QB";
    data.nflverse.rosterCsv +=
      "\n2026,LAC,WR,Cardinal Receiver,00-0000099,Other01,ACT";
    const built = buildPlayerCatalogBootstrap(normalizeLiveCatalog(data));
    expect(
      built.proposals
        .filter((row) => row.team === "Arizona Cardinals")
        .every((row) => row.proposedCanonicalKey === null),
    ).toBe(true);
  });
  it("does not accept reversed teams, kickoff drift, stale roster, or an invented event id", () => {
    const data = fixture();
    data.nflverse.scheduleCsv = data.nflverse.scheduleCsv.replace(
      "20:20",
      "20:25",
    );
    expect(() => normalizeLiveCatalog(data)).toThrow("NO_VERIFIED_EVENT");
    const stale = fixture();
    stale.nflverse.sourceUpdatedAt = "2026-09-01T00:00:00.000Z";
    expect(() => normalizeLiveCatalog(stale)).toThrow("CURRENT_DIRECTORY");
    const swapped = fixture();
    swapped.events[0].awayTeam = "Los Angeles Chargers";
    expect(() => normalizeLiveCatalog(swapped)).toThrow("NO_VERIFIED_EVENT");
    const mismatchedId = fixture();
    mismatchedId.nflverse.scheduleCsv =
      mismatchedId.nflverse.scheduleCsv.replace(
        "2026_03_ARI_LAC",
        "2025_01_ARI_LAC",
      );
    expect(() => normalizeLiveCatalog(mismatchedId)).toThrow(
      "NO_VERIFIED_EVENT",
    );
  });
  it("keeps a January game in its season-start year and applies Eastern standard time", () => {
    const data = fixture();
    data.now = "2027-01-10T15:00:00.000Z";
    data.week = 19;
    data.events[0].scheduledStartAt = "2027-01-11T01:20:00.000Z";
    for (const source of [
      data.coverage,
      data.games,
      ...Object.values(data.rosters),
    ])
      source.fetchedAt = data.now;
    const gameRows = (
      data.games.payload as {
        response: { game: { date: { timestamp: number } } }[];
      }
    ).response;
    gameRows[0].game.date.timestamp =
      Date.parse(data.events[0].scheduledStartAt) / 1000;
    data.nflverse.fetchedAt = data.now;
    data.nflverse.sourceUpdatedAt = data.now;
    data.nflverse.scheduleCsv =
      "game_id,season,week,gameday,gametime,away_team,home_team\n2026_19_ARI_LAC,2026,19,2027-01-10,20:20,ARI,LAC\n";
    expect(normalizeLiveCatalog(data).events[0].resultMapping.gameDate).toBe(
      "2027-01-10",
    );
  });
  it("never turns unvalidated result contracts into eligible menu records", () => {
    const data = fixture();
    data.nflverseContractValidated = false;
    const prepared = buildPlayerCatalogBootstrap(normalizeLiveCatalog(data));
    expect(prepared.records).toEqual([]);
    expect(
      prepared.exceptions.some(
        (row) => row.code === "COMPLETE_RESULT_PATH_UNVERIFIED",
      ),
    ).toBe(true);
  });
  it("reuses an already verified canonical bookmaker alias when this game's quotes have not appeared", () => {
    const data = fixture();
    const original = normalizeLiveCatalog(data);
    const verifiedAliases = original.directory.map((row) => ({
      canonicalKey: row.canonicalKey,
      name: row.displayName,
    }));
    const prepared = buildPlayerCatalogBootstrap(
      normalizeLiveCatalog({ ...data, quotes: [], verifiedAliases }),
    );
    expect(
      prepared.proposals.every((row) => row.proposedCanonicalKey !== null),
    ).toBe(true);
    expect(
      prepared.proposals.every((row) =>
        row.warnings.includes(
          "Known player; bookmaker quote not yet available.",
        ),
      ),
    ).toBe(true);
    expect(
      prepared.records.filter((row) => row.provider === "THE_ODDS_API"),
    ).toHaveLength(6);
  });
  it("preserves usage through the actual team-only stats wire and drops unrelated profile data", () => {
    const data = fixture();
    data.nflverse.statsCsv = data.nflverse.statsCsv.replace(
      "recent_team",
      "team",
    );
    data.nflverse = sanitizeNflverseCatalog(data.nflverse, data.season);
    const normalized = normalizeLiveCatalog(data);
    expect(normalized.roles).toHaveLength(3);
    expect(normalized.roles.map((role) => role.usage)).toEqual([36, 19, 12]);
    const roster = data.rosters["1"].payload as {
      response: { position: string }[];
    };
    roster.response[0].position = "Quarterback";
    expect(
      normalizeCatalogRoster(data.rosters["1"], 2026, "1", data.now)[0]
        .position,
    ).toBe("QB");
  });
});
