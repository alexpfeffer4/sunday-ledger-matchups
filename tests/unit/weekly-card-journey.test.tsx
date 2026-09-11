// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { useCardDraft } from "@/components/card/use-card-draft";
import { restoreCardDrafts } from "@/components/card/card-draft-storage";
import { OwnerCardProgress } from "@/components/card/owner-card-progress";
import {
  cardDraftStorageKey,
  ownerCardContext,
} from "@/components/card/owner-card-context";
import { frozenCardRulesFixture } from "../fixtures/card-rules";
import { Stage1CardBuilder } from "@/components/card/stage1-card-builder";
import { reviewLiveCardQuotes } from "@/app/l/[leagueSlug]/card-quote-actions";
import { PairedMatchupView } from "@/components/matchup/paired-matchup-view";
import { projectPairedMatchup } from "@/application/queries/project-paired-matchup";
import {
  makeStage3CardState,
  savedStage3Draft,
} from "../fixtures/stage3-card-journey";
import {
  makePhase6Matchup,
  makePhase6State,
} from "../fixtures/phase6-paired-matchup";
vi.mock("@/app/l/[leagueSlug]/actions", () => ({
  acceptStage1CardAction: vi.fn(),
}));
vi.mock("@/app/l/[leagueSlug]/card-quote-actions", () => ({
  reviewLiveCardQuotes: vi.fn(),
}));
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function store(stakes?: number[]) {
  const state = makeStage3CardState();
  const context = ownerCardContext(state);
  localStorage.setItem(
    cardDraftStorageKey(context)!,
    savedStage3Draft(state, stakes),
  );
  return { state, context };
}

describe("weekly card journey", () => {
  it("hydrates the owner draft without erasing it and shares progress across mounted surfaces", async () => {
    const { state, context } = store([500]);
    const container = document.createElement("div");
    document.body.append(container);
    container.innerHTML = renderToString(
      <OwnerCardProgress context={context} />,
    );
    expect(container).not.toHaveTextContent("500");
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, <OwnerCardProgress context={context} />);
    });
    expect(
      within(container).getByRole("link", { name: "Continue card" }),
    ).toBeVisible();
    expect(container).toHaveTextContent("500 / 1,000 allocated");
    expect(container).toHaveTextContent("Draft saved on this device");
    await act(async () => {
      localStorage.setItem(
        cardDraftStorageKey(context)!,
        savedStage3Draft(state),
      );
      window.dispatchEvent(
        new StorageEvent("storage", { key: cardDraftStorageKey(context) }),
      );
    });
    expect(
      within(container).getByRole("link", { name: "Review card" }),
    ).toHaveAttribute("href", "/l/sunday-friends/slate?review=1");
    await act(async () => root!.unmount());
    container.remove();
    render(<OwnerCardProgress context={context} />);
    expect(screen.getByText("Ready to review")).toBeVisible();
  });

  it("keeps empty, other device, new week, and other owner states distinct from an incomplete card", () => {
    const { context } = store();
    const { rerender } = render(<OwnerCardProgress context={context} />);
    expect(screen.getByText("Ready to review")).toBeVisible();
    rerender(
      <OwnerCardProgress
        context={{
          ...context,
          ownerCard: { ...context.ownerCard!, id: "other-owner-card" },
        }}
      />,
    );
    expect(screen.getByText("Not started")).toBeVisible();
    rerender(
      <OwnerCardProgress
        context={{ ...context, week: { ...context.week!, id: "next-week" } }}
      />,
    );
    expect(screen.getByText("Not started")).toBeVisible();
    localStorage.clear();
    rerender(<OwnerCardProgress context={context} />);
    expect(screen.getByRole("link", { name: "Make picks" })).toBeVisible();
    expect(screen.queryByText("Incomplete")).not.toBeInTheDocument();
  });

  it("reports refused device storage and can recover without losing the in-memory draft", () => {
    const state = makeStage3CardState();
    state.ownerCard!.id = "storage-refusal-card";
    const context = ownerCardContext(state);
    const initial = restoreCardDrafts(
      savedStage3Draft(state, [500]),
      state.slate,
    );
    function Editor() {
      const { drafts, setDrafts } = useCardDraft(context);
      return (
        <button onClick={() => setDrafts(drafts.length ? drafts : initial)}>
          Save draft
        </button>
      );
    }
    const refused = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      });
    render(
      <>
        <OwnerCardProgress context={context} />
        <Editor />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(screen.getByText(/Draft not saved on this device/)).toBeVisible();
    expect(screen.getByText(/500/)).toHaveTextContent("500 / 1,000 allocated");
    refused.mockRestore();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(screen.getByText(/Draft saved on this device/)).toBeVisible();
    expect(
      restoreCardDrafts(
        localStorage.getItem(cardDraftStorageKey(context)!),
        state.slate,
      ),
    ).toHaveLength(1);
  });

  it("recovers sealed server state over a stale device draft and clears only that card", () => {
    const { context } = store();
    localStorage.setItem("unrelated", "keep");
    const { rerender } = render(<OwnerCardProgress context={context} />);
    rerender(
      <OwnerCardProgress
        context={{
          ...context,
          ownerCard: {
            ...context.ownerCard!,
            compliance: "COMPLIANT",
            allocatedCredits: 1000,
            remainingCredits: 0,
          },
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Card sealed" })).toBeVisible();
    expect(screen.getByRole("link", { name: "View card" })).toBeVisible();
    expect(localStorage.getItem(cardDraftStorageKey(context)!)).toBeNull();
    expect(localStorage.getItem("unrelated")).toBe("keep");
  });

  it("closes at the deadline even before commissioner lock without inventing the consequence", async () => {
    const { context } = store([500]);
    const live = {
      ...context,
      mode: "LIVE" as const,
      week: {
        ...context.week!,
        commonLockAt: new Date(Date.now() - 1000).toISOString(),
      },
    };
    const { rerender } = render(<OwnerCardProgress context={live} />);
    await screen.findByRole("heading", { name: "Picks closed" });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText("Incomplete")).not.toBeInTheDocument();
    rerender(
      <OwnerCardProgress
        context={{
          ...live,
          ownerCard: { ...live.ownerCard!, compliance: "INCOMPLETE" },
        }}
      />,
    );
    expect(screen.getByText("Incomplete")).toBeVisible();
  });

  it("identifies identical totals by game and explains total return with the established arithmetic", () => {
    const { state } = store();
    render(<Stage1CardBuilder state={state} initialReview />);
    for (const game of [
      "Harbor Club at Lake Club",
      "River Club at Capital Club",
    ]) {
      const row = screen.getByRole("article", { name: new RegExp(game) });
      expect(row).toHaveTextContent("Over 47.5");
      expect(row).toHaveTextContent("EDT");
      expect(row).toHaveTextContent("Stake500");
      expect(row).toHaveTextContent("Profit if won250");
      expect(row).toHaveTextContent("Total returned if won750");
    }
    expect(screen.getByText(/Sealing is final/)).toBeVisible();
    expect(screen.getByText(/A loss returns 0/)).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Review your complete card" }),
    ).toHaveFocus();
  });

  it("does not call the provider when navigating directly to review and requires an explicit fresh check", () => {
    const { state } = store();
    state.league.mode = "LIVE";
    state.season.rulesetSnapshot = frozenCardRulesFixture("LIVE");
    render(<Stage1CardBuilder state={state} initialReview />);
    expect(reviewLiveCardQuotes).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Confirm and seal card" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Check current odds before sealing" }),
    ).toBeEnabled();
  });

  it("drops an open review when another tab edits the same draft", () => {
    const { state, context } = store();
    render(<Stage1CardBuilder state={state} initialReview />);
    act(() => {
      localStorage.setItem(
        cardDraftStorageKey(context)!,
        savedStage3Draft(state, [500]),
      );
      window.dispatchEvent(
        new StorageEvent("storage", { key: cardDraftStorageKey(context) }),
      );
    });
    expect(
      screen.queryByRole("button", { name: "Confirm and seal card" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeVisible();
  });

  it("keeps the first matchup screen focused on the opponent, deadline, allocation, and action", () => {
    const { state, context } = store([500]);
    const matchup = projectPairedMatchup(state, null)!;
    render(
      <PairedMatchupView
        matchup={matchup}
        refreshControl={<button>Refresh matchup</button>}
        cardProgress={<OwnerCardProgress context={context} />}
      />,
    );
    expect(screen.getByRole("link", { name: "Continue card" })).toBeVisible();
    expect(screen.getAllByText("Jordan Rival").length).toBeGreaterThan(0);
    expect(screen.getByText(/Seal by/)).toHaveTextContent("Sep 13");
    expect(screen.queryByText(/Scores not checked/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Picks by game" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Alex Ledger score/),
    ).not.toBeInTheDocument();
  });

  it.each([
    "LOCKED",
    "PARTIAL_REVEAL",
    "LIVE",
    "PROVISIONAL",
    "FINAL",
    "CORRECTED",
  ] as const)("preserves authorized contest facts in %s", (phase) => {
    render(
      <PairedMatchupView
        matchup={makePhase6Matchup(phase)}
        refreshControl={<button>Refresh matchup</button>}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Picks by game" }),
    ).toBeVisible();
    expect(
      screen.queryByText("SECRET FUTURE OPPONENT PICK"),
    ).not.toBeInTheDocument();
    if (phase === "FINAL" || phase === "CORRECTED")
      expect(screen.getByRole("heading", { name: "You won" })).toBeVisible();
  });

  it("uses the simulation clock and treats an overdue OPEN week as locked", () => {
    const state = makeStage3CardState();
    expect(
      projectPairedMatchup(state, null, new Date("2030-01-01"))?.phase,
    ).toBe("PREGAME");
    state.season.simulatedNow = state.week!.commonLockAt;
    expect(projectPairedMatchup(state, null)?.phase).toBe("LOCKED");
    const corrected = makePhase6State("CORRECTED");
    corrected.state.matchup!.result!.status = "PROVISIONAL";
    expect(
      projectPairedMatchup(corrected.state, corrected.operations, corrected.now)
        ?.resultStatus,
    ).toBe("PROVISIONAL");
  });
});
