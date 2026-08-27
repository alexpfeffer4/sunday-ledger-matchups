import { createHash } from "node:crypto";
import type { RosterSize } from "@/rulesets/schema";

export type ScheduledMatchup = {
  week: number;
  sideAEntryId: string;
  sideBEntryId: string;
};

export type SchedulePublication = {
  algorithmVersion: "circle-v1";
  seed: string;
  orderedEntryIds: string[];
  matchups: ScheduledMatchup[];
  outputHash: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertRosterSize(value: number): asserts value is RosterSize {
  if (![4, 6, 8, 10, 12, 14, 16].includes(value)) {
    throw new RangeError(
      "The roster must use a supported even size from 4 through 16.",
    );
  }
}

function circleMethod(
  orderedEntryIds: readonly string[],
): [string, string][][] {
  const fixed = orderedEntryIds[0];
  const rotating = orderedEntryIds.slice(1);

  if (!fixed) throw new Error("A fixed entry is required.");

  const rounds: [string, string][][] = [];
  for (
    let roundIndex = 0;
    roundIndex < orderedEntryIds.length - 1;
    roundIndex += 1
  ) {
    const arrangement = [fixed, ...rotating];
    const round: [string, string][] = [];

    for (
      let pairIndex = 0;
      pairIndex < arrangement.length / 2;
      pairIndex += 1
    ) {
      const left = arrangement[pairIndex];
      const right = arrangement[arrangement.length - 1 - pairIndex];
      if (!left || !right)
        throw new Error("Circle method produced an incomplete pair.");
      round.push([left, right]);
    }

    rounds.push(round);
    const last = rotating.pop();
    if (!last) throw new Error("Circle rotation failed.");
    rotating.unshift(last);
  }

  return rounds;
}

export function generateRegularSeasonSchedule(params: {
  entryIds: readonly string[];
  seed: string;
  regularSeasonWeeks?: number;
}): SchedulePublication {
  const regularSeasonWeeks = params.regularSeasonWeeks ?? 14;
  assertRosterSize(params.entryIds.length);

  if (new Set(params.entryIds).size !== params.entryIds.length) {
    throw new Error("Schedule entries must be unique.");
  }

  const orderedEntryIds = [...params.entryIds].sort((left, right) => {
    const hashComparison = sha256(`${params.seed}${left}`).localeCompare(
      sha256(`${params.seed}${right}`),
    );
    return hashComparison || left.localeCompare(right);
  });
  const baseRounds = circleMethod(orderedEntryIds);
  const cycleLength = baseRounds.length;
  const fullCycles = Math.floor(regularSeasonWeeks / cycleLength);
  const extraCount = regularSeasonWeeks % cycleLength;
  const selectedRounds: [string, string][][] = [];

  for (let cycle = 0; cycle < fullCycles; cycle += 1) {
    for (const [roundIndex, round] of baseRounds.entries()) {
      selectedRounds.push(
        round.map(([sideA, sideB]) =>
          (cycle + roundIndex) % 2 === 0 ? [sideA, sideB] : [sideB, sideA],
        ),
      );
    }
  }

  if (extraCount > 0) {
    const extraOffsetModulus = Math.max(1, cycleLength - 1);
    const offset =
      Number.parseInt(sha256(`${params.seed}extra`).slice(0, 12), 16) %
      extraOffsetModulus;
    for (let index = 0; index < extraCount; index += 1) {
      const round = baseRounds[(offset + index) % cycleLength];
      if (!round) throw new Error("Extra schedule round is missing.");
      selectedRounds.push(round.map(([sideA, sideB]) => [sideA, sideB]));
    }
  }

  const matchups = selectedRounds.flatMap((round, weekIndex) =>
    round.map(([sideAEntryId, sideBEntryId]) => ({
      week: weekIndex + 1,
      sideAEntryId,
      sideBEntryId,
    })),
  );
  const outputHash = sha256(
    JSON.stringify({
      algorithmVersion: "circle-v1",
      orderedEntryIds,
      matchups,
    }),
  );

  return {
    algorithmVersion: "circle-v1",
    seed: params.seed,
    orderedEntryIds,
    matchups,
    outputHash,
  };
}
