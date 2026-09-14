"use client";

import Link from "next/link";
import {
  selectionKey,
  sameSelection,
  marketLabels,
} from "@/components/card/selection-identity";
import { PlayerPropsGame } from "@/components/card/player-props-game";
import { submissionAttemptId } from "@/components/card/submission-attempt";
import { refreshPlayerPropQuotesAction } from "@/app/l/[leagueSlug]/player-prop-actions";
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
  eventAcceptsBets,
  ownerCardContext,
} from "@/components/card/owner-card-context";
import {
  useCardDeadline,
  useEventCutoffTime,
  useCardDraft,
} from "@/components/card/use-card-draft";
import {
  OwnerCardProgress,
  SealedCardSummary,
} from "@/components/card/owner-card-progress";
import { PickReturn, ReturnExplanation } from "@/components/card/pick-return";
import { easternTime } from "@/application/queries/score-freshness";
import { CardTray } from "@/components/card/card-tray";
import {
  OutcomeSelector,
  type OutcomeSelectorOption,
} from "@/components/card/outcome-selector";
import { PositionEditorSheet } from "@/components/card/position-editor-sheet";
import { ActionFeedback } from "@/components/forms/action-feedback";
import { validateDraftCard } from "@/domain/cards/validate-card-draft";
import {
  maximumStakeForOdds,
  validateProposedPosition,
} from "@/domain/cards/validate-position";
import { formatCredits } from "@/domain/odds/american";
import {
  resolveSeasonCardRules,
  usesRollingSubmissions,
  type CardRules,
} from "@/rulesets/card-rules";

type SlateEvent = Stage1StateDto["slate"][number];
type SlateMarket = SlateEvent["markets"][number];

type DraftSelection = RestoredCardDraft;

type EditorState = {
  eventId: string;
  existing: boolean;
  marketSnapshotId: string;
  marketType: SlateMarket["marketType"];
  outcomeKey: SlateMarket["outcomeKey"];
  stakeCredits: string;
  subjectId?: string | null;
  statistic?: "PASSING_YARDS" | "RUSHING_YARDS" | "RECEIVING_YARDS" | null;
  period?: "FULL_GAME" | null;
};

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

function cardBuilderContextKey(state: Stage1StateDto): string {
  return JSON.stringify([
    state.league.id,
    state.week?.id,
    state.ownerCard?.id,
    state.season?.rulesetSnapshot,
  ]);
}

function slateSourceRevision(state: Stage1StateDto): string {
  return JSON.stringify(
    state.slate.map((event) => [
      event.id,
      event.entryClosesAt,
      event.entryOpen,
      event.playerProps?.map((slot) => [
        slot.team,
        slot.slot,
        slot.subjectId,
        slot.subjectLabel,
        slot.confirmed,
        slot.frozen,
        slot.unavailableReason,
      ]),
      event.markets.map((market) => [
        market.id,
        market.payloadHash,
        market.qualityStatus,
      ]),
    ]),
  );
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
  const rolling = usesRollingSubmissions(rules);
  const sourceRevision = slateSourceRevision(state);
  const [refreshedSlate, setRefreshedSlate] = useState<{
    sourceRevision: string;
    slate: Stage1StateDto["slate"];
  } | null>(null);
  const slate =
    refreshedSlate?.sourceRevision === sourceRevision
      ? refreshedSlate.slate
      : state.slate;
  function setSlate(next: Stage1StateDto["slate"]) {
    setRefreshedSlate({ sourceRevision, slate: next });
  }
  const [checkingQuotes, setCheckingQuotes] = useState(false);
  type Review = Extract<CardQuoteReviewResult, { status: "ready" }>["review"];
  const [storedReview, setStoredReview] = useState<{
    sourceRevision: string;
    review: Review;
  } | null>(null);
  const quoteReview =
    storedReview?.sourceRevision === sourceRevision
      ? storedReview.review
      : null;
  function setQuoteReview(review: Review | null) {
    setStoredReview(review ? { sourceRevision, review } : null);
  }
  const [reviewExpired, setReviewExpired] = useState(false);
  const [requiresLiveReview, setRequiresLiveReview] = useState(
    initialReview && (state.league.mode === "LIVE" || rolling),
  );
  const context = { ...ownerCardContext(state), slate };
  const { drafts, setDrafts, hydrated, sealed, clearDrafts, currentRevision } =
    useCardDraft(context);
  const closed = useCardDeadline(context);
  const cutoffNow = useEventCutoffTime(context);
  const [excludedKeys, setExcludedKeys] = useState<Set<string>>(new Set());
  const batchDrafts = rolling
    ? drafts.filter((draft) => !excludedKeys.has(selectionKey(draft)))
    : drafts;
  const submittedKeys = useRef<Set<string>>(new Set());
  const [marketView, setMarketView] = useState<"GAME" | "PLAYER">("GAME");
  const [kickoffFilter, setKickoffFilter] = useState<KickoffFilter>("ALL");
  const [reviewing, setReviewing] = useState(initialReview);
  const storageKey = cardDraftStorageKey(context);
  useEffect(() => {
    const changedInAnotherTab = (event: StorageEvent) => {
      if (event.key !== null && event.key !== storageKey) return;
      setReviewing(false);
      setStoredReview(null);
    };
    window.addEventListener("storage", changedInAnotherTab);
    return () => window.removeEventListener("storage", changedInAnotherTab);
  }, [storageKey]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [cardFeedback, setCardFeedback] = useState<string | null>(null);
  const cardFeedbackRef = useRef<HTMLParagraphElement>(null);
  const [actionState, action, sealing] = useActionState(
    async (previous: typeof initialAppActionState, formData: FormData) => {
      if (storageKey) {
        formData.set(
          "submissionId",
          submissionAttemptId(
            storageKey,
            JSON.stringify({
              rules: state.season.rulesetSnapshot,
              positions: batchDrafts
                .map((draft) => {
                  const market = slate
                    .find((event) => event.id === draft.eventId)
                    ?.markets.find(
                      (market) => market.id === draft.marketSnapshotId,
                    );
                  return {
                    identity: selectionKey(draft),
                    outcomeKey: draft.outcomeKey,
                    lineMilli: market?.lineMilli,
                    americanOdds: draft.reviewedAmericanOdds,
                    proposition: draft.reviewedProposition,
                    stakeCredits: draft.stakeCredits,
                  };
                })
                .sort((a, b) => a.identity.localeCompare(b.identity)),
            }),
          ),
        );
      }
      submittedKeys.current = new Set(batchDrafts.map(selectionKey));
      return acceptStage1CardAction(previous, formData);
    },
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
    if (actionState.status !== "success") return;
    if (!rolling) clearDrafts();
    else if (submittedKeys.current.size) {
      const accepted = submittedKeys.current;
      submittedKeys.current = new Set();
      setDrafts((current) =>
        current.filter((draft) => !accepted.has(selectionKey(draft))),
      );
      setReviewing(false);
      setStoredReview(null);
    }
  }, [actionState.status, clearDrafts, rolling, setDrafts]);
  const appliedActionReview = useRef<string | null>(null);
  useEffect(() => {
    const refreshed = actionState.quoteReview;
    if (!refreshed || appliedActionReview.current === refreshed.reviewId)
      return;
    appliedActionReview.current = refreshed.reviewId;
    const freshByEvent = new Map(
      refreshed.quotes.map((event) => [event.eventId, event.markets]),
    );
    const nextSlate = slate.map((event) => ({
      ...event,
      markets: freshByEvent.has(event.id)
        ? [
            ...event.markets.filter(
              (market) =>
                !(freshByEvent.get(event.id) ?? []).some(
                  (fresh) =>
                    sameSelection(
                      { ...fresh, eventId: event.id },
                      { ...market, eventId: event.id },
                    ) && fresh.outcomeKey === market.outcomeKey,
                ),
            ),
            ...(freshByEvent.get(event.id) ?? []),
          ]
        : event.markets,
    }));
    setRefreshedSlate({ sourceRevision, slate: nextSlate });
    setDrafts((current) =>
      restoreCardDrafts(
        JSON.stringify({ version: 1, drafts: current }),
        nextSlate,
      ).map((draft) => ({
        ...draft,
        reviewedPayloadHash:
          draft.reviewedAmericanOdds === draft.americanOdds &&
          draft.reviewedProposition === draft.proposition
            ? draft.payloadHash
            : draft.reviewedPayloadHash,
        quoteReviewRequired:
          draft.reviewedAmericanOdds !== draft.americanOdds ||
          draft.reviewedProposition !== draft.proposition ||
          nextSlate
            .flatMap((event) => event.markets)
            .find((market) => market.id === draft.marketSnapshotId)
            ?.qualityStatus !== "HEALTHY",
      })),
    );
    setStoredReview({ sourceRevision, review: refreshed });
    setReviewExpired(false);
    setReviewing(true);
  }, [actionState.quoteReview, slate, setDrafts, sourceRevision]);
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
      subjectId?: string | null;
      statistic?: "PASSING_YARDS" | "RUSHING_YARDS" | "RECEIVING_YARDS" | null;
      period?: "FULL_GAME" | null;
    }
  >();
  for (const event of slate) {
    for (const market of event.markets) {
      if (market.qualityStatus !== "HEALTHY") continue;
      const key = selectionKey({ ...market, eventId: event.id });
      const current = eligibleByMarket.get(key);
      if (
        !current ||
        maximumStakeForOdds(market.americanOdds, rules) >
          maximumStakeForOdds(current.americanOdds, rules)
      ) {
        eligibleByMarket.set(key, {
          eventId: event.id,
          marketType: market.marketType,
          subjectId: market.subjectId,
          statistic: market.statistic,
          period: market.period,
          americanOdds: market.americanOdds,
        });
      }
    }
  }

  const draftPositions = batchDrafts.flatMap((draft) => {
    const selected = snapshots.get(draft.marketSnapshotId);
    return selected
      ? [
          {
            eventId: selected.event.id,
            marketType: selected.market.marketType,
            subjectId: selected.market.subjectId,
            statistic: selected.market.statistic,
            period: selected.market.period,
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
      subjectId: position.subjectId,
      statistic: position.statistic,
      period: position.period,
      stakeCredits: position.stakeCredits,
      americanOdds: position.americanOdds,
    })),
    draftPositions,
    eligibleOpportunities: [...eligibleByMarket.values()],
    ruleset: rules,
  });
  const batchCredits = batchDrafts.reduce(
    (sum, draft) => sum + draft.stakeCredits,
    0,
  );
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
    if (
      rolling &&
      (!eventAcceptsBets(event, cutoffNow) ||
        ownerCard?.positions.some((position) =>
          sameSelection(position, { ...market, eventId: event.id }),
        ))
    )
      return;
    const maximumStakeCredits = maximumStakeForOdds(market.americanOdds, rules);
    setStoredReview(null);
    setEditor({
      eventId: event.id,
      subjectId: market.subjectId,
      statistic: market.statistic,
      period: market.period,
      existing: Boolean(existing),
      marketSnapshotId: market.id,
      marketType: market.marketType,
      outcomeKey: market.outcomeKey,
      stakeCredits: String(
        existing?.stakeCredits ?? Math.min(250, maximumStakeCredits),
      ),
    });
    setEditorError(null);
    setCardFeedback(null);
  }

  function removeDraft(key: string) {
    setStoredReview(null);
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
    if (
      rolling &&
      batchDrafts.some((draft) => {
        const selection = snapshots.get(draft.marketSnapshotId);
        return !selection || !eventAcceptsBets(selection.event, cutoffNow);
      })
    ) {
      setCardFeedback(
        "A selected game is closed or unavailable. Uncheck it to submit bets on later games. Your drafts are kept.",
      );
      return;
    }
    if (!draftValidation.accepted) {
      setCardFeedback(draftValidation.message);
      requestAnimationFrame(() => cardFeedbackRef.current?.focus());
      return;
    }
    setCardFeedback(null);
    const reviewedDraftRevision = currentRevision();
    if (state.league.mode === "LIVE" || rolling) {
      setCheckingQuotes(true);
      setStoredReview(null);
      try {
        const result = await reviewLiveCardQuotes(
          state.league.slug,
          batchDrafts.map(
            ({ marketSnapshotId, payloadHash, stakeCredits }) => ({
              marketSnapshotId,
              payloadHash,
              stakeCredits,
            }),
          ),
        );
        if (currentRevision() !== reviewedDraftRevision) {
          setCardFeedback(
            "Your draft changed while odds were being checked. The latest draft is kept; review it again before submitting.",
          );
          return;
        }
        if (result.status === "error") {
          setCardFeedback(result.message);
          return;
        }
        if (result.status === "disabled") setRequiresLiveReview(false);
        if (result.status === "ready" || result.status === "simulation") {
          const byEvent = new Map(
            (result.status === "ready"
              ? result.review.quotes
              : result.quotes
            ).map((event) => [event.eventId, event.markets]),
          );
          const refreshedSlate = slate.map((event) => ({
            ...event,
            markets: byEvent.has(event.id)
              ? [
                  ...event.markets.filter(
                    (market) =>
                      !(byEvent.get(event.id) ?? []).some(
                        (fresh) =>
                          sameSelection(
                            { ...fresh, eventId: event.id },
                            { ...market, eventId: event.id },
                          ) && fresh.outcomeKey === market.outcomeKey,
                      ),
                  ),
                  ...(byEvent.get(event.id) ?? []),
                ]
              : event.markets,
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
          setQuoteReview(result.status === "ready" ? result.review : null);
          setReviewExpired(false);
          setRequiresLiveReview(result.status === "ready");
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
  const quoteReviewCount = batchDrafts.filter(
    (draft) => draft.quoteReviewRequired,
  ).length;
  const editorEvent = editor
    ? slate.find((event) => event.id === editor.eventId)
    : undefined;
  const editorMarket = editor
    ? (snapshots.get(editor.marketSnapshotId)?.market ??
      editorEvent?.markets.find(
        (market) =>
          sameSelection({ ...market, eventId: editor.eventId }, editor) &&
          market.outcomeKey === editor.outcomeKey,
      ))
    : undefined;
  const editorKey = editor ? selectionKey(editor) : undefined;
  const editorOtherDrafts = editorKey
    ? drafts.filter((draft) => selectionKey(draft) !== editorKey)
    : drafts;
  const editorAcceptedPositions = [
    ...ownerCard.positions.map((position) => ({
      eventId: position.eventId,
      marketType: position.marketType,
      subjectId: position.subjectId,
      statistic: position.statistic,
      period: position.period,
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
              subjectId: selected.market.subjectId,
              statistic: selected.market.statistic,
              period: selected.market.period,
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
          .filter((market) =>
            sameSelection({ ...market, eventId: editor.eventId }, editor),
          )
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
        outcomeKey: market.outcomeKey,
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
    if (rolling && !eventAcceptsBets(editorEvent, cutoffNow)) {
      setEditorError(
        "This game has closed. You can still choose a later game.",
      );
      return;
    }
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
        subjectId: editorMarket.subjectId,
        statistic: editorMarket.statistic,
        period: editorMarket.period,
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
      subjectId: editorMarket.subjectId,
      subjectLabel: editorMarket.subjectLabel,
      statistic: editorMarket.statistic,
      period: editorMarket.period,
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

  if (!rolling && (sealed || actionState.status === "success")) {
    return (
      <div className="mt-4">
        <SealedCardSummary
          heading="All 1,000 credits are sealed"
          leagueSlug={state.league.slug}
          lockAt={state.week.commonLockAt}
        />
      </div>
    );
  }

  if (closed)
    return (
      <div className="mt-7">
        <OwnerCardProgress context={context} />
      </div>
    );

  if (reviewing && batchDrafts.length > 0) {
    return (
      <div className="mt-4 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="border-registry bg-surface min-w-0 rounded-xl border p-4 wrap-break-word shadow-[var(--shadow-card)] sm:p-6">
          <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
            Final review
          </p>
          <h2
            className="mt-2 text-2xl font-bold outline-none"
            ref={reviewHeadingRef}
            tabIndex={-1}
          >
            {rolling ? "Review your bets" : "Review your complete card"}
          </h2>
          <p className="text-graphite mt-3 leading-7">
            Check each game, selection, odds, stake, and total return. Your
            picks stay editable until you confirm.
          </p>
          {actionState.quoteChanges?.length ? (
            <div
              role="alert"
              className="border-pending/40 bg-pending/10 mt-4 rounded-lg border p-3 text-sm"
            >
              <p className="font-semibold">
                Odds changed. Check the differences before submitting again.
              </p>
              <ul className="mt-2 space-y-2">
                {actionState.quoteChanges.map((change) => (
                  <li key={change.selectionKey} className="break-words">
                    {change.label}:{" "}
                    {change.before.lineMilli === null
                      ? ""
                      : `${change.before.lineMilli / 1000} · `}
                    {formatAmericanOdds(change.before.americanOdds)} →{" "}
                    {change.after
                      ? `${change.after.lineMilli === null ? "" : `${change.after.lineMilli / 1000} · `}${formatAmericanOdds(change.after.americanOdds)}`
                      : "Unavailable; your draft is kept"}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
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
            {batchDrafts.map((draft, index) => {
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
            <p className="text-muted text-sm font-semibold">
              {rolling ? "This submission" : "Card total"}
            </p>
            <p className="mt-2 font-mono text-3xl font-bold">
              {rolling
                ? `${formatCredits(batchCredits)} credits`
                : `${formatCredits(rules.card.weeklyAllocationCredits)} / ${formatCredits(rules.card.weeklyAllocationCredits)}`}
            </p>
            <p className="text-graphite mt-2 text-sm">
              {rolling
                ? `${batchDrafts.length} bets · ${formatCredits(ownerCard.remainingCredits - batchCredits)} credits available after submission`
                : `${ownerCard.positions.length + drafts.length} total picks`}
            </p>
          </section>
          {state.league.mode === "LIVE" || rolling ? (
            <div className="text-graphite space-y-2 text-sm" aria-live="polite">
              {quoteReview ? (
                <p>
                  Odds checked {formatObservedAt(quoteReview.fetchedAt)}.{" "}
                  {reviewExpired
                    ? "We’ll check the latest odds when you submit."
                    : "Odds are checked again if needed when you submit."}
                </p>
              ) : null}
              {(requiresLiveReview && !quoteReview) ||
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
                      : rolling
                        ? "Check current odds before submitting"
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
            {rolling
              ? "Each selected game closes at kickoff."
              : `Seal by ${formatDate(state.week.commonLockAt)}.`}
          </p>
          <form action={action}>
            <p className="mb-3 text-sm leading-6">
              {rolling
                ? "Submitting is final: these bets are accepted together with a receipt for each. You cannot edit or cancel them. You can return to add more bets with your remaining credits."
                : "Sealing is final: all picks are saved together with a receipt for each. You cannot edit or cancel them."}
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
                batchDrafts.map(
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
                (quoteReview?.reviewId === actionState.quoteReview?.reviewId &&
                  Boolean(
                    actionState.quoteChanges?.some(
                      (change) => change.after === null,
                    ),
                  )) ||
                !draftValidation.accepted ||
                (rolling &&
                  batchDrafts.some((draft) => {
                    const selected = snapshots.get(draft.marketSnapshotId);
                    return (
                      !selected || !eventAcceptsBets(selected.event, cutoffNow)
                    );
                  })) ||
                (requiresLiveReview && !quoteReview)
              }
              type="submit"
            >
              {checkingQuotes
                ? "Checking current odds…"
                : sealing
                  ? "Checking latest odds…"
                  : quoteReviewCount > 0
                    ? "Review changed quotes first"
                    : rolling
                      ? "Submit bets"
                      : "Confirm and seal card"}
            </button>
            <ActionFeedback state={actionState} />
          </form>
          <button
            className="border-registry text-registry hover:bg-subtle min-h-11 w-full rounded-lg border px-5 text-sm font-semibold"
            disabled={pending}
            onClick={() => {
              setReviewing(false);
              setStoredReview(null);
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
      <div className="mt-4 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          <OwnerCardProgress context={context} onSlatePage />
          {rolling ? <ActionFeedback state={actionState} /> : null}

          <nav
            aria-label="Filter games by kickoff"
            className="flex flex-wrap gap-2"
          >
            {availableFilters.map((filter) => (
              <button
                aria-pressed={kickoffFilter === filter}
                className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors ${
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

          {state.week.propsEnabled ? (
            <div
              aria-label="Bet type"
              className="border-boundary bg-surface grid grid-cols-2 rounded-lg border p-1"
            >
              {(["GAME", "PLAYER"] as const).map((view) => (
                <button
                  type="button"
                  key={view}
                  aria-pressed={marketView === view}
                  className={`min-h-11 rounded-md px-3 text-sm font-semibold ${marketView === view ? "bg-registry text-white" : "text-graphite hover:bg-subtle"}`}
                  onClick={() => setMarketView(view)}
                >
                  {view === "GAME" ? "Game lines" : "Player props"}
                </button>
              ))}
            </div>
          ) : null}
          {marketView === "PLAYER" && state.week.propsEnabled
            ? visibleEvents.map((event) => (
                <PlayerPropsGame
                  leagueId={state.league.id}
                  leagueSlug={state.league.slug}
                  refreshAction={refreshPlayerPropQuotesAction}
                  key={event.id}
                  event={event}
                  drafts={drafts}
                  acceptedPositions={ownerCard.positions}
                  bettingOpen={!rolling || eventAcceptsBets(event, cutoffNow)}
                  onSelect={openEditor}
                />
              ))
            : visibleEvents.map((event) => (
                <section
                  aria-labelledby={`card-builder-event-${event.id}`}
                  className="border-boundary bg-surface rounded-lg border p-4"
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
                      {rolling && !eventAcceptsBets(event, cutoffNow) ? (
                        <p className="mt-1 font-semibold">Betting closed</p>
                      ) : null}
                      <p className="mt-1 text-xs">
                        Odds updated{" "}
                        {formatObservedAt(
                          event.markets.reduce(
                            (latest, market) =>
                              market.observedAt > latest
                                ? market.observedAt
                                : latest,
                            event.markets[0]?.observedAt ??
                              event.scheduledStartAt,
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
                          className={`grid gap-2 py-3 sm:grid-cols-[110px_minmax(0,1fr)] sm:items-center ${
                            selectedDraft ? "bg-registry/5" : ""
                          }`}
                          key={marketType}
                        >
                          <div className="flex items-center justify-between gap-3 sm:block">
                            <p className="text-muted text-sm font-semibold">
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
                                (candidate) =>
                                  candidate.id === marketSnapshotId,
                              );
                              if (market)
                                openEditor(event, market, selectedDraft);
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
                                  rolling && !eventAcceptsBets(event, cutoffNow)
                                    ? "Betting closed"
                                    : rolling &&
                                        ownerCard.positions.some(
                                          (position) =>
                                            position.eventId === event.id &&
                                            position.marketType === marketType,
                                        )
                                      ? "Bet already submitted for this market"
                                      : market.qualityStatus === "HEALTHY"
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
          <details className="text-graphite text-sm">
            <summary className="min-h-11 cursor-pointer py-3 font-semibold">
              Card requirements
            </summary>
            <p className="pb-3 leading-6">
              {rolling ? (
                `Submit one or more bets before each game's kickoff. You have ${formatCredits(rules.card.weeklyAllocationCredits)} credits for the entire week. Unused credits expire and partial cards score normally.`
              ) : (
                <>
                  Allocate all{" "}
                  {formatCredits(rules.card.weeklyAllocationCredits)} credits
                  and seal before the deadline.
                </>
              )}{" "}
              {rolling ? (
                "Only zero submitted bets at the final cutoff counts as a missed week. Drafts stay editable; submitted bets are permanent. Wins, pushes and voids do not replenish available credits."
              ) : (
                <>
                  {state.week.scope === "EXHIBITION"
                    ? "An incomplete card scores zero for this exhibition; your official season record stays unchanged."
                    : "An incomplete card receives an automatic matchup loss under this season’s Ruleset."}{" "}
                  Picks stay editable until you seal.
                </>
              )}
            </p>
          </details>
        </div>

        <aside className="min-w-0 space-y-5 wrap-break-word xl:sticky xl:top-6 xl:self-start">
          <section className="border-boundary bg-surface rounded-lg border p-4">
            <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
              {rolling ? "Your drafts" : "Your picks"}
            </p>
            {ownerCard.positions.length > 0 ? (
              <p className="text-muted mt-2 text-xs">
                {formatCredits(ownerCard.allocatedCredits)} credits are already{" "}
                {rolling ? "submitted" : "sealed"} and can’t be changed.
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
                  const key = selectionKey(draft);
                  if (!selected)
                    return (
                      <article key={key} className="py-4">
                        <p className="font-semibold">
                          Unavailable draft ·{" "}
                          {formatMarketProposition(draft.reviewedProposition)}
                        </p>
                        <p className="text-muted mt-1 text-sm">
                          Your draft is kept. Remove it or wait for the game and
                          quote to become available.
                        </p>
                        {rolling ? (
                          <label className="flex min-h-11 items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={!excludedKeys.has(key)}
                              onChange={() => {
                                setExcludedKeys((current) => {
                                  const next = new Set(current);
                                  if (next.has(key)) next.delete(key);
                                  else next.add(key);
                                  return next;
                                });
                                setStoredReview(null);
                              }}
                            />
                            Include in submission
                          </label>
                        ) : null}
                        <button
                          type="button"
                          className="text-action min-h-11 font-semibold"
                          onClick={() => removeDraft(key)}
                        >
                          Remove
                        </button>
                      </article>
                    );
                  return (
                    <article className="py-4 first:pt-0 last:pb-0" key={key}>
                      {rolling ? (
                        <label className="mb-2 flex min-h-11 items-center gap-2 text-sm font-semibold">
                          <input
                            type="checkbox"
                            checked={!excludedKeys.has(key)}
                            onChange={() => {
                              setExcludedKeys((current) => {
                                const next = new Set(current);
                                if (next.has(key)) next.delete(key);
                                else next.add(key);
                                return next;
                              });
                              setStoredReview(null);
                            }}
                            aria-label={`Include ${selected.event.awayTeam} at ${selected.event.homeTeam} ${draft.subjectLabel ? `${draft.subjectLabel} ` : ""}${marketLabels[draft.marketType]} in submission`}
                          />
                          Include in submission
                        </label>
                      ) : null}
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 basis-48">
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
                          <p className="text-muted mt-1 font-mono text-[.9375rem] leading-5">
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
                                Review{" "}
                                {rolling ? "these bets" : "the complete card"}{" "}
                                to reconcile current terms.
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
              {formatCredits(totalCredits)}{" "}
              {rolling ? "submitted or drafted" : "used"} ·{" "}
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
                : `Review ${batchDrafts.length} ${rolling ? "bets" : "picks"}`
              : rolling
                ? batchDrafts.length
                  ? "Resolve selected bet issues"
                  : "Select bets to review"
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
        reviewLabel={
          rolling ? `Review ${batchDrafts.length} bets` : "Review card"
        }
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
            ? (editorMarket.id ?? null)
            : null
        }
        stakeCredits={editor?.stakeCredits ?? ""}
        title={
          editorMarket?.subjectLabel
            ? `${editorMarket.subjectLabel} · ${marketLabels[editorMarket.marketType]}`
            : editor
              ? marketLabels[editor.marketType]
              : "Pick"
        }
      />
    </>
  );
}
