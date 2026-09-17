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
  own?: boolean;
  href?: string;
};

function score(value: number | null): string {
  return value === null ? "—" : formatCenticredits(BigInt(value), true);
}

export function LeagueScoreboard({
  games,
  leagueSlug,
  showOverviewLink = true,
  onOverview = false,
  week,
}: {
  games: LeagueScoreboardGame[];
  leagueSlug: string;
  showOverviewLink?: boolean;
  onOverview?: boolean;
  week: number;
}) {
  return (
    <section
      aria-labelledby="league-scoreboard-heading"
      className="league-scoreboard h-fit"
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold" id="league-scoreboard-heading">
            Week {week} scoreboard
          </h2>
        </div>
      </div>
      <ol className="border-boundary divide-boundary bg-surface mt-3 divide-y overflow-hidden rounded-lg border">
        {games.map((game) => (
          <li
            aria-current={game.selected && !onOverview ? "true" : undefined}
            className={`${game.selected ? "bg-registry/5 border-l-registry border-l-4" : ""}`}
            key={game.id}
          >
            <ScoreboardRowLink game={game}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted text-xs font-semibold">
                  {(game.own ?? game.selected)
                    ? "Your matchup"
                    : game.competition}
                </p>
                <span className="text-graphite text-xs font-bold">
                  {game.state}
                </span>
              </div>
              <dl className="scoreboard-facts mt-2 grid gap-2 text-sm">
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
              {game.href ? (
                <p className="text-action mt-2 text-xs font-semibold">
                  {onOverview && (game.own ?? game.selected)
                    ? "View your matchup →"
                    : game.selected && !onOverview
                      ? "Viewing matchup"
                      : "View matchup →"}
                </p>
              ) : null}
            </ScoreboardRowLink>
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

function ScoreboardRowLink({
  game,
  children,
}: {
  game: LeagueScoreboardGame;
  children: React.ReactNode;
}) {
  return game.href ? (
    <Link
      href={game.href}
      prefetch={false}
      aria-label={`View ${game.sideAName} versus ${game.sideBName}`}
      className="hover:bg-registry/5 focus-visible:outline-registry block px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-[-3px]"
    >
      {children}
    </Link>
  ) : (
    <div className="px-4 py-3">{children}</div>
  );
}
