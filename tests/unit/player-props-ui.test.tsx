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
import { PlayerPropMenuReview } from "@/components/commissioner/player-prop-menu-review";
import { PlayerPropsGame } from "@/components/card/player-props-game";
import { MatchupLineup } from "@/components/matchup/matchup-lineup";
import { restoreCardDrafts } from "@/components/card/card-draft-storage";
import {
  cardDraftStorageKey,
  ownerCardContext,
} from "@/components/card/owner-card-context";
import { selectionKey } from "@/components/card/selection-identity";
import { reviewLiveCardQuotes } from "@/app/l/[leagueSlug]/card-quote-actions";
import { acceptStage1CardAction } from "@/app/l/[leagueSlug]/actions";
import { simulationSeason14Ruleset } from "@/rulesets/simulation-season-1-4";
import { simulationSeason15Ruleset } from "@/rulesets/simulation-season-1-5";
import { playerPropMenuSchema } from "@/application/queries/player-prop-dtos";
import { frozenCardRulesFixture } from "../fixtures/card-rules";
import { makeStage3CardState } from "../fixtures/stage3-card-journey";
import { makePhase6Matchup } from "../fixtures/phase6-paired-matchup";
import type { Stage1StateDto } from "@/application/queries/stage1-dtos";
import type { CardQuoteReviewResult } from "@/application/providers/card-quote-review";

vi.mock("@/app/l/[leagueSlug]/player-prop-actions", () => ({
  refreshPlayerPropQuotesAction: vi.fn(),
}));
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
  vi.mocked(reviewLiveCardQuotes).mockReset();
  vi.mocked(reviewLiveCardQuotes).mockResolvedValue({ status: "disabled" });
});
afterEach(cleanup);
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function propsState(gameCount = 1, progressive = false): Stage1StateDto {
  const state = makeStage3CardState(gameCount);
  state.season.rulesetSnapshot = frozenCardRulesFixture(
    "SIMULATION",
    progressive ? simulationSeason15Ruleset : simulationSeason14Ruleset,
  );
  state.week = {
    ...state.week!,
    propsEnabled: true,
    rollingSubmissionsEnabled: true,
    entryClosesAt: "2026-09-15T00:15:00Z",
    entryClosed: false,
  };
  state.ownerCard = {
    ...state.ownerCard!,
    canSubmit: true,
    rollingSubmissionsEnabled: true,
  };
  state.slate = state.slate.map((event, eventIndex) => {
    const slots: NonNullable<typeof event.playerProps> = ["HBR", "LAK"].flatMap(
      (team, teamIndex) =>
        (["QB_PASS", "RB_RUSH", "RECEIVER"] as const).map(
          (slot, roleIndex) => ({
            eventId: event.id,
            team,
            slot,
            subjectId: id(100 + eventIndex * 6 + teamIndex * 3 + roleIndex),
            subjectLabel: `${team} ${roleIndex ? "Taylor Rivers" : "Alexandria Montgomery-Wellington"}`,
            position:
              roleIndex === 0
                ? ("QB" as const)
                : roleIndex === 1
                  ? ("RB" as const)
                  : ("TE" as const),
            statistic:
              roleIndex === 0
                ? ("PASSING_YARDS" as const)
                : roleIndex === 1
                  ? ("RUSHING_YARDS" as const)
                  : ("RECEIVING_YARDS" as const),
            period: "FULL_GAME",
            confirmed: true,
            frozen: false,
            unavailableReason: null,
            ...(progressive
              ? {
                  lateFillEligible: false,
                  publicationMode: "COMMISSIONER" as const,
                  publishedAt: "2026-09-13T16:00:00Z",
                }
              : {}),
          }),
        ),
    );
    return {
      ...event,
      state: "SCHEDULED",
      actualStartedAt: null,
      entryOpen: true,
      entryClosesAt: "2026-09-13T17:00:00Z",
      playerProps: slots,
      markets: [
        ...event.markets,
        ...slots.flatMap((slot, index) =>
          (["OVER", "UNDER"] as const).map((side, sideIndex) => ({
            ...event.markets[0]!,
            id: id(1000 + eventIndex * 12 + index * 2 + sideIndex),
            marketType:
              `PLAYER_${slot.statistic}` as (typeof event.markets)[number]["marketType"],
            subjectId: slot.subjectId,
            subjectLabel: slot.subjectLabel,
            subjectTeam: slot.team,
            subjectPosition: slot.position,
            statistic: slot.statistic,
            period: "FULL_GAME" as const,
            outcomeKey: side,
            americanOdds: -110,
            lineMilli: 245_500,
            proposition: `${slot.subjectLabel} ${side === "OVER" ? "over" : "under"} 245.5 ${slot.statistic.toLowerCase().replaceAll("_", " ")}`,
          })),
        ),
      ],
    };
  });
  return state;
}

function storeProps(state: Stage1StateDto, indexes = [3, 9]) {
  const event = state.slate[0]!;
  const value = JSON.stringify({
    version: 1,
    drafts: indexes.map((index) => ({
      ...event.markets[index]!,
      eventId: event.id,
      marketSnapshotId: event.markets[index]!.id,
      reviewedAmericanOdds: event.markets[index]!.americanOdds,
      reviewedPayloadHash: event.markets[index]!.payloadHash,
      reviewedProposition: event.markets[index]!.proposition,
      stakeCredits: 100,
    })),
  });
  const key = cardDraftStorageKey(ownerCardContext(state))!;
  localStorage.setItem(key, value);
  return key;
}

function ready(
  state: Stage1StateDto,
  reviewId = id(9000),
): Extract<CardQuoteReviewResult, { status: "ready" }> {
  return {
    status: "ready",
    review: {
      reviewId,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      fetchedAt: "2026-09-13T16:30:00Z",
      reviewedAt: "2026-09-13T16:30:00Z",
      quotes: state.slate.map((event) => ({
        eventId: event.id,
        markets: event.markets,
      })),
    },
  };
}

describe("full-slate props member experience", () => {
  it("reviews available choices and the pending-slot policy without claiming future players were reviewed", async () => {
    const state = propsState(1, true);
    const slots = state.slate[0].playerProps!.map((slot, index) => ({
      ...slot,
      subjectId: index === 5 ? null : slot.subjectId,
      subjectLabel: index === 5 ? null : slot.subjectLabel,
      publicationMode: null,
      publishedAt: null,
      lateFillEligible: index === 5,
      candidates:
        index === 5
          ? []
          : [
              {
                subjectId: slot.subjectId!,
                subjectLabel: slot.subjectLabel!,
                position: slot.position!,
                roleEvidence: "Highest verified standard line",
                roleRank: 0,
              },
            ],
    }));
    const confirm = vi
      .fn()
      .mockResolvedValue({ status: "success", message: "Policy confirmed" });
    render(
      <PlayerPropMenuReview
        leagueSlug="test-league"
        leagueId={state.league.id}
        slots={slots}
        frozen={false}
        amendmentPending
        progressiveAvailability
        prepareAction={vi.fn()}
        refreshAction={vi.fn()}
        confirmAction={confirm}
      />,
    );
    expect(
      screen.getByRole("heading", {
        name: "Review available players and pending slots",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "1 games · 5 of 6 player slots selected · 1 unavailable now",
      ),
    ).toBeVisible();
    const acknowledgement = screen.getByRole("checkbox", {
      name: "I reviewed the available players and approve automatic publication of eligible empty slots before each game’s betting cutoff.",
    });
    expect(acknowledgement).not.toBeChecked();
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(acknowledgement);
    fireEvent.submit(
      screen
        .getByRole("button", {
          name: "Confirm players and pending-slot policy",
        })
        .closest("form")!,
    );
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    const form = confirm.mock.calls[0][1] as FormData;
    const choices = JSON.parse(String(form.get("choices")));
    expect(choices).toHaveLength(6);
    expect(choices[5].subjectId).toBeNull();
    expect(form.get("emptySlotPublication")).toBe(
      "AUTOMATIC_BEFORE_EVENT_CUTOFF",
    );
    expect(form.get("confirmed")).toBeNull();
    expect(
      screen.queryByRole("combobox", { hidden: true }),
    ).not.toBeInTheDocument();
  });
  it("keeps published choices read-only and labels automatic publication separately from human review", () => {
    const state = propsState(1, true);
    const menu = playerPropMenuSchema.parse({
      weekId: state.week!.id,
      enabled: true,
      frozen: true,
      progressiveAvailability: true,
      slots: state.slate[0].playerProps!.map((slot, index) => ({
        ...slot,
        subjectId: index === 5 ? null : slot.subjectId,
        subjectLabel: index === 5 ? null : slot.subjectLabel,
        lateFillEligible: index === 5,
        publicationMode:
          index === 4 ? "AUTOMATIC" : index === 5 ? null : "COMMISSIONER",
        publishedAt: index === 5 ? null : "2026-09-13T16:10:00+00:00",
        candidates: [],
      })),
    });
    const { rerender } = render(
      <PlayerPropMenuReview
        leagueSlug="test-league"
        leagueId={state.league.id}
        slots={menu.slots.map((slot) => ({
          ...slot,
          candidates: slot.candidates ?? [],
        }))}
        frozen
        amendmentApplied
        progressiveAvailability={menu.progressiveAvailability}
        prepareAction={vi.fn()}
        refreshAction={vi.fn()}
        confirmAction={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("combobox", { hidden: true }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      screen.getByText("Unavailable now · Check back before kickoff."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Added automatically before kickoff under the approved pending-slot policy.",
      ),
    ).toBeInTheDocument();
    // An activated all-empty menu has no frozen player yet; it still must not
    // offer a second initial review or manual replacement control.
    rerender(
      <PlayerPropMenuReview
        leagueSlug="test-league"
        leagueId={state.league.id}
        slots={menu.slots.map((slot) => ({
          ...slot,
          subjectId: null,
          subjectLabel: null,
          publicationMode: null,
          publishedAt: null,
          lateFillEligible: true,
          candidates: [],
        }))}
        frozen={false}
        progressiveActivated
        progressiveAvailability
        prepareAction={vi.fn()}
        refreshAction={vi.fn()}
        confirmAction={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("combobox", { hidden: true }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
  it("offers check-back guidance only while an empty slot can still fill before its game cutoff", () => {
    const state = propsState(1, true);
    const event = state.slate[0];
    event.playerProps![0] = {
      ...event.playerProps![0],
      subjectId: null,
      subjectLabel: null,
      publicationMode: null,
      publishedAt: null,
      lateFillEligible: true,
    };
    event.markets = event.markets.filter(
      (market) => market.subjectId !== id(100),
    );
    const select = vi.fn();
    const { rerender } = render(
      <PlayerPropsGame
        event={event}
        acceptedPositions={[]}
        drafts={[]}
        bettingOpen
        onSelect={select}
      />,
    );
    expect(
      screen.getByText("Unavailable now · Check back before kickoff."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("group", {
        name: /HBR Alexandria Montgomery-Wellington/,
      }),
    ).not.toBeInTheDocument();
    rerender(
      <PlayerPropsGame
        event={event}
        acceptedPositions={[]}
        drafts={[]}
        bettingOpen={false}
        onSelect={select}
      />,
    );
    expect(screen.getByText("Unavailable for this game.")).toBeInTheDocument();
    expect(
      screen.queryByText("Unavailable now · Check back before kickoff."),
    ).not.toBeInTheDocument();
    expect(select).not.toHaveBeenCalled();
  });
  it("keeps an existing player's draft intact when a previously empty slot is published", async () => {
    const published = propsState(1, true);
    const pending = structuredClone(published);
    pending.slate[0].playerProps![1] = {
      ...pending.slate[0].playerProps![1],
      subjectId: null,
      subjectLabel: null,
      publicationMode: null,
      publishedAt: null,
      lateFillEligible: true,
    };
    pending.slate[0].markets = pending.slate[0].markets.filter(
      (market) => market.subjectId !== id(101),
    );
    const key = storeProps(pending, [3]);
    const originalDrafts = restoreCardDrafts(
      localStorage.getItem(key),
      pending.slate,
    );
    const { rerender } = render(<Stage1CardBuilder state={pending} />);
    await screen.findAllByText(/Alexandria Montgomery-Wellington over/);
    published.slate[0].playerProps![1].publicationMode = "AUTOMATIC";
    published.slate[0].playerProps![1].publishedAt = "2026-09-13T16:15:00Z";
    rerender(<Stage1CardBuilder state={published} />);
    expect(
      restoreCardDrafts(localStorage.getItem(key), published.slate),
    ).toEqual(originalDrafts);
    expect(acceptStage1CardAction).not.toHaveBeenCalled();
    fireEvent.click(
      await screen.findByRole("button", { name: "Player props" }),
    );
    expect(
      screen.getByText("Added automatically before kickoff."),
    ).toBeInTheDocument();
  });
  it("keeps a withdrawn player quote visible in review and preserves it when submitting another draft", async () => {
    const state = propsState();
    const key = storeProps(state, [3, 0]);
    const { rerender } = render(<Stage1CardBuilder state={state} />);
    fireEvent.click(
      (await screen.findAllByRole("button", { name: "Review 2 bets" }))[0]!,
    );
    await screen.findByRole("heading", { name: "Review your bets" });
    const unavailable = structuredClone(state);
    unavailable.slate[0]!.markets = unavailable.slate[0]!.markets.filter(
      (market) => market.subjectId !== id(100),
    );
    rerender(<Stage1CardBuilder state={unavailable} />);
    expect(
      await screen.findByText(
        "This line is unavailable. Your draft is kept; return to edit to leave it out of this submission.",
      ),
    ).toBeVisible();
    expect(acceptStage1CardAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back to edit" }));
    const missing = screen.getByText(/Unavailable draft/).closest("article")!;
    fireEvent.click(
      within(missing).getByRole("checkbox", { name: "Include in submission" }),
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Review 1 bets" })[0]!,
    );
    vi.mocked(acceptStage1CardAction).mockResolvedValue({
      status: "success",
      message: "1 bet submitted.",
    });
    fireEvent.submit(
      (await screen.findByRole("button", { name: "Submit bets" })).closest(
        "form",
      )!,
    );
    await waitFor(() => expect(acceptStage1CardAction).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(
        restoreCardDrafts(localStorage.getItem(key), unavailable.slate),
      ).toHaveLength(1),
    );
    expect(
      restoreCardDrafts(localStorage.getItem(key), unavailable.slate)[0]!
        .subjectId,
    ).toBe(id(100));
  });

  it("confirms all games in one commissioner action with explicit unresolved choices", async () => {
    const state = propsState(14);
    const slots = state.slate.flatMap((event) =>
      event.playerProps!.map((slot) => ({
        ...slot,
        eventLabel: `${event.awayTeam} at ${event.homeTeam}`,
        candidates: [
          {
            subjectId: slot.subjectId!,
            subjectLabel: slot.subjectLabel!,
            position: slot.position!,
            roleEvidence: "Verified projected role",
            roleRank: 1,
          },
        ],
      })),
    );
    const confirm = vi
      .fn()
      .mockResolvedValue({ status: "success", message: "Menu confirmed" });
    const open = vi
      .fn()
      .mockResolvedValue({ status: "success", message: "Week opened" });
    render(
      <PlayerPropMenuReview
        leagueSlug="test-league"
        leagueId={state.league.id}
        slots={slots}
        frozen={false}
        prepareAction={vi.fn()}
        refreshAction={vi.fn()}
        confirmAction={confirm}
        canOpen
        openAction={open}
      />,
    );
    expect(
      screen.getByText("14 games · 84 of 84 player slots selected"),
    ).toBeInTheDocument();
    const firstChoice = screen.getAllByRole("combobox", { hidden: true })[0]!;
    fireEvent.change(firstChoice, { target: { value: "" } });
    expect(
      screen.getByRole("button", { name: "Open week for bets" }),
    ).toBeDisabled();
    expect(open).not.toHaveBeenCalled();
    expect(
      screen.getByText(/1 unresolved slots will remain unavailable/),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Confirm full-slate player menu" })
        .closest("form")!,
    );
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    const choices = JSON.parse(
      String(confirm.mock.calls[0]![1].get("choices")),
    );
    expect(choices).toHaveLength(84);
    expect(choices[0].subjectId).toBeNull();
    expect(
      new Set(choices.map((choice: { eventId: string }) => choice.eventId))
        .size,
    ).toBe(14);
    cleanup();
    render(
      <PlayerPropMenuReview
        leagueSlug="test-league"
        leagueId={state.league.id}
        slots={slots}
        frozen
        prepareAction={vi.fn()}
        refreshAction={vi.fn()}
        confirmAction={confirm}
      />,
    );
    expect(
      screen.queryByRole("combobox", { hidden: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Confirm full-slate player menu" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Refresh full-slate player lines" }),
    ).toBeVisible();
    cleanup();
    render(
      <PlayerPropMenuReview
        leagueSlug="test-league"
        leagueId={state.league.id}
        slots={slots.map((slot, index) =>
          index === 0 ? { ...slot, subjectId: null, subjectLabel: null } : slot,
        )}
        frozen={false}
        prepareAction={vi.fn()}
        refreshAction={vi.fn()}
        confirmAction={confirm}
        canOpen
        openAction={open}
      />,
    );
    const openButton = screen.getByRole("button", {
      name: "Open week for bets",
    });
    expect(openButton).toBeEnabled();
    fireEvent.submit(openButton.closest("form")!);
    await waitFor(() => expect(open).toHaveBeenCalledOnce());
    expect(open.mock.calls[0]![1].get("leagueSlug")).toBe("test-league");
  });

  it("keeps both quarterbacks distinct across persisted drafts and late quote heads", () => {
    const state = propsState();
    const key = storeProps(state);
    const restored = restoreCardDrafts(localStorage.getItem(key), state.slate);
    expect(restored).toHaveLength(2);
    expect(new Set(restored.map(selectionKey)).size).toBe(2);
    const withoutFirst = state.slate.map((event) => ({
      ...event,
      markets: event.markets.filter(
        (market) => market.subjectId !== restored[0]!.subjectId,
      ),
    }));
    const unavailable = restoreCardDrafts(
      localStorage.getItem(key),
      withoutFirst,
    );
    expect(unavailable).toHaveLength(2);
    expect(unavailable[0]).toMatchObject({
      subjectId: restored[0]!.subjectId,
      quoteReviewRequired: true,
    });
    expect(unavailable[1]!.marketSnapshotId).toBe(
      restored[1]!.marketSnapshotId,
    );
  });

  it("shows 16 collapsed games, six role rows per game, and distinct missing-player versus missing-line states", async () => {
    const state = propsState(16);
    render(<Stage1CardBuilder state={state} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Player props" }),
    );
    const games = document.querySelectorAll("details");
    expect(
      [...games].filter(
        (game) => game.querySelectorAll("article").length === 6,
      ),
    ).toHaveLength(16);
    expect([...games].filter((game) => game.open)).toHaveLength(0);
    cleanup();
    const event = state.slate[0]!;
    event.playerProps![0]!.subjectId = null;
    event.playerProps![0]!.subjectLabel = null;
    event.markets = event.markets.filter(
      (market) => ![id(100), id(101)].includes(market.subjectId ?? ""),
    );
    const { container } = render(
      <PlayerPropsGame
        event={event}
        acceptedPositions={[]}
        drafts={[]}
        bettingOpen
        onSelect={vi.fn()}
      />,
    );
    expect(container.querySelectorAll("article")).toHaveLength(6);
    expect(
      screen.getByText("Player unavailable for this week"),
    ).toBeInTheDocument();
    expect(screen.getByText("Awaiting line")).toBeInTheDocument();
    expect(screen.queryByText(/of 6 props available/)).not.toBeInTheDocument();
  });

  it("adds two passing-yard drafts for the same game using the shared editor and tray", async () => {
    const state = propsState();
    render(<Stage1CardBuilder state={state} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Player props" }),
    );
    const details = document.querySelector("details")!;
    details.open = true;
    for (const team of ["HBR", "LAK"]) {
      const group = screen.getByRole("group", {
        name: `${team} Alexandria Montgomery-Wellington Passing yards outcomes`,
      });
      fireEvent.click(
        within(group).getByRole("button", { name: "Over 245.5 −110" }),
      );
      expect(
        screen.getByRole("heading", {
          name: `${team} Alexandria Montgomery-Wellington · Passing yards`,
        }),
      ).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Add to card" }));
    }
    const restored = restoreCardDrafts(
      localStorage.getItem(cardDraftStorageKey(ownerCardContext(state))!),
      state.slate,
    );
    expect(restored).toHaveLength(2);
    expect(restored.map((draft) => draft.subjectId)).toEqual([
      id(100),
      id(103),
    ]);
    expect(
      screen.getAllByRole("button", { name: "Review 2 bets" }).length,
    ).toBeGreaterThan(0);
  });

  it("keeps another player's draft when the first player was submitted on another device", async () => {
    const state = propsState();
    const key = storeProps(state);
    const { rerender } = render(<Stage1CardBuilder state={state} />);
    await screen.findAllByText(/Alexandria Montgomery-Wellington over/);
    const next = structuredClone(state);
    const event = next.slate[0]!;
    const market = event.markets[3]!;
    next.ownerCard!.positions = [
      {
        ...market,
        id: id(9001),
        eventId: event.id,
        eventLabel: `${event.awayTeam} at ${event.homeTeam}`,
        eventKey: event.key,
        scheduledStartAt: event.scheduledStartAt,
        quoteObservedAt: market.observedAt,
        acceptedAt: "2026-09-13T16:31:00Z",
        receiptHash: "e".repeat(64),
        stakeCredits: 100,
      },
    ];
    next.ownerCard!.allocatedCredits = 100;
    next.ownerCard!.remainingCredits = 900;
    rerender(<Stage1CardBuilder state={next} />);
    await waitFor(() =>
      expect(
        restoreCardDrafts(localStorage.getItem(key), next.slate),
      ).toHaveLength(1),
    );
    expect(
      restoreCardDrafts(localStorage.getItem(key), next.slate)[0]!.subjectId,
    ).toBe(id(103));
  });

  it("uses one explicit Submit after proof expiry and requires new consent for favorable odds", async () => {
    const state = propsState();
    storeProps(state, [3]);
    vi.mocked(reviewLiveCardQuotes).mockResolvedValue(ready(state));
    const changed = structuredClone(state);
    const market = changed.slate[0]!.markets[3]!;
    market.americanOdds = 105;
    market.id = id(5000);
    market.payloadHash = "b".repeat(64);
    vi.mocked(acceptStage1CardAction)
      .mockResolvedValueOnce({
        status: "error",
        message: "Odds changed. Review before submitting again.",
        requiresConfirmation: true,
        quoteReview: ready(changed, id(9002)).review,
        quoteChanges: [
          {
            selectionKey: selectionKey({
              ...market,
              eventId: changed.slate[0]!.id,
            }),
            label: market.proposition,
            before: { lineMilli: 245500, americanOdds: -110 },
            after: { lineMilli: 245500, americanOdds: 105 },
          },
        ],
      })
      .mockResolvedValueOnce({
        status: "success",
        message: "1 bet submitted.",
      });
    render(<Stage1CardBuilder state={state} />);
    fireEvent.click(
      (await screen.findAllByRole("button", { name: "Review 1 bets" }))[0]!,
    );
    const submit = await screen.findByRole("button", { name: "Submit bets" });
    expect(submit).toBeEnabled();
    expect(acceptStage1CardAction).not.toHaveBeenCalled();
    fireEvent.submit(submit.closest("form")!);
    await waitFor(() =>
      expect(acceptStage1CardAction).toHaveBeenCalledTimes(1),
    );
    const firstAttempt = vi
      .mocked(acceptStage1CardAction)
      .mock.calls[0]![1].get("submissionId");
    expect(
      await screen.findByRole("button", {
        name: "Review changed quotes first",
      }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Use updated odds" }));
    expect(acceptStage1CardAction).toHaveBeenCalledTimes(1);
    fireEvent.submit(
      screen.getByRole("button", { name: "Submit bets" }).closest("form")!,
    );
    await waitFor(() =>
      expect(acceptStage1CardAction).toHaveBeenCalledTimes(2),
    );
    expect(
      vi.mocked(acceptStage1CardAction).mock.calls[1]![1].get("submissionId"),
    ).not.toBe(firstAttempt);
    expect(reviewLiveCardQuotes).toHaveBeenCalledTimes(1);
  });

  it("aligns only the same revealed player and preserves final zero yardage and pending player results", () => {
    const matchup = makePhase6Matchup("LIVE");
    const base = matchup.rows.IN_PROGRESS[0]!;
    matchup.self.selectedGames = [];
    matchup.opponent.selectedGames = [];
    matchup.futureSealed = false;
    matchup.rows = {
      SETTLED: [],
      REMAINING: [],
      IN_PROGRESS: [
        {
          ...base,
          id: "one",
          side: "SELF",
          marketType: "PLAYER_PASSING_YARDS",
          subjectId: id(100),
          subjectLabel: "First quarterback",
          statistic: "PASSING_YARDS",
          period: "FULL_GAME",
          proposition: "First quarterback over 245.5 passing yards",
          eventState: "FINAL",
          finalYards: 0,
          playerEvidenceVersion: 2,
          playerCorrectionReason: "A completed pass was ruled a lateral.",
          outcome: "LOSS",
          returnedCenticredits: 0,
        },
        {
          ...base,
          id: "two",
          side: "OPPONENT",
          marketType: "PLAYER_PASSING_YARDS",
          subjectId: id(103),
          subjectLabel: "Second quarterback",
          statistic: "PASSING_YARDS",
          period: "FULL_GAME",
          proposition: "Second quarterback under 245.5 passing yards",
          eventState: "FINAL",
          finalYards: null,
          outcome: null,
          returnedCenticredits: null,
        },
      ],
    };
    const { container } = render(<MatchupLineup matchup={matchup} />);
    expect(container.querySelectorAll(".lineup-pair")).toHaveLength(2);
    expect(screen.getByText("Final: 0 passing yards")).toBeVisible();
    expect(
      screen.getByText(
        "Player result corrected: A completed pass was ruled a lateral.",
      ),
    ).toBeVisible();
    expect(screen.getByText("Awaiting player results")).toBeVisible();
    expect(
      container
        .querySelector('[data-position-id="one"]')
        ?.closest(".lineup-pair"),
    ).not.toBe(
      container
        .querySelector('[data-position-id="two"]')
        ?.closest(".lineup-pair"),
    );
  });
});
