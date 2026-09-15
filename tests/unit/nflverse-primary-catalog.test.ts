import { describe, expect, it } from "vitest";
import { buildPlayerCatalogBootstrap } from "@/application/players/catalog-bootstrap";
import {
  normalizeNflversePrimaryCatalog,
  sanitizeNflverseCatalog,
} from "@/adapters/providers/player-catalog-normalizer";
import { parseNflverseCsv } from "@/adapters/providers/nflverse/normalize-player-results";
import { nflversePrimaryCatalogFixture as fixture } from "../fixtures/nflverse-primary-catalog";
import { fullSlateCatalogWireFixture } from "../fixtures/player-catalog-wire";

function build(input = fixture()) {
  return buildPlayerCatalogBootstrap(normalizeNflversePrimaryCatalog(input));
}
function addPlayer(
  input: ReturnType<typeof fixture>,
  options: {
    name?: string;
    position?: "QB" | "RB" | "WR" | "TE";
    line?: number;
  } = {},
) {
  const name = options.name ?? "Cardinal Alternative",
    position = options.position ?? "TE";
  const statistic: "PASSING_YARDS" | "RUSHING_YARDS" | "RECEIVING_YARDS" =
    position === "QB"
      ? "PASSING_YARDS"
      : position === "RB"
        ? "RUSHING_YARDS"
        : "RECEIVING_YARDS";
  input.nflverse.rosterCsv += `\n2026,ARI,${position},${name},00-0000099,Other99,ACT,1099`;
  input.quotes[0].events[0].markets.push(
    ...(["OVER", "UNDER"] as const).map((outcomeKey) => ({
      sourceBook: "draftkings" as const,
      period: "FULL_GAME" as const,
      marketType: `PLAYER_${statistic}` as const,
      statistic,
      externalPlayerId: name,
      outcomeKey,
      proposition: name,
      lineMilli: options.line ?? 70500,
      americanOdds: -110,
      observedAt: input.now,
    })),
  );
}

describe("nflverse primary featured-player catalog", () => {
  it("expires nominations at the earliest real source deadline instead of refreshing old roster evidence", () => {
    const input = fixture();
    input.nflverse.sourceUpdatedAt = "2026-09-19T00:00:00.000Z";
    const result = build(input);
    expect(result.proposals[0].nominationVerifiedAt).toBe(input.now);
    expect(result.proposals[0].nominationExpiresAt).toBe(
      "2026-09-21T00:00:00.000Z",
    );
    const repeated = build({ ...input, now: "2026-09-20T15:05:00.000Z" });
    expect(repeated.proposals[0]).toEqual(result.proposals[0]);
  });
  it("prepares six mapped choices without API-Sports or depth-chart proof", () => {
    const input = fixture();
    input.apiSportsContractValidated = false;
    input.coverage.payload = null;
    input.games.payload = null;
    input.rosters = {};
    const normalized = normalizeNflversePrimaryCatalog(input),
      result = buildPlayerCatalogBootstrap(normalized);
    expect(normalized).toMatchObject({
      sourcePolicy: "NFLVERSE_PRIMARY",
      selectionPolicy: "FEATURED_HIGHEST_STANDARD_LINES",
    });
    expect(normalized.roles).toEqual([]);
    expect(
      normalized.mappings.every((row) => row.provider === "NFLVERSE"),
    ).toBe(true);
    expect(result.records).toHaveLength(12);
    expect(result.resultEvents[0]).toMatchObject({
      apiSportsEventId: null,
      nflverseEventId: "2026_03_ARI_LAC",
    });
    expect(result.proposals).toHaveLength(6);
    expect(
      result.proposals.every((row) => row.proposedCanonicalKey !== null),
    ).toBe(true);
    expect(result.exceptions).toEqual([]);
    expect(result.proposals[0].candidates[0].roleEvidence).toContain(
      "featured player, not a confirmed starter",
    );
    expect(result.proposals[0].nominationVerifiedAt).toBe(input.now);
    expect(result.proposals[0].nominationEvidenceHash).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });
  it.each([14, 16])(
    "handles all %i games with exactly six slot proposals",
    (games) => {
      const raw = fullSlateCatalogWireFixture();
      raw.events = raw.events.slice(0, games);
      const result = build(fixture(raw));
      expect(result.proposals).toHaveLength(games * 6);
      expect(
        result.proposals.every((row) => row.proposedCanonicalKey !== null),
      ).toBe(true);
      expect(result.resultEvents).toHaveLength(games);
    },
  );
  it.each([
    ["QB", 0],
    ["RB", 1],
    ["TE", 2],
  ] as const)(
    "ranks %s by highest line rather than historical usage or starting-role assumptions",
    (position, index) => {
      const input = fixture();
      addPlayer(input, { position, line: 150500 });
      expect(build(input).proposals[index].proposedCanonicalKey).toBe(
        "nflverse:00-0000099",
      );
    },
  );
  it("never fills an RB slot with QB rushing or a receiver slot with RB receiving", () => {
    const input = fixture();
    input.quotes[0].events[0].markets.push(
      ...(["OVER", "UNDER"] as const).flatMap((outcomeKey) => [
        {
          ...input.quotes[0].events[0].markets[0],
          outcomeKey,
          marketType: "PLAYER_RUSHING_YARDS" as const,
          statistic: "RUSHING_YARDS" as const,
          lineMilli: 200500,
        },
        {
          ...input.quotes[0].events[0].markets[2],
          outcomeKey,
          marketType: "PLAYER_RECEIVING_YARDS" as const,
          statistic: "RECEIVING_YARDS" as const,
          lineMilli: 200500,
        },
      ]),
    );
    expect(build(input).proposals[1].proposedCanonicalKey).toBe(
      "nflverse:00-0000001",
    );
    expect(build(input).proposals[2].proposedCanonicalKey).toBe(
      "nflverse:00-0000002",
    );
  });
  it("flags equal lines and orders by canonical ID independent of provider row order", () => {
    const input = fixture();
    addPlayer(input, { position: "TE", line: 50000 });
    const normalized = normalizeNflversePrimaryCatalog(input),
      first = buildPlayerCatalogBootstrap(normalized);
    normalized.directory.reverse();
    normalized.mappings.reverse();
    normalized.roles.reverse();
    normalized.quotes![0].events[0].markets.reverse();
    expect(buildPlayerCatalogBootstrap(normalized)).toEqual(first);
    expect(first.proposals[2].proposedCanonicalKey).toBe("nflverse:00-0000002");
    expect(first.proposals[2].warnings).toContain(
      "Equally ranked candidates; confirm the proposed choice.",
    );
  });
  it("leaves every featured slot unresolved without a line even when a prior alias exists", () => {
    const input = fixture(),
      normalized = normalizeNflversePrimaryCatalog(input);
    const verifiedAliases = normalized.directory.map((player) => ({
      canonicalKey: player.canonicalKey,
      name: player.displayName,
    }));
    const result = buildPlayerCatalogBootstrap(
      normalizeNflversePrimaryCatalog({
        ...input,
        quotes: [],
        verifiedAliases,
      }),
    );
    expect(
      result.proposals.every((row) => row.proposedCanonicalKey === null),
    ).toBe(true);
    expect(result.records).toEqual([]);
    expect(result.proposals.every((row) => row.nominationEvidenceHash)).toBe(
      true,
    );
  });
  it("accepts nomination acquisition from earlier durable runs without claiming executable quote freshness", () => {
    const input = fixture();
    input.now = "2026-09-20T20:00:00.000Z";
    const result = build(input);
    expect(
      result.proposals.every((row) => row.proposedCanonicalKey !== null),
    ).toBe(true);
    expect(result.proposals[0].nominationVerifiedAt).toBe(
      "2026-09-20T15:00:00.000Z",
    );
    expect(result.proposals[0].candidates[0].roleEvidence).toContain(
      "Snapshot 2026-09-20T15:00:00.000Z",
    );
  });
  it.each([
    "old-fetch",
    "future-fetch",
    "old-observation",
    "future-observation",
    "one-side",
    "two-lines",
    "conflicting-price",
  ])("rejects %s line evidence", (failure) => {
    const input = fixture(),
      bundle = input.quotes[0],
      markets = bundle.events[0].markets;
    if (failure === "old-fetch") bundle.fetchedAt = "2026-09-20T02:59:59.000Z";
    if (failure === "future-fetch")
      bundle.fetchedAt = "2026-09-20T15:00:01.000Z";
    if (failure === "old-observation")
      markets.forEach((row) => (row.observedAt = "2026-09-20T14:49:59.000Z"));
    if (failure === "future-observation")
      markets.forEach((row) => (row.observedAt = "2026-09-20T15:00:01.000Z"));
    if (failure === "one-side")
      bundle.events[0].markets = markets.filter(
        (row) => row.outcomeKey === "OVER",
      );
    if (failure === "two-lines")
      markets
        .filter((row) => row.outcomeKey === "UNDER")
        .forEach((row) => (row.lineMilli += 500));
    if (failure === "conflicting-price")
      markets.push({ ...markets[4], americanOdds: -120 });
    expect(build(input).proposals[2].proposedCanonicalKey).toBeNull();
  });
  it("uses a coherent latest snapshot per family, without reviving removed candidates or discarding another family", () => {
    const input = fixture();
    addPlayer(input, { position: "TE" });
    const initial = build(input);
    expect(initial.proposals[2].proposedCanonicalKey).toBe(
      "nflverse:00-0000099",
    );
    input.now = "2026-09-20T15:05:00.000Z";
    const passing = structuredClone(input.quotes[0]);
    passing.fetchedAt = input.now;
    passing.events[0].requestedFamilies = ["player_pass_yds"];
    passing.events[0].markets = passing.events[0].markets.filter(
      (row) => row.statistic === "PASSING_YARDS",
    );
    passing.events[0].markets.forEach((row) => (row.observedAt = input.now));
    input.quotes.push(passing);
    expect(build(input).proposals[2]).toEqual(initial.proposals[2]);
    const receiving = structuredClone(input.quotes[0]);
    receiving.fetchedAt = input.now;
    receiving.events[0].requestedFamilies = ["player_reception_yds"];
    receiving.events[0].markets = receiving.events[0].markets.filter(
      (row) =>
        row.statistic === "RECEIVING_YARDS" &&
        row.externalPlayerId !== "Cardinal Alternative",
    );
    receiving.events[0].markets.forEach((row) => (row.observedAt = input.now));
    input.quotes.push(receiving);
    const after = build(input);
    expect(after.proposals[2].proposedCanonicalKey).toBe("nflverse:00-0000002");
    expect(after.proposals[2].candidates).toHaveLength(1);
    expect(after.proposals[2].nominationVerifiedAt).toBe(input.now);
    expect(after.proposals[2].nominationEvidenceHash).not.toBe(
      initial.proposals[2].nominationEvidenceHash,
    );
    expect(
      after.records.find(
        (row) =>
          row.provider === "THE_ODDS_API" &&
          row.canonicalKey === "nflverse:00-0000002",
      )!.evidenceHash,
    ).not.toBe(
      initial.records.find(
        (row) =>
          row.provider === "THE_ODDS_API" &&
          row.canonicalKey === "nflverse:00-0000002",
      )!.evidenceHash,
    );
  });
  it("rejects conflicting family payloads at the same acquisition timestamp", () => {
    const input = fixture(),
      conflict = structuredClone(input.quotes[0]);
    conflict.events[0].markets[4].lineMilli += 500;
    input.quotes.push(conflict);
    expect(build(input).proposals[2].proposedCanonicalKey).toBeNull();
  });
  it.each([
    "missing-pfr",
    "missing-espn",
    "wrong-position",
    "inactive",
    "duplicate-gsis",
    "duplicate-pfr",
    "duplicate-espn",
  ])("fails closed on %s roster identity", (failure) => {
    const input = fixture();
    if (failure === "missing-pfr")
      input.nflverse.rosterCsv = input.nflverse.rosterCsv.replace(
        "Player00",
        "",
      );
    if (failure === "missing-espn")
      input.nflverse.rosterCsv = input.nflverse.rosterCsv.replace(
        "ACT,1001",
        "ACT,",
      );
    if (failure === "wrong-position")
      input.nflverse.rosterCsv = input.nflverse.rosterCsv.replace(
        "ARI,QB",
        "ARI,RB",
      );
    if (failure === "inactive")
      input.nflverse.rosterCsv = input.nflverse.rosterCsv.replace(
        "Player00,ACT",
        "Player00,RES",
      );
    if (failure === "duplicate-gsis")
      input.nflverse.rosterCsv +=
        "\n2026,ARI,QB,Other Player,00-0000000,Other99,ACT,1099";
    if (failure === "duplicate-pfr")
      input.nflverse.rosterCsv +=
        "\n2026,ARI,QB,Other Player,00-0000099,Player00,ACT,1099";
    if (failure === "duplicate-espn")
      input.nflverse.rosterCsv +=
        "\n2026,ARI,QB,Other Player,00-0000099,Other99,ACT,1001";
    expect(build(input).proposals[0].proposedCanonicalKey).toBeNull();
  });
  it("does not manufacture missing current roster, result-contract, or pregame evidence", () => {
    const input = fixture();
    input.nflverseContractValidated = false;
    expect(build(input).records).toEqual([]);
    input.nflverseContractValidated = true;
    input.nflverse.sourceUpdatedAt = "2026-09-17T12:00:00.000Z";
    expect(() => build(input)).toThrow("CURRENT_DIRECTORY");
    input.nflverse.sourceUpdatedAt = input.now;
    input.nflverse.fetchedAt = "2026-09-20T15:00:01.000Z";
    expect(() => build(input)).toThrow("CURRENT_DIRECTORY");
    const started = fixture();
    started.events[0].scheduledStartAt = started.now;
    expect(() => build(started)).toThrow("NO_VERIFIED_EVENT");
  });
  it("preserves suffixes and permits only a previously verified exact alias", () => {
    const input = fixture();
    input.quotes[0].events[0].markets
      .filter((row) => row.externalPlayerId === "Cardinal Quarterback")
      .forEach((row) => (row.externalPlayerId += " Jr."));
    expect(build(input).proposals[0].proposedCanonicalKey).toBeNull();
    const result = buildPlayerCatalogBootstrap(
      normalizeNflversePrimaryCatalog({
        ...input,
        verifiedAliases: [
          {
            canonicalKey: "nflverse:00-0000000",
            name: "Cardinal Quarterback Jr.",
          },
        ],
      }),
    );
    expect(result.proposals[0].proposedCanonicalKey).toBe(
      "nflverse:00-0000000",
    );
    expect(
      parseNflverseCsv(
        sanitizeNflverseCatalog(input.nflverse, 2026).rosterCsv,
      )[0].espn_id,
    ).toBe("1001");
  });
});
