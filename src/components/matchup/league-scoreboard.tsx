import type { PairedMatchupDto } from "@/application/queries/project-paired-matchup";
import { formatCenticredits } from "@/domain/odds/american";

function score(value: number | null): string {
  return value === null ? "—" : formatCenticredits(BigInt(value), true);
}

export function LeagueScoreboard({ matchup }: { matchup: PairedMatchupDto }) {
  return (
    <aside
      aria-labelledby="league-scoreboard-heading"
      className="border-boundary bg-surface h-fit rounded-xl border p-5"
    >
      <p className="text-muted text-xs font-bold tracking-[0.08em] uppercase">
        Around the league
      </p>
      <h2 className="mt-1 text-lg font-bold" id="league-scoreboard-heading">
        Week {matchup.week.nflWeek} scoreboard
      </h2>
      <ol className="mt-4 space-y-3">
        {matchup.scoreboard.map((game) => (
          <li
            aria-current={game.selected ? "true" : undefined}
            className={`rounded-lg border p-3 ${game.selected ? "border-registry bg-selected" : "border-boundary bg-subtle"}`}
            key={game.id}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-muted text-xs font-semibold">
                {game.selected ? "Your matchup" : game.state}
              </p>
              {game.selected ? (
                <span className="text-registry text-xs font-bold">
                  {game.state}
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-semibold">
                {game.sideAName}
              </span>
              <span className="shrink-0 font-mono">
                {score(game.sideAScoreCenticredits)}
              </span>
            </div>
            <div className="border-boundary mt-2 flex justify-between gap-3 border-t pt-2 text-sm">
              <span className="min-w-0 truncate font-semibold">
                {game.sideBName}
              </span>
              <span className="shrink-0 font-mono">
                {score(game.sideBScoreCenticredits)}
              </span>
            </div>
          </li>
        ))}
      </ol>
      <a
        className="text-action mt-4 inline-flex min-h-11 items-center text-sm font-semibold hover:underline"
        href={`/l/${matchup.league.slug}/league`}
      >
        Open full league scoreboard
      </a>
    </aside>
  );
}
