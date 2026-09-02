"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useRef,
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
import {
  formatAmericanOdds,
  marketOptionCopy,
} from "@/components/card/market-option-copy";
import { CardTray } from "@/components/card/card-tray";
import {
  OutcomeSelector,
  type OutcomeSelectorOption,
} from "@/components/card/outcome-selector";
import { PositionEditorSheet } from "@/components/card/position-editor-sheet";
import { ActionFeedback } from "@/components/forms/action-feedback";
import { StatusBadge } from "@/components/ui/status-badge";
import { validateDraftCard } from "@/domain/cards/validate-card-draft";
import {
  maximumStakeForOdds,
  validateProposedPosition,
} from "@/domain/cards/validate-position";
import { formatCredits } from "@/domain/odds/american";
import { pocSeason1Ruleset } from "@/rulesets/poc-season-1";

type SlateEvent = Stage1StateDto["slate"][number];
type SlateMarket = SlateEvent["markets"][number];

type DraftSelection = RestoredCardDraft;

type EditorState = {
  eventId: string;
  existing: boolean;
  marketSnapshotId: string;
  marketType: SlateMarket["marketType"];
  stakeCredits: string;
};

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
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [cardFeedback, setCardFeedback] = useState<string | null>(null);
  const cardFeedbackRef = useRef<HTMLParagraphElement>(null);
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
        maximumStakeForOdds(market.americanOdds, pocSeason1Ruleset) >
          maximumStakeForOdds(current.americanOdds, pocSeason1Ruleset)
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
    ruleset: pocSeason1Ruleset,
  });
  const draftCredits = drafts.reduce(
    (total, draft) =>
      total + (Number.isFinite(draft.stakeCredits) ? draft.stakeCredits : 0),
    0,
  );
  const totalCredits = ownerCard.allocatedCredits + draftCredits;
  const remainingCredits =
    pocSeason1Ruleset.card.weeklyAllocationCredits - totalCredits;

  function openEditor(
    event: SlateEvent,
    market: SlateMarket,
    existing: DraftSelection | undefined,
  ) {
    const maximumStakeCredits = maximumStakeForOdds(
      market.americanOdds,
      pocSeason1Ruleset,
    );
    setEditor({
      eventId: event.id,
      existing: Boolean(existing),
      marketSnapshotId: market.id,
      marketType: market.marketType,
      stakeCredits: String(
        existing?.stakeCredits ?? Math.min(250, maximumStakeCredits),
      ),
    });
    setEditorError(null);
    setCardFeedback(null);
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
  }

  function reviewCard() {
    if (!draftValidation.accepted) {
      setCardFeedback(draftValidation.message);
      requestAnimationFrame(() => cardFeedbackRef.current?.focus());
      return;
    }
    setCardFeedback(null);
    setReviewing(true);
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
  const editorEvent = editor
    ? state.slate.find((event) => event.id === editor.eventId)
    : undefined;
  const editorMarket = editor
    ? snapshots.get(editor.marketSnapshotId)?.market
    : undefined;
  const editorKey = editor
    ? `${editor.eventId}:${editor.marketType}`
    : undefined;
  const editorOtherDrafts = editorKey
    ? drafts.filter((draft) => selectionKey(draft) !== editorKey)
    : drafts;
  const editorAcceptedPositions = [
    ...ownerCard.positions.map((position) => ({
      eventId: position.eventId,
      marketType: position.marketType,
      stakeCredits: position.stakeCredits,
      americanOdds: position.americanOdds,
    })),
    ...editorOtherDrafts.flatMap((draft) => {
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
    }),
  ];
  const editorAvailableCredits =
    pocSeason1Ruleset.card.weeklyAllocationCredits -
    editorAcceptedPositions.reduce(
      (total, position) => total + position.stakeCredits,
      0,
    );
  const editorMaximumStake =
    editorMarket?.qualityStatus === "HEALTHY"
      ? maximumStakeForOdds(editorMarket.americanOdds, pocSeason1Ruleset)
      : null;
  const editorOptions: OutcomeSelectorOption[] =
    editorEvent && editor
      ? editorEvent.markets
          .filter((market) => market.marketType === editor.marketType)
          .map((market) => {
            const copy = marketOptionCopy({
              americanOdds: market.americanOdds,
              awayTeam: editorEvent.awayTeam,
              fallbackLabel: market.proposition,
              homeTeam: editorEvent.homeTeam,
              lineMilli: market.lineMilli,
              marketType: market.marketType,
              outcomeKey: market.outcomeKey,
            });
            return {
              id: market.id,
              accessibleLabel: copy.accessibleLabel,
              primary: copy.primary,
              secondary: copy.secondary,
              unavailableReason:
                market.qualityStatus === "HEALTHY"
                  ? undefined
                  : "Current quote is unavailable",
            };
          })
      : [];

  function selectEditorOutcome(marketSnapshotId: string) {
    const market = snapshots.get(marketSnapshotId)?.market;
    if (!market || market.qualityStatus !== "HEALTHY") return;
    const maximumStakeCredits = maximumStakeForOdds(
      market.americanOdds,
      pocSeason1Ruleset,
    );
    setEditor((current) => {
      if (!current) return current;
      const currentStake = Number(current.stakeCredits);
      return {
        ...current,
        marketSnapshotId,
        stakeCredits: String(
          Number.isInteger(currentStake)
            ? Math.min(currentStake, maximumStakeCredits)
            : Math.min(250, maximumStakeCredits),
        ),
      };
    });
    setEditorError(null);
  }

  function saveEditor() {
    if (!editor || !editorEvent || !editorMarket) return;
    if (editorMarket.qualityStatus !== "HEALTHY") {
      setEditorError("Choose an available outcome before saving this pick.");
      return;
    }
    const stakeCredits = Number(editor.stakeCredits);
    const validation = validateProposedPosition({
      acceptedPositions: editorAcceptedPositions,
      proposedPosition: {
        eventId: editorEvent.id,
        marketType: editorMarket.marketType,
        stakeCredits,
        americanOdds: editorMarket.americanOdds,
      },
      eligibleOpportunities: [...eligibleByMarket.values()],
      ruleset: pocSeason1Ruleset,
    });
    if (!validation.accepted) {
      setEditorError(validation.message);
      return;
    }

    const replacement: DraftSelection = {
      americanOdds: editorMarket.americanOdds,
      eventId: editorEvent.id,
      marketSnapshotId: editorMarket.id,
      marketType: editorMarket.marketType,
      outcomeKey: editorMarket.outcomeKey,
      payloadHash: editorMarket.payloadHash,
      proposition: editorMarket.proposition,
      quoteReviewRequired: false,
      reviewedAmericanOdds: editorMarket.americanOdds,
      reviewedPayloadHash: editorMarket.payloadHash,
      reviewedProposition: editorMarket.proposition,
      stakeCredits,
    };
    setDrafts((current) => {
      const existing = current.some(
        (draft) => selectionKey(draft) === editorKey,
      );
      return existing
        ? current.map((draft) =>
            selectionKey(draft) === editorKey ? replacement : draft,
          )
        : [...current, replacement];
    });
    setEditor(null);
    setEditorError(null);
    setCardFeedback(null);
    setReviewing(false);
  }

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
              All 1,000 credits are sealed
            </h2>
            <p className="text-graphite mt-2 text-sm">
              Your card is ready. Open My Card to review the accepted terms and
              receipt for every pick.
            </p>
            <Link
              className="text-action mt-3 inline-flex min-h-11 items-center text-sm font-semibold hover:underline"
              href={`/l/${state.league.slug}/card`}
            >
              Open accepted card and receipts
            </Link>
          </div>
          <StatusBadge tone="sealed">Ready</StatusBadge>
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
            These picks are still editable. One successful confirmation accepts
            every pick together, seals the complete card, and creates its
            receipts.
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
                    Pick {String(index + 1).padStart(2, "0")} ·{" "}
                    {selected.market.marketType}
                  </p>
                  <div className="mt-1 flex justify-between gap-4 text-sm">
                    <span className="font-semibold">
                      {draft.reviewedProposition}
                    </span>
                    <span className="shrink-0 font-mono">
                      {formatCredits(draft.stakeCredits)} @{" "}
                      {formatAmericanOdds(draft.reviewedAmericanOdds)}
                    </span>
                  </div>
                  {draft.quoteReviewRequired ? (
                    <div className="border-pending/40 bg-pending/10 mt-3 rounded-lg border p-3 text-sm leading-5">
                      <p className="font-semibold">Updated quote</p>
                      <p className="text-graphite mt-1">
                        Reviewed: {draft.reviewedProposition}{" "}
                        {formatAmericanOdds(draft.reviewedAmericanOdds)} →
                        Current: {selected.market.proposition}{" "}
                        {formatAmericanOdds(selected.market.americanOdds)}
                      </p>
                      {selected.market.qualityStatus === "HEALTHY" ? (
                        <button
                          className="text-action mt-2 min-h-11 font-semibold hover:underline"
                          onClick={() =>
                            reviewUpdatedQuote(selectionKey(draft))
                          }
                          type="button"
                        >
                          Use updated odds
                        </button>
                      ) : (
                        <p className="text-pending mt-2 font-semibold">
                          This quote is unavailable. Return to editing and
                          choose another outcome.
                        </p>
                      )}
                    </div>
                  ) : null}
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
              {formatCredits(pocSeason1Ruleset.card.weeklyAllocationCredits)} /{" "}
              {formatCredits(pocSeason1Ruleset.card.weeklyAllocationCredits)}
            </p>
            <p className="text-graphite mt-2 text-sm">
              {ownerCard.positions.length + drafts.length} total picks
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
                ? "Sealing card…"
                : quoteReviewCount > 0
                  ? "Review changed quotes first"
                  : "Confirm and seal card"}
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
    <>
      <div className="mt-7 grid gap-6 pb-28 xl:grid-cols-[minmax(0,1fr)_360px] xl:pb-0">
        <div className="space-y-6">
          <section className="border-boundary bg-surface rounded-xl border p-5">
            <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
              Card progress
            </p>
            <p className="mt-2 font-mono text-2xl font-bold">
              {formatCredits(totalCredits)} /{" "}
              {formatCredits(pocSeason1Ruleset.card.weeklyAllocationCredits)}
            </p>
            <p className="text-graphite mt-2 text-sm leading-6">
              Select one side per market. Your unfinished picks are saved on
              this device until you confirm the complete card.
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
                          market.observedAt > latest
                            ? market.observedAt
                            : latest,
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
                      <OutcomeSelector
                        label={`${event.awayTeam} at ${event.homeTeam} ${marketLabels[marketType]} outcomes`}
                        onSelect={(marketSnapshotId) => {
                          const market = outcomes.find(
                            (candidate) => candidate.id === marketSnapshotId,
                          );
                          if (market) openEditor(event, market, selectedDraft);
                        }}
                        options={outcomes.map((market) => {
                          const copy = marketOptionCopy({
                            americanOdds: market.americanOdds,
                            awayTeam: event.awayTeam,
                            fallbackLabel: market.proposition,
                            homeTeam: event.homeTeam,
                            lineMilli: market.lineMilli,
                            marketType: market.marketType,
                            outcomeKey: market.outcomeKey,
                          });
                          return {
                            id: market.id,
                            accessibleLabel: copy.accessibleLabel,
                            primary: copy.primary,
                            secondary: copy.secondary,
                            unavailableReason:
                              market.qualityStatus === "HEALTHY"
                                ? undefined
                                : "Current quote is unavailable",
                          } satisfies OutcomeSelectorOption;
                        })}
                        selectedId={selectedDraft?.marketSnapshotId ?? null}
                      />
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
              Your picks
            </p>
            {ownerCard.positions.length > 0 ? (
              <p className="text-muted mt-2 text-xs">
                {formatCredits(ownerCard.allocatedCredits)} credits are already
                sealed and can’t be changed.
              </p>
            ) : null}
            {drafts.length === 0 ? (
              <p className="text-muted mt-4 text-sm">
                Choose a side from the slate to add your first pick.
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
                            Pick {String(index + 1).padStart(2, "0")}
                          </p>
                          <p className="mt-1 text-sm font-semibold">
                            {selected.market.proposition}
                          </p>
                          <p className="text-muted mt-1 font-mono text-xs">
                            {formatAmericanOdds(selected.market.americanOdds)} ·
                            cap{" "}
                            {formatCredits(selected.market.maximumStakeCredits)}
                          </p>
                          {draft.quoteReviewRequired ? (
                            <div className="border-pending/40 bg-pending/10 mt-3 rounded-lg border p-3 text-xs leading-5">
                              <p className="font-semibold">Updated quote</p>
                              <p className="text-graphite mt-1">
                                {draft.reviewedProposition}{" "}
                                {formatAmericanOdds(draft.reviewedAmericanOdds)}{" "}
                                → {selected.market.proposition}{" "}
                                {formatAmericanOdds(
                                  selected.market.americanOdds,
                                )}
                              </p>
                              <p className="text-pending mt-2 font-semibold">
                                Review the complete card to reconcile current
                                terms.
                              </p>
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
                      <button
                        className="border-control text-action hover:border-registry mt-3 min-h-11 w-full rounded-lg border px-3 text-sm font-semibold"
                        onClick={() =>
                          openEditor(selected.event, selected.market, draft)
                        }
                        type="button"
                      >
                        Edit pick
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
            <p className="border-boundary text-graphite mt-4 border-t pt-4 text-sm font-semibold">
              {formatCredits(totalCredits)} used ·{" "}
              {remainingCredits >= 0
                ? `${formatCredits(remainingCredits)} left`
                : `${formatCredits(Math.abs(remainingCredits))} over`}
            </p>
          </section>

          {cardFeedback ? (
            <p
              className="border-negative text-negative border-l-2 pl-3 text-sm font-semibold"
              ref={cardFeedbackRef}
              role="alert"
              tabIndex={-1}
            >
              {cardFeedback}
            </p>
          ) : null}

          <button
            className="bg-registry hover:bg-registry-hover min-h-12 w-full rounded-lg px-5 font-semibold text-white"
            onClick={reviewCard}
            type="button"
          >
            {draftValidation.accepted
              ? quoteReviewCount > 0
                ? `Review ${quoteReviewCount} updated quote${quoteReviewCount === 1 ? "" : "s"}`
                : `Review ${drafts.length} picks`
              : remainingCredits > 0
                ? `Use ${formatCredits(remainingCredits)} more to review`
                : remainingCredits < 0
                  ? `Reduce by ${formatCredits(Math.abs(remainingCredits))} to review`
                  : "Resolve card issues to review"}
          </button>
        </aside>
      </div>
      <CardTray
        aboveMobileNavigation
        allocatedCredits={totalCredits}
        onReview={reviewCard}
        pickCount={drafts.length}
        remainingCredits={remainingCredits}
      />
      <PositionEditorSheet
        confirmLabel={editor?.existing ? "Update pick" : "Add to card"}
        context={
          editorEvent
            ? `${editorEvent.awayTeam} at ${editorEvent.homeTeam} · ${formatDate(editorEvent.scheduledStartAt)}`
            : "Weekly slate"
        }
        error={editorError}
        helper={
          editorMaximumStake === null
            ? "Choose an outcome to see its current limit."
            : `This pick may use up to ${formatCredits(editorMaximumStake)} credits under the current Ruleset.`
        }
        maximumStakeCredits={editorMaximumStake}
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
        selectedOutcomeId={
          editorMarket?.qualityStatus === "HEALTHY"
            ? (editor?.marketSnapshotId ?? null)
            : null
        }
        stakeCredits={editor?.stakeCredits ?? ""}
        title={editor ? marketLabels[editor.marketType] : "Pick"}
      />
    </>
  );
}
