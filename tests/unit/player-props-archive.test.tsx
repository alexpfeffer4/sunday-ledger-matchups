// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { exampleSeasonArchive } from "@/adapters/example/example-season";
import { seasonArchiveSchema } from "@/application/queries/season-archive-dtos";
import { SeasonArchiveMyCard } from "@/components/season/archive-views";

afterEach(cleanup);

it("retains distinct archived player identities, signed final yards, accepted terms and original hashes", () => {
  const archive = seasonArchiveSchema.parse(
    structuredClone(exampleSeasonArchive),
  );
  const card = archive.week18
    .flatMap((game) => game.cards)
    .find((card) => card.entryId === archive.viewerEntryId)!;
  const base = card.receipts[0]!;
  card.receipts = [
    {
      ...base,
      id: "player-one",
      subjectId: "00000000-0000-4000-8000-000000000001",
      subjectLabel: "First Quarterback",
      subjectTeam: "Harbor",
      statistic: "PASSING_YARDS",
      period: "FULL_GAME",
      marketType: "PLAYER_PASSING_YARDS",
      selection: "OVER",
      lineMilli: 0,
      finalYards: 0,
      outcome: "PUSH",
      returnedCenticredits: 10000,
    },
    {
      ...base,
      id: "player-two",
      subjectId: "00000000-0000-4000-8000-000000000002",
      subjectLabel: "Second Quarterback",
      subjectTeam: "Lake",
      statistic: "PASSING_YARDS",
      period: "FULL_GAME",
      marketType: "PLAYER_PASSING_YARDS",
      selection: "UNDER",
      lineMilli: 1500,
      finalYards: -5,
      playerEvidenceVersion: 2,
      playerCorrectionReason: "A completed pass was ruled a lateral.",
      outcome: "WIN",
      returnedCenticredits: 19090,
    },
  ];
  const before = JSON.stringify(card.receipts);
  render(<SeasonArchiveMyCard archive={archive} />);
  expect(
    screen.getByText("First Quarterback · Over · Passing yards"),
  ).toBeVisible();
  expect(
    screen.getByText("Second Quarterback · Under · Passing yards"),
  ).toBeVisible();
  expect(
    screen.getByText("Harbor · Full game, including overtime"),
  ).toBeVisible();
  expect(screen.getByText("Final: 0 passing yards")).toBeVisible();
  expect(screen.getByText("Final: -5 passing yards")).toBeVisible();
  expect(
    screen.getByText(
      "Player result corrected: A completed pass was ruled a lateral.",
    ),
  ).toBeVisible();
  expect(screen.getByText("Push · 100.00 returned")).toBeVisible();
  expect(screen.getByText("Won · 190.90 returned")).toBeVisible();
  expect(screen.getAllByText(base.receiptHash)).toHaveLength(2);
  expect(JSON.stringify(card.receipts)).toBe(before);
});
