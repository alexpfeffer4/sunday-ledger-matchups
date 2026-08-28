"use client";

import {
  useActionState,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { acceptStage1CardAction } from "@/app/l/[leagueSlug]/actions";
import { initialAppActionState } from "@/application/actions/action-state";
import type { Stage1StateDto } from "@/application/queries/stage1-dtos";
import {
  restoreCardDrafts,
  type RestoredCardDraft,
  type StoredCardDraft,
} from "@/components/card/card-draft-storage";
import { ActionFeedback } from "@/components/forms/action-feedback";
import { StatusBadge } from "@/components/ui/status-badge";
import { validateDraftCard } from "@/domain/cards/validate-card-draft";
import { maximumStakeForOdds } from "@/domain/cards/validate-position";
import { simulationSeason1Ruleset } from "@/rulesets/simulation-season-1";

type SlateEvent = Stage1StateDto["slate"][number];
type SlateMarket = SlateEvent["markets"][number];

type DraftSelection = RestoredCardDraft;

const marketLabels = {
  MONEYLINE: "Winner",
  SPREAD: "Spread",
  TOTAL: "Total",
} as const;

const marketTypes = ["MONEYLINE", "SPREAD", "TOTAL"] as const;

type KickoffFilter = "ALL" | "SUN_EARLY" | "SUN_LATE" | "SUN_NIGHT" | "MON";

const kickoffFilterLabels: Record<KickoffFilter, string> = {
  ALL: "All games",
  MON: "Monday",
  SUN_EARLY: "Sun early",
  SUN_LATE: "Sun late",
  SUN_NIGHT: "Sun night",
};

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

function formatObservedAt(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function kickoffWindow(value: string): Exclude<KickoffFilter, "ALL"> | "OTHER" {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date(value));
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  if (weekday === "Mon") return "MON";
  if (weekday !== "Sun" || !Number.isFinite(hour)) return "OTHER";
  if (hour < 16) return "SUN_EARLY";
  if (hour < 20) return "SUN_LATE";
  return "SUN_NIGHT";
}

function selectionKey(
  selection: Pick<DraftSelection, "eventId" | "marketType">,
) {
  return `${selection.eventId}:${selection.marketType}`;
}

function subscribeToHydration() {
  return () => undefined;
}

export function Stage1CardBuilder({ state }: { state: Stage1StateDto }) {
  const ownerCard = state.ownerCard;
  const draftStorageKey =
    ownerCard && state.week
      ? `sunday-ledger:card-draft:v1:${state.league.id}:${state.week.id}:${ownerCard.id}`
      : null;
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const [drafts, setDrafts] = useState<DraftSelection[]>(() => {
    if (typeof window === "undefined" || !draftStorageKey) return [];
    try {
      return restoreCardDrafts(
        localStorage.getItem(draftStorageKey),
        state.slate,
      );
    } catch {
      return [];
    }
  });
  const [kickoffFilter, setKickoffFilter] = useState<KickoffFilter>("ALL");
  const [reviewing, setReviewing] = useState(false);
  const [actionState, action, pending] = useActionState(
    acceptStage1CardAction,
    initialAppActionState,
  );
  useEffect(() => {
    if (!draftStorageKey || !hydrated) return;
    try {
      if (
        ownerCard?.remainingCredits === 0 ||
        actionState.status === "success" ||
        drafts.length === 0
      ) {
        localStorage.removeItem(draftStorageKey);
        return;
      }

      const stored: StoredCardDraft = {
        version: 1,
        drafts: drafts.map((draft) => ({
          eventId: draft.eventId,
          marketType: draft.marketType,
          outcomeKey: draft.outcomeKey,
          reviewedAmericanOdds: draft.reviewedAmericanOdds,
          reviewedPayloadHash: draft.reviewedPayloadHash,
          reviewedProposition: draft.reviewedProposition,
          stakeCredits: draft.stakeCredits,
        })),
      };
      localStorage.setItem(draftStorageKey, JSON.stringify(stored));
    } catch {
      // Card entry remains usable when browser storage is unavailable.
    }
  }, [
    actionState.status,
    draftStorageKey,
    drafts,
    hydrated,
    ownerCard?.remainingCredits,
  ]);

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
        americanOdds: market.americanOdds,
        eventId: event.id,
        marketSnapshotId: market.id,
        marketType: market.marketType,
        outcomeKey: market.outcomeKey,
        payloadHash: market.payloadHash,
        proposition: market.proposition,
        quoteReviewRequired: false,
        reviewedAmericanOdds: market.americanOdds,
        reviewedPayloadHash: market.payloadHash,
        reviewedProposition: market.proposition,
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

  function reviewUpdatedQuote(key: string) {
    setDrafts((current) =>
      current.map((draft) => {
        if (selectionKey(draft) !== key) return draft;
        const selected = snapshots.get(draft.marketSnapshotId);
        if (!selected || selected.market.qualityStatus !== "HEALTHY") {
          return draft;
        }
        return {
          ...draft,
          quoteReviewRequired: false,
          reviewedAmericanOdds: selected.market.americanOdds,
          reviewedPayloadHash: selected.market.payloadHash,
          reviewedProposition: selected.market.proposition,
          stakeCredits: Math.min(
            draft.stakeCredits,
            selected.market.maximumStakeCredits,
          ),
        };
      }),
    );
    setReviewing(false);
  }

  const availableFilters = (
    ["ALL", "SUN_EARLY", "SUN_LATE", "SUN_NIGHT", "MON"] as const
  ).filter(
    (filter) =>
      filter === "ALL" ||
      state.slate.some(
        (event) => kickoffWindow(event.scheduledStartAt) === filter,
      ),
  );
  const visibleEvents = state.slate.filter(
    (event) =>
      kickoffFilter === "ALL" ||
      kickoffWindow(event.scheduledStartAt) === kickoffFilter,
  );
  const quoteReviewCount = drafts.filter(
    (draft) => draft.quoteReviewRequired,
  ).length;

  if (!hydrated) {
    return (
      <section className="border-boundary bg-surface mt-7 rounded-xl border p-5">
        <p className="font-semibold">Restoring your saved card…</p>
      </section>
    );
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
            These picks are still editable. Confirming accepts the current terms
            and locks every position together.
          </p>
          {quoteReviewCount > 0 ? (
            <p
              className="border-pending/40 bg-pending/10 text-graphite mt-4 rounded-lg border p-3 text-sm font-semibold"
              role="alert"
            >
              Review {quoteReviewCount} changed quote
              {quoteReviewCount === 1 ? "" : "s"} before confirming.
            </p>
          ) : null}
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
              disabled={pending || quoteReviewCount > 0}
              type="submit"
            >
              {pending
                ? "Locking card…"
                : quoteReviewCount > 0
                  ? "Review changed quotes first"
                  : "Confirm & lock entire card"}
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
            Select one side per market. Your unfinished picks are saved on this
            device until you confirm the complete card.
          </p>
          <dl className="border-boundary mt-4 grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Card deadline</dt>
              <dd className="mt-1 font-semibold">
                {formatDate(state.week.commonLockAt)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">If incomplete at lock</dt>
              <dd className="mt-1 font-semibold">Automatic matchup loss</dd>
            </div>
          </dl>
        </section>

        <nav
          aria-label="Filter games by kickoff"
          className="flex flex-wrap gap-2"
        >
          {availableFilters.map((filter) => (
            <button
              aria-pressed={kickoffFilter === filter}
              className={`min-h-10 rounded-full border px-4 text-sm font-semibold transition-colors ${
                kickoffFilter === filter
                  ? "border-registry bg-registry text-white"
                  : "border-control bg-surface hover:border-registry"
              }`}
              key={filter}
              onClick={() => setKickoffFilter(filter)}
              type="button"
            >
              {kickoffFilterLabels[filter]}
            </button>
          ))}
        </nav>

        {visibleEvents.map((event) => (
          <section
            aria-labelledby={`card-builder-event-${event.id}`}
            className="border-boundary bg-surface rounded-xl border p-5"
            key={event.id}
          >
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
              <h2
                className="text-lg font-bold"
                id={`card-builder-event-${event.id}`}
              >
                {event.awayTeam} at {event.homeTeam}
              </h2>
              <div className="text-muted text-sm sm:text-right">
                <p>{formatDate(event.scheduledStartAt)}</p>
                <p className="mt-1 text-xs">
                  Odds updated{" "}
                  {formatObservedAt(
                    event.markets.reduce(
                      (latest, market) =>
                        market.observedAt > latest ? market.observedAt : latest,
                      event.markets[0]?.observedAt ?? event.scheduledStartAt,
                    ),
                  )}
                </p>
              </div>
            </div>
            <div className="divide-boundary border-boundary mt-4 divide-y border-y">
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
                    className={`grid gap-3 py-4 sm:grid-cols-[110px_minmax(0,1fr)] sm:items-center ${
                      selectedDraft ? "bg-registry/5" : ""
                    }`}
                    key={marketType}
                  >
                    <div className="flex items-center justify-between gap-3 sm:block">
                      <p className="text-muted text-xs font-bold tracking-[0.08em] uppercase">
                        {marketLabels[marketType]}
                      </p>
                      {selectedDraft ? (
                        <span className="text-positive mt-1 block text-xs font-semibold">
                          In card
                        </span>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {outcomes.map((market) => {
                        const isSelected =
                          selectedDraft?.outcomeKey === market.outcomeKey;
                        return (
                          <button
                            aria-pressed={isSelected}
                            className={`relative min-h-20 rounded-lg border py-3 pr-10 pl-3 text-left transition-colors ${
                              isSelected
                                ? "border-registry bg-registry text-white shadow-sm"
                                : "border-control bg-surface hover:border-registry hover:bg-registry/5"
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
                        {draft.quoteReviewRequired ? (
                          <div className="border-pending/40 bg-pending/10 mt-3 rounded-lg border p-3 text-xs leading-5">
                            <p className="font-semibold">Odds changed</p>
                            <p className="text-graphite mt-1">
                              {draft.reviewedProposition}{" "}
                              {formatOdds(draft.reviewedAmericanOdds)} →{" "}
                              {selected.market.proposition}{" "}
                              {formatOdds(selected.market.americanOdds)}
                            </p>
                            {selected.market.qualityStatus === "HEALTHY" ? (
                              <button
                                className="text-action mt-2 min-h-10 font-semibold hover:underline"
                                onClick={() => reviewUpdatedQuote(key)}
                                type="button"
                              >
                                Review and accept updated quote
                              </button>
                            ) : (
                              <p className="text-pending mt-2 font-semibold">
                                This quote is temporarily unavailable. Choose a
                                different side or check again later.
                              </p>
                            )}
                          </div>
                        ) : null}
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
          disabled={!draftValidation.accepted || quoteReviewCount > 0}
          onClick={() => setReviewing(true)}
          type="button"
        >
          {quoteReviewCount > 0
            ? `Review ${quoteReviewCount} changed quote${quoteReviewCount === 1 ? "" : "s"}`
            : draftValidation.accepted
              ? `Review & lock ${drafts.length} positions`
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
