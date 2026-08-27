"use client";

import { useActionState, useState } from "react";
import { acceptStage1CardAction } from "@/app/l/[leagueSlug]/actions";
import { initialAppActionState } from "@/application/actions/action-state";
import type { Stage1StateDto } from "@/application/queries/stage1-dtos";
import { ActionFeedback } from "@/components/forms/action-feedback";
import { StatusBadge } from "@/components/ui/status-badge";
import { validateDraftCard } from "@/domain/cards/validate-card-draft";
import { maximumStakeForOdds } from "@/domain/cards/validate-position";
import { simulationSeason1Ruleset } from "@/rulesets/simulation-season-1";

type SlateEvent = Stage1StateDto["slate"][number];
type SlateMarket = SlateEvent["markets"][number];

type DraftSelection = {
  eventId: string;
  marketSnapshotId: string;
  marketType: SlateMarket["marketType"];
  payloadHash: string;
  stakeCredits: number;
};

const marketLabels = {
  MONEYLINE: "Winner",
  SPREAD: "Spread",
  TOTAL: "Total",
} as const;

const marketTypes = ["MONEYLINE", "SPREAD", "TOTAL"] as const;

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `−${Math.abs(odds)}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function selectionKey(
  selection: Pick<DraftSelection, "eventId" | "marketType">,
) {
  return `${selection.eventId}:${selection.marketType}`;
}

export function Stage1CardBuilder({ state }: { state: Stage1StateDto }) {
  const [drafts, setDrafts] = useState<DraftSelection[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [actionState, action, pending] = useActionState(
    acceptStage1CardAction,
    initialAppActionState,
  );
  const ownerCard = state.ownerCard;
  if (!ownerCard || !state.week) return null;

  const snapshots = new Map(
    state.slate.flatMap((event) =>
      event.markets.map((market) => [market.id, { event, market }] as const),
    ),
  );
  const eligibleByMarket = new Map<
    string,
    {
      eventId: string;
      marketType: SlateMarket["marketType"];
      americanOdds: number;
    }
  >();
  for (const event of state.slate) {
    for (const market of event.markets) {
      if (market.qualityStatus !== "HEALTHY") continue;
      const key = `${event.id}:${market.marketType}`;
      const current = eligibleByMarket.get(key);
      if (
        !current ||
        maximumStakeForOdds(market.americanOdds, simulationSeason1Ruleset) >
          maximumStakeForOdds(current.americanOdds, simulationSeason1Ruleset)
      ) {
        eligibleByMarket.set(key, {
          eventId: event.id,
          marketType: market.marketType,
          americanOdds: market.americanOdds,
        });
      }
    }
  }

  const draftPositions = drafts.flatMap((draft) => {
    const selected = snapshots.get(draft.marketSnapshotId);
    return selected
      ? [
          {
            eventId: selected.event.id,
            marketType: selected.market.marketType,
            stakeCredits: draft.stakeCredits,
            americanOdds: selected.market.americanOdds,
          },
        ]
      : [];
  });
  const draftValidation = validateDraftCard({
    acceptedPositions: ownerCard.positions.map((position) => ({
      eventId: position.eventId,
      marketType: position.marketType,
      stakeCredits: position.stakeCredits,
      americanOdds: position.americanOdds,
    })),
    draftPositions,
    eligibleOpportunities: [...eligibleByMarket.values()],
    ruleset: simulationSeason1Ruleset,
  });
  const draftCredits = drafts.reduce(
    (total, draft) =>
      total + (Number.isFinite(draft.stakeCredits) ? draft.stakeCredits : 0),
    0,
  );
  const totalCredits = ownerCard.allocatedCredits + draftCredits;
  const remainingCredits = 1_000 - totalCredits;

  function selectOutcome(event: SlateEvent, market: SlateMarket) {
    const key = `${event.id}:${market.marketType}`;
    setDrafts((current) => {
      const existing = current.find((draft) => selectionKey(draft) === key);
      const replacement: DraftSelection = {
        eventId: event.id,
        marketSnapshotId: market.id,
        marketType: market.marketType,
        payloadHash: market.payloadHash,
        stakeCredits:
          existing?.stakeCredits ?? Math.min(250, market.maximumStakeCredits),
      };
      return existing
        ? current.map((draft) =>
            selectionKey(draft) === key ? replacement : draft,
          )
        : [...current, replacement];
    });
    setReviewing(false);
  }

  function updateStake(key: string, stakeCredits: number) {
    setDrafts((current) =>
      current.map((draft) =>
        selectionKey(draft) === key ? { ...draft, stakeCredits } : draft,
      ),
    );
    setReviewing(false);
  }

  function removeDraft(key: string) {
    setDrafts((current) =>
      current.filter((draft) => selectionKey(draft) !== key),
    );
    setReviewing(false);
  }

  if (ownerCard.remainingCredits === 0) {
    return (
      <section className="border-positive/30 bg-positive/5 mt-7 rounded-xl border p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
              Card sealed
            </p>
            <h2 className="mt-2 text-xl font-bold">
              All 1,000 credits were accepted
            </h2>
            <p className="text-graphite mt-2 text-sm">
              Every position now has an immutable receipt. Open My Card to
              review the accepted terms.
            </p>
          </div>
          <StatusBadge tone="sealed">Immutable</StatusBadge>
        </div>
      </section>
    );
  }

  if (reviewing) {
    return (
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="border-registry bg-surface rounded-xl border p-6 shadow-[var(--shadow-card)]">
          <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
            Final review
          </p>
          <h2 className="mt-2 text-2xl font-bold">Review your complete card</h2>
          <p className="text-graphite mt-3 leading-7">
            These drafts are still editable and unaccepted. The final button
            rechecks every quote and seals all positions in one database
            transaction.
          </p>
          <div className="divide-boundary mt-6 divide-y">
            {drafts.map((draft, index) => {
              const selected = snapshots.get(draft.marketSnapshotId);
              if (!selected) return null;
              return (
                <article
                  className="py-4 first:pt-0 last:pb-0"
                  key={draft.marketSnapshotId}
                >
                  <p className="text-muted text-xs">
                    Draft {String(index + 1).padStart(2, "0")} ·{" "}
                    {selected.market.marketType}
                  </p>
                  <div className="mt-1 flex justify-between gap-4 text-sm">
                    <span className="font-semibold">
                      {selected.market.proposition}
                    </span>
                    <span className="shrink-0 font-mono">
                      {draft.stakeCredits} @{" "}
                      {formatOdds(selected.market.americanOdds)}
                    </span>
                  </div>
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
            <p className="mt-2 font-mono text-3xl font-bold">1,000 / 1,000</p>
            <p className="text-graphite mt-2 text-sm">
              {ownerCard.positions.length + drafts.length} total positions ·{" "}
              {drafts.length} accepted in this transaction
            </p>
          </section>
          <form action={action}>
            <input name="leagueSlug" type="hidden" value={state.league.slug} />
            <input
              name="positions"
              type="hidden"
              value={JSON.stringify(
                drafts.map(
                  ({ marketSnapshotId, payloadHash, stakeCredits }) => ({
                    marketSnapshotId,
                    payloadHash,
                    stakeCredits,
                  }),
                ),
              )}
            />
            <button
              className="bg-registry hover:bg-registry-hover min-h-12 w-full rounded-lg px-5 font-semibold text-white disabled:opacity-50"
              disabled={pending}
              type="submit"
            >
              {pending ? "Sealing entire card…" : "Confirm & seal entire card"}
            </button>
            <ActionFeedback state={actionState} />
          </form>
          <button
            className="border-registry text-registry hover:bg-subtle min-h-11 w-full rounded-lg border px-5 text-sm font-semibold"
            disabled={pending}
            onClick={() => setReviewing(false)}
            type="button"
          >
            Back to edit
          </button>
        </aside>
      </div>
    );
  }

  return (
    <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <section className="border-boundary bg-surface rounded-xl border p-5">
          <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
            Draft card
          </p>
          <p className="mt-2 font-mono text-2xl font-bold">
            {totalCredits.toLocaleString()} / 1,000
          </p>
          <p className="text-graphite mt-2 text-sm leading-6">
            Select one side per market. Nothing is accepted until you review and
            seal the complete card.
          </p>
        </section>

        {state.slate.map((event) => (
          <section
            aria-labelledby={`card-builder-event-${event.id}`}
            className="border-boundary bg-surface rounded-xl border p-5"
            key={event.id}
          >
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
              <h2
                className="text-lg font-bold"
                id={`card-builder-event-${event.id}`}
              >
                {event.awayTeam} at {event.homeTeam}
              </h2>
              <p className="text-muted text-sm">
                {formatDate(event.scheduledStartAt)}
              </p>
            </div>
            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              {marketTypes.map((marketType) => {
                const outcomes = event.markets.filter(
                  (market) => market.marketType === marketType,
                );
                if (outcomes.length === 0) return null;
                const key = `${event.id}:${marketType}`;
                const selectedDraft = drafts.find(
                  (draft) => selectionKey(draft) === key,
                );
                return (
                  <article
                    className={`rounded-lg border p-4 ${
                      selectedDraft
                        ? "border-registry bg-registry/5"
                        : "border-boundary bg-subtle"
                    }`}
                    key={marketType}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-muted text-xs font-bold tracking-[0.08em] uppercase">
                        {marketLabels[marketType]}
                      </p>
                      {selectedDraft ? (
                        <StatusBadge tone="positive">In card</StatusBadge>
                      ) : null}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {outcomes.map((market) => {
                        const isSelected =
                          selectedDraft?.marketSnapshotId === market.id;
                        return (
                          <button
                            aria-pressed={isSelected}
                            className={`min-h-16 rounded-lg border px-3 py-2 text-left transition-colors ${
                              isSelected
                                ? "border-registry bg-surface text-registry"
                                : "border-control bg-surface hover:border-registry"
                            }`}
                            disabled={market.qualityStatus !== "HEALTHY"}
                            key={market.id}
                            onClick={() => selectOutcome(event, market)}
                            type="button"
                          >
                            <span className="block text-sm font-semibold">
                              {market.proposition}
                            </span>
                            <span className="mt-1 block font-mono text-xs">
                              {formatOdds(market.americanOdds)}
                            </span>
                          </button>
                        );
                      })}
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
            Card Builder
          </p>
          {ownerCard.positions.length > 0 ? (
            <p className="text-muted mt-2 text-xs">
              {ownerCard.allocatedCredits} credits are already sealed and cannot
              be edited.
            </p>
          ) : null}
          {drafts.length === 0 ? (
            <p className="text-muted mt-4 text-sm">
              Choose a market outcome to add the first draft.
            </p>
          ) : (
            <div className="divide-boundary mt-4 divide-y">
              {drafts.map((draft, index) => {
                const selected = snapshots.get(draft.marketSnapshotId);
                if (!selected) return null;
                const key = selectionKey(draft);
                return (
                  <article className="py-4 first:pt-0 last:pb-0" key={key}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-muted text-xs">
                          Draft {String(index + 1).padStart(2, "0")}
                        </p>
                        <p className="mt-1 text-sm font-semibold">
                          {selected.market.proposition}
                        </p>
                        <p className="text-muted mt-1 font-mono text-xs">
                          {formatOdds(selected.market.americanOdds)} · cap{" "}
                          {selected.market.maximumStakeCredits}
                        </p>
                      </div>
                      <button
                        className="text-action min-h-11 px-2 text-xs font-semibold hover:underline"
                        onClick={() => removeDraft(key)}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                    <label
                      className="mt-3 block text-xs font-semibold"
                      htmlFor={`card-builder-stake-${draft.marketSnapshotId}`}
                    >
                      Credits at risk
                    </label>
                    <input
                      className="border-control bg-surface focus:border-registry mt-2 min-h-11 w-full rounded-lg border px-3 font-mono outline-none"
                      id={`card-builder-stake-${draft.marketSnapshotId}`}
                      inputMode="numeric"
                      max={selected.market.maximumStakeCredits}
                      min={50}
                      onChange={(event) =>
                        updateStake(key, event.currentTarget.valueAsNumber)
                      }
                      step={1}
                      type="number"
                      value={
                        Number.isNaN(draft.stakeCredits)
                          ? ""
                          : draft.stakeCredits
                      }
                    />
                  </article>
                );
              })}
            </div>
          )}
          <p className="border-boundary text-graphite mt-4 border-t pt-4 text-sm font-semibold">
            {totalCredits.toLocaleString()} allocated ·{" "}
            {remainingCredits >= 0
              ? `${remainingCredits.toLocaleString()} remaining`
              : `${Math.abs(remainingCredits).toLocaleString()} over`}
          </p>
        </section>

        {!draftValidation.accepted &&
        draftValidation.code !== "INCOMPLETE_CARD" &&
        draftValidation.code !== "EMPTY_DRAFT" ? (
          <p
            className="border-negative text-negative border-l-2 pl-3 text-sm font-semibold"
            role="alert"
          >
            {draftValidation.message}
          </p>
        ) : null}

        <button
          className="bg-registry hover:bg-registry-hover min-h-12 w-full rounded-lg px-5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!draftValidation.accepted}
          onClick={() => setReviewing(true)}
          type="button"
        >
          {draftValidation.accepted
            ? `Review & seal ${drafts.length} positions`
            : remainingCredits > 0
              ? `Allocate ${remainingCredits} more to review`
              : remainingCredits < 0
                ? `Reduce by ${Math.abs(remainingCredits)} to review`
                : "Resolve card issues to review"}
        </button>
      </aside>
    </div>
  );
}
