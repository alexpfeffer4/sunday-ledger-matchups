import { describe, expect, it } from "vitest";
import { pocSeason14Ruleset } from "@/rulesets/poc-season-1-4";
import { simulationSeason14Ruleset } from "@/rulesets/simulation-season-1-4";
import { pocSeason13Ruleset } from "@/rulesets/poc-season-1-3";
import { hashRuleset } from "@/rulesets/canonicalize";
import { persistedSeasonRulesetSchema } from "@/rulesets/schema";
import {
  resolveSeasonCardRules,
  usesRollingSubmissions,
} from "@/rulesets/card-rules";
import { validateDraftCard } from "@/domain/cards/validate-card-draft";
import { selectionIdentityKey } from "@/domain/cards/selection-identity";

const prop = (subjectId: string, stakeCredits = 100) => ({
  eventId: "one-game",
  marketType: "PLAYER_PASSING_YARDS" as const,
  subjectId,
  statistic: "PASSING_YARDS",
  period: "FULL_GAME",
  stakeCredits,
  americanOdds: -110,
});

describe("prospective player props rules", () => {
  it.each([pocSeason14Ruleset, simulationSeason14Ruleset])(
    "validates exact supported $mode package and rolling inheritance",
    async (rules) => {
      const hash = await hashRuleset(rules);
      expect(hash).toBe(
        rules.mode === "LIVE"
          ? "7a2721afb0c0d366367cfbb8a90fba6e4061df0bd02893f5722c5ba838ecd8f5"
          : "c9e9d9c049a57dbab45de23f1b6e6e3b7d8abcf52ba1854b3c496fd230bc653c",
      );
      const snapshot = {
        rulesetId: rules.id,
        rulesetVersion: rules.version,
        productBibleId: rules.productBibleId,
        productBibleVersion: rules.productBibleVersion,
        mode: rules.mode,
        sha256Hash: hash,
        canonicalSha256Hash: hash,
        frozenAt: "2026-09-15T00:00:00Z",
        canonicalJson: rules,
      };
      const resolved = resolveSeasonCardRules(snapshot, rules.mode);
      expect(resolved.supported).toBe(true);
      expect(usesRollingSubmissions(rules)).toBe(true);
      expect(
        resolveSeasonCardRules(
          {
            ...snapshot,
            rulesetVersion: "1.5",
            canonicalJson: { ...rules, version: "1.5" },
          },
          rules.mode,
        ).supported,
      ).toBe(false);
      expect(persistedSeasonRulesetSchema.parse(rules)).toEqual(rules);
    },
  );

  it("does not change the historical 1.3 market package", () => {
    expect(pocSeason13Ruleset.markets.eligible).toEqual([
      "MONEYLINE",
      "SPREAD",
      "TOTAL",
    ]);
    expect(pocSeason14Ruleset.card).toEqual(pocSeason13Ruleset.card);
    expect(pocSeason14Ruleset.markets.playerProps.zeroOffensiveSnaps).toBe(
      "VOID",
    );
    expect(pocSeason14Ruleset.markets.playerProps.unknownEvidence).toBe(
      "PENDING",
    );
  });

  it("allows distinct players in one statistic and one game", () => {
    expect(
      validateDraftCard({
        draftPositions: [prop("qb-a"), prop("qb-b")],
        eligibleOpportunities: [],
        ruleset: pocSeason14Ruleset,
      }).accepted,
    ).toBe(true);
  });

  it("rejects the same canonical identity across old and new batches", () => {
    expect(
      validateDraftCard({
        acceptedPositions: [prop("qb-a")],
        draftPositions: [prop("qb-a")],
        eligibleOpportunities: [],
        ruleset: pocSeason14Ruleset,
      }),
    ).toMatchObject({ accepted: false, code: "DUPLICATE_OR_OPPOSING_MARKET" });
  });

  it("binds identity independently of the quote's line or price", () => {
    expect(selectionIdentityKey(prop("qb-a"))).toBe(
      "one-game:qb-a:PASSING_YARDS:FULL_GAME",
    );
    expect(
      selectionIdentityKey({ eventId: "one-game", marketType: "TOTAL" }),
    ).toBe("one-game:TOTAL");
  });

  it("shares partial balances and rejects props under game-only rules", () => {
    expect(
      validateDraftCard({
        draftPositions: [prop("qb-a", 951)],
        eligibleOpportunities: [],
        ruleset: pocSeason14Ruleset,
      }).accepted,
    ).toBe(true);
    expect(
      validateDraftCard({
        draftPositions: [prop("qb-a")],
        eligibleOpportunities: [],
        ruleset: pocSeason13Ruleset,
      }),
    ).toMatchObject({ accepted: false, code: "INELIGIBLE_MARKET" });
    expect(
      validateDraftCard({
        draftPositions: [{ ...prop("qb-a"), subjectId: undefined }],
        eligibleOpportunities: [],
        ruleset: pocSeason14Ruleset,
      }),
    ).toMatchObject({ accepted: false, code: "INELIGIBLE_MARKET" });
    expect(
      validateDraftCard({
        draftPositions: [{ ...prop("qb-a"), statistic: "RUSHING_YARDS" }],
        eligibleOpportunities: [],
        ruleset: pocSeason14Ruleset,
      }),
    ).toMatchObject({ accepted: false, code: "INELIGIBLE_MARKET" });
  });
});
