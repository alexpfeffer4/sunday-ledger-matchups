import { createHash } from "node:crypto";
import {
  normalizedEventResultSchema,
  normalizedProviderEventWithMarketsSchema,
  type NormalizedEventResult,
  type NormalizedNflProvider,
  type NormalizedProviderEvent,
  type NormalizedProviderEventWithMarkets,
} from "@/application/providers/normalized-provider";

export const canonicalSimulationFixturePackId =
  "sunday-ledger-authoritative-2026-v1";
export const canonicalSimulationSeed = "phase-8c-canonical-seed-v1";

const teams = [
  "Arizona Firebirds",
  "Atlanta Talons",
  "Baltimore Admirals",
  "Boston Harbors",
  "Buffalo Stampede",
  "Carolina Copperheads",
  "Chicago Union",
  "Cincinnati Rivermen",
  "Cleveland Guardians",
  "Dallas Wranglers",
  "Denver Summit",
  "Detroit Motors",
  "Houston Comets",
  "Indianapolis Racers",
  "Jacksonville Tritons",
  "Kansas City Kings",
  "Las Vegas Outlaws",
  "Los Angeles Stars",
  "Memphis Hounds",
  "Miami Breakers",
  "Minnesota Northmen",
  "Nashville Sound",
  "New England Minutemen",
  "New Orleans Crescents",
  "New York Knights",
  "Orlando Orbits",
  "Philadelphia Founders",
  "Phoenix Scorpions",
  "Pittsburgh Forge",
  "San Francisco Gold",
  "Seattle Evergreens",
  "Washington Sentinels",
] as const;

export type SimulationScenario =
  | "WIN_LOSS"
  | "PUSH"
  | "VOID"
  | "REGULAR_EXACT_TIE"
  | "ONE_INCOMPLETE_CARD"
  | "BOTH_CARDS_INCOMPLETE"
  | "THIRD_REGULAR_MISS"
  | "PLAYOFF_EXACT_TIE"
  | "PLAYOFF_SINGLE_INCOMPLETE"
  | "PLAYOFF_DUAL_INCOMPLETE"
  | "POSTPONEMENT_48H_VOID"
  | "OBJECTIVE_CORRECTION"
  | "RESEEDING"
  | "ELIGIBLE_COUNTS_0_TO_6"
  | "SIX_SLOT_VACANCIES"
  | "BYE_EXHIBITIONS"
  | "EXHIBITION_MISSES"
  | "CHAMPION_FINALITY"
  | "WEEK_18"
  | "ARCHIVE_FINALITY"
  | "W17_CORRECTION_BEFORE_W18_SEAL"
  | "W17_CORRECTION_AFTER_W18_SEAL";

export type SimulationScenarioOverride = Readonly<{
  id: SimulationScenario;
  week: number;
  eventIndex?: number;
  note: string;
  rosterSizes?: readonly number[];
}>;

export const canonicalScenarioOverrides: readonly SimulationScenarioOverride[] =
  Object.freeze([
    {
      id: "WIN_LOSS",
      week: 1,
      eventIndex: 0,
      note: "Ordinary settled win/loss.",
    },
    {
      id: "PUSH",
      week: 2,
      eventIndex: 3,
      note: "Spread and total push evidence.",
    },
    {
      id: "VOID",
      week: 3,
      eventIndex: 2,
      note: "Provider void without a score.",
    },
    { id: "REGULAR_EXACT_TIE", week: 4, note: "Equal compliant card scores." },
    {
      id: "ONE_INCOMPLETE_CARD",
      week: 5,
      note: "One member misses common lock.",
    },
    {
      id: "BOTH_CARDS_INCOMPLETE",
      week: 6,
      note: "Both matchup cards miss common lock.",
    },
    {
      id: "THIRD_REGULAR_MISS",
      week: 14,
      note: "Third miss removes playoff eligibility.",
    },
    {
      id: "POSTPONEMENT_48H_VOID",
      week: 7,
      eventIndex: 3,
      note: "Final availability is kickoff plus exactly 48 hours.",
    },
    {
      id: "OBJECTIVE_CORRECTION",
      week: 8,
      eventIndex: 4,
      note: "A second scripted result supersedes the first.",
    },
    {
      id: "ELIGIBLE_COUNTS_0_TO_6",
      week: 14,
      note: "Targeted attendance fixtures cover all eligible counts.",
      rosterSizes: [4, 6, 8, 10, 12, 14, 16],
    },
    {
      id: "SIX_SLOT_VACANCIES",
      week: 15,
      note: "Four/five qualifiers retain explicit vacancies.",
      rosterSizes: [4, 6, 8, 10],
    },
    {
      id: "BYE_EXHIBITIONS",
      week: 15,
      note: "Seeded byes still receive cards and exhibition matchups.",
    },
    {
      id: "RESEEDING",
      week: 16,
      note: "Remaining qualifiers reseed after the prior round.",
    },
    {
      id: "PLAYOFF_EXACT_TIE",
      week: 16,
      note: "Higher seed advances an exact compliant tie.",
    },
    {
      id: "PLAYOFF_SINGLE_INCOMPLETE",
      week: 15,
      note: "Compliant card advances over one incomplete card.",
    },
    {
      id: "PLAYOFF_DUAL_INCOMPLETE",
      week: 17,
      note: "Higher seed advances dual incompletion.",
    },
    {
      id: "EXHIBITION_MISSES",
      week: 17,
      note: "Exhibition misses settle but do not affect advancement.",
    },
    {
      id: "CHAMPION_FINALITY",
      week: 17,
      note: "Champion closes only after the correction window.",
    },
    {
      id: "W17_CORRECTION_BEFORE_W18_SEAL",
      week: 17,
      eventIndex: 5,
      note: "Correction may replace unsealed Week 18 pairings.",
    },
    {
      id: "W17_CORRECTION_AFTER_W18_SEAL",
      week: 17,
      eventIndex: 5,
      note: "Correction preserves sealed Week 18 pairings.",
    },
    {
      id: "WEEK_18",
      week: 18,
      note: "Every member receives one final exhibition card.",
    },
    {
      id: "ARCHIVE_FINALITY",
      week: 18,
      note: "Archive derives after Week 18 is final.",
    },
  ] satisfies SimulationScenarioOverride[]);

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isoAt(base: Date, milliseconds: number): string {
  return new Date(base.getTime() + milliseconds).toISOString();
}

function buildMarkets(input: {
  awayTeam: string;
  homeTeam: string;
  observedAt: string;
  week: number;
  eventIndex: number;
}) {
  const favoriteAway = (input.week + input.eventIndex) % 2 === 0;
  const favoritePrice = -150 - input.week - input.eventIndex;
  const dogPrice = 125 + input.week + input.eventIndex;
  const awaySpread =
    (favoriteAway ? -1 : 1) *
    (1_000 +
      ((input.week * 3 + input.eventIndex) % 8) * 1_000 +
      (favoriteAway ? 500 : 0));
  const total =
    37_000 + ((input.week * 5 + input.eventIndex * 3) % 17) * 1_000 + 500;

  return [
    {
      sourceBook: "draftkings",
      marketType: "MONEYLINE",
      outcomeKey: "AWAY",
      proposition: `${input.awayTeam} to win`,
      lineMilli: null,
      americanOdds: favoriteAway ? favoritePrice : dogPrice,
      observedAt: input.observedAt,
    },
    {
      sourceBook: "draftkings",
      marketType: "MONEYLINE",
      outcomeKey: "HOME",
      proposition: `${input.homeTeam} to win`,
      lineMilli: null,
      americanOdds: favoriteAway ? dogPrice : favoritePrice,
      observedAt: input.observedAt,
    },
    {
      sourceBook: "draftkings",
      marketType: "SPREAD",
      outcomeKey: "AWAY",
      proposition: `${input.awayTeam} spread`,
      lineMilli: awaySpread,
      americanOdds: -110,
      observedAt: input.observedAt,
    },
    {
      sourceBook: "draftkings",
      marketType: "SPREAD",
      outcomeKey: "HOME",
      proposition: `${input.homeTeam} spread`,
      lineMilli: -awaySpread,
      americanOdds: -110,
      observedAt: input.observedAt,
    },
    {
      sourceBook: "draftkings",
      marketType: "TOTAL",
      outcomeKey: "OVER",
      proposition: `Over ${total / 1_000}`,
      lineMilli: total,
      americanOdds: -110,
      observedAt: input.observedAt,
    },
    {
      sourceBook: "draftkings",
      marketType: "TOTAL",
      outcomeKey: "UNDER",
      proposition: `Under ${total / 1_000}`,
      lineMilli: total,
      americanOdds: -110,
      observedAt: input.observedAt,
    },
  ] as const;
}

function eventTeams(week: number, eventIndex: number) {
  const awayIndex = (eventIndex * 2 + week - 1) % teams.length;
  const homeIndex =
    (teams.length - 1 - eventIndex * 2 + week - 1) % teams.length;
  return { awayTeam: teams[awayIndex], homeTeam: teams[homeIndex] };
}

function buildWeek(week: number) {
  const sunday = new Date(Date.UTC(2026, 8, 13 + (week - 1) * 7, 17));
  return Array.from({ length: 8 }, (_, eventIndex) => {
    const { awayTeam, homeTeam } = eventTeams(week, eventIndex);
    const kickoff = isoAt(sunday, (eventIndex % 4) * 65 * 60_000);
    const observedAt = isoAt(sunday, -60 * 60_000);
    return normalizedProviderEventWithMarketsSchema.parse({
      source: "SIMULATION_FIXTURE",
      externalEventId: `sim26-w${String(week).padStart(2, "0")}-e${String(eventIndex + 1).padStart(2, "0")}-${digest(`${week}:${eventIndex}`).slice(0, 8)}`,
      sportKey: "americanfootball_nfl",
      awayTeam,
      homeTeam,
      scheduledStartAt: kickoff,
      markets: buildMarkets({
        awayTeam,
        homeTeam,
        observedAt,
        week,
        eventIndex,
      }),
    });
  });
}

const weeks = new Map<number, readonly NormalizedProviderEventWithMarkets[]>(
  Array.from({ length: 18 }, (_, index) => {
    const week = index + 1;
    return [week, Object.freeze(buildWeek(week))] as const;
  }),
);

function resultVersions(
  event: NormalizedProviderEventWithMarkets,
  week: number,
  eventIndex: number,
): NormalizedEventResult[] {
  const kickoff = new Date(event.scheduledStartAt);
  const live = isoAt(kickoff, 5 * 60_000);
  const final = isoAt(
    kickoff,
    week === 7 && eventIndex === 3 ? 48 * 60 * 60_000 : 3.5 * 60 * 60_000,
  );
  const awayScore = 10 + ((week * 7 + eventIndex * 5) % 28);
  const homeScore = 10 + ((week * 11 + eventIndex * 3) % 28);
  const base = {
    source: "SIMULATION_FIXTURE" as const,
    externalEventId: event.externalEventId,
    sportKey: "americanfootball_nfl" as const,
    awayTeam: event.awayTeam,
    homeTeam: event.homeTeam,
    scheduledStartAt: event.scheduledStartAt,
  };
  const versions: NormalizedEventResult[] = [
    normalizedEventResultSchema.parse({
      ...base,
      version: 1,
      availableAt: live,
      status: "LIVE",
      completed: false,
      awayScore: 0,
      homeScore: 0,
      reason: "Scripted fixture event entered live state.",
    }),
    normalizedEventResultSchema.parse({
      ...base,
      version: 2,
      availableAt: final,
      status:
        (week === 3 && eventIndex === 2) || (week === 7 && eventIndex === 3)
          ? "VOID"
          : "FINAL",
      completed: true,
      awayScore:
        (week === 3 && eventIndex === 2) || (week === 7 && eventIndex === 3)
          ? null
          : awayScore,
      homeScore:
        (week === 3 && eventIndex === 2) || (week === 7 && eventIndex === 3)
          ? null
          : homeScore,
      reason:
        week === 7 && eventIndex === 3
          ? "Scripted 48-hour postponement boundary expired."
          : week === 3 && eventIndex === 2
            ? "Scripted provider void."
            : "Scripted final score became available.",
    }),
  ];
  if ((week === 8 && eventIndex === 4) || (week === 17 && eventIndex === 5)) {
    versions.push(
      normalizedEventResultSchema.parse({
        ...base,
        version: 3,
        availableAt: isoAt(kickoff, 30 * 60 * 60_000),
        status: "FINAL",
        completed: true,
        awayScore: homeScore,
        homeScore: awayScore,
        reason:
          week === 17
            ? "Scripted Week 17 objective correction."
            : "Scripted objective correction superseded the first final.",
      }),
    );
  }
  return versions;
}

export const canonicalSimulationManifestHash = digest(
  JSON.stringify({
    id: canonicalSimulationFixturePackId,
    seed: canonicalSimulationSeed,
    weeks: Array.from(weeks.values()),
    scenarios: canonicalScenarioOverrides,
  }),
);

export class SimulationFixtureAdapter implements NormalizedNflProvider {
  constructor(
    readonly packId: string = canonicalSimulationFixturePackId,
    readonly seed: string = canonicalSimulationSeed,
  ) {
    if (
      packId !== canonicalSimulationFixturePackId ||
      seed !== canonicalSimulationSeed
    ) {
      throw new Error(
        "Only the reviewed canonical Simulation fixture pack is available.",
      );
    }
  }

  async listEvents(week: number): Promise<readonly NormalizedProviderEvent[]> {
    return this.requireWeek(week).map((event) => ({
      source: event.source,
      externalEventId: event.externalEventId,
      sportKey: event.sportKey,
      awayTeam: event.awayTeam,
      homeTeam: event.homeTeam,
      scheduledStartAt: event.scheduledStartAt,
    }));
  }

  async listMainMarkets(
    week: number,
  ): Promise<readonly NormalizedProviderEventWithMarkets[]> {
    return this.requireWeek(week);
  }

  async getEventResults(
    week: number,
    availableAt: string,
  ): Promise<readonly NormalizedEventResult[]> {
    const cutoff = new Date(availableAt).getTime();
    if (!Number.isFinite(cutoff))
      throw new Error("Result availability time is invalid.");
    return this.requireWeek(week).flatMap((event, eventIndex) => {
      const available = resultVersions(event, week, eventIndex).filter(
        (result) => new Date(result.availableAt).getTime() <= cutoff,
      );
      return available.length === 0 ? [] : [available.at(-1)!];
    });
  }

  private requireWeek(week: number) {
    const fixtureWeek = weeks.get(week);
    if (!fixtureWeek)
      throw new Error("Simulation fixture week must be 1 through 18.");
    return fixtureWeek;
  }
}
