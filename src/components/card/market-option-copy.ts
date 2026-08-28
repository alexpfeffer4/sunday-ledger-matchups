type MarketType = "MONEYLINE" | "SPREAD" | "TOTAL";
type OutcomeKey = "AWAY" | "HOME" | "OVER" | "UNDER";

type MarketOptionCopyInput = {
  americanOdds: number;
  awayTeam: string;
  fallbackLabel: string;
  homeTeam: string;
  lineMilli: number | null;
  marketType: MarketType;
  outcomeKey: OutcomeKey;
};

export function formatAmericanOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `−${Math.abs(odds)}`;
}

function formatMilliValue(value: number): string {
  return String(Math.abs(value) / 1_000);
}

function formatSpread(lineMilli: number): string {
  if (lineMilli === 0) return "PK";
  return `${lineMilli > 0 ? "+" : "−"}${formatMilliValue(lineMilli)}`;
}

export function marketOptionCopy({
  americanOdds,
  awayTeam,
  fallbackLabel,
  homeTeam,
  lineMilli,
  marketType,
  outcomeKey,
}: MarketOptionCopyInput): {
  accessibleLabel: string;
  primary: string;
  secondary: string;
} {
  const odds = formatAmericanOdds(americanOdds);
  const primary =
    outcomeKey === "AWAY"
      ? awayTeam
      : outcomeKey === "HOME"
        ? homeTeam
        : outcomeKey === "OVER"
          ? "Over"
          : outcomeKey === "UNDER"
            ? "Under"
            : fallbackLabel;

  if (marketType === "SPREAD" && lineMilli !== null) {
    const line = formatSpread(lineMilli);
    return {
      accessibleLabel: `${primary} ${line} ${odds}`,
      primary,
      secondary: `${line} · ${odds}`,
    };
  }

  if (marketType === "TOTAL" && lineMilli !== null) {
    const line = formatMilliValue(lineMilli);
    return {
      accessibleLabel: `${primary} ${line} ${odds}`,
      primary,
      secondary: `${line} · ${odds}`,
    };
  }

  return {
    accessibleLabel: `${primary} ${odds}`,
    primary,
    secondary: odds,
  };
}
