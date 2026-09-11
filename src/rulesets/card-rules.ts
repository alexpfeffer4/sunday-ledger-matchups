import { z } from "zod";
import type { PersistedSeasonRuleset } from "@/rulesets/schema";

// Supported values, never defaults for an absent or unknown snapshot.
// New constraints require versioned compatibility here and in season_card_rules.
const snapshotSchema = z.object({
  rulesetId: z.string(),
  rulesetVersion: z.enum(["1.0", "1.1", "1.2"]),
  productBibleId: z.string(),
  productBibleVersion: z.string(),
  mode: z.enum(["LIVE", "SIMULATION"]),
  sha256Hash: z.string().regex(/^[0-9a-f]{64}$/),
  frozenAt: z.iso.datetime({ offset: true }),
  canonicalJson: z
    .object({
      id: z.string(),
      version: z.enum(["1.0", "1.1", "1.2"]),
      productBibleId: z.string(),
      productBibleVersion: z.string(),
      mode: z.enum(["LIVE", "SIMULATION"]),
      format: z.literal("SUNDAY_LEDGER_MATCHUPS"),
      sport: z.literal("NFL"),
    })
    .passthrough(),
});
const cardSchema = z
  .object({
    weeklyAllocationCredits: z.literal(1000),
    minimumStakeCredits: z.literal(50),
    minimumPositions: z.literal(1),
    maximumPositions: z.literal(20),
    stakePrecision: z.literal("WHOLE_CREDITS"),
  })
  .strict();
const concentrationSchema = z
  .object({
    heavyFavoriteThresholdAmerican: z.literal(-200),
    heavyFavoriteSinglePositionCapCredits: z.literal(750),
    standardSinglePositionCapCredits: z.literal(1000),
    eligibleOddsMinimum: z.null(),
    eligibleOddsMaximum: z.null(),
    aggregateFavoriteExposureCapCredits: z.null(),
  })
  .strict();
const marketsSchema = z
  .object({
    eligible: z.tuple([
      z.literal("MONEYLINE"),
      z.literal("SPREAD"),
      z.literal("TOTAL"),
    ]),
    referenceBook: z.literal("draftkings"),
  })
  .strict();
const historicalCardRulesSchema = z.object({
  card: cardSchema,
  concentration: concentrationSchema,
  markets: marketsSchema,
});
const atomicCardRulesSchema = historicalCardRulesSchema.extend({
  card: cardSchema.extend({
    carryoverCredits: z.literal(false),
    acceptanceUnit: z.literal("WHOLE_CARD_ATOMIC"),
    irreversibleAction: z.literal("CONFIRM_AND_SEAL_CARD"),
  }),
  concentration: concentrationSchema.extend({
    status: z.literal("SETTLED_FOR_POC_V1"),
  }),
});

export type CardRules = Pick<
  PersistedSeasonRuleset,
  "card" | "concentration" | "markets"
>;
export const unavailableCardRulesMessage =
  "These season rules are unavailable or unsupported. Card changes are paused. Your draft and sealed receipts are unchanged.";

export function resolveSeasonCardRules(
  snapshot: unknown,
  mode: "LIVE" | "SIMULATION",
):
  | { supported: true; rules: CardRules; version: "1.0" | "1.1" | "1.2" }
  | { supported: false; message: string } {
  const parsed = snapshotSchema.safeParse(snapshot);
  if (!parsed.success || parsed.data.mode !== mode) {
    return { supported: false, message: unavailableCardRulesMessage };
  }
  const stored = parsed.data;
  const canonical = stored.canonicalJson;
  const expectedId =
    mode === "LIVE"
      ? "SUNDAY-LEDGER-POC-SEASON-RULESET-V1"
      : "SUNDAY-LEDGER-SIMULATION-SEASON-RULESET-V1";
  if (
    stored.rulesetId !== canonical.id ||
    stored.rulesetVersion !== canonical.version ||
    stored.productBibleId !== canonical.productBibleId ||
    stored.productBibleVersion !== canonical.productBibleVersion ||
    stored.mode !== canonical.mode ||
    canonical.id !== expectedId ||
    canonical.productBibleId !== "SUNDAY-LEDGER-PRODUCT-BIBLE-V3" ||
    canonical.productBibleVersion !==
      (canonical.version === "1.2" ? "3.1" : "3.0")
  )
    return { supported: false, message: unavailableCardRulesMessage };

  // Strict raw blocks reject unimplemented additional constraints. We do not
  // reinterpret standings/playoff history or replace any snapshot with a bundle.
  const raw = (snapshot as { canonicalJson: unknown }).canonicalJson;
  const rules = (
    canonical.version === "1.0"
      ? historicalCardRulesSchema
      : atomicCardRulesSchema
  ).safeParse(raw);
  return rules.success
    ? { supported: true, rules: rules.data, version: canonical.version }
    : { supported: false, message: unavailableCardRulesMessage };
}
