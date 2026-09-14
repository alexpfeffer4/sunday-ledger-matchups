"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { selectionKey } from "@/components/card/selection-identity";
import { usesRollingSubmissions } from "@/rulesets/card-rules";
import {
  restoreCardDrafts,
  type RestoredCardDraft,
  type StoredCardDraft,
} from "@/components/card/card-draft-storage";
import {
  cardDraftStorageKey,
  cardIsSealed,
  ownerDraftState,
  type OwnerCardContext,
} from "@/components/card/owner-card-context";

const changedEvent = "sunday-ledger:card-draft-changed";
// Only used if the browser refuses storage. It never survives a reload.
const unsavedDrafts = new Map<string, string>();
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(changedEvent, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(changedEvent, listener);
  };
}
function snapshot(key: string | null): string {
  if (!key) return "saved:";
  if (unsavedDrafts.has(key)) return `unsaved:${unsavedDrafts.get(key)}`;
  try {
    return `saved:${localStorage.getItem(key) ?? ""}`;
  } catch {
    return "unsaved:";
  }
}
function write(key: string, drafts: RestoredCardDraft[]) {
  const stored: StoredCardDraft = {
    version: 1,
    drafts: drafts.map(
      ({
        eventId,
        subjectId,
        subjectLabel,
        statistic,
        period,
        marketSnapshotId,
        marketType,
        outcomeKey,
        reviewedAmericanOdds,
        reviewedPayloadHash,
        reviewedProposition,
        stakeCredits,
      }) => ({
        eventId,
        subjectId,
        subjectLabel,
        statistic,
        period,
        marketSnapshotId,
        marketType,
        outcomeKey,
        reviewedAmericanOdds,
        reviewedPayloadHash,
        reviewedProposition,
        stakeCredits,
      }),
    ),
  };
  const value = drafts.length ? JSON.stringify(stored) : "";
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
    unsavedDrafts.delete(key);
  } catch {
    unsavedDrafts.set(key, value);
  }
  window.dispatchEvent(new Event(changedEvent));
}
const serverSnapshot = () => "loading:";

export function useCardDraft(context: OwnerCardContext) {
  const key = cardDraftStorageKey(context);
  const getSnapshot = useCallback(() => snapshot(key), [key]);
  const stored = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  const rolling = usesRollingSubmissions(context.rules);
  const sealed = cardIsSealed(context);
  const acceptedMarkets = useMemo(
    () =>
      new Set(
        rolling ? (context.ownerCard?.positions ?? []).map(selectionKey) : [],
      ),
    [rolling, context.ownerCard?.positions],
  );
  const incomplete = !rolling && context.ownerCard?.compliance === "INCOMPLETE";
  const drafts = useMemo(
    () =>
      sealed || incomplete
        ? []
        : restoreCardDrafts(
            stored.slice(stored.indexOf(":") + 1),
            context.slate,
          ).filter((draft) => !acceptedMarkets.has(selectionKey(draft))),
    [stored, context.slate, sealed, incomplete, acceptedMarkets],
  );
  const setDrafts = useCallback(
    (
      next:
        | RestoredCardDraft[]
        | ((current: RestoredCardDraft[]) => RestoredCardDraft[]),
    ) => {
      if (key && !sealed && !incomplete)
        write(
          key,
          typeof next === "function"
            ? next(
                restoreCardDrafts(
                  snapshot(key).slice(snapshot(key).indexOf(":") + 1),
                  context.slate,
                ).filter((draft) => !acceptedMarkets.has(selectionKey(draft))),
              )
            : next,
        );
    },
    [key, sealed, incomplete, context.slate, acceptedMarkets],
  );
  const clearDrafts = useCallback(() => {
    if (key) write(key, []);
  }, [key]);
  useEffect(() => {
    if (key && (sealed || incomplete)) write(key, []);
  }, [key, sealed, incomplete]);
  useEffect(() => {
    if (!key || !rolling || !acceptedMarkets.size || stored === "loading:")
      return;
    const current = restoreCardDrafts(
      snapshot(key).slice(snapshot(key).indexOf(":") + 1),
      context.slate,
    );
    const retained = current.filter(
      (draft) => !acceptedMarkets.has(selectionKey(draft)),
    );
    if (retained.length !== current.length) write(key, retained);
  }, [key, rolling, acceptedMarkets, stored, context.slate]);
  return {
    drafts,
    setDrafts,
    clearDrafts,
    currentRevision: () => snapshot(key),
    hydrated: stored !== "loading:",
    saved: stored.startsWith("saved:"),
    sealed,
    status: ownerDraftState(context, drafts),
  };
}

// One deadline timer, never a quote/provider poll. Simulation uses its own clock.
export function useCardDeadline(context: OwnerCardContext) {
  const [elapsedDeadline, setElapsedDeadline] = useState<string | null>(null);
  const rolling = usesRollingSubmissions(context.rules);
  const deadline =
    (rolling ? context.week?.entryClosesAt : context.week?.commonLockAt) ?? "";
  useEffect(() => {
    if (!deadline || context.mode !== "LIVE") return;
    let timer: number;
    const check = () => {
      const remaining = new Date(deadline).getTime() - Date.now();
      if (remaining <= 0) setElapsedDeadline(deadline);
      else timer = window.setTimeout(check, Math.min(remaining, 2_147_483_647));
    };
    timer = window.setTimeout(check, 0);
    return () => window.clearTimeout(timer);
  }, [deadline, context.mode]);
  return Boolean(
    context.week &&
    ((rolling
      ? context.week.entryClosed === true ||
        ["PLANNED", "FINAL"].includes(context.week.state) ||
        !deadline
      : context.week.state !== "OPEN") ||
      (context.mode === "SIMULATION"
        ? Boolean(
            context.simulatedNow &&
            new Date(context.simulatedNow).getTime() >=
              new Date(deadline).getTime(),
          )
        : elapsedDeadline === deadline)),
  );
}

// Refresh only at published cutoffs and on focus; never fetch odds from a timer.
export function useEventCutoffTime(context: OwnerCardContext): string {
  const [observedNow, setObservedNow] = useState<string | null>(null);
  const rolling = usesRollingSubmissions(context.rules);
  useEffect(() => {
    if (context.mode !== "LIVE" || !rolling) return;
    let timer: number;
    const check = () => {
      window.clearTimeout(timer);
      const now = Date.now();
      setObservedNow(new Date(now).toISOString());
      const next = context.slate
        .map((event) =>
          new Date(event.entryClosesAt ?? event.scheduledStartAt).getTime(),
        )
        .filter((cutoff) => cutoff > now)
        .sort((a, b) => a - b)[0];
      if (next)
        timer = window.setTimeout(check, Math.min(next - now, 2_147_483_647));
    };
    timer = window.setTimeout(check, 0);
    window.addEventListener("focus", check);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", check);
    };
  }, [context.mode, rolling, context.slate]);
  return context.mode === "SIMULATION"
    ? (context.simulatedNow ?? "")
    : (observedNow ?? new Date().toISOString());
}
