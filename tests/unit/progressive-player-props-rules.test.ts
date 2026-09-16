import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { seasonRulesetSnapshotSchema } from "@/application/queries/season-ruleset-dtos";
import { validateDraftCard } from "@/domain/cards/validate-card-draft";
import { hashRuleset } from "@/rulesets/canonicalize";
import {
  resolveSeasonCardRules,
  usesRollingSubmissions,
} from "@/rulesets/card-rules";
import { pocSeason14Ruleset } from "@/rulesets/poc-season-1-4";
import { pocSeason15Ruleset } from "@/rulesets/poc-season-1-5";
import {
  persistedSeasonRulesetSchema,
  seasonRulesetV14Schema,
  seasonRulesetV15Schema,
} from "@/rulesets/schema";
import { simulationSeason14Ruleset } from "@/rulesets/simulation-season-1-4";
import { simulationSeason15Ruleset } from "@/rulesets/simulation-season-1-5";
import { withVerifiedRulesetHash } from "@/rulesets/verify-snapshot";
import { frozenCardRulesFixture } from "../fixtures/card-rules";

const packages = [
  {
    rules: pocSeason15Ruleset,
    previous: pocSeason14Ruleset,
    hash: "51895827d841c6e3cbb9a98174f2f12a4fb2a16627621b28b991b0c8e7221b5f",
    previousHash:
      "7a2721afb0c0d366367cfbb8a90fba6e4061df0bd02893f5722c5ba838ecd8f5",
  },
  {
    rules: simulationSeason15Ruleset,
    previous: simulationSeason14Ruleset,
    hash: "23a9a4a3ae84dbd79e29137dde749b4ce0fe2ac685278e45007b4a8bc189ad17",
    previousHash:
      "c9e9d9c049a57dbab45de23f1b6e6e3b7d8abcf52ba1854b3c496fd230bc653c",
  },
];

it("pins both SQL-generated progressive packages to the same canonical hashes as the application", async () => {
  const migration = readFileSync(
    new URL(
      "../../supabase/migrations/20260916023250_progressive_player_props.sql",
      import.meta.url,
    ),
    "utf8",
  );
  // Native migration tests execute this assertion against the packages produced
  // by PostgreSQL jsonb_set/canonicalization; this checks its independent
  // expected digests against the actual TypeScript package definitions.
  const assertion = migration.match(
    /do \$canonical_parity\$([\s\S]*?)\$canonical_parity\$/,
  )?.[1];
  expect(assertion).toContain("raise exception");
  const expected = new Map(
    [
      ...(assertion ?? "").matchAll(
        /where\s+mode\s*=\s*'(LIVE|SIMULATION)'\s*\)\s*<>\s*'([0-9a-f]{64})'/g,
      ),
    ].map((match) => [match[1], match[2]]),
  );
  expect(expected.size).toBe(2);
  for (const { rules } of packages)
    expect(expected.get(rules.mode)).toBe(await hashRuleset(rules));
});

describe.each(packages)(
  "$rules.mode progressive publication rules",
  ({ rules, previous, hash, previousHash }) => {
    it("adds only the versioned publication terms and preserves the full 1.4 package", async () => {
      await expect(hashRuleset(rules)).resolves.toBe(hash);
      await expect(hashRuleset(previous)).resolves.toBe(previousHash);
      const { emptySlotPublication, ...previousPropFields } =
        rules.markets.playerProps;
      expect(emptySlotPublication).toBe("AUTOMATIC_BEFORE_EVENT_CUTOFF");
      expect(rules.markets.playerProps.menuFreeze).toBe(
        "FIRST_PUBLICATION_PER_SLOT",
      );
      expect({
        ...rules,
        version: "1.4",
        productBibleVersion: "3.3",
        markets: {
          ...rules.markets,
          playerProps: {
            ...previousPropFields,
            menuFreeze: "FIRST_ACCEPTED_SUBMISSION",
          },
        },
      }).toEqual(previous);
      expect(seasonRulesetV14Schema.parse(previous)).toEqual(previous);
    });

    it("routes a verified 1.5 snapshot through persisted DTOs and rolling card validation", async () => {
      const snapshot = {
        ...frozenCardRulesFixture(rules.mode, rules),
        sha256Hash: hash,
        canonicalSha256Hash: hash,
      };
      const verified = await withVerifiedRulesetHash(snapshot);
      expect(persistedSeasonRulesetSchema.parse(rules)).toEqual(rules);
      expect(seasonRulesetSnapshotSchema.parse(snapshot).canonicalJson).toEqual(
        rules,
      );
      const resolved = resolveSeasonCardRules(verified, rules.mode);
      expect(resolved.supported).toBe(true);
      if (!resolved.supported) throw new Error(resolved.message);
      expect(resolved.version).toBe("1.5");
      expect(resolved.rules.markets).toEqual(rules.markets);
      expect(usesRollingSubmissions(resolved.rules)).toBe(true);

      const accepted = {
        eventId: "first-game",
        marketType: "TOTAL" as const,
        stakeCredits: 900,
        americanOdds: -110,
      };
      const prop = {
        eventId: "later-game",
        marketType: "PLAYER_RUSHING_YARDS" as const,
        subjectId: "published-rb",
        statistic: "RUSHING_YARDS",
        period: "FULL_GAME",
        stakeCredits: 50,
        americanOdds: -110,
      };
      expect(
        validateDraftCard({
          acceptedPositions: [accepted],
          draftPositions: [prop],
          eligibleOpportunities: [],
          ruleset: resolved.rules,
        }),
      ).toMatchObject({
        accepted: true,
        allocatedCredits: 950,
        positionCount: 2,
      });
      expect(
        validateDraftCard({
          acceptedPositions: [accepted, prop],
          draftPositions: [prop],
          eligibleOpportunities: [],
          ruleset: resolved.rules,
        }),
      ).toMatchObject({
        accepted: false,
        code: "DUPLICATE_OR_OPPOSING_MARKET",
      });
      expect(
        validateDraftCard({
          acceptedPositions: [accepted],
          draftPositions: [{ ...prop, stakeCredits: 101 }],
          eligibleOpportunities: [],
          ruleset: resolved.rules,
        }),
      ).toMatchObject({ accepted: false, code: "OVER_ALLOCATION" });
    });

    it("rejects incompatible publication terms and Bible identities even with matching digests", async () => {
      const wrongTerms = [
        { ...rules, markets: previous.markets },
        { ...previous, markets: rules.markets },
        { ...rules, productBibleVersion: "3.3" },
        { ...previous, productBibleVersion: "3.4" },
      ];
      for (const canonicalJson of wrongTerms) {
        const digest = await hashRuleset(canonicalJson);
        const snapshot = {
          ...frozenCardRulesFixture(canonicalJson.mode, previous),
          rulesetVersion: canonicalJson.version,
          productBibleVersion: canonicalJson.productBibleVersion,
          canonicalJson,
          sha256Hash: digest,
          canonicalSha256Hash: digest,
        };
        expect(
          persistedSeasonRulesetSchema.safeParse(canonicalJson).success,
        ).toBe(false);
        expect(
          resolveSeasonCardRules(snapshot, canonicalJson.mode).supported,
        ).toBe(false);
      }
    });

    it("fails closed for changed publication authority, missing policy or unimplemented additional rules", () => {
      const withoutPublication = Object.fromEntries(
        Object.entries(rules.markets.playerProps).filter(
          ([key]) => key !== "emptySlotPublication",
        ),
      );
      const invalidProps = [
        withoutPublication,
        {
          ...rules.markets.playerProps,
          emptySlotPublication: "AFTER_EVENT_CUTOFF",
        },
        {
          ...rules.markets.playerProps,
          menuFreeze: "REPLACE_ON_EVERY_REFRESH",
        },
        { ...rules.markets.playerProps, allowPublishedPlayerReplacement: true },
      ];
      for (const playerProps of invalidProps) {
        const canonicalJson = {
          ...rules,
          markets: { ...rules.markets, playerProps },
        };
        expect(seasonRulesetV15Schema.safeParse(canonicalJson).success).toBe(
          false,
        );
        expect(
          resolveSeasonCardRules(
            { ...frozenCardRulesFixture(rules.mode, rules), canonicalJson },
            rules.mode,
          ).supported,
        ).toBe(false);
      }
    });

    it("rejects mismatched Bible, mode, unknown future version and corrupted stored content", async () => {
      const snapshot = {
        ...frozenCardRulesFixture(rules.mode, rules),
        sha256Hash: hash,
        canonicalSha256Hash: hash,
      };
      const invalid = [
        { ...snapshot, productBibleVersion: "3.3" },
        {
          ...snapshot,
          productBibleVersion: "3.3",
          canonicalJson: { ...rules, productBibleVersion: "3.3" },
        },
        {
          ...snapshot,
          rulesetVersion: "1.6",
          canonicalJson: { ...rules, version: "1.6" },
        },
        { ...snapshot, mode: rules.mode === "LIVE" ? "SIMULATION" : "LIVE" },
        {
          ...snapshot,
          canonicalJson: { ...rules, seasonLabel: "Changed stored content" },
        },
      ];
      for (const candidate of invalid)
        expect(
          resolveSeasonCardRules(
            await withVerifiedRulesetHash(candidate),
            rules.mode,
          ).supported,
        ).toBe(false);
    });
  },
);
