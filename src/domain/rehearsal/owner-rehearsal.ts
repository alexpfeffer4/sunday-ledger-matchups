export const ownerRehearsalCheckpoints = [
  "FORMATION_EMPTY",
  "FORMATION_READY",
  "WEEK_1_OPEN",
  "WEEK_1_PARTIAL",
  "WEEK_1_PROVISIONAL",
  "WEEK_1_FINAL",
  "WEEK_2_OPEN",
  "WEEK_2_FINAL",
  "WEEK_5_OPEN",
  "WEEK_5_FINAL",
  "WEEK_8_OPEN",
  "WEEK_8_PROVISIONAL",
  "WEEK_8_CORRECTED",
  "WEEK_14_OPEN",
  "WEEK_14_FINAL",
  "WEEK_15_OPEN",
  "WEEK_15_FINAL",
  "WEEK_16_OPEN",
  "WEEK_16_FINAL",
  "WEEK_17_OPEN",
  "WEEK_17_CHAMPION",
  "WEEK_18_OPEN",
  "COMPLETE",
] as const;

export type OwnerRehearsalCheckpoint =
  (typeof ownerRehearsalCheckpoints)[number];

export const ownerRehearsalBotNames = [
  "Cedar Eleven",
  "Harbor Eleven",
  "Northline Eleven",
  "Orchard Eleven",
  "Summit Eleven",
  "Riverlight Eleven",
  "Westfield Eleven",
  "Stonebridge Eleven",
  "Pine Eleven",
] as const;

export type OwnerRehearsalTask = "Commissioner task" | "Member task";

export type OwnerRehearsalGuideStep = {
  action: string;
  advanceLabel?: string;
  confirmation?: string;
  detail: string;
  href?: (slug: string) => string;
  linkLabel?: string;
  task: OwnerRehearsalTask;
  title: string;
};

const commissioner = "Commissioner task" as const;
const member = "Member task" as const;

export const ownerRehearsalGuide: Record<
  OwnerRehearsalCheckpoint,
  OwnerRehearsalGuideStep
> = {
  FORMATION_EMPTY: {
    action: "Fill the nine open seats with rehearsal teams.",
    detail:
      "A Live league would use private invitations. Here, one explicit action adds nine neutral teams without emailing anyone or creating sign-ins.",
    task: commissioner,
    title: "See formation before roster lock",
  },
  FORMATION_READY: {
    action: "Lock the 10-member roster and publish Week 1.",
    advanceLabel: "Lock roster and open Week 1",
    confirmation:
      "This freezes the roster, Ruleset, and 14-week schedule just as a Live commissioner action would.",
    detail:
      "Review the full roster and frozen Ruleset first. The next step creates the deterministic 14-week matchup schedule and opens real cards.",
    href: (slug) => `/l/${slug}/league`,
    linkLabel: "Review league and roster",
    task: commissioner,
    title: "Freeze the season foundation",
  },
  WEEK_1_OPEN: {
    action: "Build, review, and seal your complete 1,000-credit card.",
    advanceLabel: "Lock cards and begin partial reveal",
    confirmation:
      "Advancing locks every card and begins the first games. An unsealed owner card would become incomplete.",
    detail:
      "This is the ordinary member workflow. Your card becomes final only when every position is accepted together and its receipt is issued.",
    href: (slug) => `/l/${slug}/card`,
    linkLabel: "Make my Week 1 card",
    task: member,
    title: "Practice the weekly card loop",
  },
  WEEK_1_PARTIAL: {
    action: "Open Matchup and compare the revealed positions.",
    advanceLabel: "Finish games and show provisional result",
    detail:
      "Only games that have started reveal their positions. Commissioner status never unlocks future bot picks.",
    href: (slug) => `/l/${slug}/matchup`,
    linkLabel: "See partial reveal",
    task: member,
    title: "Watch event-timed reveal",
  },
  WEEK_1_PROVISIONAL: {
    action: "Review the provisional matchup, then close its correction window.",
    advanceLabel: "Finalize Week 1",
    confirmation:
      "Finalization closes the correction window and makes this weekly result official.",
    detail:
      "Provisional means all known games are scored but the correction window remains open. Final makes the weekly result official.",
    href: (slug) => `/l/${slug}/matchup`,
    linkLabel: "Review provisional result",
    task: commissioner,
    title: "Understand result finality",
  },
  WEEK_1_FINAL: {
    action: "Open Week 2 and see how quote review protects a card.",
    advanceLabel: "Open Week 2",
    detail:
      "The finished matchup now feeds standings and history. A real season repeats this handoff each week.",
    href: (slug) => `/l/${slug}/standings`,
    linkLabel: "See updated standings",
    task: commissioner,
    title: "Hand off to the next week",
  },
  WEEK_2_OPEN: {
    action:
      "Choose a card path; the first confirmation presents an updated quote.",
    advanceLabel: "Finalize Week 2",
    confirmation:
      "Advancing locks the reviewed Week 2 card, completes the games, and finalizes the push lesson.",
    detail:
      "A deterministic quote changes before sealing. The changed terms are never accepted silently; review and confirm again with the same stable attempt.",
    href: (slug) => `/l/${slug}/card`,
    linkLabel: "Review Week 2 card",
    task: member,
    title: "Review a changed quote",
  },
  WEEK_2_FINAL: {
    action: "Move through Weeks 3–4 and open Week 5.",
    advanceLabel: "Run Weeks 3–4 and open Week 5",
    detail:
      "The guide uses valid sample cards for repetition. Week 3 includes a void, and every skipped week still runs the complete authoritative lifecycle.",
    task: commissioner,
    title: "See push and void treatment",
  },
  WEEK_5_OPEN: {
    action: "Choose your Week 5 card, then complete the week.",
    advanceLabel: "Finalize Week 5",
    confirmation:
      "One rehearsal team intentionally leaves this week incomplete so you can see the visible consequence without missing your own card.",
    detail:
      "One neutral team records an attendance miss. Its hidden card content remains private; only the normal completion consequence is visible.",
    href: (slug) => `/l/${slug}/card`,
    linkLabel: "Make or sample my card",
    task: member,
    title: "Learn incomplete-card consequences",
  },
  WEEK_5_FINAL: {
    action: "Run Weeks 6–7 and open the correction lesson.",
    advanceLabel: "Run Weeks 6–7 and open Week 8",
    detail:
      "A later third attendance miss will make one bot ineligible. Your own participation remains under your control.",
    href: (slug) => `/l/${slug}/standings`,
    linkLabel: "Review attendance and standings",
    task: commissioner,
    title: "Connect attendance to eligibility",
  },
  WEEK_8_OPEN: {
    action: "Choose your Week 8 card and produce a provisional result.",
    advanceLabel: "Show provisional Week 8 result",
    confirmation:
      "The next result is intentionally provisional so the correction can be examined before finalization.",
    detail:
      "This week pauses before finality so you can see the original result and the later correction as separate versions.",
    href: (slug) => `/l/${slug}/card`,
    linkLabel: "Make or sample my card",
    task: member,
    title: "Set up a correction lesson",
  },
  WEEK_8_PROVISIONAL: {
    action: "Review the original result, then record the fixture correction.",
    advanceLabel: "Apply Week 8 correction",
    detail:
      "A correction appends a new result version. It does not erase the original provider fact or overwrite the audit trail.",
    href: (slug) => `/l/${slug}/matchup`,
    linkLabel: "Review original result",
    task: commissioner,
    title: "Compare provisional and corrected",
  },
  WEEK_8_CORRECTED: {
    action:
      "Inspect the corrected matchup, then move to the regular-season finale.",
    advanceLabel: "Finalize through Week 14",
    confirmation:
      "This completes Week 8, runs normal Weeks 9–13, and opens Week 14 through the same weekly lifecycle.",
    detail:
      "The prior version remains in Audit details while the corrected version drives settlement. Weeks 9–13 then run with valid sample cards.",
    href: (slug) => `/l/${slug}/matchup`,
    linkLabel: "See corrected result",
    task: commissioner,
    title: "Keep history append-only",
  },
  WEEK_14_OPEN: {
    action:
      "Choose the final regular-season card and confirm the playoff field.",
    advanceLabel: "Finalize Week 14 and playoff field",
    confirmation:
      "This finalizes official regular-season standings and creates the six-member playoff field with two first-round byes.",
    detail:
      "Points For and all-play resolve meaningful ties. One bot’s third miss demonstrates the frozen attendance eligibility rule.",
    href: (slug) => `/l/${slug}/card`,
    linkLabel: "Make or sample my Week 14 card",
    task: member,
    title: "Finish the official standings",
  },
  WEEK_14_FINAL: {
    action: "Review the six qualifiers and open the first playoff round.",
    advanceLabel: "Open Week 15 playoffs",
    detail:
      "Seeds 1 and 2 receive byes. Championship, placement, and bye-member exhibition scopes remain visibly distinct.",
    href: (slug) => `/l/${slug}/playoffs`,
    linkLabel: "Review playoff field",
    task: commissioner,
    title: "Move from standings to bracket",
  },
  WEEK_15_OPEN: {
    action: "Choose a Week 15 card, then settle the opening playoff round.",
    advanceLabel: "Finalize Week 15",
    confirmation:
      "This locks and settles every scheduled Week 15 scope through the normal receipt lifecycle.",
    detail:
      "The bracket advances winners while placement and exhibition matchups remain outside champion finality.",
    href: (slug) => `/l/${slug}/card`,
    linkLabel: "Make or sample my card",
    task: member,
    title: "Play the first postseason round",
  },
  WEEK_15_FINAL: {
    action: "Open the semifinals.",
    advanceLabel: "Open Week 16 semifinals",
    detail:
      "The two bye seeds now enter. Frozen qualification seeds determine the semifinal bracket without changing the Week 14 standings.",
    href: (slug) => `/l/${slug}/playoffs`,
    linkLabel: "See bracket advancement",
    task: commissioner,
    title: "Bring the bye teams into play",
  },
  WEEK_16_OPEN: {
    action: "Choose a semifinal card, then settle the round.",
    advanceLabel: "Finalize Week 16",
    confirmation:
      "This locks every semifinal scope and advances the championship bracket through the frozen Ruleset.",
    detail:
      "The Week 15 single-incomplete edge has already shown deterministic advancement. Sealed semifinal positions remain event-timed before settlement.",
    href: (slug) => `/l/${slug}/card`,
    linkLabel: "Make or sample my card",
    task: member,
    title: "See seeded semifinal advancement",
  },
  WEEK_16_FINAL: {
    action: "Review the finalists and open Championship Week.",
    advanceLabel: "Open Week 17 championship",
    detail:
      "Week 17 includes championship, third-place, placement, and exhibition scopes without mixing their records.",
    href: (slug) => `/l/${slug}/playoffs`,
    linkLabel: "Review the final-round bracket",
    task: commissioner,
    title: "Prepare champion finality",
  },
  WEEK_17_OPEN: {
    action: "Choose a Week 17 card and finalize the champion.",
    advanceLabel: "Finalize Week 17 champion",
    confirmation:
      "The champion and placements become final here. Week 18 remains exhibition-only and cannot alter them.",
    detail:
      "This is the last competitive round. Every scope settles normally, then one champion is frozen from the championship path.",
    href: (slug) => `/l/${slug}/card`,
    linkLabel: "Make or sample my card",
    task: member,
    title: "Complete Championship Week",
  },
  WEEK_17_CHAMPION: {
    action: "Inspect the final champion, then open Week 18 exhibition.",
    advanceLabel: "Open Week 18 exhibition",
    detail:
      "The champion is already final. Week 18 gives every member one last card but cannot change placement, eligibility, official records, Points For, or all-play.",
    href: (slug) => `/l/${slug}/playoffs`,
    linkLabel: "See champion finality",
    task: commissioner,
    title: "Separate champion from exhibition",
  },
  WEEK_18_OPEN: {
    action: "Choose the exhibition card, then publish the final archive.",
    advanceLabel: "Finish Week 18 and archive",
    confirmation:
      "This settles exhibition cards and makes the season archive final without changing the Week 17 champion or official standings.",
    detail:
      "Every member participates, but exhibition outcomes remain outside official records and rivalry totals. Archive finality waits until this week ends.",
    href: (slug) => `/l/${slug}/card`,
    linkLabel: "Make or sample my exhibition card",
    task: member,
    title: "Finish without rewriting the season",
  },
  COMPLETE: {
    action: "Explore the final archive or safely reset this rehearsal.",
    detail:
      "You practiced the real cadence: publish, make cards, lock together, reveal by kickoff, settle provisionally, correct when needed, and finalize.",
    href: (slug) => `/l/${slug}/history`,
    linkLabel: "Open season history",
    task: commissioner,
    title: "Rehearsal complete",
  },
};

export function ownerRehearsalSamplePlan(seed: string, week: number) {
  const specialEventOrdinals: Record<number, number> = {
    2: 4,
    3: 3,
    8: 5,
    17: 6,
  };
  const ordinal = specialEventOrdinals[week] ?? 1;
  const side =
    week === 1 && parseInt(seed.slice(-2), 16) % 2 === 0 ? "HOME" : "AWAY";
  return {
    eventOrdinal: ordinal,
    marketType: week === 2 ? "SPREAD" : "MONEYLINE",
    side,
    stakeCredits: 1_000,
  } as const;
}

export function ownerRehearsalBotCardPlan(week: number, botNumber: number) {
  const cardSeed = botNumber + 1;
  const marketType = ["MONEYLINE", "SPREAD", "TOTAL"] as const;
  const selectedMarket = marketType[(week + cardSeed) % marketType.length];
  return {
    eventOrdinal: 1 + ((week + cardSeed * 3) % 8),
    marketType: selectedMarket,
    side:
      selectedMarket === "TOTAL"
        ? (week + cardSeed) % 2 === 0
          ? "OVER"
          : "UNDER"
        : (week + cardSeed) % 2 === 0
          ? "HOME"
          : "AWAY",
    stakeCredits: 1_000,
  } as const;
}
