import { describe, expect, it } from "vitest";
import {
  buildPlayerCatalogBootstrap,
  type PlayerCatalogBootstrapInput,
} from "@/application/players/catalog-bootstrap";
import type { PropQuoteImport } from "@/application/providers/player-prop-quotes";

const now = "2026-09-14T12:00:00Z";
const proof = { verified: true, verifiedAt: now, evidenceHash: "a".repeat(64) };
function fixture(count = 1): PlayerCatalogBootstrapInput {
  const input: PlayerCatalogBootstrapInput = {
    now,
    events: [],
    directory: [],
    mappings: [],
    roles: [],
  };
  for (let game = 0; game < count; game++) {
    const externalEventId = `game-${game}`;
    const awayTeam = `Away ${game}`;
    const homeTeam = `Home ${game}`;
    const gameDate = "2026-09-14";
    input.events.push({
      externalEventId,
      awayTeam,
      homeTeam,
      scheduledStartAt: "2026-09-14T20:00:00Z",
      resultMapping: {
        ...proof,
        apiSportsEventId: String(game + 1),
        nflverseEventId: `2026_01_A${game}_H${game}`,
        gameDate,
        awayTeam,
        homeTeam,
      },
    });
    for (const team of [awayTeam, homeTeam]) {
      for (const [index, position] of ["QB", "RB", "WR"].entries()) {
        const canonicalKey = `gsis:${game}:${team}:${position}`;
        const displayName = `${team} ${position} Jr.`;
        input.directory.push({
          ...proof,
          canonicalKey,
          displayName,
          position,
          team,
          validFrom: gameDate,
          validThrough: gameDate,
          bookmakerAliases: [displayName],
        });
        for (const provider of ["API_SPORTS", "NFLVERSE"] as const) {
          input.mappings.push({
            ...proof,
            canonicalKey,
            provider,
            externalEventId,
            team,
            gameDate,
            externalPlayerId: `${provider}:${canonicalKey}`,
            sourceTeam:
              provider === "NFLVERSE" ? team.replaceAll(" ", "") : team,
            secondaryPlayerId:
              provider === "NFLVERSE" ? `pfr:${canonicalKey}` : null,
            resultPathVerified: true,
          });
        }
        input.roles.push({
          ...proof,
          canonicalKey,
          externalEventId,
          team,
          gameDate,
          kind:
            position === "QB"
              ? "CONFIRMED_STARTER"
              : position === "RB"
                ? "LEAD_ROLE"
                : "RECENT_USAGE",
          statistic: (
            ["PASSING_YARDS", "RUSHING_YARDS", "RECEIVING_YARDS"] as const
          )[index],
          usage: 10,
          source: "NFLVERSE",
          description: "Verified fixture role evidence.",
        });
      }
    }
  }
  return input;
}
function quotes(
  input: PlayerCatalogBootstrapInput,
  canonicalKey: string,
  lineMilli = 200500,
): PropQuoteImport {
  const player = input.directory.find(
    (row) => row.canonicalKey === canonicalKey,
  )!;
  const event = input.events[0];
  const statistic =
    player.position === "QB"
      ? "PASSING_YARDS"
      : player.position === "RB"
        ? "RUSHING_YARDS"
        : "RECEIVING_YARDS";
  const family =
    player.position === "QB"
      ? "player_pass_yds"
      : player.position === "RB"
        ? "player_rush_yds"
        : "player_reception_yds";
  return {
    source: "THE_ODDS_API",
    fetchedAt: now,
    events: [
      {
        source: "THE_ODDS_API",
        externalEventId: event.externalEventId,
        sportKey: "americanfootball_nfl",
        awayTeam: event.awayTeam,
        homeTeam: event.homeTeam,
        scheduledStartAt: event.scheduledStartAt,
        requestedFamilies: [family],
        markets: (["OVER", "UNDER"] as const).map((outcomeKey) => ({
          sourceBook: "draftkings",
          marketType: `PLAYER_${statistic}`,
          statistic,
          period: "FULL_GAME",
          externalPlayerId: player.displayName,
          outcomeKey,
          proposition: `${player.displayName} ${outcomeKey}`,
          lineMilli,
          americanOdds: -110,
          observedAt: now,
        })),
      },
    ],
  };
}
function addAlternative(
  input: PlayerCatalogBootstrapInput,
  index: number,
  position?: string,
) {
  const original = input.directory[index];
  const canonicalKey = `${original.canonicalKey}:alternative`;
  const displayName = `${original.displayName} Alternative`;
  input.directory.push({
    ...original,
    canonicalKey,
    displayName,
    position: position ?? original.position,
    bookmakerAliases: [displayName],
  });
  for (const mapping of input.mappings.filter(
    (row) => row.canonicalKey === original.canonicalKey,
  )) {
    input.mappings.push({
      ...mapping,
      canonicalKey,
      externalPlayerId: `${mapping.externalPlayerId}:alternative`,
    });
  }
  return canonicalKey;
}

describe("verified automatic full-slate catalog bootstrap", () => {
  it.each([14, 16])(
    "prepares six role-correct choices for all %i games before any lines exist",
    (games) => {
      const result = buildPlayerCatalogBootstrap(fixture(games));
      expect(result.proposals).toHaveLength(games * 6);
      expect(result.records).toHaveLength(games * 6 * 3);
      expect(result.resultEvents).toHaveLength(games);
      expect(result.exceptions).toEqual([]);
      expect(
        result.proposals.every(
          (proposal) =>
            proposal.proposedCanonicalKey && proposal.availableQuotes === 0,
        ),
      ).toBe(true);
      expect(
        result.proposals.every((proposal) =>
          proposal.warnings.includes(
            "Known player; bookmaker quote not yet available.",
          ),
        ),
      ).toBe(true);
      for (const proposal of result.proposals) {
        const record = result.records.find(
          (row) => row.canonicalKey === proposal.proposedCanonicalKey,
        )!;
        expect(
          proposal.slot === "QB_PASS"
            ? ["QB"]
            : proposal.slot === "RB_RUSH"
              ? ["RB"]
              : ["WR", "TE"],
        ).toContain(record.position);
      }
    },
  );

  it("keeps canonical identities and hashes stable when real lines arrive later", () => {
    const input = fixture();
    const before = buildPlayerCatalogBootstrap(input);
    input.quotes = [quotes(input, input.directory[0].canonicalKey)];
    const after = buildPlayerCatalogBootstrap(input);
    expect(after.records).toEqual(before.records);
    expect(after.proposals[0].availableQuotes).toBe(1);
    expect(after.proposals[0].proposedCanonicalKey).toBe(
      before.proposals[0].proposedCanonicalKey,
    );
  });

  it("fails closed on same-name players on either team and preserves suffixes", () => {
    const input = fixture();
    input.directory[3].displayName = input.directory[0].displayName;
    input.directory[3].bookmakerAliases = [
      ...input.directory[0].bookmakerAliases,
    ];
    input.quotes = [quotes(input, input.directory[0].canonicalKey)];
    const result = buildPlayerCatalogBootstrap(input);
    expect(
      result.proposals
        .filter((row) => row.slot === "QB_PASS")
        .every((row) => row.proposedCanonicalKey === null),
    ).toBe(true);
    expect(
      result.exceptions.some(
        (row) => row.code === "AMBIGUOUS_BOOKMAKER_PLAYER",
      ),
    ).toBe(true);
    const suffixInput = fixture();
    suffixInput.directory[0].bookmakerAliases = [];
    const unverifiedAlias = quotes(
      suffixInput,
      suffixInput.directory[0].canonicalKey,
    );
    unverifiedAlias.events[0].markets.forEach((row) => {
      row.externalPlayerId = row.externalPlayerId.replace(" Jr.", "");
    });
    suffixInput.quotes = [unverifiedAlias];
    expect(
      buildPlayerCatalogBootstrap(suffixInput).proposals[0]
        .proposedCanonicalKey,
    ).toBeNull();
  });

  it("checks both teams, Eastern game date, current roster dates, and exact source player crosswalks", () => {
    const input = fixture();
    input.events[0].scheduledStartAt = "2026-09-15T00:20:00Z";
    expect(buildPlayerCatalogBootstrap(input).resultEvents[0].gameDate).toBe(
      "2026-09-14",
    );
    input.events[0].resultMapping.gameDate = "2026-09-15";
    expect(buildPlayerCatalogBootstrap(input).records).toEqual([]);
    const traded = fixture();
    traded.directory[0].validThrough = "2026-09-13";
    expect(
      buildPlayerCatalogBootstrap(traded).proposals[0].proposedCanonicalKey,
    ).toBeNull();
    const wrongTeam = fixture();
    wrongTeam.mappings
      .filter((row) => row.canonicalKey === wrongTeam.directory[0].canonicalKey)
      .forEach((row) => {
        row.team = "Previous Team";
      });
    expect(
      buildPlayerCatalogBootstrap(wrongTeam).proposals[0].proposedCanonicalKey,
    ).toBeNull();
  });

  it("never infers position from a quote, including QB rushing and RB receiving", () => {
    const input = fixture();
    input.directory[1].position = "QB";
    input.directory[2].position = "RB";
    const result = buildPlayerCatalogBootstrap(input);
    expect(
      result.proposals.find(
        (row) => row.team === "Away 0" && row.slot === "RECEIVER",
      )!.proposedCanonicalKey,
    ).toBeNull();
    expect(
      result.records
        .filter((row) => row.canonicalKey === input.directory[1].canonicalKey)
        .every((row) => row.position === "QB"),
    ).toBe(true);
  });

  it("prefers verified starters and role evidence over a higher line", () => {
    const input = fixture();
    const alternative = addAlternative(input, 0);
    input.quotes = [
      quotes(input, input.directory[0].canonicalKey, 150500),
      quotes(input, alternative, 300500),
    ];
    const result = buildPlayerCatalogBootstrap(input);
    expect(result.proposals[0].proposedCanonicalKey).toBe(
      input.directory[0].canonicalKey,
    );
    expect(result.proposals[0].candidates[0].roleEvidence).toContain(
      "CONFIRMED_STARTER",
    );
  });

  it("ranks receivers by verified usage, supports TE, and flags highest-line fallback uncertainty", () => {
    const input = fixture();
    const alternative = addAlternative(input, 2, "TE");
    input.roles.push({
      ...input.roles[2],
      canonicalKey: alternative,
      usage: 20,
    });
    expect(
      buildPlayerCatalogBootstrap(input).proposals[2].proposedCanonicalKey,
    ).toBe(alternative);
    input.roles = [];
    input.quotes = [
      quotes(input, input.directory[2].canonicalKey, 50500),
      quotes(input, alternative, 70500),
    ];
    const result = buildPlayerCatalogBootstrap(input);
    expect(result.proposals[2].proposedCanonicalKey).toBe(alternative);
    expect(result.proposals[2].warnings).toContain(
      "Proposed role is unconfirmed; review this choice.",
    );
    expect(result.proposals[2].candidates[0].roleEvidence).toContain(
      "role unconfirmed",
    );
  });

  it("does not offer identities lacking a proven complete totals-and-snaps fallback", () => {
    const input = fixture();
    input.mappings.find(
      (row) =>
        row.canonicalKey === input.directory[0].canonicalKey &&
        row.provider === "NFLVERSE",
    )!.secondaryPlayerId = null;
    const result = buildPlayerCatalogBootstrap(input);
    expect(result.proposals[0].proposedCanonicalKey).toBeNull();
    expect(
      result.exceptions.some(
        (row) => row.code === "COMPLETE_RESULT_PATH_UNVERIFIED",
      ),
    ).toBe(true);
  });

  it("does not let one source player ID identify two canonical players", () => {
    const input = fixture();
    const alternative = addAlternative(input, 0);
    const original = input.mappings.find((row) => row.provider === "NFLVERSE")!;
    input.mappings.find(
      (row) => row.canonicalKey === alternative && row.provider === "NFLVERSE",
    )!.externalPlayerId = original.externalPlayerId;
    expect(
      buildPlayerCatalogBootstrap(input).proposals[0].proposedCanonicalKey,
    ).toBeNull();
  });

  it("is deterministic across adapter ordering and rejects future verification", () => {
    const input = fixture();
    addAlternative(input, 0);
    const before = buildPlayerCatalogBootstrap(input);
    input.events.reverse();
    input.directory.reverse();
    input.mappings.reverse();
    input.roles.reverse();
    expect(buildPlayerCatalogBootstrap(input)).toEqual(before);
    input.directory.forEach((row) => {
      row.verifiedAt = "2026-09-14T12:01:00Z";
    });
    expect(buildPlayerCatalogBootstrap(input).records).toEqual([]);
  });
});
