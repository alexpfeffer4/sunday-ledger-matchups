// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStoredQuoteUpdates } from "@/components/card/use-stored-quote-updates";
const weekId = "10000000-0000-4000-8000-000000000001";
const update = {
  status: "READY",
  weekId,
  pollingEnabled: true,
  hasOpenEvents: true,
  quotes: [],
  slots: [],
  events: [],
};
beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(update)),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("stored board reads", () => {
  it("polls visible boards, deduplicates focus/visibility, and pauses for review", async () => {
    const apply = vi.fn();
    const { rerender } = renderHook(
      ({ paused }) =>
        useStoredQuoteUpdates({
          leagueSlug: "test-league",
          weekId,
          enabled: true,
          paused,
          apply,
        }),
      { initialProps: { paused: false } },
    );
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledTimes(1);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    rerender({ paused: true });
    await act(() => vi.advanceTimersByTimeAsync(120_000));
    expect(fetch).toHaveBeenCalledTimes(1);
    rerender({ paused: false });
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(fetch).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      vi
        .mocked(fetch)
        .mock.calls.every(([url]) =>
          String(url).startsWith("/api/l/test-league/quotes?weekId="),
        ),
    ).toBe(true);
  });
  it("defers a response that arrives after review starts", async () => {
    let respond: (value: Response) => void = () => {};
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise((resolve) => {
          respond = resolve;
        }),
    );
    const apply = vi.fn();
    const { rerender } = renderHook(
      ({ paused }) =>
        useStoredQuoteUpdates({
          leagueSlug: "test-league",
          weekId,
          enabled: true,
          paused,
          apply,
        }),
      { initialProps: { paused: false } },
    );
    await act(() => vi.advanceTimersByTimeAsync(1));
    rerender({ paused: true });
    await act(async () => {
      respond(Response.json(update));
    });
    expect(apply).not.toHaveBeenCalled();
    rerender({ paused: false });
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
