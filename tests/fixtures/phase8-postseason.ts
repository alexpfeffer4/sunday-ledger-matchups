export const phase8PostseasonRequirements = {
  authority: {
    decisionIds: ["D-003", "D-004", "D-005"] as const,
    rulesetVersion: "1.1",
    implementationPhase: 8,
    prospectiveOnly: true,
    existingFrozenSeasons: "UNCHANGED",
  },
  qualification: {
    minimumChampionshipField: 4,
    eligibleBeforeReinstated: true,
    reinstatementOrder: "OFFICIAL_STANDINGS",
    reinstateOnlyUntilMinimum: true,
    reinstateWhenFourOrMoreEligible: false,
    largeLeagueSlots: 6,
  },
  championshipPath: {
    smallLeague: {
      maximumRosterSize: 8,
      fieldSize: 4,
      week15: "EXHIBITION_ONLY",
      week16Pairings: ["1_VS_4", "2_VS_3"] as const,
    },
    largeLeague: {
      minimumRosterSize: 10,
      maximumFieldSize: 6,
      week15Pairings: ["3_VS_6", "4_VS_5"] as const,
      week15ByeSeeds: [1, 2] as const,
      week16Reseeding: "SEED_1_VS_LOWEST_REMAINING",
    },
    week17Games: ["CHAMPIONSHIP", "THIRD_PLACE"] as const,
    exactScoreTieAdvances: "HIGHER_QUALIFICATION_SEED",
    incompleteChampionshipCard: "ELIMINATED",
    dualIncompleteAdvances: "HIGHER_QUALIFICATION_SEED",
  },
  weeks15Through17: {
    weeks: [15, 16, 17] as const,
    cardsPerMemberPerWeek: 1,
    matchupsPerMemberPerWeek: 1,
    assignmentOrder: [
      "CHAMPIONSHIP_PATH",
      "THIRD_PLACE",
      "ADJACENT_FROZEN_WEEK_14_ORDER",
    ] as const,
    byeSeedsReceiveExhibition: true,
    rematchesAllowed: true,
    regularSeasonAttendanceFrozenAfterWeek: 14,
    exhibitionMiss: {
      label: "Exhibition miss",
      exhibitionScore: 0,
      affects: [] as const,
    },
    protectedFromExhibition: [
      "OFFICIAL_RECORD",
      "POINTS_FOR",
      "ALL_PLAY",
      "ELIGIBILITY",
      "SEED",
      "BRACKET",
      "REGULAR_SEASON_MISSES",
    ] as const,
  },
  week18: {
    state: "WEEK_18_EXHIBITION",
    cardsPerMember: 1,
    matchupsPerMember: 1,
    pairing: "ADJACENT_FINAL_PLACEMENT",
    placementTieBreak: "FROZEN_WEEK_14_STANDINGS",
    incompletion: "EXHIBITION_MISS_ZERO_SCORE_ONLY",
    affectsChampionOrOfficialCompetition: false,
  },
  finality: {
    afterWeek17CorrectionWindow: "CHAMPION_FINAL",
    afterWeek18Finalization: "FINAL",
    archiveFinalOnlyAfterWeek18: true,
    laterWeek17CorrectionMaySupersedeChampion: true,
    firstWeek18SealProtectsPairings: true,
    week18ResultsAreAlwaysAppendOnly: true,
  },
  authoritativeSimulation: {
    implementationPhase: 8,
    sameLifecycleAsLive: true,
    separateFromLive: true,
    callerAuthoredArchivePublication: false,
  },
} as const;

export const sparseQualificationFixtures = [
  {
    eligibleCount: 0,
    reinstatedCount: 4,
    championshipFieldCount: 4,
    vacantLargeLeagueSlots: [5, 6],
    automaticWeek15Advances: [3, 4],
  },
  {
    eligibleCount: 1,
    reinstatedCount: 3,
    championshipFieldCount: 4,
    vacantLargeLeagueSlots: [5, 6],
    automaticWeek15Advances: [3, 4],
  },
  {
    eligibleCount: 2,
    reinstatedCount: 2,
    championshipFieldCount: 4,
    vacantLargeLeagueSlots: [5, 6],
    automaticWeek15Advances: [3, 4],
  },
  {
    eligibleCount: 3,
    reinstatedCount: 1,
    championshipFieldCount: 4,
    vacantLargeLeagueSlots: [5, 6],
    automaticWeek15Advances: [3, 4],
  },
  {
    eligibleCount: 4,
    reinstatedCount: 0,
    championshipFieldCount: 4,
    vacantLargeLeagueSlots: [5, 6],
    automaticWeek15Advances: [3, 4],
  },
  {
    eligibleCount: 5,
    reinstatedCount: 0,
    championshipFieldCount: 5,
    vacantLargeLeagueSlots: [6],
    automaticWeek15Advances: [3],
  },
  {
    eligibleCount: 6,
    reinstatedCount: 0,
    championshipFieldCount: 6,
    vacantLargeLeagueSlots: [],
    automaticWeek15Advances: [],
  },
] as const;

const frozenWeek14Order = [
  "seed-1",
  "seed-2",
  "seed-3",
  "seed-4",
  "seed-5",
  "seed-6",
  "seed-7",
  "seed-8",
  "seed-9",
  "seed-10",
] as const;

export const everyMemberPostseasonFixture = {
  frozenWeek14Order,
  weeks: [
    {
      week: 15,
      matchups: [
        ["seed-3", "seed-6", "CHAMPIONSHIP"],
        ["seed-4", "seed-5", "CHAMPIONSHIP"],
        ["seed-1", "seed-2", "EXHIBITION"],
        ["seed-7", "seed-8", "EXHIBITION"],
        ["seed-9", "seed-10", "EXHIBITION"],
      ],
    },
    {
      week: 16,
      matchups: [
        ["seed-1", "seed-5", "CHAMPIONSHIP"],
        ["seed-2", "seed-3", "CHAMPIONSHIP"],
        ["seed-4", "seed-6", "PLACEMENT"],
        ["seed-7", "seed-8", "EXHIBITION"],
        ["seed-9", "seed-10", "EXHIBITION"],
      ],
    },
    {
      week: 17,
      matchups: [
        ["seed-1", "seed-3", "CHAMPIONSHIP"],
        ["seed-2", "seed-5", "THIRD_PLACE"],
        ["seed-4", "seed-6", "PLACEMENT"],
        ["seed-7", "seed-8", "EXHIBITION"],
        ["seed-9", "seed-10", "EXHIBITION"],
      ],
    },
    {
      week: 18,
      matchups: [
        ["seed-1", "seed-3", "EXHIBITION"],
        ["seed-2", "seed-5", "EXHIBITION"],
        ["seed-4", "seed-6", "EXHIBITION"],
        ["seed-7", "seed-8", "EXHIBITION"],
        ["seed-9", "seed-10", "EXHIBITION"],
      ],
    },
  ],
} as const;

export const week17CorrectionFixtures = [
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
] as const;
