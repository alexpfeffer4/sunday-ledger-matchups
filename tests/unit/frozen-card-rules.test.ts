import { describe, expect, it } from "vitest";
import { resolveSeasonCardRules } from "@/rulesets/card-rules";
import { validateDraftCard } from "@/domain/cards/validate-card-draft";
import { frozenCardRulesFixture } from "../fixtures/card-rules";

function fixture(version: "1.0" | "1.1" | "1.2", mode: "LIVE" | "SIMULATION") {
  const snapshot = frozenCardRulesFixture(mode);
  const bible = version === "1.2" ? "3.1" : "3.0";
  const canonical = snapshot.canonicalJson;
  return {
    ...snapshot, rulesetVersion: version, productBibleVersion: bible,
    canonicalJson: {
      ...canonical, version, productBibleVersion: bible,
      card: version === "1.0" ? Object.fromEntries(Object.entries(canonical.card)
        .filter(([key]) => !["carryoverCredits", "acceptanceUnit", "irreversibleAction"].includes(key))) : canonical.card,
      concentration: version === "1.0" ? Object.fromEntries(Object.entries(canonical.concentration)
        .filter(([key]) => key !== "status")) : canonical.concentration,
    },
  };
}

describe.each(["LIVE", "SIMULATION"] as const)("%s frozen card compatibility", mode => {
  it.each(["1.0", "1.1", "1.2"] as const)("uses V%s limits without changing its snapshot", version => {
    const snapshot = fixture(version, mode);
    const before = JSON.stringify(snapshot);
    const resolved = resolveSeasonCardRules(snapshot, mode);
    expect(resolved.supported).toBe(true);
    if (!resolved.supported) throw new Error(resolved.message);
    expect(resolved.version).toBe(version);
    const pick = (eventId: string, stakeCredits: number, americanOdds = -200) => ({
      eventId, stakeCredits, americanOdds, marketType: "MONEYLINE" as const,
    });
    const cases = [
      { picks: [pick("a", 1000)], accepted: true },
      { picks: [pick("a", 1000, -201)], accepted: false },
      { picks: [pick("a", 750, -201), pick("b", 250)], accepted: true },
      { picks: [pick("a", 751, -201), pick("b", 249)], accepted: false },
      { picks: [pick("a", 49), pick("b", 951)], accepted: false },
      { picks: [pick("a", 500.5), pick("b", 499.5)], accepted: false },
      { picks: [pick("a", 999)], accepted: false },
      { picks: [pick("a", 500), pick("a", 500)], accepted: false },
      { picks: Array.from({length: 20}, (_, i) => pick(String(i), 50)), accepted: true },
      { picks: Array.from({length: 21}, (_, i) => pick(String(i), 50)), accepted: false },
      { picks: [pick("a", 1000, 10000)], accepted: true },
    ];
    for (const testCase of cases) expect(validateDraftCard({
      draftPositions: testCase.picks,
      eligibleOpportunities: testCase.picks,
      ruleset: resolved.rules,
    }).accepted, JSON.stringify(testCase.picks)).toBe(testCase.accepted);
    expect(JSON.stringify(snapshot)).toBe(before);
  });
});

it("fails closed on unknown, missing, changed, extra, unfrozen and mismatched context", () => {
  const valid = fixture("1.2", "LIVE");
  const invalid = [
    undefined, null, {}, { ...valid, frozenAt: null },
    { ...valid, rulesetVersion: "9.0" },
    { ...valid, rulesetId: "FORGED" },
    { ...valid, mode: "SIMULATION" },
    { ...valid, productBibleVersion: "3.0" },
    { ...valid, canonicalJson: { ...valid.canonicalJson, version: "1.1" } },
    { ...valid, canonicalJson: { ...valid.canonicalJson, card: { ...valid.canonicalJson.card, maximumPositions: 21 } } },
    { ...valid, canonicalJson: { ...valid.canonicalJson, card: { ...valid.canonicalJson.card, minimumStakeCredits: "50" } } },
    { ...valid, canonicalJson: { ...valid.canonicalJson, card: { ...valid.canonicalJson.card, newConstraint: true } } },
    { ...valid, canonicalJson: { ...valid.canonicalJson, concentration: { ...valid.canonicalJson.concentration, heavyFavoriteThresholdAmerican: -201 } } },
    { ...valid, canonicalJson: { ...valid.canonicalJson, markets: { eligible: ["TOTAL", "TOTAL", "TOTAL"], referenceBook: "draftkings" } } },
  ];
  for (const snapshot of invalid) expect(resolveSeasonCardRules(snapshot, "LIVE").supported).toBe(false);
});

it("does not convert V1.1 standings or receipts into current rules", () => {
  const snapshot = fixture("1.1", "LIVE");
  snapshot.canonicalJson.standings = {
    tiebreakOrder: ["MATCHUP_WIN_PERCENTAGE", "POINTS_FOR", "ALL_PLAY_PERCENTAGE", "BALANCED_HEAD_TO_HEAD", "FEWER_ATTENDANCE_MISSES", "HIGHEST_SINGLE_WEEK_SCORE", "STORED_DETERMINISTIC_RANDOM"],
  };
  const before = JSON.stringify(snapshot);
  expect(resolveSeasonCardRules(snapshot, "LIVE").supported).toBe(true);
  expect(JSON.stringify(snapshot)).toBe(before);
});
