"use client";
import { useEffect, useRef, useState } from "react";
import {
  storedQuoteUpdatesSchema,
  type StoredQuoteUpdate,
  type QuoteFreshnessData,
} from "@/application/providers/stored-quote-updates";

/** Stored reads only. Stable component state survives every quote revision. */
export function useStoredQuoteUpdates(options: {
  leagueSlug: string;
  weekId?: string;
  enabled: boolean;
  paused: boolean;
  apply: (update: StoredQuoteUpdate) => void;
}) {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const [freshness, setFreshness] = useState(
    new Map<string, QuoteFreshnessData>(),
  );
  const [delayed, setDelayed] = useState(false);
  const resume = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!options.enabled || !options.weekId) return;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false,
      inFlight = false,
      failures = 0,
      lastRead = 0;
    let buffered: StoredQuoteUpdate | null = null;
    const controller = new AbortController();
    const visible = () =>
      document.visibilityState !== "hidden" && navigator.onLine !== false;
    const apply = (update: StoredQuoteUpdate) => {
      latest.current.apply(update);
      setFreshness(
        new Map(update.events.map((event) => [event.eventId, event.freshness])),
      );
      setDelayed(false);
      if (!update.hasOpenEvents || !update.pollingEnabled) stopped = true;
    };
    const schedule = () => {
      clearTimeout(timer);
      if (!stopped && visible())
        timer = setTimeout(
          () => void read(),
          Math.min(300_000, 60_000 * 2 ** failures),
        );
    };
    async function read() {
      if (stopped || inFlight || !visible()) return;
      if (latest.current.paused) {
        schedule();
        return;
      }
      if (buffered) {
        apply(buffered);
        buffered = null;
      }
      if (Date.now() - lastRead < 1000) {
        schedule();
        return;
      }
      inFlight = true;
      lastRead = Date.now();
      try {
        const response = await fetch(
          `/api/l/${encodeURIComponent(options.leagueSlug)}/quotes?weekId=${options.weekId}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error("Stored quotes unavailable");
        const update = storedQuoteUpdatesSchema.parse(await response.json());
        failures = 0;
        if (stopped) return;
        if (update.status === "STOP") {
          stopped = true;
          return;
        }
        if (update.weekId !== options.weekId) {
          stopped = true;
          return;
        }
        if (latest.current.paused || !visible()) buffered = update;
        else apply(update);
      } catch {
        if (!controller.signal.aborted) {
          failures = Math.min(3, failures + 1);
          setDelayed(true);
        }
      } finally {
        inFlight = false;
        schedule();
      }
    }
    const visibility = () => {
      clearTimeout(timer);
      if (visible()) void read();
    };
    resume.current = () => {
      if (buffered || Date.now() - lastRead >= 60_000) void read();
    };
    // One authorized read discovers the operational polling switch. No provider.
    timer = setTimeout(() => void read(), 0);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", visibility);
    window.addEventListener("online", visibility);
    window.addEventListener("offline", visibility);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller.abort();
      resume.current = null;
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", visibility);
      window.removeEventListener("online", visibility);
      window.removeEventListener("offline", visibility);
    };
  }, [options.enabled, options.leagueSlug, options.weekId]);
  useEffect(() => {
    if (!options.paused) resume.current?.();
  }, [options.paused]);
  return { freshness, delayed };
}
