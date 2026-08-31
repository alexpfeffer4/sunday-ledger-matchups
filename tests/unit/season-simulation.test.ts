import { describe, expect, it } from "vitest";
import { simulateSeason } from "@/domain/season/simulate";

function members(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    entryId: `entry-${index + 1}`,
    displayName: `Member ${index + 1}`,
    initials: `M${index + 1}`,
    deterministicTiebreak: index.toString().padStart(64, "0"),
  }));
}

describe("full-season simulation", () => {
  it.each([4, 6, 8, 10, 12, 14, 16])(
    "produces a complete immutable season for %i members",
    (rosterSize) => {
      const archive = simulateSeason({
        members: members(rosterSize),
        scheduleSeed: `stage-2-${rosterSize}`,
        nflYear: 2026,
      });

      expect(archive.regularSeason.weeks).toHaveLength(14);
      expect(archive.schedule.matchups).toHaveLength((rosterSize / 2) * 14);
      expect(archive.regularSeason.finalStandings).toHaveLength(rosterSize);
      expect(archive.playoffs.qualifiers).toHaveLength(rosterSize <= 8 ? 4 : 6);
      expect(archive.playoffs.games).toHaveLength((rosterSize / 2) * 3);
      for (const week of [15, 16, 17]) {
        const postseasonWeek = archive.playoffs.games.filter(
          (matchup) => matchup.week === week,
        );
        expect(postseasonWeek).toHaveLength(rosterSize / 2);
        expect(
          new Set(
            postseasonWeek.flatMap((matchup) => [
              matchup.sideAEntryId,
              matchup.sideBEntryId,
            ]),
          ).size,
        ).toBe(rosterSize);
      }
      expect(archive.week18).toHaveLength(rosterSize / 2);
      expect(
        archive.members.some(
          (member) => member.entryId === archive.playoffs.championEntryId,
        ),
      ).toBe(true);

      for (const week of archive.regularSeason.weeks) {
        expect(week.matchups).toHaveLength(rosterSize / 2);
        expect(week.standings).toHaveLength(rosterSize);
        for (const matchup of week.matchups) {
          expect(
            matchup.cards.every(
              (card) =>
                card.allocatedCredits === 1_000 ||
                card.compliance === "INCOMPLETE",
            ),
          ).toBe(true);
          expect(
            matchup.cards
              .flatMap((card) => card.receipts)
              .every((receipt) => receipt.receiptHash.length === 64),
          ).toBe(true);
        }
      }
    },
  );

  it("re-seeds eligible qualifiers after the three-miss member is removed", () => {
    const archive = simulateSeason({
      members: members(10),
      scheduleSeed: "stage-2-eligibility",
      nflYear: 2026,
    });
    const ineligible = archive.regularSeason.finalStandings.find(
      (standing) => standing.attendanceMisses === 3,
    );

    expect(ineligible?.playoffEligible).toBe(false);
    expect(
      archive.playoffs.qualifiers.some(
        (qualifier) => qualifier.entryId === ineligible?.entryId,
      ),
    ).toBe(false);
    expect(
      archive.playoffs.qualifiers.map((entry) => entry.qualificationSeed),
    ).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
