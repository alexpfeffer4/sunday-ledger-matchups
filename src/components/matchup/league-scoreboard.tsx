import Link from "next/link";
import { formatCenticredits } from "@/domain/odds/american";

export type LeagueScoreboardGame = {
  id: string;
  sideAName: string;
  sideBName: string;
  sideAScoreCenticredits: number | null;
  sideBScoreCenticredits: number | null;
  state: string;
  competition: string;
  selected: boolean;
};

function score(value: number | null): string {
  return value === null ? "—" : formatCenticredits(BigInt(value), true);
}

export function LeagueScoreboard({
  games,
  leagueSlug,
  showOverviewLink = true,
  week,
}: {
  games: LeagueScoreboardGame[];
  leagueSlug: string;
  showOverviewLink?: boolean;
  week: number;
}) {
  return (
    <section aria-labelledby="league-scoreboard-heading" className="h-fit">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-muted text-xs font-bold tracking-[0.08em] uppercase">
            Around the league
          </p>
          <h2 className="mt-1 text-lg font-bold" id="league-scoreboard-heading">
            Week {week} scoreboard
          </h2>
        </div>
      </div>
      <ol className="border-boundary bg-surface mt-3 divide-y overflow-hidden rounded-lg border">
        {games.map((game) => (
          <li
            aria-current={game.selected ? "true" : undefined}
            className={`px-4 py-3 ${game.selected ? "bg-registry/5 border-l-registry border-l-4" : ""}`}
            key={game.id}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-muted text-xs font-semibold">
                {game.selected ? "Your matchup" : game.competition}
              </p>
              <span className="text-graphite text-xs font-bold">
                {game.state}
              </span>
            </div>
            <dl className="mt-2 grid gap-2 text-sm">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                <dt className="min-w-0 font-semibold break-words">
                  {game.sideAName}
                </dt>
                <dd className="font-mono">
                  {score(game.sideAScoreCenticredits)}
                </dd>
              </div>
              <div className="border-boundary grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t pt-2">
                <dt className="min-w-0 font-semibold break-words">
                  {game.sideBName}
                </dt>
                <dd className="font-mono">
                  {score(game.sideBScoreCenticredits)}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ol>
      {showOverviewLink ? (
        <Link
          className="text-action mt-3 inline-flex min-h-11 items-center text-sm font-semibold hover:underline"
          href={`/l/${leagueSlug}/league`}
        >
          Open League Overview
        </Link>
      ) : null}
    </section>
  );
}
