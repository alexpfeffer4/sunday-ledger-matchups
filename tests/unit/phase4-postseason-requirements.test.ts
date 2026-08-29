import { describe, expect, it } from "vitest";
import {
  everyMemberPostseasonFixture,
  phase8PostseasonRequirements,
  sparseQualificationFixtures,
  week17CorrectionFixtures,
} from "../fixtures/phase8-postseason";

describe("Phase 8 postseason requirements prepared by Phase 4", () => {
  it("covers every approved eligible-count fixture without inventing a no-champion state", () => {
    expect(sparseQualificationFixtures.map((row) => row.eligibleCount)).toEqual(
      [0, 1, 2, 3, 4, 5, 6],
    );
    expect(
      sparseQualificationFixtures.every(
        (row) => row.championshipFieldCount >= 4,
      ),
    ).toBe(true);
    expect(
      sparseQualificationFixtures.map((row) => row.reinstatedCount),
    ).toEqual([4, 3, 2, 1, 0, 0, 0]);
  });

  it("encodes the exact vacant-slot advancements for a 10+ member league", () => {
    expect(sparseQualificationFixtures[4]).toMatchObject({
      vacantLargeLeagueSlots: [5, 6],
      automaticWeek15Advances: [3, 4],
    });
    expect(sparseQualificationFixtures[5]).toMatchObject({
      vacantLargeLeagueSlots: [6],
      automaticWeek15Advances: [3],
    });
  });

  it("keeps every-member exhibitions isolated from official competition", () => {
    expect(
      phase8PostseasonRequirements.weeks15Through17.matchupsPerMemberPerWeek,
    ).toBe(1);
    expect(phase8PostseasonRequirements.week18.matchupsPerMember).toBe(1);
    expect(
      phase8PostseasonRequirements.weeks15Through17.exhibitionMiss.affects,
    ).toEqual([]);
    expect(
      phase8PostseasonRequirements.week18.affectsChampionOrOfficialCompetition,
    ).toBe(false);

    for (const week of everyMemberPostseasonFixture.weeks) {
      const participants = week.matchups.flatMap(([sideA, sideB]) => [
        sideA,
        sideB,
      ]);
      expect(participants).toHaveLength(10);
      expect(new Set(participants)).toEqual(
        new Set(everyMemberPostseasonFixture.frozenWeek14Order),
      );
    }
  });

  it("preserves exact bracket tie, incompletion, bye, and reseeding requirements", () => {
    expect(
      phase8PostseasonRequirements.championshipPath.exactScoreTieAdvances,
    ).toBe("HIGHER_QUALIFICATION_SEED");
    expect(
      phase8PostseasonRequirements.championshipPath.incompleteChampionshipCard,
    ).toBe("ELIMINATED");
    expect(
      phase8PostseasonRequirements.championshipPath.largeLeague.week15ByeSeeds,
    ).toEqual([1, 2]);
    expect(
      phase8PostseasonRequirements.championshipPath.largeLeague.week16Reseeding,
    ).toBe("SEED_1_VS_LOWEST_REMAINING");
  });

  it("keeps champion, Week 18, and archive finality distinct", () => {
    expect(
      phase8PostseasonRequirements.finality.afterWeek17CorrectionWindow,
    ).toBe("CHAMPION_FINAL");
    expect(phase8PostseasonRequirements.week18.state).toBe(
      "WEEK_18_EXHIBITION",
    );
    expect(phase8PostseasonRequirements.finality.afterWeek18Finalization).toBe(
      "FINAL",
    );
    expect(
      phase8PostseasonRequirements.finality.firstWeek18SealProtectsPairings,
    ).toBe(true);
    expect(week17CorrectionFixtures).toEqual([
      {
        firstWeek18CardAccepted: false,
        maySupersedeChampion: true,
        mayRegenerateUnsealedWeek18Pairings: true,
        mayRewriteWeek18Results: false,
      },
      {
        firstWeek18CardAccepted: true,
        maySupersedeChampion: true,
        mayRegenerateUnsealedWeek18Pairings: false,
        mayRewriteWeek18Results: false,
      },
    ]);
  });

  it("reserves same-lifecycle authoritative Simulation for Phase 8", () => {
    expect(
      phase8PostseasonRequirements.authoritativeSimulation.implementationPhase,
    ).toBe(8);
    expect(
      phase8PostseasonRequirements.authoritativeSimulation.sameLifecycleAsLive,
    ).toBe(true);
    expect(
      phase8PostseasonRequirements.authoritativeSimulation
        .callerAuthoredArchivePublication,
    ).toBe(false);
  });
});
