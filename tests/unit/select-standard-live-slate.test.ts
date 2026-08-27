import { describe, expect, it } from "vitest";
import type { LiveProviderEvent } from "@/application/providers/live-odds";
import { isStandardLiveSlateEvent } from "@/application/providers/select-standard-live-slate";

function eventAt(scheduledStartAt: string): LiveProviderEvent {
  return {
    source: "THE_ODDS_API",
    externalEventId: scheduledStartAt,
    sportKey: "americanfootball_nfl",
    awayTeam: "Away",
    homeTeam: "Home",
    scheduledStartAt,
    markets: [],
  };
}

describe("standard live slate selection", () => {
  it("selects Sunday games at 1:00 p.m. Eastern or later", () => {
    expect(isStandardLiveSlateEvent(eventAt("2026-09-13T17:00:00.000Z"))).toBe(
      true,
    );
    expect(isStandardLiveSlateEvent(eventAt("2026-09-13T16:59:00.000Z"))).toBe(
      false,
    );
  });

  it("selects Monday games and excludes Thursday games", () => {
    expect(isStandardLiveSlateEvent(eventAt("2026-09-15T00:15:00.000Z"))).toBe(
      true,
    );
    expect(isStandardLiveSlateEvent(eventAt("2026-09-11T00:15:00.000Z"))).toBe(
      false,
    );
  });
});
