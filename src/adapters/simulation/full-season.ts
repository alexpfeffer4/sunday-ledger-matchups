import { createHash } from "node:crypto";
import {
  simulateSeason,
  type SimulationMember,
} from "@/domain/season/simulate";

export const fullSeasonSimulationSlug = "west-21st-ledger-archive";

const names = [
  ["pfeff", "Pfeff", "AP"],
  ["mia", "Mia", "MC"],
  ["ders", "Ders", "DS"],
  ["joe", "Joe", "JB"],
  ["drew", "Drew", "DR"],
  ["lee", "Lee", "LE"],
  ["malcolm", "Malcolm", "MG"],
  ["sam", "Sam", "SK"],
  ["nina", "Nina", "NR"],
  ["omar", "Omar", "OA"],
] as const;

const members: SimulationMember[] = names.map(
  ([entryId, displayName, initials]) => ({
    entryId: `entry-${entryId}`,
    displayName,
    initials,
    deterministicTiebreak: createHash("sha256")
      .update(`west-21st-ledger:${entryId}`)
      .digest("hex"),
  }),
);

export function createFullSeasonSimulationArchive() {
  return simulateSeason({
    members,
    scheduleSeed: "west-21st-ledger-2026-full-season-v1",
    nflYear: 2026,
    viewerEntryId: "entry-pfeff",
  });
}

export const fullSeasonSimulationArchive = createFullSeasonSimulationArchive();
