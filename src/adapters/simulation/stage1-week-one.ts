import { z } from "zod";

const marketQualitySchema = z.enum([
  "HEALTHY",
  "STALE",
  "OUTLIER",
  "SUSPENDED",
  "PROVIDER_DEGRADED",
]);

const stage1MarketSchema = z.object({
  bookKey: z.string().min(1),
  marketType: z.enum(["MONEYLINE", "SPREAD", "TOTAL"]),
  outcomeKey: z.enum(["AWAY", "HOME", "OVER", "UNDER"]),
  proposition: z.string().min(1),
  lineMilli: z.number().int().nullable(),
  americanOdds: z
    .number()
    .int()
    .refine((odds) => odds !== 0),
  qualityStatus: marketQualitySchema,
  observedAt: z.iso.datetime(),
  eligible: z.boolean(),
});

const stage1EventSchema = z.object({
  key: z.string().min(1),
  awayTeam: z.string().min(1),
  homeTeam: z.string().min(1),
  scheduledStartAt: z.iso.datetime(),
  providerHealth: z.enum(["HEALTHY", "DEGRADED"]),
  markets: z.array(stage1MarketSchema).min(6),
});

export const stage1WeekOneFixtureSchema = z.object({
  id: z.literal("stage1-week-1-v1"),
  opensAt: z.iso.datetime(),
  commonLockAt: z.iso.datetime(),
  events: z.array(stage1EventSchema).length(8),
});

export type Stage1WeekOneFixture = z.infer<typeof stage1WeekOneFixtureSchema>;

export type Stage1FixtureResult = {
  eventKey: string;
  status: "FINAL" | "VOID";
  awayScore: number | null;
  homeScore: number | null;
  reason: string;
};

const opensAt = "2026-09-08T10:00:00.000Z";

type FixtureEventInput = {
  key: string;
  awayTeam: string;
  homeTeam: string;
  scheduledStartAt: string;
  awayMoneyline: number;
  homeMoneyline: number;
  awaySpreadMilli: number;
  totalMilli: number;
  providerHealth?: "HEALTHY" | "DEGRADED";
  degradedMarket?: "MONEYLINE" | "SPREAD" | "TOTAL";
  degradedQuality?: z.infer<typeof marketQualitySchema>;
};

function primaryMarkets(input: FixtureEventInput) {
  const quality = (marketType: "MONEYLINE" | "SPREAD" | "TOTAL") =>
    input.degradedMarket === marketType
      ? (input.degradedQuality ?? "PROVIDER_DEGRADED")
      : "HEALTHY";

  return [
    {
      bookKey: "draftkings",
      marketType: "MONEYLINE" as const,
      outcomeKey: "AWAY" as const,
      proposition: `${input.awayTeam} to win`,
      lineMilli: null,
      americanOdds: input.awayMoneyline,
      qualityStatus: quality("MONEYLINE"),
      observedAt: opensAt,
      eligible: true,
    },
    {
      bookKey: "draftkings",
      marketType: "MONEYLINE" as const,
      outcomeKey: "HOME" as const,
      proposition: `${input.homeTeam} to win`,
      lineMilli: null,
      americanOdds: input.homeMoneyline,
      qualityStatus: quality("MONEYLINE"),
      observedAt: opensAt,
      eligible: true,
    },
    {
      bookKey: "draftkings",
      marketType: "SPREAD" as const,
      outcomeKey: "AWAY" as const,
      proposition: `${input.awayTeam} ${input.awaySpreadMilli > 0 ? "+" : ""}${input.awaySpreadMilli / 1000}`,
      lineMilli: input.awaySpreadMilli,
      americanOdds: -110,
      qualityStatus: quality("SPREAD"),
      observedAt: opensAt,
      eligible: true,
    },
    {
      bookKey: "draftkings",
      marketType: "SPREAD" as const,
      outcomeKey: "HOME" as const,
      proposition: `${input.homeTeam} ${-input.awaySpreadMilli > 0 ? "+" : ""}${-input.awaySpreadMilli / 1000}`,
      lineMilli: -input.awaySpreadMilli,
      americanOdds: -110,
      qualityStatus: quality("SPREAD"),
      observedAt: opensAt,
      eligible: true,
    },
    {
      bookKey: "draftkings",
      marketType: "TOTAL" as const,
      outcomeKey: "OVER" as const,
      proposition: `Over ${input.totalMilli / 1000}`,
      lineMilli: input.totalMilli,
      americanOdds: -110,
      qualityStatus: quality("TOTAL"),
      observedAt: opensAt,
      eligible: true,
    },
    {
      bookKey: "draftkings",
      marketType: "TOTAL" as const,
      outcomeKey: "UNDER" as const,
      proposition: `Under ${input.totalMilli / 1000}`,
      lineMilli: input.totalMilli,
      americanOdds: -110,
      qualityStatus: quality("TOTAL"),
      observedAt: opensAt,
      eligible: true,
    },
    {
      bookKey: "fanduel",
      marketType: "MONEYLINE" as const,
      outcomeKey: "HOME" as const,
      proposition: `${input.homeTeam} comparison quote`,
      lineMilli: null,
      americanOdds: input.homeMoneyline - 5,
      qualityStatus: "OUTLIER" as const,
      observedAt: opensAt,
      eligible: false,
    },
  ];
}

function event(input: FixtureEventInput) {
  return {
    key: input.key,
    awayTeam: input.awayTeam,
    homeTeam: input.homeTeam,
    scheduledStartAt: input.scheduledStartAt,
    providerHealth: input.providerHealth ?? ("HEALTHY" as const),
    markets: primaryMarkets(input),
  };
}

export const stage1WeekOneFixture = stage1WeekOneFixtureSchema.parse({
  id: "stage1-week-1-v1",
  opensAt,
  commonLockAt: "2026-09-13T16:55:00.000Z",
  events: [
    event({
      key: "buf-nyj",
      awayTeam: "Buffalo",
      homeTeam: "New York",
      scheduledStartAt: "2026-09-13T17:00:00.000Z",
      awayMoneyline: -160,
      homeMoneyline: 140,
      awaySpreadMilli: -3000,
      totalMilli: 44000,
    }),
    event({
      key: "bal-cle",
      awayTeam: "Baltimore",
      homeTeam: "Cleveland",
      scheduledStartAt: "2026-09-13T17:00:00.000Z",
      awayMoneyline: -225,
      homeMoneyline: 190,
      awaySpreadMilli: -4500,
      totalMilli: 41500,
      degradedMarket: "TOTAL",
      degradedQuality: "STALE",
    }),
    event({
      key: "mia-ne",
      awayTeam: "Miami",
      homeTeam: "New England",
      scheduledStartAt: "2026-09-13T17:00:00.000Z",
      awayMoneyline: -200,
      homeMoneyline: 170,
      awaySpreadMilli: -3500,
      totalMilli: 45500,
      degradedMarket: "MONEYLINE",
      degradedQuality: "OUTLIER",
    }),
    event({
      key: "pit-cin",
      awayTeam: "Pittsburgh",
      homeTeam: "Cincinnati",
      scheduledStartAt: "2026-09-13T17:00:00.000Z",
      awayMoneyline: 115,
      homeMoneyline: -135,
      awaySpreadMilli: 1500,
      totalMilli: 42500,
      degradedMarket: "SPREAD",
      degradedQuality: "SUSPENDED",
    }),
    event({
      key: "kc-den",
      awayTeam: "Kansas City",
      homeTeam: "Denver",
      scheduledStartAt: "2026-09-13T20:25:00.000Z",
      awayMoneyline: -205,
      homeMoneyline: 175,
      awaySpreadMilli: -3500,
      totalMilli: 47500,
      providerHealth: "DEGRADED",
      degradedMarket: "MONEYLINE",
      degradedQuality: "PROVIDER_DEGRADED",
    }),
    event({
      key: "sf-sea",
      awayTeam: "San Francisco",
      homeTeam: "Seattle",
      scheduledStartAt: "2026-09-13T20:25:00.000Z",
      awayMoneyline: -115,
      homeMoneyline: -105,
      awaySpreadMilli: -1000,
      totalMilli: 46500,
    }),
    event({
      key: "dal-phi",
      awayTeam: "Dallas",
      homeTeam: "Philadelphia",
      scheduledStartAt: "2026-09-14T00:20:00.000Z",
      awayMoneyline: 150,
      homeMoneyline: -175,
      awaySpreadMilli: 3000,
      totalMilli: 48500,
    }),
    event({
      key: "gb-chi",
      awayTeam: "Green Bay",
      homeTeam: "Chicago",
      scheduledStartAt: "2026-09-15T00:15:00.000Z",
      awayMoneyline: -125,
      homeMoneyline: 105,
      awaySpreadMilli: -1500,
      totalMilli: 43000,
    }),
  ],
});

export const stage1InitialResults: readonly Stage1FixtureResult[] = [
  {
    eventKey: "buf-nyj",
    status: "FINAL",
    awayScore: 24,
    homeScore: 20,
    reason: "Deterministic Stage 1 final",
  },
  {
    eventKey: "bal-cle",
    status: "FINAL",
    awayScore: 27,
    homeScore: 17,
    reason: "Deterministic Stage 1 final",
  },
  {
    eventKey: "mia-ne",
    status: "FINAL",
    awayScore: 21,
    homeScore: 24,
    reason: "Deterministic Stage 1 final",
  },
  {
    eventKey: "pit-cin",
    status: "VOID",
    awayScore: null,
    homeScore: null,
    reason: "Deterministic unplayed administrative void",
  },
  {
    eventKey: "kc-den",
    status: "FINAL",
    awayScore: 30,
    homeScore: 21,
    reason: "Deterministic Stage 1 final",
  },
  {
    eventKey: "sf-sea",
    status: "FINAL",
    awayScore: 23,
    homeScore: 20,
    reason: "Deterministic Stage 1 final",
  },
  {
    eventKey: "dal-phi",
    status: "FINAL",
    awayScore: 17,
    homeScore: 31,
    reason: "Deterministic Stage 1 final",
  },
  {
    eventKey: "gb-chi",
    status: "FINAL",
    awayScore: 20,
    homeScore: 23,
    reason: "Deterministic Stage 1 final",
  },
];

export const stage1CorrectionResult: Stage1FixtureResult = {
  eventKey: "buf-nyj",
  status: "FINAL",
  awayScore: 20,
  homeScore: 24,
  reason: "Visible Stage 1 correction replay",
};
