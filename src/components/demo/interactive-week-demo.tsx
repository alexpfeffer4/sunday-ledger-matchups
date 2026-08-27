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
import { StatusBadge } from "@/components/ui/status-badge";
import {
  cardCompliance,
  maximumStakeForOdds,
  validateProposedPosition,
  type AcceptedCardPosition,
} from "@/domain/cards/validate-position";
import { decideRegularSeasonMatchup } from "@/domain/matchups/decide";
import { formatCenticredits } from "@/domain/odds/american";
import { weeklyScore } from "@/domain/settlement/settle";
import { simulationSeason1Ruleset } from "@/rulesets/simulation-season-1";

type DemoPhase = "BUILDING" | "LOCKED" | "FINAL";

type DraftPosition = {
  opportunityId: string;
  stakeCredits: string;
};

type Feedback = {
  marketKey: string;
  tone: "positive" | "negative";
  message: string;
} | null;

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `−${Math.abs(odds)}`;
}

function marketKey(eventId: string, marketType: string): string {
  return `${eventId}:${marketType}`;
}

function createInitialDrafts(): Record<string, DraftPosition> {
  return Object.fromEntries(
    interactiveDemoEvents.flatMap((event) =>
      event.markets.map((market) => [
        marketKey(event.id, market.marketType),
        {
          opportunityId: market.opportunities[0].id,
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
}: {
  positions: readonly InteractiveDemoPosition[];
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
              Receipt {String(index + 1).padStart(2, "0")} ·{" "}
              {opportunity.marketType}
            </p>
            <div className="mt-1 flex justify-between gap-4 text-sm">
              <span className="font-semibold">{opportunity.displayLine}</span>
              <span className="font-mono">
                {position.stakeCredits} @ {formatOdds(opportunity.americanOdds)}
              </span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function DemoMarketCard({
  eventId,
  market,
  acceptedPosition,
  draft,
  feedback,
  remainingCredits,
  onDraftChange,
  onAccept,
}: {
  eventId: string;
  market: InteractiveDemoMarket;
  acceptedPosition?: InteractiveDemoPosition;
  draft: DraftPosition;
  feedback: Feedback;
  remainingCredits: number;
  onDraftChange: (draft: DraftPosition) => void;
  onAccept: () => void;
}) {
  const key = marketKey(eventId, market.marketType);
  const selectedOpportunity =
    market.opportunities.find(
      (opportunity) => opportunity.id === draft.opportunityId,
    ) ?? market.opportunities[0];
  const acceptedOpportunity = acceptedPosition
    ? getInteractiveDemoOpportunity(acceptedPosition.opportunityId)
    : null;
  const maximumStakeCredits = maximumStakeForOdds(
    selectedOpportunity.americanOdds,
    simulationSeason1Ruleset,
  );

  if (acceptedPosition && acceptedOpportunity) {
    return (
      <article className="border-positive/30 bg-positive/5 rounded-lg border p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted text-xs font-bold tracking-[0.08em] uppercase">
            {market.label}
          </p>
          <StatusBadge tone="sealed">Sealed</StatusBadge>
        </div>
        <p className="mt-3 font-semibold">{acceptedOpportunity.displayLine}</p>
        <p className="text-graphite mt-1 font-mono text-sm">
          {acceptedPosition.stakeCredits} credits @{" "}
          {formatOdds(acceptedOpportunity.americanOdds)}
        </p>
      </article>
    );
  }

  return (
    <article className="border-boundary bg-subtle rounded-lg border p-4">
      <p className="text-muted text-xs font-bold tracking-[0.08em] uppercase">
        {market.label}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {market.opportunities.map((opportunity) => (
          <button
            aria-label={`${opportunity.displayLine} ${formatOdds(opportunity.americanOdds)}`}
            aria-pressed={draft.opportunityId === opportunity.id}
            className={`min-h-16 rounded-lg border px-3 py-2 text-left transition-colors ${
              draft.opportunityId === opportunity.id
                ? "border-registry bg-surface text-registry"
                : "border-control bg-surface hover:border-registry"
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
            <span className="block text-sm font-semibold">
              {opportunity.displayLine}
            </span>
            <span className="mt-1 block font-mono text-xs">
              {formatOdds(opportunity.americanOdds)}
            </span>
          </button>
        ))}
      </div>
      <label
        className="mt-4 block text-xs font-semibold"
        htmlFor={`demo-${key}`}
      >
        Credits at risk
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          className="border-control bg-surface focus:border-registry min-h-11 min-w-0 flex-1 rounded-lg border px-3 font-mono outline-none"
          id={`demo-${key}`}
          inputMode="numeric"
          min={simulationSeason1Ruleset.card.minimumStakeCredits}
          max={Math.min(remainingCredits, maximumStakeCredits)}
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
          className="bg-registry hover:bg-registry-hover min-h-11 rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-50"
          disabled={remainingCredits < 50}
          onClick={onAccept}
          type="button"
        >
          Confirm &amp; seal
        </button>
      </div>
      <p className="text-muted mt-2 text-xs">
        This selection’s cap is {maximumStakeCredits.toLocaleString()} credits.
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
              {formatOdds(position.opportunity.americanOdds)} · returned{" "}
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
  const [feedback, setFeedback] = useState<Feedback>(null);

  const accepted = acceptedCardPositions(positions);
  const allocatedCredits = accepted.reduce(
    (total, position) => total + position.stakeCredits,
    0,
  );
  const remainingCredits =
    simulationSeason1Ruleset.card.weeklyAllocationCredits - allocatedCredits;
  const acceptedByMarket = new Map(
    positions.map((position) => {
      const opportunity = getInteractiveDemoOpportunity(position.opportunityId);
      if (!opportunity)
        throw new Error("The accepted demo position is missing.");
      return [marketKey(opportunity.eventId, opportunity.marketType), position];
    }),
  );

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

  function acceptPosition(market: InteractiveDemoMarket, eventId: string) {
    const key = marketKey(eventId, market.marketType);
    const draft = drafts[key];
    if (!draft) return;
    const opportunity = getInteractiveDemoOpportunity(draft.opportunityId);
    if (!opportunity) return;
    const stakeCredits = Number(draft.stakeCredits);
    const validation = validateProposedPosition({
      acceptedPositions: accepted,
      proposedPosition: {
        eventId: opportunity.eventId,
        marketType: opportunity.marketType,
        stakeCredits,
        americanOdds: opportunity.americanOdds,
      },
      eligibleOpportunities: interactiveDemoEligibleOpportunities,
      ruleset: simulationSeason1Ruleset,
    });

    if (!validation.accepted) {
      setFeedback({
        marketKey: key,
        tone: "negative",
        message: validation.message,
      });
      return;
    }

    setPositions((current) => [
      ...current,
      {
        id: `demo-receipt-${String(current.length + 1).padStart(2, "0")}`,
        opportunityId: opportunity.id,
        stakeCredits,
      },
    ]);
    setFeedback({
      marketKey: key,
      tone: "positive",
      message: `${stakeCredits} credits accepted. This demo receipt is now immutable.`,
    });
  }

  function resetDemo() {
    setPhase("BUILDING");
    setPositions([]);
    setDrafts(createInitialDrafts());
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
                Betting flow completed successfully
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
            Run another betting demo
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

  if (phase === "LOCKED") {
    return (
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="border-registry bg-surface rounded-xl border p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
                Common lock passed
              </p>
              <h2 className="mt-2 text-xl font-bold">Your card is compliant</h2>
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
            Start games, reveal &amp; settle
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
            Allocate exactly 1,000 whole credits. Every confirmation is final;
            use <strong>Reset test data</strong> if you want a fresh run.
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
                  opportunityId: market.opportunities[0].id,
                  stakeCredits: "250",
                };
                return (
                  <DemoMarketCard
                    acceptedPosition={acceptedByMarket.get(key)}
                    draft={draft}
                    eventId={event.id}
                    feedback={feedback}
                    key={market.marketType}
                    market={market}
                    onAccept={() => acceptPosition(market, event.id)}
                    onDraftChange={(nextDraft) => updateDraft(key, nextDraft)}
                    remainingCredits={remainingCredits}
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
            Your private card
          </p>
          <div className="mt-4">
            <AcceptedPositions positions={positions} />
          </div>
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
            <li>After sealing one market, its opposite side disappears too.</li>
          </ul>
        </section>

        <button
          className="bg-registry hover:bg-registry-hover min-h-12 w-full rounded-lg px-5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={remainingCredits !== 0}
          onClick={() => setPhase("LOCKED")}
          type="button"
        >
          {remainingCredits === 0
            ? "Lock completed card"
            : `Allocate ${remainingCredits} more to lock`}
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
