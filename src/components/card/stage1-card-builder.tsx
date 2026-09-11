"use client";

import Link from "next/link";
import { reviewLiveCardQuotes } from "@/app/l/[leagueSlug]/card-quote-actions";
import type { CardQuoteReviewResult } from "@/application/providers/card-quote-review";
import { useActionState, useEffect, useRef, useState } from "react";
import { acceptStage1CardAction } from "@/app/l/[leagueSlug]/actions";
import { initialAppActionState } from "@/application/actions/action-state";
import type { Stage1StateDto } from "@/application/queries/stage1-dtos";
import {
  restoreCardDrafts,
  type RestoredCardDraft,
} from "@/components/card/card-draft-storage";
import {
  formatAmericanOdds,
  formatMarketProposition,
  marketOptionCopy,
} from "@/components/card/market-option-copy";
import {
  cardDraftStorageKey,
  ownerCardContext,
} from "@/components/card/owner-card-context";
import {
  useCardDeadline,
  useCardDraft,
} from "@/components/card/use-card-draft";
import { OwnerCardProgress } from "@/components/card/owner-card-progress";
import { PickReturn, ReturnExplanation } from "@/components/card/pick-return";
import { easternTime } from "@/application/queries/score-freshness";
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
import { resolveSeasonCardRules, type CardRules } from "@/rulesets/card-rules";

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

const formatDate = easternTime;

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

function cardBuilderContextKey(state: Stage1StateDto): string {
  const slateRevision = state.slate.flatMap((event) =>
    event.markets.map((market) => [
      market.id,
      market.payloadHash,
      market.qualityStatus,
    ]),
  );

  return JSON.stringify([
    state.league.id,
    state.week?.id ?? null,
    state.ownerCard?.id ?? null,
    state.ownerCard?.compliance,
    state.ownerCard?.allocatedCredits,
    state.week?.state,
    state.season?.rulesetSnapshot,
    slateRevision,
  ]);
}

export function Stage1CardBuilder({
  state,
  initialReview = false,
}: {
  state: Stage1StateDto;
  initialReview?: boolean;
}) {
  const resolved = resolveSeasonCardRules(
    state.season?.rulesetSnapshot,
    state.league.mode,
  );
  if (!resolved.supported)
    return (
      <div role="alert" className="border-border rounded-lg border p-5">
        <p>{resolved.message}</p>
        <Link href={`/l/${state.league.slug}/card`} className="underline">
          View your card
        </Link>
      </div>
    );
  return (
    <Stage1CardBuilderEditor
      key={cardBuilderContextKey(state)}
      state={state}
      rules={resolved.rules}
      initialReview={initialReview}
    />
  );
}

function Stage1CardBuilderEditor({
  state,
  rules,
  initialReview,
}: {
  state: Stage1StateDto;
  initialReview: boolean;
  rules: CardRules;
}) {
  const ownerCard = state.ownerCard;
  const [slate, setSlate] = useState(state.slate);
  const [checkingQuotes, setCheckingQuotes] = useState(false);
  const [quoteReview, setQuoteReview] = useState<
    Extract<CardQuoteReviewResult, { status: "ready" }>["review"] | null
  >(null);
  const [reviewExpired, setReviewExpired] = useState(false);
  const [requiresLiveReview, setRequiresLiveReview] = useState(
    initialReview && state.league.mode === "LIVE",
  );
  const context = { ...ownerCardContext(state), slate };
  const { drafts, setDrafts, hydrated, saved, sealed, status, clearDrafts } =
    useCardDraft(context);
  const closed = useCardDeadline(context);
  const [kickoffFilter, setKickoffFilter] = useState<KickoffFilter>("ALL");
  const [reviewing, setReviewing] = useState(initialReview);
  const storageKey = cardDraftStorageKey(context);
  useEffect(() => {
    const changedInAnotherTab = (event: StorageEvent) => {
      if (event.key !== null && event.key !== storageKey) return;
      setReviewing(false);
      setQuoteReview(null);
    };
    window.addEventListener("storage", changedInAnotherTab);
    return () => window.removeEventListener("storage", changedInAnotherTab);
  }, [storageKey]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [cardFeedback, setCardFeedback] = useState<string | null>(null);
  const cardFeedbackRef = useRef<HTMLParagraphElement>(null);
  const [actionState, action, sealing] = useActionState(
    acceptStage1CardAction,
    initialAppActionState,
  );
  const pending = sealing || checkingQuotes;
  useEffect(() => {
    if (!quoteReview) return;
    const timer = window.setTimeout(
      () => setReviewExpired(true),
      Math.max(0, new Date(quoteReview.expiresAt).getTime() - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [quoteReview]);
  useEffect(() => {
    if (actionState.status === "success") clearDrafts();
  }, [actionState.status, clearDrafts]);
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (reviewing && hydrated) reviewHeadingRef.current?.focus();
  }, [reviewing, hydrated]);

  if (!ownerCard || !state.week) return null;

  const snapshots = new Map(
    slate.flatMap((event) =>
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
  for (const event of slate) {
    for (const market of event.markets) {
      if (market.qualityStatus !== "HEALTHY") continue;
      const key = `${event.id}:${market.marketType}`;
      const current = eligibleByMarket.get(key);
      if (
        !current ||
        maximumStakeForOdds(market.americanOdds, rules) >
          maximumStakeForOdds(current.americanOdds, rules)
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
    ruleset: rules,
  });
  const draftCredits = drafts.reduce(
    (total, draft) =>
      total + (Number.isFinite(draft.stakeCredits) ? draft.stakeCredits : 0),
    0,
  );
  const totalCredits = ownerCard.allocatedCredits + draftCredits;
  const remainingCredits = rules.card.weeklyAllocationCredits - totalCredits;

  function openEditor(
    event: SlateEvent,
    market: SlateMarket,
    existing: DraftSelection | undefined,
  ) {
    const maximumStakeCredits = maximumStakeForOdds(market.americanOdds, rules);
    setQuoteReview(null);
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
    setQuoteReview(null);
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
          stakeCredits: draft.stakeCredits,
        };
      }),
    );
  }

  async function reviewCard() {
    if (pending || closed || sealed) return;
    if (!draftValidation.accepted) {
      setCardFeedback(draftValidation.message);
      requestAnimationFrame(() => cardFeedbackRef.current?.focus());
      return;
    }
    setCardFeedback(null);
    if (state.league.mode === "LIVE") {
      setCheckingQuotes(true);
      setQuoteReview(null);
      try {
        const result = await reviewLiveCardQuotes(
          state.league.slug,
          drafts.map(({ marketSnapshotId, payloadHash, stakeCredits }) => ({
            marketSnapshotId,
            payloadHash,
            stakeCredits,
          })),
        );
        if (result.status === "error") {
          setCardFeedback(result.message);
          return;
        }
        if (result.status === "disabled") setRequiresLiveReview(false);
        if (result.status === "ready") {
          const byEvent = new Map(
            result.review.quotes.map((event) => [event.eventId, event.markets]),
          );
          const refreshedSlate = slate.map((event) => ({
            ...event,
            markets: byEvent.get(event.id) ?? event.markets,
          }));
          const restored = restoreCardDrafts(
            JSON.stringify({ version: 1, drafts }),
            refreshedSlate,
          );
          if (restored.length !== drafts.length) {
            setCardFeedback(
              "A pick is unavailable. Your draft has been kept; return to editing to review it.",
            );
            return;
          }
          setSlate(refreshedSlate);
          setDrafts(
            restored.map((draft) => ({
              ...draft,
              reviewedPayloadHash:
                draft.reviewedAmericanOdds === draft.americanOdds &&
                draft.reviewedProposition === draft.proposition
                  ? draft.payloadHash
                  : draft.reviewedPayloadHash,
              // Source timestamps may advance with unchanged terms. Only a real
              // proposition/price change needs another per-pick acknowledgment.
              quoteReviewRequired:
                draft.reviewedAmericanOdds !== draft.americanOdds ||
                draft.reviewedProposition !== draft.proposition,
            })),
          );
          setQuoteReview(result.review);
          setReviewExpired(false);
          setRequiresLiveReview(true);
        }
      } catch {
        setCardFeedback(
          "We could not check current odds. Your draft has been kept; try again shortly.",
        );
        return;
      } finally {
        setCheckingQuotes(false);
      }
    }
    setReviewing(true);
  }

  const availableFilters = (
    ["ALL", "SUN_EARLY", "SUN_LATE", "SUN_NIGHT", "MON"] as const
  ).filter(
    (filter) =>
      filter === "ALL" ||
      slate.some((event) => kickoffWindow(event.scheduledStartAt) === filter),
  );
  const visibleEvents = slate.filter(
    (event) =>
      kickoffFilter === "ALL" ||
      kickoffWindow(event.scheduledStartAt) === kickoffFilter,
  );
  const quoteReviewCount = drafts.filter(
    (draft) => draft.quoteReviewRequired,
  ).length;
  const editorEvent = editor
    ? slate.find((event) => event.id === editor.eventId)
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
    rules.card.weeklyAllocationCredits -
    editorAcceptedPositions.reduce(
      (total, position) => total + position.stakeCredits,
      0,
    );
  const editorMaximumStake =
    editorMarket?.qualityStatus === "HEALTHY"
      ? maximumStakeForOdds(editorMarket.americanOdds, rules)
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
    const maximumStakeCredits = maximumStakeForOdds(market.americanOdds, rules);
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
      ruleset: rules,
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

  if (sealed || actionState.status === "success") {
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
              Your card is sealed and every pick has a receipt. Open My Card to
              see your saved picks.
            </p>
            <Link
              className="text-action mt-3 inline-flex min-h-11 items-center text-sm font-semibold hover:underline"
              href={`/l/${state.league.slug}/card`}
            >
              View card
            </Link>
          </div>
          <StatusBadge tone="sealed">Sealed</StatusBadge>
        </div>
      </section>
    );
  }

  if (closed)
    return (
      <div className="mt-7">
        <OwnerCardProgress context={context} />
      </div>
    );

  if (reviewing && drafts.length > 0) {
    return (
      <div className="mt-7 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="border-registry bg-surface min-w-0 rounded-xl border p-4 wrap-break-word shadow-[var(--shadow-card)] sm:p-6">
          <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
            Final review
          </p>
          <h2
            className="mt-2 text-2xl font-bold outline-none"
            ref={reviewHeadingRef}
            tabIndex={-1}
          >
            Review your complete card
          </h2>
          <p className="text-graphite mt-3 leading-7">
            Check each game, selection, odds, stake, and total return. Your
            picks stay editable until you confirm.
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
                  aria-label={`Pick ${index + 1}: ${selected.event.awayTeam} at ${selected.event.homeTeam}`}
                  className="py-4 first:pt-0 last:pb-0"
                  key={draft.marketSnapshotId}
                >
                  <p className="text-graphite text-sm font-semibold">
                    Pick {String(index + 1).padStart(2, "0")} ·{" "}
                    {selected.event.awayTeam} at {selected.event.homeTeam} ·{" "}
                    {formatDate(selected.event.scheduledStartAt)}
                  </p>
                  <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
                    <span className="font-semibold">
                      {formatMarketProposition(draft.reviewedProposition)}
                    </span>
                    <span className="shrink-0 font-mono">
                      Odds {formatAmericanOdds(draft.reviewedAmericanOdds)}
                    </span>
                  </div>
                  <PickReturn
                    stakeCredits={draft.stakeCredits}
                    americanOdds={draft.reviewedAmericanOdds}
                  />
                  {draft.quoteReviewRequired ? (
                    <div className="border-pending/40 bg-pending/10 mt-3 rounded-lg border p-3 text-sm leading-5">
                      <p className="font-semibold">
                        Updated quote · {selected.event.awayTeam} at{" "}
                        {selected.event.homeTeam}
                      </p>
                      <p className="text-graphite mt-1">
                        Reviewed:{" "}
                        {formatMarketProposition(draft.reviewedProposition)}{" "}
                        {formatAmericanOdds(draft.reviewedAmericanOdds)} →
                        Current:{" "}
                        {formatMarketProposition(selected.market.proposition)}{" "}
                        {formatAmericanOdds(selected.market.americanOdds)}
                      </p>
                      <PickReturn
                        stakeCredits={draft.stakeCredits}
                        americanOdds={selected.market.americanOdds}
                      />
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
        <aside className="min-w-0 space-y-5 wrap-break-word xl:sticky xl:top-6 xl:self-start">
          <section className="border-boundary bg-subtle rounded-xl border p-5">
            <p className="text-muted text-xs font-bold tracking-[0.08em] uppercase">
              Card total
            </p>
            <p className="mt-2 font-mono text-3xl font-bold">
              {formatCredits(rules.card.weeklyAllocationCredits)} /{" "}
              {formatCredits(rules.card.weeklyAllocationCredits)}
            </p>
            <p className="text-graphite mt-2 text-sm">
              {ownerCard.positions.length + drafts.length} total picks
            </p>
          </section>
          {state.league.mode === "LIVE" ? (
            <div className="text-graphite space-y-2 text-sm" aria-live="polite">
              {quoteReview ? (
                <p>
                  Odds checked {formatObservedAt(quoteReview.fetchedAt)}.{" "}
                  {reviewExpired
                    ? "Check again before sealing."
                    : "Confirm within 30 seconds; odds are not held."}
                </p>
              ) : null}
              {requiresLiveReview ||
              cardFeedback ||
              actionState.status === "error" ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={reviewCard}
                  className="text-action min-h-11 font-semibold hover:underline"
                >
                  {checkingQuotes
                    ? "Checking current odds…"
                    : quoteReview
                      ? "Check current odds again"
                      : "Check current odds before sealing"}
                </button>
              ) : null}
            </div>
          ) : null}
          {cardFeedback ? (
            <p role="alert" className="text-negative text-sm">
              {cardFeedback}
            </p>
          ) : null}
          {!draftValidation.accepted ? (
            <p role="alert" className="text-negative text-sm">
              {draftValidation.message} Return to editing to adjust your stake.
            </p>
          ) : null}
          <ReturnExplanation />
          <p className="text-sm font-semibold">
            Seal by {formatDate(state.week.commonLockAt)}.
          </p>
          <form action={action}>
            <p className="mb-3 text-sm leading-6">
              Sealing is final: all picks are saved together with a receipt for
              each. You cannot edit or cancel them.
            </p>
            <input name="leagueSlug" type="hidden" value={state.league.slug} />
            <input
              name="reviewId"
              type="hidden"
              value={quoteReview?.reviewId ?? ""}
            />
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
              disabled={
                pending ||
                quoteReviewCount > 0 ||
                !draftValidation.accepted ||
                (requiresLiveReview && (!quoteReview || reviewExpired))
              }
              type="submit"
            >
              {checkingQuotes
                ? "Checking current odds…"
                : sealing
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
            onClick={() => {
              setReviewing(false);
              setQuoteReview(null);
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
      <div className="mt-7 grid grid-cols-1 gap-6 pb-28 xl:grid-cols-[minmax(0,1fr)_360px] xl:pb-0">
        <div className="space-y-6">
          <section className="border-boundary bg-surface rounded-xl border p-5">
            <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
              Your weekly card
            </p>
            <div className="mt-2">
              <StatusBadge tone="pending">{status}</StatusBadge>
            </div>
            <p className="mt-2 font-mono text-2xl font-bold">
              {formatCredits(totalCredits)} /{" "}
              {formatCredits(rules.card.weeklyAllocationCredits)}
            </p>
            <p className="text-graphite mt-2 text-sm leading-6">
              {drafts.length > 0
                ? saved
                  ? "Draft saved on this device."
                  : "Draft not saved on this device. Keep this page open to avoid losing it."
                : "Choose a side to start your card. Drafts stay on this device."}{" "}
              Your picks stay editable until you seal the complete card.
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

        <aside className="min-w-0 space-y-5 wrap-break-word xl:sticky xl:top-6 xl:self-start">
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
                            Pick {String(index + 1).padStart(2, "0")} ·{" "}
                            {selected.event.awayTeam} at{" "}
                            {selected.event.homeTeam}
                          </p>
                          <p className="text-muted mt-1 text-xs">
                            {formatDate(selected.event.scheduledStartAt)}
                          </p>
                          <p className="mt-1 text-sm font-semibold">
                            {formatMarketProposition(
                              selected.market.proposition,
                            )}
                          </p>
                          <p className="text-muted mt-1 font-mono text-xs">
                            {formatAmericanOdds(selected.market.americanOdds)} ·
                            cap{" "}
                            {formatCredits(selected.market.maximumStakeCredits)}
                          </p>
                          {draft.quoteReviewRequired ? (
                            <div className="border-pending/40 bg-pending/10 mt-3 rounded-lg border p-3 text-xs leading-5">
                              <p className="font-semibold">
                                Updated quote · {selected.event.awayTeam} at{" "}
                                {selected.event.homeTeam}
                              </p>
                              <p className="text-graphite mt-1">
                                {formatMarketProposition(
                                  draft.reviewedProposition,
                                )}{" "}
                                {formatAmericanOdds(draft.reviewedAmericanOdds)}{" "}
                                →{" "}
                                {formatMarketProposition(
                                  selected.market.proposition,
                                )}{" "}
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
            disabled={pending}
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
        americanOdds={editorMarket?.americanOdds ?? null}
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
        minimumStakeCredits={rules.card.minimumStakeCredits}
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
