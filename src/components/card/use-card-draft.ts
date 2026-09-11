"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
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
        marketType,
        outcomeKey,
        reviewedAmericanOdds,
        reviewedPayloadHash,
        reviewedProposition,
        stakeCredits,
      }) => ({
        eventId,
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
  const sealed = cardIsSealed(context);
  const incomplete = context.ownerCard?.compliance === "INCOMPLETE";
  const drafts = useMemo(
    () =>
      sealed || incomplete
        ? []
        : restoreCardDrafts(
            stored.slice(stored.indexOf(":") + 1),
            context.slate,
          ),
    [stored, context.slate, sealed, incomplete],
  );
  const setDrafts = useCallback(
    (
      next:
        | RestoredCardDraft[]
        | ((current: RestoredCardDraft[]) => RestoredCardDraft[]),
    ) => {
      if (key && !sealed && !incomplete)
        write(key, typeof next === "function" ? next(drafts) : next);
    },
    [key, sealed, incomplete, drafts],
  );
  const clearDrafts = useCallback(() => {
    if (key) write(key, []);
  }, [key]);
  useEffect(() => {
    if (key && (sealed || incomplete)) write(key, []);
  }, [key, sealed, incomplete]);
  return {
    drafts,
    setDrafts,
    clearDrafts,
    hydrated: stored !== "loading:",
    saved: stored.startsWith("saved:"),
    sealed,
    status: ownerDraftState(context, drafts),
  };
}

// One deadline timer, never a quote/provider poll. Simulation uses its own clock.
export function useCardDeadline(context: OwnerCardContext) {
  const [elapsedDeadline, setElapsedDeadline] = useState<string | null>(null);
  const deadline = context.week?.commonLockAt ?? "";
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
    (context.week.state !== "OPEN" ||
      (context.mode === "SIMULATION"
        ? Boolean(context.simulatedNow && context.simulatedNow >= deadline)
        : elapsedDeadline === deadline)),
  );
}
