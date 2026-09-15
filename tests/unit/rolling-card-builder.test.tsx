// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Stage1CardBuilder } from "@/components/card/stage1-card-builder";
import { OwnerCardProgress } from "@/components/card/owner-card-progress";
import {
  ownerCardContext,
  cardDraftStorageKey,
} from "@/components/card/owner-card-context";
import { submissionAttemptId } from "@/components/card/submission-attempt";
import { restoreCardDrafts } from "@/components/card/card-draft-storage";
import { reviewLiveCardQuotes } from "@/app/l/[leagueSlug]/card-quote-actions";
import { acceptStage1CardAction } from "@/app/l/[leagueSlug]/actions";
import { simulationSeason13Ruleset } from "@/rulesets/simulation-season-1-3";
import { frozenCardRulesFixture } from "../fixtures/card-rules";
import {
  makeStage3CardState,
  savedStage3Draft,
} from "../fixtures/stage3-card-journey";
vi.mock("@/app/l/[leagueSlug]/actions", () => ({
  acceptStage1CardAction: vi.fn(),
}));
vi.mock("@/app/l/[leagueSlug]/card-quote-actions", () => ({
  reviewLiveCardQuotes: vi.fn(),
}));
beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value() {
        this.setAttribute("open", "");
      },
    },
    close: {
      configurable: true,
      value() {
        this.removeAttribute("open");
      },
    },
  });
  localStorage.clear();
  vi.mocked(acceptStage1CardAction).mockReset();
  vi.mocked(reviewLiveCardQuotes).mockResolvedValue({ status: "disabled" });
});
afterEach(cleanup);
function rollingState() {
  const state = makeStage3CardState();
  state.season.rulesetSnapshot = frozenCardRulesFixture(
    "SIMULATION",
    simulationSeason13Ruleset,
  );
  state.week = {
    ...state.week!,
    rollingSubmissionsEnabled: true,
    entryClosesAt: "2026-09-15T00:15:00Z",
    entryClosed: false,
  };
  state.ownerCard = {
    ...state.ownerCard!,
    rollingSubmissionsEnabled: true,
    canSubmit: true,
  };
  state.slate = state.slate.map((event, index) => ({
    ...event,
    state: "SCHEDULED",
    actualStartedAt: null,
    entryOpen: true,
    scheduledStartAt: index ? "2026-09-15T00:15:00Z" : "2026-09-13T17:00:00Z",
    entryClosesAt: index ? "2026-09-15T00:15:00Z" : "2026-09-13T17:00:00Z",
  }));
  return state;
}
describe("rolling member submission flow", () => {
  it("filters Thursday games using Eastern Time and restores the full slate", () => {
    const state = rollingState();
    state.slate[0].scheduledStartAt = "2026-09-18T00:15:00Z";
    render(<Stage1CardBuilder state={state} />);
    const filters = screen.getByRole("navigation", {
      name: "Filter games by kickoff",
    });
    expect(
      within(filters)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["All games", "Thursday", "Monday"]);

    fireEvent.click(within(filters).getByRole("button", { name: "Thursday" }));
    expect(
      within(filters).getByRole("button", { name: "Thursday" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("region", { name: "Harbor Club at Lake Club" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "River Club at Capital Club" }),
    ).not.toBeInTheDocument();

    fireEvent.click(within(filters).getByRole("button", { name: "All games" }));
    expect(
      screen.getByRole("region", { name: "River Club at Capital Club" }),
    ).toBeVisible();
    expect(reviewLiveCardQuotes).not.toHaveBeenCalled();
    expect(acceptStage1CardAction).not.toHaveBeenCalled();
  });

  it.each([
    ["Thursday", "2026-12-18T01:15:00Z"],
    ["Friday", "2026-11-27T20:00:00Z"],
    ["Saturday", "2026-12-20T01:15:00Z"],
    ["Sun early", "2026-10-11T13:30:00Z"],
    ["Sun late", "2026-09-20T20:25:00Z"],
    ["Sun night", "2026-09-21T00:20:00Z"],
    ["Tuesday", "2026-09-23T00:15:00Z"],
    ["Wednesday", "2026-09-24T00:15:00Z"],
  ])("offers %s only when that window is in the slate", (label, kickoff) => {
    const state = rollingState();
    state.slate[0].scheduledStartAt = kickoff;
    render(<Stage1CardBuilder state={state} />);
    const filters = screen.getByRole("navigation", {
      name: "Filter games by kickoff",
    });
    expect(within(filters).getAllByRole("button")).toHaveLength(3);
    fireEvent.click(within(filters).getByRole("button", { name: label }));
    expect(
      screen.getByRole("region", { name: "Harbor Club at Lake Club" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "River Club at Capital Club" }),
    ).not.toBeInTheDocument();
  });

  it("returns to All games if a refreshed slate removes the selected day", () => {
    const state = rollingState();
    state.slate[0].scheduledStartAt = "2026-09-18T00:15:00Z";
    const { rerender } = render(<Stage1CardBuilder state={state} />);
    fireEvent.click(screen.getByRole("button", { name: "Thursday" }));

    rerender(
      <Stage1CardBuilder state={{ ...state, slate: [state.slate[1]] }} />,
    );
    expect(
      screen.queryByRole("button", { name: "Thursday" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All games" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("region", { name: "River Club at Capital Club" }),
    ).toBeVisible();
  });

  it("reviews only the chosen batch and keeps the unsubmitted draft after successful submission", async () => {
    const state = rollingState();
    const key = cardDraftStorageKey(ownerCardContext(state))!;
    localStorage.setItem(key, savedStage3Draft(state, [300, 400]));
    vi.mocked(acceptStage1CardAction).mockResolvedValue({
      status: "success",
      message: "1 bet submitted.",
    });
    render(<Stage1CardBuilder state={state} />);
    fireEvent.click(
      await screen.findByRole("checkbox", { name: /Include River Club/ }),
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Review 1 bets" })[0],
    );
    expect(
      await screen.findByRole("heading", { name: "Review your bets" }),
    ).toBeVisible();
    expect(screen.getByText("300 credits")).toBeVisible();
    const form = screen
      .getByRole("button", { name: "Submit bets" })
      .closest("form")!;
    const submitted = JSON.parse(
      (form.elements.namedItem("positions") as HTMLInputElement).value,
    );
    expect(submitted).toHaveLength(1);
    fireEvent.submit(form);
    await waitFor(() =>
      expect(acceptStage1CardAction).toHaveBeenCalledTimes(1),
    );
    expect(
      vi.mocked(acceptStage1CardAction).mock.calls[0][1].get("submissionId"),
    ).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(key)!).drafts).toHaveLength(1),
    );
    expect(JSON.parse(localStorage.getItem(key)!).drafts[0].eventId).toBe(
      state.slate[1].id,
    );
  });
  it("recovers server-accepted markets without clearing other drafts or replenishing credits", () => {
    const state = rollingState();
    const key = cardDraftStorageKey(ownerCardContext(state))!;
    localStorage.setItem(key, savedStage3Draft(state, [300, 400]));
    state.ownerCard = {
      ...state.ownerCard!,
      compliance: "COMPLIANT",
      allocatedCredits: 300,
      remainingCredits: 700,
      positions: [
        {
          eventId: state.slate[0].id,
          marketType: "TOTAL",
          stakeCredits: 300,
          americanOdds: 100,
          settlement: { outcome: "VOID", returnedCenticredits: 30000 },
        } as never,
      ],
    };
    render(<OwnerCardProgress context={ownerCardContext(state)} />);
    expect(screen.getByText("Submitted")).toBeVisible();
    expect(screen.getByText("700")).toBeVisible();
    expect(screen.getByText(/1 unsubmitted draft/)).toBeVisible();
    expect(JSON.parse(localStorage.getItem(key)!).drafts).toHaveLength(1);
  });
  it("keeps later games accessible after common lock and disables started games independently", () => {
    const state = rollingState();
    state.season.simulatedNow = "2026-09-13T19:00:00Z";
    state.week!.state = "LOCKED";
    render(<Stage1CardBuilder state={state} />);
    const early = screen.getByRole("region", {
      name: "Harbor Club at Lake Club",
    });
    const monday = screen.getByRole("region", {
      name: "River Club at Capital Club",
    });
    expect(within(early).getByText("Betting closed")).toBeVisible();
    expect(
      within(early)
        .getAllByRole("button")
        .every((button) => button.hasAttribute("disabled")),
    ).toBe(true);
    expect(
      within(monday)
        .getAllByRole("button")
        .every((button) => !button.hasAttribute("disabled")),
    ).toBe(true);
    expect(screen.getByText("Not submitted")).toBeVisible();
    expect(screen.queryByText(/missed-week result/)).not.toBeInTheDocument();
  });
  it("keeps active stake entry and focus when server quote heads refresh", () => {
    const state = rollingState();
    const view = render(<Stage1CardBuilder state={state} />);
    fireEvent.click(
      within(
        screen.getByRole("region", { name: "Harbor Club at Lake Club" }),
      ).getAllByRole("button")[0],
    );
    const field = screen.getByRole("spinbutton", { name: "Stake in credits" });
    fireEvent.change(field, { target: { value: "375" } });
    field.focus();
    const updated = structuredClone(state);
    updated.slate[0].markets[0] = {
      ...updated.slate[0].markets[0],
      id: "30000000-0000-4000-8000-000000000010",
      americanOdds: -190,
      payloadHash: "f".repeat(64),
    };
    view.rerender(<Stage1CardBuilder state={updated} />);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("spinbutton", { name: "Stake in credits" })).toBe(
      field,
    );
    expect(field).toHaveValue(375);
    expect(field).toHaveFocus();
  });

  it("does not overwrite another tab's draft changes during an odds review", async () => {
    const state = rollingState();
    const key = cardDraftStorageKey(ownerCardContext(state))!;
    localStorage.setItem(key, savedStage3Draft(state, [300]));
    let finishReview!: (result: { status: "disabled" }) => void;
    vi.mocked(reviewLiveCardQuotes).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishReview = resolve;
        }),
    );
    render(<Stage1CardBuilder state={state} />);
    fireEvent.click(
      screen.getAllByRole("button", { name: "Review 1 bets" })[0],
    );
    localStorage.setItem(key, savedStage3Draft(state, [350, 400]));
    finishReview({ status: "disabled" });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your draft changed while odds were being checked",
    );
    expect(
      JSON.parse(localStorage.getItem(key)!).drafts.map(
        (draft: { stakeCredits: number }) => draft.stakeCredits,
      ),
    ).toEqual([350, 400]);
    expect(
      screen.queryByRole("button", { name: "Submit bets" }),
    ).not.toBeInTheDocument();
  });

  it("preserves unavailable drafts for recovery instead of silently deleting them", () => {
    const state = rollingState();
    const draft = savedStage3Draft(state, [500]);
    const restored = restoreCardDrafts(draft, []);
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({
      stakeCredits: 500,
      quoteReviewRequired: true,
    });
  });
  it("retains a stable local batch identity for duplicate retries and distinguishes changed review content", () => {
    const first = submissionAttemptId("test-card", "review-one");
    expect(submissionAttemptId("test-card", "review-one")).toBe(first);
    expect(submissionAttemptId("test-card", "review-two")).not.toBe(first);
  });
});
