// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Stage1StateDto } from "@/application/queries/stage1-dtos";
import { CardResetHistory } from "@/components/card/card-reset-history";
import { Stage1CardView } from "@/components/stage1/live-views";
import { simulationSeason13Ruleset } from "@/rulesets/simulation-season-1-3";
import { frozenCardRulesFixture } from "../fixtures/card-rules";
import { makePhase6State } from "../fixtures/phase6-paired-matchup";

const queries = vi.hoisted(() => ({ live: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
}));
vi.mock("@/application/queries/get-live-stage1-league", () => ({
  getLeagueState: queries.live,
}));
import ReceiptPage from "@/app/l/[leagueSlug]/receipt/[receiptId]/page";

function resetState() {
  const { state } = makePhase6State("PREGAME");
  const original = { ...state.ownerCard!.positions[0]!, stakeCredits: 250 };
  const active = { ...state.ownerCard!.positions[1]!, stakeCredits: 300 };
  state.league.mode = "SIMULATION";
  state.season.simulatedNow = "2026-09-13T16:30:00.000Z";
  state.season.rulesetSnapshot = frozenCardRulesFixture(
    "SIMULATION",
    simulationSeason13Ruleset,
  );
  state.week = {
    ...state.week!,
    nflWeek: 2,
    rollingSubmissionsEnabled: true,
    entryClosed: false,
    entryClosesAt: "2026-09-15T00:15:00.000Z",
  };
  state.ownerCard = {
    ...state.ownerCard!,
    cardGeneration: 1,
    resetAt: "2026-09-13T16:20:00.000Z",
    resetReceipts: [
      {
        id: original.id,
        receiptHash: original.receiptHash,
        eventLabel: original.eventLabel,
        marketType: original.marketType,
        proposition: original.proposition,
        americanOdds: original.americanOdds,
        stakeCredits: original.stakeCredits,
        acceptedAt: original.acceptedAt,
      },
    ],
    positions: [],
    allocatedCredits: 0,
    remainingCredits: 1000,
    lockedAt: null,
    compliance: "PENDING",
    rollingSubmissionsEnabled: true,
    canSubmit: true,
  };
  return { state, original, active };
}
function page(state: Stage1StateDto | null, receiptId: string) {
  queries.live.mockResolvedValue(state);
  return ReceiptPage({
    params: Promise.resolve({ leagueSlug: "sunday-ledger", receiptId }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
});
afterEach(cleanup);

describe("reset receipt access and original terms", () => {
  it("keeps an owner's original receipt URL readable without assigning a result to the reset", async () => {
    const { state, original } = resetState();
    const before = structuredClone(state.ownerCard);
    const { container } = render(await page(state, original.id));
    expect(queries.live).toHaveBeenCalledWith("sunday-ledger");
    expect(
      screen.getByRole("heading", { name: "Reset pick receipt" }),
    ).toBeVisible();
    expect(
      screen.getByText(original.eventLabel, { exact: true }),
    ).toBeVisible();
    expect(
      screen.getByText("Harbor Club at +100 for 250 credits.", { exact: true }),
    ).toBeVisible();
    expect(screen.getByText(/Originally accepted/)).toBeVisible();
    expect(
      screen.getByText(/no longer counts toward the card or score/),
    ).toBeVisible();
    const hash = screen.getByText(original.receiptHash, { exact: true });
    expect(hash).not.toBeVisible();
    fireEvent.click(screen.getByText("Audit details", { exact: true }));
    expect(hash).toBeVisible();
    expect(
      screen.getByText(/without grading it as a win, loss or void/),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Back to your card" }),
    ).toHaveAttribute("href", `/l/${state.league.slug}/card`);
    expect(container.querySelector(".status-badge")).toBeNull();
    expect(
      screen.queryByText(
        /^(Won|Lost|Push|Void|Pending|Settled|Official result)$/,
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Official result:/)).not.toBeInTheDocument();
    expect(state.ownerCard).toEqual(before);
  });

  it("continues to serve a newly accepted active receipt separately", async () => {
    const { state, active, original } = resetState();
    state.ownerCard!.positions = [active];
    render(await page(state, active.id));
    expect(screen.getByRole("heading", { name: "Pick receipt" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Reset pick receipt" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(original.receiptHash, { exact: true }),
    ).not.toBeInTheDocument();
  });

  it("rejects an unknown receipt even when the owner has reset history", async () => {
    const { state } = resetState();
    await expect(
      page(state, "00000000-0000-4000-8000-000000000099"),
    ).rejects.toThrow("not found");
  });

  it("rejects another member's visible receipt instead of using matchup data as owner authorization", async () => {
    const { state } = resetState();
    const opponent =
      makePhase6State("FINAL").state.matchup!.opponentRevealedPositions[0]!;
    state.matchup!.opponentRevealedPositions = [opponent];
    await expect(page(state, opponent.id)).rejects.toThrow("not found");
  });

  it.each(["unavailable league", "no owner card"])(
    "rejects an old receipt for %s",
    async (condition) => {
      const { state, original } = resetState();
      if (condition === "no owner card") state.ownerCard = null;
      await expect(
        page(condition === "unavailable league" ? null : state, original.id),
      ).rejects.toThrow("not found");
    },
  );
});

describe("owner reset history presentation", () => {
  it("keeps retired picks out of active counts and shows only the owner's audit history", () => {
    const { state, original } = resetState();
    const opponent =
      makePhase6State("FINAL").state.matchup!.opponentRevealedPositions[0]!;
    state.matchup!.opponentRevealedPositions = [
      { ...opponent, proposition: "ANOTHER MEMBER'S PRIVATE RECEIPT" },
    ];
    render(<Stage1CardView state={state} />);
    const progress = screen.getByRole("region", {
      name: "Your weekly card",
    });
    expect(progress).toHaveTextContent(
      "0 submitted bets · 0 credits committed",
    );
    expect(
      within(progress).getByText("Available to bet").nextElementSibling,
    ).toHaveTextContent("1,000");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your Week 2 picks were reset",
    );
    expect(
      screen.queryByRole("link", { name: "View receipt" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("ANOTHER MEMBER'S PRIVATE RECEIPT"),
    ).not.toBeInTheDocument();
    const summary = screen.getByText("Reset receipt history", { exact: true });
    const disclosure = summary.closest("details")!;
    expect(disclosure).not.toHaveAttribute("open");
    fireEvent.click(summary);
    expect(
      within(disclosure).getByText("250 credits · Reset", { exact: true }),
    ).toBeVisible();
    expect(
      within(disclosure).getByText(original.receiptHash, { exact: true }),
    ).toBeVisible();
    expect(
      within(disclosure).getByRole("link", { name: original.proposition }),
    ).toHaveAttribute("href", `/l/${state.league.slug}/receipt/${original.id}`);
  });

  it("shows the new bet as active while keeping the prior generation in its disclosure", () => {
    const { state, original, active } = resetState();
    state.ownerCard!.positions = [active];
    state.ownerCard!.allocatedCredits = 300;
    state.ownerCard!.remainingCredits = 700;
    render(<Stage1CardView state={state} />);
    expect(
      screen.getByRole("region", { name: "Your weekly card" }),
    ).toHaveTextContent("1 submitted bet · 300 credits committed");
    expect(screen.getByRole("link", { name: "View receipt" })).toHaveAttribute(
      "href",
      `/l/${state.league.slug}/receipt/${active.id}`,
    );
    const archivedHash = screen.getByText(original.receiptHash, {
      exact: true,
    });
    expect(archivedHash).not.toBeVisible();
    expect(archivedHash.closest("details")).toContainElement(
      screen.getByText("Reset receipt history"),
    );
  });

  it("does not render reset history when no owner reset receipts exist", () => {
    const { container } = render(
      <CardResetHistory leagueSlug="sunday-ledger" receipts={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
