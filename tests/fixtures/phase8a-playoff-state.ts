import type { LivePlayoffState } from "@/application/queries/live-playoff-dtos";

const entryId = (seed: number) =>
  `84000000-0000-4000-8000-${seed.toString().padStart(12, "0")}`;

const standings = Array.from({ length: 10 }, (_, index) => ({
  seed: index + 1,
  entryId: entryId(index + 1),
  displayName: `Ledger Member ${index + 1}`,
  wins: 10 - index,
  losses: index + 4,
  ties: 0,
  pointsForCenticredits: 150_000 - index * 1_000,
  allPlayHalfWinUnits: 90 - index,
  allPlayComparisonCount: 126,
  attendanceMisses: index < 3 ? 0 : 3,
  highestWeekCenticredits: 120_000 - index * 500,
  deterministicTiebreak: `${index + 1}`.repeat(64).slice(0, 64),
}));

const qualifiers = standings.slice(0, 4).map((standing, index) => ({
  ...standing,
  qualificationSeed: index + 1,
  regularSeasonSeed: standing.seed,
  eligibilityStatus:
    index < 3 ? ("ELIGIBLE" as const) : ("INELIGIBLE" as const),
  selectionReason:
    index < 3
      ? ("ELIGIBLE_STANDINGS" as const)
      : ("MINIMUM_FOUR_CHAMPIONSHIP_FIELD" as const),
  attendanceMissesUsedByQualification: standing.attendanceMisses,
}));

const paired = Array.from({ length: 5 }, (_, index) => ({
  id: `85000000-0000-4000-8000-${(index + 1).toString().padStart(12, "0")}`,
  game: index + 1,
  role: "EXHIBITION" as const,
  scope: "EXHIBITION" as const,
  label: index < 2 ? "Bye exhibition" : "Exhibition",
  byeExhibition: index < 2,
  sideA: {
    entryId: entryId(index * 2 + 1),
    displayName: `Ledger Member ${index * 2 + 1}`,
    qualificationSeed: index * 2 + 1 <= 4 ? index * 2 + 1 : null,
  },
  sideB: {
    entryId: entryId(index * 2 + 2),
    displayName: `Ledger Member ${index * 2 + 2}`,
    qualificationSeed: index * 2 + 2 <= 4 ? index * 2 + 2 : null,
  },
  result:
    index === 0
      ? {
          id: "86000000-0000-4000-8000-000000000001",
          status: "FINAL" as const,
          sideADecision: null,
          sideBDecision: null,
          sideAScoreCenticredits: 0,
          sideBScoreCenticredits: 100_000,
          sideAParticipation: "EXHIBITION_MISS" as const,
          sideBParticipation: "COMPLETED" as const,
          advancingEntryId: null,
        }
      : null,
}));

export const phase8aPlayoffState: LivePlayoffState = {
  league: {
    id: "81000000-0000-4000-8000-000000000001",
    name: "Sunday Ledger",
    slug: "sunday-ledger",
    nflYear: 2026,
    lifecycle: "PLAYOFFS",
  },
  publication: {
    id: "82000000-0000-4000-8000-000000000001",
    version: 2,
    supersedesId: "82000000-0000-4000-8000-000000000000",
    publishedAt: "2026-12-29T16:00:00.000Z",
    inputHash: "a".repeat(64),
    sourceResultVersionIds: ["86000000-0000-4000-8000-000000000014"],
    stage: "QUALIFICATION",
    rosterSize: 10,
    expectedQualifierCount: 6,
    actualQualifierCount: 4,
    standings,
    qualifiers,
    bracket: {
      format: "SIX_SLOT",
      minimumFieldSize: 4,
      maximumFieldSize: 6,
      slots: Array.from({ length: 6 }, (_, index) => ({
        slot: index + 1,
        state: index < 4 ? ("OCCUPIED" as const) : ("VACANT" as const),
        entry: qualifiers[index] ?? null,
      })),
      automaticWeek15Advancements: qualifiers.map((entry, index) => ({
        entry,
        fromWeek: 15 as const,
        toWeek: 16 as const,
        reason:
          index < 2
            ? ("TOP_TWO_SEED_BYE" as const)
            : ("VACANT_OPPONENT" as const),
      })),
      championshipAdvancementRule:
        "HIGHER_QUALIFICATION_SEED_ON_EXACT_TIE_OR_DUAL_INCOMPLETION",
    },
    legacy: false,
    tieRule:
      "Higher qualification seed advances an exact championship tie or dual incompletion",
    attendanceMissLimit: 3,
    correctionEvidence: {
      effectiveVersion: 2,
      supersedesVersionId: "82000000-0000-4000-8000-000000000000",
      priorVersionCount: 1,
      sourceResultVersionIds: ["86000000-0000-4000-8000-000000000014"],
    },
    championFinality: null,
    championLineage: [],
  },
  rounds: [
    {
      id: "83000000-0000-4000-8000-000000000001",
      version: 2,
      supersedesId: "83000000-0000-4000-8000-000000000000",
      week: 15,
      scope: "EXHIBITION",
      state: "FINAL",
      commonLockAt: "2027-01-03T17:55:00.000Z",
      publishedAt: "2026-12-29T16:05:00.000Z",
      inputHash: "b".repeat(64),
      sourceResultVersionIds: [],
      matchups: paired,
    },
  ],
  archiveComplete: false,
  viewer: {
    userId: "87000000-0000-4000-8000-000000000001",
    isCommissioner: true,
  },
};
