import { describe, expect, it } from "vitest";
import { stableOperationKey } from "@/application/actions/stable-operation-key";

describe("stable operation keys", () => {
  it("survives a lost response, reload, and identical resubmission", () => {
    const intent = {
      command: "ACCEPT_STAGE1_CARD",
      leagueSlug: "friends-2026",
      positions: [
        {
          marketSnapshotId: "d653df5b-4010-4c15-998b-9a5aa12e276c",
          payloadHash: "a".repeat(64),
          stakeCredits: 1_000,
        },
      ],
    } as const;

    const firstAttempt = stableOperationKey(intent);
    const afterReload = stableOperationKey(
      JSON.parse(JSON.stringify(intent)) as typeof intent,
    );

    expect(afterReload).toBe(firstAttempt);
    expect(firstAttempt).toMatch(/^op:[0-9a-f]{64}$/);
  });

  it("changes when a reviewed quote or command input changes", () => {
    const original = stableOperationKey({
      command: "ACCEPT_STAGE1_CARD",
      payloadHash: "a".repeat(64),
      stakeCredits: 1_000,
    });
    const changedQuote = stableOperationKey({
      command: "ACCEPT_STAGE1_CARD",
      payloadHash: "b".repeat(64),
      stakeCredits: 1_000,
    });
    const changedStake = stableOperationKey({
      command: "ACCEPT_STAGE1_CARD",
      payloadHash: "a".repeat(64),
      stakeCredits: 950,
    });

    expect(changedQuote).not.toBe(original);
    expect(changedStake).not.toBe(original);
  });

  it("distinguishes two deliberate invitation intents with the same settings", () => {
    const settings = {
      command: "CREATE_LEAGUE_INVITE",
      expiresInDays: 7,
      leagueId: "league-1",
      maxUses: 4,
    } as const;

    expect(stableOperationKey({ ...settings, intentId: "intent-1" })).not.toBe(
      stableOperationKey({ ...settings, intentId: "intent-2" }),
    );
  });

  it("distinguishes later corrections that intentionally restore prior scores", () => {
    const correction = {
      command: "RECORD_STAGE1_RESULT",
      eventId: "event-1",
      leagueId: "league-1",
    } as const;

    expect(
      stableOperationKey({ ...correction, intentId: "correction-first" }),
    ).not.toBe(
      stableOperationKey({ ...correction, intentId: "correction-later" }),
    );
  });
});
