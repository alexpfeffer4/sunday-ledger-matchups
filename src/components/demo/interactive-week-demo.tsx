"use client";

import Link from "next/link";
import { useState } from "react";
import {
  getInteractiveDemoCurrentOdds,
  getInteractiveDemoOpportunity,
  interactiveDemoEligibleOpportunities,
  interactiveDemoEvents,
  interactiveDemoOpponentPositions,
  interactiveDemoResults,
  settleInteractiveDemoPositions,
  type InteractiveDemoEvent,
  type InteractiveDemoMarket,
  type InteractiveDemoPosition,
} from "@/adapters/simulation/interactive-week";
import { CardTray } from "@/components/card/card-tray";
import {
  formatAmericanOdds,
  marketOptionCopy,
} from "@/components/card/market-option-copy";
import {
  OutcomeSelector,
  type OutcomeSelectorOption,
} from "@/components/card/outcome-selector";
import { PositionEditorSheet } from "@/components/card/position-editor-sheet";
import { AllocationMeter } from "@/components/matchup/allocation-meter";
import { StatusBadge } from "@/components/ui/status-badge";
import { validateDraftCard } from "@/domain/cards/validate-card-draft";
import { decideRegularSeasonMatchup } from "@/domain/matchups/decide";
import { formatCenticredits, formatCredits } from "@/domain/odds/american";
import { weeklyScore } from "@/domain/settlement/settle";
import {
  cardCompliance,
  maximumStakeForOdds,
  validateProposedPosition,
  type AcceptedCardPosition,
} from "@/domain/cards/validate-position";
import { pocSeason1Ruleset } from "@/rulesets/poc-season-1";

type DemoPhase = "BUILDING" | "SEALED" | "FINAL";

type DraftItem = {
  key: string;
  opportunityId: string;
  reviewedAmericanOdds: number;
  stakeCredits: number;
};

type EditorState = {
  eventId: string;
  existing: boolean;
  key: string;
  marketType: InteractiveDemoMarket["marketType"];
  opportunityId: string;
  stakeCredits: string;
};

type Feedback = {
  message: string;
  tone: "negative" | "positive";
} | null;

const marketLabels: Record<InteractiveDemoMarket["marketType"], string> = {
  MONEYLINE: "Winner",
  SPREAD: "Spread",
  TOTAL: "Total",
};

function marketKey(eventId: string, marketType: string): string {
  return `${eventId}:${marketType}`;
}

function acceptedCardPositions(
  positions: readonly InteractiveDemoPosition[],
): AcceptedCardPosition[] {
  return positions.map((position) => {
    const opportunity = getInteractiveDemoOpportunity(position.opportunityId);
    if (!opportunity) throw new Error("The accepted practice pick is missing.");
    return {
      eventId: opportunity.eventId,
      marketType: opportunity.marketType,
      stakeCredits: position.stakeCredits,
      americanOdds: position.americanOdds,
    };
  });
}

function draftPosition(
  item: DraftItem,
  refreshed: boolean,
): AcceptedCardPosition | null {
  const opportunity = getInteractiveDemoOpportunity(item.opportunityId);
  const americanOdds = getInteractiveDemoCurrentOdds(
    item.opportunityId,
    refreshed,
  );
  if (!opportunity || americanOdds === null) return null;
  return {
    eventId: opportunity.eventId,
    marketType: opportunity.marketType,
    stakeCredits: item.stakeCredits,
    americanOdds,
  };
}

function PracticeReceipts({
  positions,
}: {
  positions: readonly InteractiveDemoPosition[];
}) {
  return (
    <div className="divide-boundary divide-y">
      {positions.map((position, index) => {
        const opportunity = getInteractiveDemoOpportunity(
          position.opportunityId,
        );
        if (!opportunity) return null;
        return (
          <article className="py-4 first:pt-0 last:pb-0" key={position.id}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-muted text-xs">
                  Practice receipt {String(index + 1).padStart(2, "0")} ·{" "}
                  {opportunity.marketType}
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {opportunity.displayLine}
                </p>
              </div>
              <p className="shrink-0 font-mono text-sm">
                {formatCredits(position.stakeCredits)} @{" "}
                {formatAmericanOdds(position.americanOdds)}
              </p>
            </div>
            <p className="text-muted mt-2 text-xs">
              Accepted together with the complete card · Practice only · Not
              saved
            </p>
          </article>
        );
      })}
    </div>
  );
}

function SettledCard({
  heading,
  positions,
}: {
  heading: string;
  positions: readonly InteractiveDemoPosition[];
}) {
  const settled = settleInteractiveDemoPositions(positions);
  return (
    <section className="border-boundary bg-surface rounded-xl border p-5">
      <h2 className="font-bold">{heading}</h2>
      <div className="divide-boundary mt-4 divide-y">
        {settled.map((position) => (
          <article className="py-3 first:pt-0 last:pb-0" key={position.id}>
            <div className="flex justify-between gap-3 text-sm">
              <span className="font-semibold">
                {position.opportunity.displayLine}
              </span>
              <span
                className={
                  position.settlement.outcome === "WIN"
                    ? "text-positive font-bold"
                    : position.settlement.outcome === "LOSS"
                      ? "text-negative font-bold"
                      : "text-pending font-bold"
                }
              >
                {position.settlement.outcome}
              </span>
            </div>
            <p className="text-muted mt-1 text-xs">
              Staked {formatCredits(position.stakeCredits)} @{" "}
              {formatAmericanOdds(position.americanOdds)} · returned{" "}
              {formatCenticredits(
                position.settlement.returnedCenticredits ?? 0n,
                true,
              )}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function eventForEditor(
  editor: EditorState | null,
): InteractiveDemoEvent | null {
  return (
    interactiveDemoEvents.find((event) => event.id === editor?.eventId) ?? null
  );
}

export function InteractiveWeekDemo() {
  const [phase, setPhase] = useState<DemoPhase>("BUILDING");
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [positions, setPositions] = useState<InteractiveDemoPosition[]>([]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [reviewing, setReviewing] = useState(false);
  const [quotesRefreshed, setQuotesRefreshed] = useState(false);

  const allocatedCredits = drafts.reduce(
    (total, item) => total + item.stakeCredits,
    0,
  );
  const remainingCredits =
    pocSeason1Ruleset.card.weeklyAllocationCredits - allocatedCredits;
  const currentDraftPositions = drafts.flatMap((item) => {
    const position = draftPosition(item, quotesRefreshed);
    return position ? [position] : [];
  });
  const quoteReviewItems = quotesRefreshed
    ? drafts.filter((item) => {
        const current = getInteractiveDemoCurrentOdds(item.opportunityId, true);
        return current !== null && current !== item.reviewedAmericanOdds;
      })
    : [];

  const selfSettled = settleInteractiveDemoPositions(positions);
  const opponentSettled = settleInteractiveDemoPositions(
    interactiveDemoOpponentPositions,
  );
  const selfScore =
    weeklyScore(selfSettled.map((position) => position.settlement)) ?? 0n;
  const opponentScore =
    weeklyScore(opponentSettled.map((position) => position.settlement)) ?? 0n;
  const decision = decideRegularSeasonMatchup(
    {
      entryId: "practice-self",
      compliance: cardCompliance(
        acceptedCardPositions(positions),
        pocSeason1Ruleset,
      ),
      scoreCenticredits: selfScore,
    },
    {
      entryId: "practice-opponent",
      compliance: cardCompliance(
        acceptedCardPositions(interactiveDemoOpponentPositions),
        pocSeason1Ruleset,
      ),
      scoreCenticredits: opponentScore,
    },
  );

  const editorEvent = eventForEditor(editor);
  const editorMarket =
    editorEvent?.markets.find(
      (market) => market.marketType === editor?.marketType,
    ) ?? null;
  const editorOpportunity = editor?.opportunityId
    ? getInteractiveDemoOpportunity(editor.opportunityId)
    : null;
  const editorOdds = editorOpportunity
    ? getInteractiveDemoCurrentOdds(editorOpportunity.id, quotesRefreshed)
    : null;
  const editorMaximum =
    editorOdds === null
      ? null
      : maximumStakeForOdds(editorOdds, pocSeason1Ruleset);
  const otherDrafts = editor
    ? drafts.filter((item) => item.key !== editor.key)
    : drafts;
  const otherPositions = otherDrafts.flatMap((item) => {
    const position = draftPosition(item, quotesRefreshed);
    return position ? [position] : [];
  });
  const editorAvailableCredits =
    pocSeason1Ruleset.card.weeklyAllocationCredits -
    otherDrafts.reduce((total, item) => total + item.stakeCredits, 0);

  const editorOptions: OutcomeSelectorOption[] =
    editorEvent && editorMarket
      ? editorMarket.opportunities.map((opportunity) => {
          const odds =
            getInteractiveDemoCurrentOdds(opportunity.id, quotesRefreshed) ??
            opportunity.americanOdds;
          const copy = marketOptionCopy({
            americanOdds: odds,
            awayTeam: editorEvent.awayTeam,
            fallbackLabel: opportunity.displayLine,
            homeTeam: editorEvent.homeTeam,
            lineMilli: opportunity.lineMilli,
            marketType: opportunity.marketType,
            outcomeKey: opportunity.selectedSide,
          });
          return {
            id: opportunity.id,
            accessibleLabel: copy.accessibleLabel,
            primary: copy.primary,
            secondary: copy.secondary,
          };
        })
      : [];

  function openEditor(
    event: InteractiveDemoEvent,
    market: InteractiveDemoMarket,
    opportunityId: string,
  ) {
    const key = marketKey(event.id, market.marketType);
    const existing = drafts.find((item) => item.key === key);
    const odds =
      getInteractiveDemoCurrentOdds(opportunityId, quotesRefreshed) ?? 0;
    const defaultStake = Math.min(
      250,
      maximumStakeForOdds(odds, pocSeason1Ruleset),
    );
    setEditor({
      eventId: event.id,
      existing: Boolean(existing),
      key,
      marketType: market.marketType,
      opportunityId,
      stakeCredits: String(existing?.stakeCredits ?? defaultStake),
    });
    setEditorError(null);
    setFeedback(null);
  }

  function selectEditorOutcome(opportunityId: string) {
    setEditor((current) => (current ? { ...current, opportunityId } : current));
    setEditorError(null);
  }

  function saveEditor() {
    if (!editor || !editorOpportunity || editorOdds === null) return;
    const stakeCredits = Number(editor.stakeCredits);
    const validation = validateProposedPosition({
      acceptedPositions: otherPositions,
      proposedPosition: {
        eventId: editorOpportunity.eventId,
        marketType: editorOpportunity.marketType,
        stakeCredits,
        americanOdds: editorOdds,
      },
      eligibleOpportunities: interactiveDemoEligibleOpportunities,
      ruleset: pocSeason1Ruleset,
    });
    if (!validation.accepted) {
      setEditorError(validation.message);
      return;
    }

    const item: DraftItem = {
      key: editor.key,
      opportunityId: editorOpportunity.id,
      reviewedAmericanOdds: editorOdds,
      stakeCredits,
    };
    setDrafts((current) => {
      const existing = current.some((candidate) => candidate.key === item.key);
      return existing
        ? current.map((candidate) =>
            candidate.key === item.key ? item : candidate,
          )
        : [...current, item];
    });
    setEditor(null);
    setEditorError(null);
    setFeedback({
      message: editor.existing
        ? "Practice pick updated."
        : "Practice pick added to your card.",
      tone: "positive",
    });
  }

  function removeDraft(key: string) {
    setDrafts((current) => current.filter((item) => item.key !== key));
    setFeedback(null);
  }

  function focusCardProgress() {
    requestAnimationFrame(() =>
      document.getElementById("practice-card-progress")?.focus(),
    );
  }

  function reviewCard() {
    const validation = validateDraftCard({
      draftPositions: currentDraftPositions,
      eligibleOpportunities: interactiveDemoEligibleOpportunities,
      ruleset: pocSeason1Ruleset,
    });
    if (!validation.accepted) {
      setFeedback({ message: validation.message, tone: "negative" });
      focusCardProgress();
      return;
    }
    setFeedback(null);
    setQuotesRefreshed(true);
    setReviewing(true);
  }

  function reviewUpdatedQuote(key: string) {
    setDrafts((current) =>
      current.map((item) => {
        if (item.key !== key) return item;
        const odds = getInteractiveDemoCurrentOdds(item.opportunityId, true);
        return odds === null ? item : { ...item, reviewedAmericanOdds: odds };
      }),
    );
  }

  function sealCard() {
    const latestPositions = drafts.flatMap((item) => {
      const opportunity = getInteractiveDemoOpportunity(item.opportunityId);
      const americanOdds = getInteractiveDemoCurrentOdds(
        item.opportunityId,
        true,
      );
      return opportunity && americanOdds !== null
        ? [
            {
              id: `practice-receipt-${String(drafts.indexOf(item) + 1).padStart(
                2,
                "0",
              )}`,
              opportunityId: opportunity.id,
              americanOdds,
              stakeCredits: item.stakeCredits,
            },
          ]
        : [];
    });
    const validation = validateDraftCard({
      draftPositions: acceptedCardPositions(latestPositions),
      eligibleOpportunities: interactiveDemoEligibleOpportunities,
      ruleset: pocSeason1Ruleset,
    });
    if (!validation.accepted) {
      setFeedback({ message: validation.message, tone: "negative" });
      return;
    }
    if (quoteReviewItems.length > 0) {
      setFeedback({
        message: "Review every updated quote before sealing the card.",
        tone: "negative",
      });
      return;
    }
    setPositions(latestPositions);
    setFeedback(null);
    setReviewing(false);
    setPhase("SEALED");
  }

  function resetPractice() {
    setPhase("BUILDING");
    setDrafts([]);
    setPositions([]);
    setEditor(null);
    setEditorError(null);
    setFeedback(null);
    setReviewing(false);
    setQuotesRefreshed(false);
  }

  if (phase === "FINAL") {
    const selfDecision = decision.decisions["practice-self"] ?? "LOSS";
    const opponentDecision = decision.decisions["practice-opponent"] ?? "LOSS";
    return (
      <div className="mt-7 space-y-6 pb-8">
        <section className="border-registry bg-surface rounded-xl border p-5 shadow-[var(--shadow-card)] sm:p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
                Practice Week · Unsaved · Final
              </p>
              <h2 className="mt-2 text-2xl font-bold">
                Practice matchup final
              </h2>
            </div>
            <StatusBadge tone="positive">Matchup final</StatusBadge>
          </div>
          <div className="mt-7 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center sm:gap-6">
            <div>
              <p className="font-bold">You</p>
              <p className="mt-2 font-mono text-3xl font-bold">
                {formatCenticredits(selfScore, true)}
              </p>
              <p className="text-registry mt-2 font-bold">{selfDecision}</p>
            </div>
            <span className="text-muted text-xs font-bold">VS</span>
            <div>
              <p className="font-bold">Practice opponent</p>
              <p className="mt-2 font-mono text-3xl font-bold">
                {formatCenticredits(opponentScore, true)}
              </p>
              <p className="text-copper mt-2 font-bold">{opponentDecision}</p>
            </div>
          </div>
        </section>

        <section className="border-boundary bg-subtle rounded-xl border p-5">
          <h2 className="font-bold">Example final scores</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {interactiveDemoEvents.map((event) => {
              const result = interactiveDemoResults[event.id];
              return (
                <article className="bg-surface rounded-lg p-4" key={event.id}>
                  <p className="text-sm font-semibold">
                    {event.awayTeam} at {event.homeTeam}
                  </p>
                  <p className="mt-2 font-mono text-xl font-bold">
                    {result?.status === "FINAL"
                      ? `${result.awayScore}–${result.homeScore}`
                      : "—"}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <SettledCard heading="Your final card" positions={positions} />
          <SettledCard
            heading="Opponent’s final card"
            positions={interactiveDemoOpponentPositions}
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            className="bg-registry hover:bg-registry-hover min-h-12 rounded-lg px-5 font-semibold text-white"
            onClick={resetPractice}
            type="button"
          >
            Build another practice card
          </button>
          <Link
            className="border-registry text-registry hover:bg-subtle inline-flex min-h-12 items-center justify-center rounded-lg border px-5 font-semibold"
            href="/auth/create-account?next=%2Fleagues"
          >
            Start a real league
          </Link>
        </div>
      </div>
    );
  }

  if (phase === "SEALED") {
    return (
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="border-registry bg-surface rounded-xl border p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
                Practice Week · Unsaved
              </p>
              <h2 className="mt-2 text-xl font-bold">
                Your practice card is sealed
              </h2>
              <p className="text-graphite mt-2 text-sm">
                All receipts were created together in this browser tab. They are
                not saved to a league.
              </p>
            </div>
            <StatusBadge tone="sealed">Sealed</StatusBadge>
          </div>
          <div className="mt-6">
            <PracticeReceipts positions={positions} />
          </div>
        </section>
        <aside className="space-y-5">
          <section className="border-boundary bg-subtle rounded-xl border p-5">
            <h2 className="font-bold">Opponent card sealed</h2>
            <p className="text-graphite mt-2 text-sm leading-6">
              No opponent pick count, stake, or outcome is shown before the
              related example game begins.
            </p>
          </section>
          <button
            className="bg-registry hover:bg-registry-hover min-h-12 w-full rounded-lg px-5 font-semibold text-white"
            onClick={() => setPhase("FINAL")}
            type="button"
          >
            Reveal kickoff and see results
          </button>
          <button
            className="text-action min-h-11 w-full text-sm font-semibold hover:underline"
            onClick={resetPractice}
            type="button"
          >
            Start over
          </button>
        </aside>
      </div>
    );
  }

  if (reviewing) {
    return (
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="border-registry bg-surface rounded-xl border p-5 shadow-[var(--shadow-card)] sm:p-6">
          <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
            Practice Week · Unsaved · Final review
          </p>
          <h2 className="mt-2 text-2xl font-bold">Review your complete card</h2>
          <p className="text-graphite mt-3 leading-7">
            Nothing is sealed yet. Review current terms, then confirm the
            complete card once.
          </p>
          {quoteReviewItems.length > 0 ? (
            <p
              className="border-pending/40 bg-pending/10 text-graphite mt-4 rounded-lg border p-3 text-sm font-semibold"
              role="alert"
            >
              One example quote changed. Review the update before confirming.
            </p>
          ) : null}
          <div className="divide-boundary mt-6 divide-y">
            {drafts.map((item, index) => {
              const opportunity = getInteractiveDemoOpportunity(
                item.opportunityId,
              );
              const currentOdds = getInteractiveDemoCurrentOdds(
                item.opportunityId,
                true,
              );
              if (!opportunity || currentOdds === null) return null;
              const updated = item.reviewedAmericanOdds !== currentOdds;
              return (
                <article className="py-4 first:pt-0 last:pb-0" key={item.key}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-muted text-xs">
                        Pick {String(index + 1).padStart(2, "0")} ·{" "}
                        {opportunity.eventLabel}
                      </p>
                      <p className="mt-1 text-sm font-semibold">
                        {opportunity.displayLine}
                      </p>
                    </div>
                    <p className="shrink-0 font-mono text-sm">
                      {formatCredits(item.stakeCredits)} @{" "}
                      {formatAmericanOdds(currentOdds)}
                    </p>
                  </div>
                  {updated ? (
                    <div className="border-pending/40 bg-pending/10 mt-3 rounded-lg border p-3 text-sm">
                      <p className="text-pending font-semibold">Updated</p>
                      <p className="text-graphite mt-1">
                        {formatAmericanOdds(item.reviewedAmericanOdds)} →{" "}
                        {formatAmericanOdds(currentOdds)}
                      </p>
                      <button
                        className="text-action mt-2 min-h-11 font-semibold hover:underline"
                        onClick={() => reviewUpdatedQuote(item.key)}
                        type="button"
                      >
                        Use updated odds
                      </button>
                    </div>
                  ) : (
                    <p className="text-muted mt-2 text-xs">
                      Price reviewed 12:42 PM ET
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
        <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <section className="border-boundary bg-subtle rounded-xl border p-5">
            <p className="text-muted text-xs font-bold tracking-[0.08em] uppercase">
              Card total
            </p>
            <p className="mt-2 font-mono text-3xl font-bold">
              {formatCredits(allocatedCredits)} /{" "}
              {formatCredits(pocSeason1Ruleset.card.weeklyAllocationCredits)}
            </p>
            <p className="text-graphite mt-2 text-sm">
              {drafts.length} {drafts.length === 1 ? "pick" : "picks"}
            </p>
          </section>
          {feedback?.tone === "negative" ? (
            <p
              className="border-negative text-negative border-l-2 pl-3 text-sm font-semibold"
              role="alert"
            >
              {feedback.message}
            </p>
          ) : null}
          <button
            className="bg-registry hover:bg-registry-hover min-h-12 w-full rounded-lg px-5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={quoteReviewItems.length > 0}
            onClick={sealCard}
            type="button"
          >
            {quoteReviewItems.length > 0
              ? "Review updated quote first"
              : "Confirm and seal card"}
          </button>
          <button
            className="border-registry text-registry hover:bg-subtle min-h-11 w-full rounded-lg border px-5 text-sm font-semibold"
            onClick={() => {
              setFeedback(null);
              setReviewing(false);
            }}
            type="button"
          >
            Back to edit
          </button>
        </aside>
      </div>
    );
  }

  return (
    <>
      <div className="mt-7 grid gap-6 pb-32 xl:grid-cols-[minmax(0,1fr)_340px] xl:pb-0">
        <div className="space-y-7">
          <section
            className="border-boundary bg-surface rounded-xl border p-5 outline-none sm:p-6"
            id="practice-card-progress"
            tabIndex={-1}
          >
            <AllocationMeter
              allocatedCredits={allocatedCredits}
              commonLockLabel="Practice Sunday · 12:55 PM ET"
              maximumPositions={pocSeason1Ruleset.card.maximumPositions}
              positionCount={drafts.length}
              remainingCredits={remainingCredits}
              weeklyAllocationCredits={
                pocSeason1Ruleset.card.weeklyAllocationCredits
              }
            />
            <p className="text-graphite mt-4 text-sm leading-6">
              Choose an outcome, enter a whole-credit stake, and add the pick.
              Use exactly{" "}
              {formatCredits(pocSeason1Ruleset.card.weeklyAllocationCredits)}{" "}
              credits before review.
            </p>
            {feedback ? (
              <p
                className={`mt-4 border-l-2 pl-3 text-sm font-semibold ${
                  feedback.tone === "negative"
                    ? "border-negative text-negative"
                    : "border-positive text-positive"
                }`}
                role={feedback.tone === "negative" ? "alert" : "status"}
              >
                {feedback.message}
              </p>
            ) : null}
          </section>

          {interactiveDemoEvents.map((event) => (
            <section
              aria-labelledby={`practice-event-${event.id}`}
              className="border-boundary bg-surface rounded-xl border p-4 sm:p-5"
              key={event.id}
            >
              <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-end">
                <h2
                  className="text-lg font-bold"
                  id={`practice-event-${event.id}`}
                >
                  {event.awayTeam} at {event.homeTeam}
                </h2>
                <p className="text-muted text-sm">{event.kickoffLabel}</p>
              </div>
              <div className="divide-boundary mt-4 divide-y">
                {event.markets.map((market) => {
                  const key = marketKey(event.id, market.marketType);
                  const selected = drafts.find((item) => item.key === key);
                  const options = market.opportunities.map((opportunity) => {
                    const odds =
                      getInteractiveDemoCurrentOdds(
                        opportunity.id,
                        quotesRefreshed,
                      ) ?? opportunity.americanOdds;
                    const copy = marketOptionCopy({
                      americanOdds: odds,
                      awayTeam: event.awayTeam,
                      fallbackLabel: opportunity.displayLine,
                      homeTeam: event.homeTeam,
                      lineMilli: opportunity.lineMilli,
                      marketType: opportunity.marketType,
                      outcomeKey: opportunity.selectedSide,
                    });
                    return {
                      id: opportunity.id,
                      accessibleLabel: copy.accessibleLabel,
                      primary: copy.primary,
                      secondary: copy.secondary,
                    };
                  });
                  return (
                    <article
                      className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[100px_minmax(0,1fr)] sm:items-center"
                      key={market.marketType}
                    >
                      <div className="flex items-center justify-between gap-3 sm:block">
                        <p className="text-muted text-xs font-bold tracking-[0.08em] uppercase">
                          {market.label}
                        </p>
                        {selected ? (
                          <button
                            className="text-action min-h-11 text-xs font-semibold hover:underline sm:mt-2"
                            onClick={() =>
                              openEditor(event, market, selected.opportunityId)
                            }
                            type="button"
                          >
                            Edit pick
                          </button>
                        ) : null}
                      </div>
                      <div>
                        <OutcomeSelector
                          label={`${event.awayTeam} at ${event.homeTeam} ${market.label}`}
                          onSelect={(id) => openEditor(event, market, id)}
                          options={options}
                          selectedId={selected?.opportunityId ?? null}
                        />
                        {selected ? (
                          <p className="text-graphite mt-2 text-xs font-semibold">
                            {formatCredits(selected.stakeCredits)} credits in
                            your draft
                          </p>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <section className="border-boundary bg-surface rounded-xl border p-5">
            <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
              Your practice card
            </p>
            <p className="text-muted mt-2 text-xs">
              Unsaved · this draft disappears when you leave
            </p>
            {drafts.length === 0 ? (
              <p className="text-muted mt-4 text-sm">
                Choose an outcome to add your first pick.
              </p>
            ) : (
              <div className="divide-boundary mt-4 divide-y">
                {drafts.map((item, index) => {
                  const opportunity = getInteractiveDemoOpportunity(
                    item.opportunityId,
                  );
                  const event = interactiveDemoEvents.find(
                    (candidate) => candidate.id === opportunity?.eventId,
                  );
                  const market = event?.markets.find(
                    (candidate) =>
                      candidate.marketType === opportunity?.marketType,
                  );
                  if (!opportunity || !event || !market) return null;
                  const odds =
                    getInteractiveDemoCurrentOdds(
                      item.opportunityId,
                      quotesRefreshed,
                    ) ?? item.reviewedAmericanOdds;
                  return (
                    <article
                      className="py-4 first:pt-0 last:pb-0"
                      key={item.key}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-muted text-xs">
                            Pick {String(index + 1).padStart(2, "0")}
                          </p>
                          <p className="mt-1 text-sm font-semibold">
                            {opportunity.displayLine}
                          </p>
                          <p className="text-muted mt-1 font-mono text-xs">
                            {formatCredits(item.stakeCredits)} @{" "}
                            {formatAmericanOdds(odds)}
                          </p>
                        </div>
                        <div className="flex flex-col items-end">
                          <button
                            className="text-action min-h-11 px-2 text-xs font-semibold hover:underline"
                            onClick={() =>
                              openEditor(event, market, item.opportunityId)
                            }
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            className="text-negative min-h-11 px-2 text-xs font-semibold hover:underline"
                            onClick={() => removeDraft(item.key)}
                            type="button"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            <p className="border-boundary text-graphite mt-4 border-t pt-4 text-sm font-semibold">
              {formatCredits(allocatedCredits)} allocated ·{" "}
              {remainingCredits >= 0
                ? `${formatCredits(remainingCredits)} remaining`
                : `${formatCredits(Math.abs(remainingCredits))} over`}
            </p>
          </section>

          <button
            className="bg-registry hover:bg-registry-hover min-h-12 w-full rounded-lg px-5 font-semibold text-white"
            onClick={reviewCard}
            type="button"
          >
            Review card
          </button>
          <button
            className="text-action min-h-11 w-full text-sm font-semibold hover:underline"
            onClick={resetPractice}
            type="button"
          >
            Clear practice card
          </button>
        </aside>
      </div>

      <CardTray
        allocatedCredits={allocatedCredits}
        onReview={reviewCard}
        pickCount={drafts.length}
        remainingCredits={remainingCredits}
      />

      <PositionEditorSheet
        confirmLabel={editor?.existing ? "Update pick" : "Add to card"}
        context={
          editorEvent
            ? `${editorEvent.awayTeam} at ${editorEvent.homeTeam} · ${editorEvent.kickoffLabel}`
            : "Practice fixture"
        }
        error={editorError}
        helper={
          editorMaximum === null
            ? "Choose an outcome to see its limit."
            : `This pick may use up to ${formatCredits(editorMaximum)} credits under the current Ruleset.`
        }
        maximumStakeCredits={editorMaximum}
        minimumStakeCredits={pocSeason1Ruleset.card.minimumStakeCredits}
        onClose={() => {
          setEditor(null);
          setEditorError(null);
        }}
        onSelectOutcome={selectEditorOutcome}
        onStakeChange={(value) => {
          setEditor((current) =>
            current ? { ...current, stakeCredits: value } : current,
          );
          setEditorError(null);
        }}
        onSubmit={saveEditor}
        open={Boolean(editor)}
        outcomes={editorOptions}
        remainingCredits={Math.max(0, editorAvailableCredits)}
        selectedOutcomeId={editor?.opportunityId ?? null}
        stakeCredits={editor?.stakeCredits ?? ""}
        title={editorMarket ? marketLabels[editorMarket.marketType] : "Pick"}
      />
    </>
  );
}
