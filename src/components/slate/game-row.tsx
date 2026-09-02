import Link from "next/link";
import type { SlateGameDto } from "@/application/queries/league-dtos";
import { formatCredits } from "@/domain/odds/american";

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `−${Math.abs(odds)}`;
}

export function GameRow({
  game,
  leagueSlug,
}: {
  game: SlateGameDto;
  leagueSlug: string;
}) {
  return (
    <article
      className="border-boundary bg-surface rounded-xl border"
      aria-labelledby={`game-${game.id}`}
    >
      <header className="border-boundary flex flex-col justify-between gap-2 border-b px-4 py-4 sm:flex-row sm:items-center sm:px-5">
        <div>
          <h2 id={`game-${game.id}`} className="font-bold">
            {game.awayTeam} at {game.homeTeam}
          </h2>
          <p className="text-graphite mt-1 text-sm">{game.kickoffLabel}</p>
        </div>
        <p className="text-muted text-xs font-medium">{game.updateLabel}</p>
      </header>
      <div className="divide-boundary divide-y">
        {game.markets.map((market) => (
          <section
            key={market.label}
            className="grid gap-3 px-4 py-4 sm:grid-cols-[84px_1fr] sm:items-start sm:px-5"
          >
            <p className="text-muted pt-1 text-xs font-bold tracking-[0.08em] uppercase">
              {market.label}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {market.outcomes.map((outcome) => (
                <Link
                  key={outcome.id}
                  href={`/l/${leagueSlug}/event/${game.id}?outcome=${outcome.id}`}
                  className="group border-control hover:border-registry hover:bg-subtle flex min-h-16 items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors"
                >
                  <span className="min-w-0">
                    <span className="group-hover:text-registry block truncate text-sm font-semibold">
                      {outcome.displayLine}
                    </span>
                    <span className="text-muted mt-1 block text-xs">
                      Up to {formatCredits(outcome.maximumStakeCredits)}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-sm font-semibold">
                    {formatOdds(outcome.americanOdds)}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
