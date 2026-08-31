import type { LivePlayoffState } from "@/application/queries/live-playoff-dtos";
import { phase8aPlayoffState } from "./phase8a-playoff-state";

const entryId = (seed: number) =>
  `84000000-0000-4000-8000-${seed.toString().padStart(12, "0")}`;

const finalPlacement = phase8aPlayoffState.publication.standings.map(
  (standing, index) => ({
    entryId: standing.entryId,
    placement: index + 1,
    role:
      index === 0
        ? ("CHAMPION" as const)
        : index === 1
          ? ("RUNNER_UP" as const)
          : index === 2
            ? ("THIRD_PLACE" as const)
            : index === 3
              ? ("FOURTH_PLACE" as const)
              : index < 6
                ? ("EARLIER_ROUND" as const)
                : ("NON_QUALIFIER" as const),
    tied: false,
  }),
);

const championFinality = {
  championEntryId: entryId(1),
  runnerUpEntryId: entryId(2),
  thirdPlaceEntryIds: [entryId(3)],
  thirdPlaceTied: false,
  finalPlacement,
  terminalResultVersionIds: [
    "86000000-0000-4000-8000-000000000171",
    "86000000-0000-4000-8000-000000000172",
  ],
  finalizedAt: "2027-01-19T18:00:00.000Z",
};

const originalChampionLineage = {
  id: "82000000-0000-4000-8000-000000000003",
  version: 3,
  supersedesId: phase8aPlayoffState.publication.id,
  championEntryId: entryId(1),
  runnerUpEntryId: entryId(2),
  thirdPlaceEntryIds: [entryId(3)],
  thirdPlaceTied: false,
  correctionId: null,
  finalizedAt: "2027-01-19T18:00:00.000Z",
  effective: true,
};

const championPublication: LivePlayoffState["publication"] = {
  ...phase8aPlayoffState.publication,
  id: originalChampionLineage.id,
  version: 3,
  supersedesId: phase8aPlayoffState.publication.id,
  stage: "CHAMPION_FINAL",
  championFinality,
  championLineage: [originalChampionLineage],
  correctionEvidence: {
    effectiveVersion: 3,
    supersedesVersionId: phase8aPlayoffState.publication.id,
    priorVersionCount: 2,
    sourceResultVersionIds: championFinality.terminalResultVersionIds,
  },
};

const week18Matchups: LivePlayoffState["rounds"][number]["matchups"] =
  Array.from({ length: 5 }, (_, index) => ({
    id: `88000000-0000-4000-8000-${(index + 1).toString().padStart(12, "0")}`,
    game: index + 1,
    role: "EXHIBITION" as const,
    scope: "EXHIBITION" as const,
    label: `Exhibition · final places ${index * 2 + 1} and ${index * 2 + 2}`,
    byeExhibition: false,
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
    result: null,
  }));

const week18Round: LivePlayoffState["rounds"][number] = {
  id: "89000000-0000-4000-8000-000000000001",
  version: 1,
  supersedesId: null,
  week: 18,
  scope: "EXHIBITION",
  state: "OPEN",
  commonLockAt: "2027-01-24T17:55:00.000Z",
  publishedAt: "2027-01-19T18:05:00.000Z",
  inputHash: "8".repeat(64),
  sourceResultVersionIds: championFinality.terminalResultVersionIds,
  pairingReplaceable: true,
  matchups: week18Matchups,
};

export const championFinalState: LivePlayoffState = {
  ...phase8aPlayoffState,
  league: {
    ...phase8aPlayoffState.league,
    lifecycle: "CHAMPION_FINAL",
  },
  publication: championPublication,
  archiveComplete: false,
};

export const week18OpenState: LivePlayoffState = {
  ...championFinalState,
  league: { ...championFinalState.league, lifecycle: "WEEK_18_EXHIBITION" },
  rounds: [...championFinalState.rounds, week18Round],
};

export const frozenWeek18State: LivePlayoffState = {
  ...week18OpenState,
  rounds: week18OpenState.rounds.map((round) =>
    round.week === 18
      ? { ...round, state: "LOCKED" as const, pairingReplaceable: false }
      : round,
  ),
};

const correctionId = "8a000000-0000-4000-8000-000000000001";
const correctedChampionFinality = {
  ...championFinality,
  championEntryId: entryId(2),
  runnerUpEntryId: entryId(1),
  terminalResultVersionIds: [
    "86000000-0000-4000-8000-000000000173",
    "86000000-0000-4000-8000-000000000172",
  ],
  finalizedAt: "2027-01-25T18:00:00.000Z",
};

export const correctedChampionState: LivePlayoffState = {
  ...frozenWeek18State,
  publication: {
    ...championPublication,
    id: "82000000-0000-4000-8000-000000000004",
    version: 4,
    supersedesId: championPublication.id,
    championFinality: correctedChampionFinality,
    championLineage: [
      { ...originalChampionLineage, effective: false },
      {
        ...originalChampionLineage,
        id: "82000000-0000-4000-8000-000000000004",
        version: 4,
        supersedesId: originalChampionLineage.id,
        championEntryId: entryId(2),
        runnerUpEntryId: entryId(1),
        correctionId,
        finalizedAt: correctedChampionFinality.finalizedAt,
        effective: true,
      },
    ],
    correctionEvidence: {
      effectiveVersion: 4,
      supersedesVersionId: championPublication.id,
      priorVersionCount: 3,
      sourceResultVersionIds:
        correctedChampionFinality.terminalResultVersionIds,
    },
  },
};

export const finalArchiveState: LivePlayoffState = {
  ...correctedChampionState,
  league: { ...correctedChampionState.league, lifecycle: "FINAL" },
  rounds: correctedChampionState.rounds.map((round) =>
    round.week === 18
      ? {
          ...round,
          state: "FINAL" as const,
          matchups: round.matchups.map((matchup, index) => ({
            ...matchup,
            result: {
              id: `8b000000-0000-4000-8000-${(index + 1).toString().padStart(12, "0")}`,
              status: "FINAL" as const,
              sideADecision: index === 0 ? null : ("WIN" as const),
              sideBDecision: index === 0 ? null : ("LOSS" as const),
              sideAScoreCenticredits: index === 0 ? 0 : 112_000,
              sideBScoreCenticredits: index === 0 ? 95_000 : 101_000,
              sideAParticipation:
                index === 0
                  ? ("EXHIBITION_MISS" as const)
                  : ("COMPLETED" as const),
              sideBParticipation: "COMPLETED" as const,
              advancingEntryId: null,
            },
          })),
        }
      : round,
  ),
  archiveComplete: true,
};
