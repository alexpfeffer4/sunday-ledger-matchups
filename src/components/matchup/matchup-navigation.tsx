"use client";

import type { LeagueScoreboardItem } from "@/application/queries/project-paired-matchup";

export type MatchupWeekOption = {
  week: number;
  href: string;
  current?: boolean;
};

export function MatchupNavigation({
  games,
  weeks,
}: {
  games: LeagueScoreboardItem[];
  weeks: MatchupWeekOption[];
}) {
  return (
    <nav className="matchup-navigation" aria-label="Browse matchups">
      <label className="min-w-0 text-xs font-semibold">
        Week
        <select
          className="border-control bg-surface mt-1 block min-h-11 w-full min-w-0 rounded-lg border px-3 text-sm"
          value={weeks.find((week) => week.current)?.href ?? ""}
          onChange={(event) => window.location.assign(event.target.value)}
        >
          {weeks.map((week) => (
            <option key={week.week} value={week.href}>
              Week {week.week}
              {week.current ? " · Current" : " · Result history"}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-0 text-xs font-semibold">
        Matchup
        <select
          className="border-control bg-surface mt-1 block min-h-11 w-full min-w-0 rounded-lg border px-3 text-sm"
          value={games.find((game) => game.selected)?.id ?? ""}
          onChange={(event) => {
            const game = games.find((game) => game.id === event.target.value);
            if (game?.href) window.location.assign(game.href);
          }}
        >
          {games
            .filter((game) => game.href || game.selected)
            .map((game) => (
              <option key={game.id} value={game.id}>
                {game.sideAName} vs. {game.sideBName}
                {game.own ? " · You" : ""}
              </option>
            ))}
        </select>
      </label>
    </nav>
  );
}
