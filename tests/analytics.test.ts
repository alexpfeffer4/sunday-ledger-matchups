import { describe, expect, it } from "vitest";
import { sanitizeAnalyticsEvent } from "@/lib/analytics";

describe("analytics privacy", () => {
  it.each(["/auth/verify?token=secret", "/owner/rehearsal"])(
    "excludes %s",
    (path) => {
      expect(
        sanitizeAnalyticsEvent({
          type: "pageview",
          url: `https://www.ledgerleagues.com${path}`,
        }),
      ).toBeNull();
    },
  );

  it.each([
    ["/join/secret?email=private#access_token=secret", "/join/[token]"],
    ["/l/private-league/matchup?week=2", "/l/[leagueSlug]/matchup"],
    [
      "/l/private/rivalry/alice/bob",
      "/l/[leagueSlug]/rivalry/[memberA]/[memberB]",
    ],
    ["/l/private/receipt/secret", "/l/[leagueSlug]/receipt/[receiptId]"],
    ["/l/private/event/secret", "/l/[leagueSlug]/event/[eventId]"],
    ["/practice?pick=private", "/practice"],
  ])("redacts sensitive URL details in %s", (path, expectedPath) => {
    const result = sanitizeAnalyticsEvent({
      type: "pageview",
      url: `https://www.ledgerleagues.com${path}`,
    });
    expect(result).toEqual({
      type: "pageview",
      url: `https://www.ledgerleagues.com${expectedPath}`,
    });
  });
});
