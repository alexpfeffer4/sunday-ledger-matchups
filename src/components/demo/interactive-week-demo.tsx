"use client";

import Link from "next/link";
import { useState } from "react";
import {
  getInteractiveDemoOpportunity,
  interactiveDemoEligibleOpportunities,
  interactiveDemoEvents,
  interactiveDemoOpponentPositions,
  interactiveDemoResults,
  settleInteractiveDemoPositions,
  type InteractiveDemoMarket,
  type InteractiveDemoPosition,
} from "@/adapters/simulation/interactive-week";
import { AllocationMeter } from "@/components/matchup/allocation-meter";
import {
  formatAmericanOdds,
  marketOptionCopy,
} from "@/components/card/market-option-copy";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  cardCompliance,
  maximumStakeForOdds,
  type AcceptedCardPosition,
} from "@/domain/cards/validate-position";
import { validateDraftCard } from "@/domain/cards/validate-card-draft";
import { decideRegularSeasonMatchup } from "@/domain/matchups/decide";
import { formatCenticredits } from "@/domain/odds/american";
import { weeklyScore } from "@/domain/settlement/settle";
import { simulationSeason1Ruleset } from "@/rulesets/simulation-season-1";

type DemoPhase = "BUILDING" | "LOCKED" | "FINAL";

type DraftPosition = {
  opportunityId: string | null;
  stakeCredits: string;
};

type Feedback = {
  marketKey?: string;
  tone: "positive" | "negative";
  message: string;
} | null;

function marketKey(eventId: string, marketType: string): string {
  return `${eventId}:${marketType}`;
}

function createInitialDrafts(): Record<string, DraftPosition> {
  return Object.fromEntries(
    interactiveDemoEvents.flatMap((event) =>
      event.markets.map((market) => [
        marketKey(event.id, market.marketType),
        {
          opportunityId: null,
          stakeCredits: "250",
        },
      ]),
    ),
  );
}

function acceptedCardPositions(
  positions: readonly InteractiveDemoPosition[],
): AcceptedCardPosition[] {
  return positions.map((position) => {
    const opportunity = getInteractiveDemoOpportunity(position.opportunityId);
    if (!opportunity) throw new Error("The accepted demo position is missing.");
    return {
      eventId: opportunity.eventId,
      marketType: opportunity.marketType,
      stakeCredits: position.stakeCredits,
      americanOdds: opportunity.americanOdds,
    };
  });
}

function AcceptedPositions({
  positions,
  label = "Receipt",
}: {
  positions: readonly InteractiveDemoPosition[];
  label?: "Draft" | "Receipt";
}) {
  return positions.length === 0 ? (
    <p className="text-muted text-sm">No positions accepted yet.</p>
  ) : (
    <div className="divide-boundary divide-y">
      {positions.map((position, index) => {
        const opportunity = getInteractiveDemoOpportunity(
          position.opportunityId,
        );
        if (!opportunity) return null;
        return (
          <article className="py-3 first:pt-0 last:pb-0" key={position.id}>
            <p className="text-muted text-xs">
              {label} {String(index + 1).padStart(2, "0")} ·{" "}
              {opportunity.marketType}
            </p>
            <div className="mt-1 flex justify-between gap-4 text-sm">
              <span className="font-semibold">{opportunity.displayLine}</span>
              <span className="font-mono">
                {position.stakeCredits} @{" "}
                {formatAmericanOdds(opportunity.americanOdds)}
              </span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function DemoMarketCard({
  awayTeam,
  eventId,
  homeTeam,
  market,
  draft,
  feedback,
  isInCard,
  onDraftChange,
  onToggleCard,
}: {
  awayTeam: string;
  eventId: string;
  homeTeam: string;
  market: InteractiveDemoMarket;
  draft: DraftPosition;
  feedback: Feedback;
  isInCard: boolean;
  onDraftChange: (draft: DraftPosition) => void;
  onToggleCard: () => void;
}) {
  const key = marketKey(eventId, market.marketType);
  const selectedOpportunity =
    market.opportunities.find(
      (opportunity) => opportunity.id === draft.opportunityId,
    ) ?? null;
  const maximumStakeCredits = selectedOpportunity
    ? maximumStakeForOdds(
        selectedOpportunity.americanOdds,
        simulationSeason1Ruleset,
      )
    : null;

  return (
    <article
      className={`rounded-lg border p-4 ${
        isInCard ? "border-registry bg-registry/5" : "border-boundary bg-subtle"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted text-xs font-bold tracking-[0.08em] uppercase">
          {market.label}
        </p>
        {isInCard ? <StatusBadge tone="positive">In card</StatusBadge> : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {market.opportunities.map((opportunity) => {
          const isSelected = draft.opportunityId === opportunity.id;
          const copy = marketOptionCopy({
            americanOdds: opportunity.americanOdds,
            awayTeam,
            fallbackLabel: opportunity.displayLine,
            homeTeam,
            lineMilli: opportunity.lineMilli,
            marketType: opportunity.marketType,
            outcomeKey: opportunity.selectedSide,
          });
          return (
            <button
              aria-label={copy.accessibleLabel}
              aria-pressed={isSelected}
              className={`relative flex h-20 flex-col justify-center rounded-lg border py-2 pr-10 pl-3 text-left transition-colors ${
                isSelected
                  ? "border-registry bg-registry text-white shadow-sm"
                  : "border-control bg-surface hover:border-registry hover:bg-registry/5"
              }`}
              key={opportunity.id}
              onClick={() =>
                onDraftChange({
                  ...draft,
                  opportunityId: opportunity.id,
                })
              }
              type="button"
            >
              <span className="block truncate text-sm leading-5 font-semibold">
                {copy.primary}
              </span>
              <span className="mt-1 block font-mono text-xs leading-4 whitespace-nowrap">
                {copy.secondary}
              </span>
              {isSelected ? (
                <span
                  aria-hidden="true"
                  className="text-registry absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-white text-xs font-black"
                >
                  ✓
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <label
        className="mt-4 block text-xs font-semibold"
        htmlFor={`demo-${key}`}
      >
        Credits at risk
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          className="border-control bg-surface focus:border-registry disabled:bg-subtle disabled:text-muted min-h-11 min-w-0 flex-1 rounded-lg border px-3 font-mono outline-none disabled:cursor-not-allowed"
          disabled={!selectedOpportunity}
          id={`demo-${key}`}
          inputMode="numeric"
          min={simulationSeason1Ruleset.card.minimumStakeCredits}
          max={maximumStakeCredits ?? undefined}
          onChange={(event) =>
            onDraftChange({
              ...draft,
              stakeCredits: event.currentTarget.value,
            })
          }
          step={1}
          type="number"
          value={draft.stakeCredits}
        />
        <button
          className={
            isInCard
              ? "border-registry text-registry hover:bg-surface min-h-11 rounded-lg border px-4 text-sm font-semibold"
              : "bg-registry hover:bg-registry-hover min-h-11 rounded-lg px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          }
          disabled={!selectedOpportunity}
          onClick={onToggleCard}
          type="button"
        >
          {isInCard ? "Remove" : "Add to card"}
        </button>
      </div>
      <p className="text-muted mt-2 text-xs">
        {maximumStakeCredits === null
          ? "Choose a side to set credits at risk."
          : `This selection’s cap is ${maximumStakeCredits.toLocaleString()} credits.`}
      </p>
      {feedback?.marketKey === key ? (
        <p
          className={`mt-3 border-l-2 pl-3 text-sm font-semibold ${
            feedback.tone === "positive"
              ? "border-positive text-positive"
              : "border-negative text-negative"
          }`}
          role={feedback.tone === "negative" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      ) : null}
    </article>
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
              Risked {position.stakeCredits} @{" "}
              {formatAmericanOdds(position.opportunity.americanOdds)} · returned{" "}
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

export function InteractiveWeekDemo() {
  const [phase, setPhase] = useState<DemoPhase>("BUILDING");
  const [positions, setPositions] = useState<InteractiveDemoPosition[]>([]);
  const [drafts, setDrafts] =
    useState<Record<string, DraftPosition>>(createInitialDrafts);
  const [draftMarketKeys, setDraftMarketKeys] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const accepted = acceptedCardPositions(positions);
  const draftItems = draftMarketKeys.flatMap((key, index) => {
    const draft = drafts[key];
    const opportunity = draft?.opportunityId
      ? getInteractiveDemoOpportunity(draft.opportunityId)
      : null;
    return draft && opportunity
      ? [
          {
            key,
            draft,
            opportunity,
            preview: {
              id: `demo-draft-${String(index + 1).padStart(2, "0")}`,
              opportunityId: opportunity.id,
              stakeCredits: Number(draft.stakeCredits),
            } satisfies InteractiveDemoPosition,
          },
        ]
      : [];
  });
  const draftCardPositions: AcceptedCardPosition[] = draftItems.map(
    ({ draft, opportunity }) => ({
      eventId: opportunity.eventId,
      marketType: opportunity.marketType,
      stakeCredits: Number(draft.stakeCredits),
      americanOdds: opportunity.americanOdds,
    }),
  );
  const allocatedCredits = draftCardPositions.reduce(
    (total, position) => total + position.stakeCredits,
    0,
  );
  const remainingCredits =
    simulationSeason1Ruleset.card.weeklyAllocationCredits - allocatedCredits;

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
      entryId: "demo-self",
      compliance: cardCompliance(accepted, simulationSeason1Ruleset),
      scoreCenticredits: selfScore,
    },
    {
      entryId: "demo-opponent",
      compliance: cardCompliance(
        acceptedCardPositions(interactiveDemoOpponentPositions),
        simulationSeason1Ruleset,
      ),
      scoreCenticredits: opponentScore,
    },
  );

  function updateDraft(key: string, draft: DraftPosition) {
    setDrafts((current) => ({ ...current, [key]: draft }));
    setFeedback(null);
  }

  function toggleDraftPosition(market: InteractiveDemoMarket, eventId: string) {
    const key = marketKey(eventId, market.marketType);
    if (draftMarketKeys.includes(key)) {
      setDraftMarketKeys((current) => current.filter((item) => item !== key));
      setFeedback(null);
      return;
    }
    const draft = drafts[key];
    if (!draft?.opportunityId) return;
    const opportunity = getInteractiveDemoOpportunity(draft.opportunityId);
    if (!opportunity) return;
    const proposedPositions = [
      ...draftCardPositions,
      {
        eventId: opportunity.eventId,
        marketType: opportunity.marketType,
        stakeCredits: Number(draft.stakeCredits),
        americanOdds: opportunity.americanOdds,
      },
    ];
    const validation = validateDraftCard({
      draftPositions: proposedPositions,
      eligibleOpportunities: interactiveDemoEligibleOpportunities,
      ruleset: simulationSeason1Ruleset,
    });

    if (!validation.accepted && validation.code !== "INCOMPLETE_CARD") {
      setFeedback({
        marketKey: key,
        tone: "negative",
        message: validation.message,
      });
      return;
    }

    setDraftMarketKeys((current) => [...current, key]);
    setFeedback(null);
  }

  function validateCurrentDraft() {
    const validation = validateDraftCard({
      draftPositions: draftCardPositions,
      eligibleOpportunities: interactiveDemoEligibleOpportunities,
      ruleset: simulationSeason1Ruleset,
    });
    if (!validation.accepted) {
      setFeedback({
        marketKey:
          validation.positionIndex === undefined
            ? undefined
            : draftItems[validation.positionIndex]?.key,
        tone: "negative",
        message: validation.message,
      });
      return false;
    }
    return true;
  }

  function reviewCard() {
    if (!validateCurrentDraft()) return;
    setFeedback(null);
    setReviewing(true);
  }

  function sealCard() {
    if (!validateCurrentDraft()) {
      setReviewing(false);
      return;
    }
    setPositions(
      draftItems.map(({ draft, opportunity }, index) => ({
        id: `demo-receipt-${String(index + 1).padStart(2, "0")}`,
        opportunityId: opportunity.id,
        stakeCredits: Number(draft.stakeCredits),
      })),
    );
    setFeedback(null);
    setReviewing(false);
    setPhase("LOCKED");
  }

  function resetDemo() {
    setPhase("BUILDING");
    setPositions([]);
    setDrafts(createInitialDrafts());
    setDraftMarketKeys([]);
    setReviewing(false);
    setFeedback(null);
  }

  if (phase === "FINAL") {
    const selfDecision = decision.decisions["demo-self"] ?? "LOSS";
    const opponentDecision = decision.decisions["demo-opponent"] ?? "LOSS";
    return (
      <div className="mt-7 space-y-6">
        <section className="border-registry bg-surface rounded-xl border p-6 shadow-[var(--shadow-card)]">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
                Solo demo · final
              </p>
              <h2 className="mt-2 text-2xl font-bold">
                Position flow completed successfully
              </h2>
            </div>
            <StatusBadge tone="positive">Matchup final</StatusBadge>
          </div>
          <div className="mt-7 grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-center">
            <div>
              <p className="font-bold">You</p>
              <p className="mt-2 font-mono text-3xl font-bold">
                {formatCenticredits(selfScore, true)}
              </p>
              <p className="text-registry mt-2 font-bold">{selfDecision}</p>
            </div>
            <span className="text-muted text-xs font-bold">VS</span>
            <div>
              <p className="font-bold">Demo opponent</p>
              <p className="mt-2 font-mono text-3xl font-bold">
                {formatCenticredits(opponentScore, true)}
              </p>
              <p className="text-copper mt-2 font-bold">{opponentDecision}</p>
            </div>
          </div>
        </section>

        <section className="border-boundary bg-subtle rounded-xl border p-5">
          <h2 className="font-bold">Final event results</h2>
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
          <SettledCard heading="Your settled card" positions={positions} />
          <SettledCard
            heading="Opponent card · revealed after kickoff"
            positions={interactiveDemoOpponentPositions}
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            className="bg-registry hover:bg-registry-hover min-h-11 rounded-lg px-5 font-semibold text-white"
            onClick={resetDemo}
            type="button"
          >
            Run another position demo
          </button>
          <Link
            className="border-registry text-registry hover:bg-subtle inline-flex min-h-11 items-center justify-center rounded-lg border px-5 font-semibold"
            href="/leagues"
          >
            Back to Your leagues
          </Link>
        </div>
      </div>
    );
  }

  if (phase === "BUILDING" && reviewing) {
    return (
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="border-registry bg-surface rounded-xl border p-6 shadow-[var(--shadow-card)]">
          <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
            Final review
          </p>
          <h2 className="mt-2 text-2xl font-bold">Review your complete card</h2>
          <p className="text-graphite mt-3 leading-7">
            Nothing has been accepted yet. Confirming below seals every listed
            position together; if any validation fails, none of them are
            accepted.
          </p>
          <div className="mt-6">
            <AcceptedPositions
              label="Draft"
              positions={draftItems.map((item) => item.preview)}
            />
          </div>
        </section>
        <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <section className="border-boundary bg-subtle rounded-xl border p-5">
            <p className="text-muted text-xs font-bold tracking-[0.08em] uppercase">
              Card total
            </p>
            <p className="mt-2 font-mono text-3xl font-bold">
              {allocatedCredits.toLocaleString()} / 1,000
            </p>
            <p className="text-graphite mt-2 text-sm">
              {draftItems.length} positions · one atomic acceptance
            </p>
          </section>
          {feedback ? (
            <p
              className="border-negative text-negative border-l-2 pl-3 text-sm font-semibold"
              role="alert"
            >
              {feedback.message}
            </p>
          ) : null}
          <button
            className="bg-registry hover:bg-registry-hover min-h-12 w-full rounded-lg px-5 font-semibold text-white"
            onClick={sealCard}
            type="button"
          >
            Confirm &amp; seal entire card
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

  if (phase === "LOCKED") {
    return (
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="border-registry bg-surface rounded-xl border p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
                Atomic acceptance complete
              </p>
              <h2 className="mt-2 text-xl font-bold">
                Your complete card is sealed
              </h2>
            </div>
            <StatusBadge tone="sealed">Locked</StatusBadge>
          </div>
          <div className="mt-5">
            <AcceptedPositions positions={positions} />
          </div>
        </section>
        <aside className="space-y-5">
          <section className="border-boundary bg-subtle rounded-xl border p-5">
            <h2 className="font-bold">Demo opponent · sealed</h2>
            <p className="text-graphite mt-2 text-sm leading-6">
              You cannot see its position count, markets, stakes, odds, or card
              shape before reliable kickoff.
            </p>
          </section>
          <button
            className="bg-registry hover:bg-registry-hover min-h-12 w-full rounded-lg px-5 font-semibold text-white"
            onClick={() => setPhase("FINAL")}
            type="button"
          >
            Advance to kickoff, reveal &amp; settle
          </button>
          <button
            className="text-action min-h-11 w-full text-sm font-semibold hover:underline"
            onClick={resetDemo}
            type="button"
          >
            Reset test data
          </button>
        </aside>
      </div>
    );
  }

  return (
    <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-7">
        <section className="border-boundary bg-surface rounded-xl border p-5 sm:p-6">
          <AllocationMeter
            allocatedCredits={allocatedCredits}
            commonLockLabel="Demo Sunday · 12:55 PM ET"
            maximumPositions={simulationSeason1Ruleset.card.maximumPositions}
            positionCount={positions.length}
            remainingCredits={remainingCredits}
            weeklyAllocationCredits={
              simulationSeason1Ruleset.card.weeklyAllocationCredits
            }
          />
          <p className="text-graphite mt-4 text-sm leading-6">
            Add draft positions until exactly 1,000 whole credits are allocated.
            You can switch sides, edit stakes, or remove drafts until the final
            card confirmation.
          </p>
        </section>

        {interactiveDemoEvents.map((event) => (
          <section key={event.id} aria-labelledby={`demo-event-${event.id}`}>
            <div className="mb-3 flex flex-col justify-between gap-1 sm:flex-row sm:items-end">
              <h2 id={`demo-event-${event.id}`} className="text-lg font-bold">
                {event.awayTeam} at {event.homeTeam}
              </h2>
              <p className="text-muted text-sm">{event.kickoffLabel}</p>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              {event.markets.map((market) => {
                const key = marketKey(event.id, market.marketType);
                const draft = drafts[key] ?? {
                  opportunityId: null,
                  stakeCredits: "250",
                };
                return (
                  <DemoMarketCard
                    awayTeam={event.awayTeam}
                    draft={draft}
                    eventId={event.id}
                    feedback={feedback}
                    homeTeam={event.homeTeam}
                    isInCard={draftMarketKeys.includes(key)}
                    key={market.marketType}
                    market={market}
                    onDraftChange={(nextDraft) => updateDraft(key, nextDraft)}
                    onToggleCard={() => toggleDraftPosition(market, event.id)}
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
        <section className="border-boundary bg-surface rounded-xl border p-5">
          <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
            Card Builder
          </p>
          <div className="mt-4">
            {draftItems.length === 0 ? (
              <p className="text-muted text-sm">
                Add a position from the slate. Nothing is sealed until final
                confirmation.
              </p>
            ) : (
              <AcceptedPositions
                label="Draft"
                positions={draftItems.map((item) => item.preview)}
              />
            )}
          </div>
          <p className="border-boundary text-graphite mt-4 border-t pt-4 text-sm font-semibold">
            {allocatedCredits.toLocaleString()} allocated ·{" "}
            {remainingCredits >= 0
              ? `${remainingCredits.toLocaleString()} remaining`
              : `${Math.abs(remainingCredits).toLocaleString()} over`}
          </p>
        </section>

        <section className="border-boundary bg-subtle rounded-xl border p-5">
          <h2 className="font-bold">Try the guardrails</h2>
          <ul className="text-graphite mt-3 list-disc space-y-2 pl-5 text-sm leading-6">
            <li>
              Try 1,000 on Kansas City −205; the 750 cap should reject it.
            </li>
            <li>
              Try leaving 1–49 credits; legal completion should reject it.
            </li>
            <li>Switch any side or stake before the final confirmation.</li>
            <li>At confirmation, every draft succeeds or none do.</li>
          </ul>
        </section>

        <button
          className="bg-registry hover:bg-registry-hover min-h-12 w-full rounded-lg px-5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={remainingCredits !== 0 || draftItems.length === 0}
          onClick={reviewCard}
          type="button"
        >
          {remainingCredits === 0
            ? `Review & seal ${draftItems.length} positions`
            : remainingCredits > 0
              ? `Allocate ${remainingCredits} more to review`
              : `Reduce by ${Math.abs(remainingCredits)} to review`}
        </button>
        <button
          className="text-action min-h-11 w-full text-sm font-semibold hover:underline"
          onClick={resetDemo}
          type="button"
        >
          Reset test data
        </button>
      </aside>
    </div>
  );
}
