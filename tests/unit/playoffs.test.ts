import { describe, expect, it } from "vitest";
import {
  constructBracketRepresentation,
  constructEffectivePostseasonMatchups,
  reseedLargeLeagueSemifinals,
  selectChampionshipField,
  type ChampionshipOutcome,
  type QualifiedEntry,
} from "@/domain/playoffs/bracket";
import type { StandingRow } from "@/domain/standings/rank";
import {
  everyMemberPostseasonFixture,
  sparseQualificationFixtures,
} from "@/../tests/fixtures/phase8-postseason";

function standings(
  rosterSize: number,
  eligibleSeeds: ReadonlySet<number> = new Set(
    Array.from({ length: rosterSize }, (_, index) => index + 1),
  ),
): StandingRow[] {
  return Array.from({ length: rosterSize }, (_, index) => ({
    entryId: `seed-${index + 1}`,
    wins: rosterSize - index,
    losses: index,
    ties: 0,
    pointsForCenticredits: BigInt(100_000 - index),
    allPlayHalfWinUnits: rosterSize - index,
    allPlayComparisonCount: rosterSize - 1,
    attendanceMisses: eligibleSeeds.has(index + 1) ? 0 : 3,
    highestWeekCenticredits: BigInt(100_000 - index),
    deterministicTiebreak: `${index}`.padStart(2, "0"),
  }));
}

function outcomesFor(
  games: ReturnType<typeof constructEffectivePostseasonMatchups>,
) {
  return games
    .filter((game) => game.role === "CHAMPIONSHIP")
    .map((game): ChampionshipOutcome => ({
      winner: game.sideA as QualifiedEntry,
      loser: game.sideB as QualifiedEntry,
      sourceResultVersionId: `result-${game.week}-${game.sideA.entryId}`,
    }));
}

function expectEveryMember(
  games: ReturnType<typeof constructEffectivePostseasonMatchups>,
  rosterSize: number,
) {
  const entries = games.flatMap((game) => [
    game.sideA.entryId,
    game.sideB.entryId,
  ]);
  expect(games).toHaveLength(rosterSize / 2);
  expect(entries).toHaveLength(rosterSize);
  expect(new Set(entries)).toHaveLength(rosterSize);
}

describe("Phase 8A playoff qualification", () => {
  for (const fixture of sparseQualificationFixtures) {
    it(`selects and represents ${fixture.eligibleCount} eligible members`, () => {
      const eligibleSeeds = new Set(
        Array.from({ length: fixture.eligibleCount }, (_, index) => index + 1),
      );
      const sixSlot = selectChampionshipField({
        orderedStandings: standings(10, eligibleSeeds),
        playoffIneligibilityAtMisses: 3,
        format: "SIX_SLOT",
      });
      const fourSlot = selectChampionshipField({
        orderedStandings: standings(10, eligibleSeeds),
        playoffIneligibilityAtMisses: 3,
        format: "FOUR_SLOT",
      });
      const bracket = constructBracketRepresentation(sixSlot);

      expect(
        sixSlot.qualifiers.filter(
          (entry) =>
            entry.selectionReason === "MINIMUM_FOUR_CHAMPIONSHIP_FIELD",
        ),
      ).toHaveLength(fixture.reinstatedCount);
      expect(sixSlot.qualifiers).toHaveLength(fixture.championshipFieldCount);
      expect(fourSlot.qualifiers).toHaveLength(4);
      expect(
        bracket.slots
          .filter((slot) => slot.state === "VACANT")
          .map((slot) => slot.slot),
      ).toEqual([...fixture.vacantLargeLeagueSlots]);
      expect(
        bracket.automaticWeek15Advancements
          .filter((advance) => advance.reason === "VACANT_OPPONENT")
          .map((advance) => advance.entry.qualificationSeed),
      ).toEqual([...fixture.automaticWeek15Advances]);
    });
  }

  it("seeds every eligible member before reinstated members while preserving each group order", () => {
    const field = selectChampionshipField({
      orderedStandings: standings(10, new Set([2, 5, 8])),
      playoffIneligibilityAtMisses: 3,
      format: "SIX_SLOT",
    });
    expect(field.qualifiers).toMatchObject([
      {
        regularSeasonSeed: 2,
        qualificationSeed: 1,
        eligibilityStatus: "ELIGIBLE",
      },
      {
        regularSeasonSeed: 5,
        qualificationSeed: 2,
        eligibilityStatus: "ELIGIBLE",
      },
      {
        regularSeasonSeed: 8,
        qualificationSeed: 3,
        eligibilityStatus: "ELIGIBLE",
      },
      {
        regularSeasonSeed: 1,
        qualificationSeed: 4,
        eligibilityStatus: "INELIGIBLE",
        attendanceMissesUsedByQualification: 3,
      },
    ]);
  });
});

describe("Phase 8A effective Week 15–17 matchups", () => {
  for (const rosterSize of [4, 6, 8, 10, 12, 14, 16]) {
    it(`gives every member exactly one matchup in every postseason week for ${rosterSize}`, () => {
      const ordered = standings(rosterSize);
      const frozenOrder = ordered.map((row) => row.entryId);
      const field = selectChampionshipField({
        orderedStandings: ordered,
        playoffIneligibilityAtMisses: 3,
      });
      const week15 = constructEffectivePostseasonMatchups({
        week: 15,
        field,
        frozenWeek14Order: frozenOrder,
      });
      const week16 = constructEffectivePostseasonMatchups({
        week: 16,
        field,
        frozenWeek14Order: frozenOrder,
        priorChampionshipOutcomes: outcomesFor(week15),
      });
      const week17 = constructEffectivePostseasonMatchups({
        week: 17,
        field,
        frozenWeek14Order: frozenOrder,
        priorChampionshipOutcomes: outcomesFor(week16),
      });
      expectEveryMember(week15, rosterSize);
      expectEveryMember(week16, rosterSize);
      expectEveryMember(week17, rosterSize);
      expect(
        week17.filter((game) => game.role === "CHAMPIONSHIP"),
      ).toHaveLength(1);
      expect(week17.filter((game) => game.role === "THIRD_PLACE")).toHaveLength(
        1,
      );
    });
  }

  it("labels top-seed Week 15 cards as bye exhibitions without adding advancement games", () => {
    const ordered = standings(10);
    const field = selectChampionshipField({
      orderedStandings: ordered,
      playoffIneligibilityAtMisses: 3,
    });
    const week15 = constructEffectivePostseasonMatchups({
      week: 15,
      field,
      frozenWeek14Order: ordered.map((row) => row.entryId),
    });
    expect(
      week15.find((game) =>
        [game.sideA.entryId, game.sideB.entryId].includes("seed-1"),
      ),
    ).toMatchObject({ role: "EXHIBITION", byeExhibition: true });
    expect(week15.filter((game) => game.role === "CHAMPIONSHIP")).toHaveLength(
      2,
    );
  });

  it("records four-slot Week 15 advancement and labels qualifier cards as bye exhibitions", () => {
    const ordered = standings(8);
    const field = selectChampionshipField({
      orderedStandings: ordered,
      playoffIneligibilityAtMisses: 3,
    });
    const bracket = constructBracketRepresentation(field);
    const week15 = constructEffectivePostseasonMatchups({
      week: 15,
      field,
      frozenWeek14Order: ordered.map((row) => row.entryId),
    });

    expect(bracket.automaticWeek15Advancements).toHaveLength(4);
    expect(
      bracket.automaticWeek15Advancements.map((advance) => advance.reason),
    ).toEqual(Array(4).fill("FOUR_SLOT_EXHIBITION_BYE"));
    for (const qualifier of field.qualifiers) {
      expect(
        week15.find((game) =>
          [game.sideA.entryId, game.sideB.entryId].includes(qualifier.entryId),
        ),
      ).toMatchObject({ role: "EXHIBITION", byeExhibition: true });
    }
  });

  it("re-seeds so No. 1 faces the numerically lowest-ranked survivor", () => {
    const field = selectChampionshipField({
      orderedStandings: standings(10),
      playoffIneligibilityAtMisses: 3,
    });
    const semifinals = reseedLargeLeagueSemifinals({
      seedOne: field.qualifiers[0]!,
      seedTwo: field.qualifiers[1]!,
      openingRoundWinners: [field.qualifiers[2]!, field.qualifiers[4]!],
    });
    expect(semifinals[0].sideB.qualificationSeed).toBe(5);
    expect(semifinals[1].sideB.qualificationSeed).toBe(3);
  });

  it("executes the promoted Week 15–17 conformance fixture through the production kernel", () => {
    const ordered = standings(10);
    const field = selectChampionshipField({
      orderedStandings: ordered,
      playoffIneligibilityAtMisses: 3,
    });
    const week15 = constructEffectivePostseasonMatchups({
      week: 15,
      field,
      frozenWeek14Order: everyMemberPostseasonFixture.frozenWeek14Order,
    });
    const week16 = constructEffectivePostseasonMatchups({
      week: 16,
      field,
      frozenWeek14Order: everyMemberPostseasonFixture.frozenWeek14Order,
      priorChampionshipOutcomes: [
        {
          winner: field.qualifiers[2]!,
          loser: field.qualifiers[5]!,
        },
        {
          winner: field.qualifiers[4]!,
          loser: field.qualifiers[3]!,
        },
      ],
    });
    const week17 = constructEffectivePostseasonMatchups({
      week: 17,
      field,
      frozenWeek14Order: everyMemberPostseasonFixture.frozenWeek14Order,
      priorChampionshipOutcomes: [
        {
          winner: field.qualifiers[0]!,
          loser: field.qualifiers[4]!,
        },
        {
          winner: field.qualifiers[2]!,
          loser: field.qualifiers[1]!,
        },
      ],
    });

    for (const [actual, fixture] of [week15, week16, week17].map(
      (games, index) =>
        [games, everyMemberPostseasonFixture.weeks[index]!] as const,
    )) {
      expect(actual.map((game) => game.role)).toEqual(
        fixture.matchups.map(([, , role]) => role),
      );
      expect(
        actual.map((game) =>
          [game.sideA.entryId, game.sideB.entryId].toSorted(),
        ),
      ).toEqual(
        fixture.matchups.map(([sideA, sideB]) => [sideA, sideB].toSorted()),
      );
    }
  });

  it("does not mutate frozen Week 14 standings or attendance", () => {
    const ordered = standings(10, new Set([2, 5, 8]));
    const before = JSON.stringify(ordered, (_, value) =>
      typeof value === "bigint" ? value.toString() : value,
    );
    const field = selectChampionshipField({
      orderedStandings: ordered,
      playoffIneligibilityAtMisses: 3,
    });
    constructEffectivePostseasonMatchups({
      week: 15,
      field,
      frozenWeek14Order: ordered.map((row) => row.entryId),
    });
    expect(
      JSON.stringify(ordered, (_, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    ).toBe(before);
  });
});
