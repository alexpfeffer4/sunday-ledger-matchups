import { createHash } from "node:crypto";
import {
  simulateSeason,
  type SimulationMember,
} from "@/domain/season/simulate";

export const exampleSeasonSlug = "example-season";

const neutralEntries = [
  ["north-club", "North Club", "NC"],
  ["south-club", "South Club", "SC"],
  ["east-club", "East Club", "EC"],
  ["west-club", "West Club", "WC"],
  ["harbor-club", "Harbor Club", "HC"],
  ["ridge-club", "Ridge Club", "RC"],
  ["lake-club", "Lake Club", "LC"],
  ["pine-club", "Pine Club", "PC"],
  ["cedar-club", "Cedar Club", "CC"],
  ["summit-club", "Summit Club", "SU"],
] as const;

const members: SimulationMember[] = neutralEntries.map(
  ([entryId, displayName, initials]) => ({
    entryId: `entry-${entryId}`,
    displayName,
    initials,
    deterministicTiebreak: createHash("sha256")
      .update(`example-season:${entryId}`)
      .digest("hex"),
  }),
);

export const exampleSeasonArchive = {
  ...simulateSeason({
    members,
    scheduleSeed: "example-season-2026-v1",
    nflYear: 2026,
    viewerEntryId: "entry-north-club",
  }),
  seasonLabel: "Example Season",
};
