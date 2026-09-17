"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

const changed = "sunday-ledger:browsing-choice";
const prefix = "sunday-ledger:browsing:v1:";
type Choice = { options: readonly string[]; fallback: string };
type Choices = Record<string, Choice>;

function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener(changed, listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener(changed, listener);
  };
}

function readSaved(scope: string | null): string {
  try {
    return scope ? (sessionStorage.getItem(prefix + scope) ?? "") : "";
  } catch {
    return "";
  }
}

export function resolveBrowsingChoices(
  query: URLSearchParams,
  saved: string,
  choices: Choices,
) {
  let previous: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(saved);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      previous = parsed as Record<string, unknown>;
  } catch {
    /* Unavailable/corrupt preferences never block the page. */
  }
  let invalid = false;
  const values: Record<string, string> = {};
  for (const [name, choice] of Object.entries(choices)) {
    const explicit = query.getAll(name);
    const candidate = explicit.length ? explicit[0] : previous[name];
    const valid =
      explicit.length <= 1 &&
      typeof candidate === "string" &&
      choice.options.includes(candidate);
    if (candidate !== undefined && !valid) invalid = true;
    values[name] = valid ? candidate : choice.fallback;
  }
  return { values, invalid };
}

/** Only allowlisted day/type/week choices. Never pass draft or receipt data.
 * Callers scope preferences with authorized owner/league/week identities.
 * Native history preserves the list position/focus and adds one entry per
 * deliberate selection, without fetching the page or touching quote polling.
 */
export function useBrowsingChoices(scope: string | null, choices: Choices) {
  const snapshot = useCallback(
    () => JSON.stringify([window.location.search, readSaved(scope)]),
    [scope],
  );
  const raw = useSyncExternalStore(subscribe, snapshot, () => "");
  const [search, saved] = raw
    ? (JSON.parse(raw) as [string, string])
    : ["", ""];
  const { values, invalid } = resolveBrowsingChoices(
    new URLSearchParams(search),
    saved,
    choices,
  );
  const serialized = JSON.stringify(values);
  const ready =
    Boolean(raw) &&
    (invalid ||
      Object.entries(values).every(
        ([name, value]) => new URLSearchParams(search).get(name) === value,
      ));

  useEffect(() => {
    // A pending effect must never normalize over a newer deliberate selection.
    if (!raw || invalid || raw !== snapshot()) return;
    try {
      if (scope) sessionStorage.setItem(prefix + scope, serialized);
    } catch {
      /* URL and in-tab navigation still work without storage. */
    }
    // Give the initial entry explicit defaults/restored values, so Back does
    // not reinterpret it using the last preference saved later in this tab.
    const url = new URL(window.location.href);
    for (const [name, value] of Object.entries(
      JSON.parse(serialized) as Record<string, string>,
    ))
      url.searchParams.set(name, value);
    if (url.search !== window.location.search) {
      window.history.replaceState(
        null,
        "",
        url.pathname + url.search + url.hash,
      );
      window.dispatchEvent(new Event(changed));
    }
  }, [raw, invalid, scope, serialized, snapshot]);

  function select(name: string, value: string) {
    if (!ready || !choices[name]?.options.includes(value)) return;
    const next = { ...values, [name]: value };
    const url = new URL(window.location.href);
    for (const [key, selection] of Object.entries(next))
      url.searchParams.set(key, selection);
    if (url.search !== window.location.search)
      window.history.pushState(null, "", url.pathname + url.search + url.hash);
    try {
      if (scope) sessionStorage.setItem(prefix + scope, JSON.stringify(next));
    } catch {
      /* URL remains authoritative. */
    }
    window.dispatchEvent(new Event(changed));
  }
  return { values, invalid, ready, select };
}

/** Signing out clears only browsing preferences, never the private draft store. */
export function clearBrowsingChoices() {
  try {
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith(prefix)) sessionStorage.removeItem(key);
  } catch {
    /* No preference data is available to clear. */
  }
}
