import Link from "next/link";
import type {
  PairedMatchupDto,
  PositionLedgerSection,
} from "@/application/queries/project-paired-matchup";
import type { ReactNode } from "react";
import { LeagueScoreboard } from "@/components/matchup/league-scoreboard";
import { PairedMatchupHeader } from "@/components/matchup/paired-matchup-header";
import { PositionLedgerRow } from "@/components/matchup/position-ledger-row";
import { ScorePath } from "@/components/matchup/score-path";
import { PageFrame } from "@/components/league/page-frame";
import { SelectedGameList } from "@/components/matchup/selected-game-list";

const sections: Array<{
  id: PositionLedgerSection;
  title: string;
  empty: string;
}> = [
  {
    id: "SETTLED",
    title: "Settled",
    empty: "No picks have settled yet.",
  },
  {
    id: "IN_PROGRESS",
    title: "In progress",
    empty: "No picks are in progress.",
  },
  {
    id: "REMAINING",
    title: "Remaining",
    empty: "No visible picks are waiting to start.",
  },
];

export function PairedMatchupView({
  matchup,
  refreshControl,
  weeklyClose,
  cardProgress,
}: {
  matchup: PairedMatchupDto;
  refreshControl: ReactNode;
  weeklyClose?: ReactNode;
  cardProgress?: ReactNode;
}) {
  const pregame = matchup.phase === "PREGAME";
  const completed =
    matchup.resultStatus === "FINAL" || matchup.phase === "FINAL";
  return (
    <PageFrame
      dark={matchup.broadcast}
      description={
        pregame
          ? undefined
          : completed
            ? matchup.spectator
              ? "The result and the picks behind it."
              : "Your result, its season impact, and the picks behind it."
            : "Picks reveal after a confirmed start. Scores update after results are checked."
      }
      eyebrow={`${matchup.league.name} · ${matchup.league.mode === "LIVE" ? "Live season" : "Practice/test · Simulation"}`}
      title={`Week ${matchup.week.nflWeek} matchup`}
    >
      {matchup.spectator ? (
        <Link
          href={`/l/${matchup.league.slug}/matchup`}
          className="text-action mt-3 inline-flex min-h-11 items-center font-semibold hover:underline"
        >
          Back to your matchup
        </Link>
      ) : null}
      <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <PairedMatchupHeader
            matchup={matchup}
            refreshControl={refreshControl}
            cardProgress={pregame ? cardProgress : undefined}
          />
          {weeklyClose}
          {(matchup.self.selectedGames?.length ?? 0) > 0 ||
          (matchup.opponent.selectedGames?.length ?? 0) > 0 ? (
            <section
              aria-labelledby="selected-games-heading"
              className="border-boundary bg-surface rounded-xl border p-4 sm:p-5"
            >
              <h2 id="selected-games-heading" className="text-lg font-bold">
                Games selected
              </h2>
              <p className="text-muted mt-1 text-sm">
                Games appear when bets are submitted. Bet details reveal after
                each game’s start is confirmed.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <SelectedGameList
                  games={matchup.self.selectedGames ?? []}
                  memberName={matchup.self.displayName}
                />
                <SelectedGameList
                  games={matchup.opponent.selectedGames ?? []}
                  memberName={matchup.opponent.displayName}
                />
              </div>
            </section>
          ) : null}
          {!matchup.spectator && !pregame && !completed ? (
            <ScorePath matchup={matchup} />
          ) : null}
          {!pregame && !completed ? cardProgress : null}

          {!pregame ? (
            <section
              aria-labelledby="position-ledger-heading"
              className="space-y-5"
            >
              <div>
                <h2
                  className="mt-1 text-xl font-bold"
                  id="position-ledger-heading"
                >
                  Picks by game
                </h2>
              </div>

              {sections.map((section) => {
                const rows = matchup.rows[section.id];
                if (
                  completed &&
                  rows.length === 0 &&
                  !(section.id === "REMAINING" && matchup.futureSealed)
                )
                  return null;
                return (
                  <section
                    aria-labelledby={`ledger-${section.id}`}
                    key={section.id}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <h3
                        className="text-base font-bold"
                        id={`ledger-${section.id}`}
                      >
                        {section.title}
                      </h3>
                      <span className="text-muted text-xs">
                        {rows.length === 0 ? "None" : `${rows.length} picks`}
                      </span>
                    </div>
                    {rows.length > 0 ? (
                      <ol className="mt-2 space-y-2">
                        {rows.map((row) => (
                          <PositionLedgerRow
                            key={row.id}
                            row={row}
                            showMemberName={matchup.spectator}
                          />
                        ))}
                      </ol>
                    ) : (
                      <p className="border-boundary bg-subtle text-muted mt-2 rounded-lg border px-4 py-3 text-sm">
                        {section.empty}
                      </p>
                    )}

                    {section.id === "REMAINING" &&
                    matchup.futureSealed &&
                    !matchup.gameIdentitiesVisible ? (
                      <div
                        aria-label="Future picks sealed. Unstarted events remain private."
                        className="border-boundary bg-subtle mt-2 flex min-h-24 items-center justify-center rounded-lg border px-4 py-5 text-center"
                        data-testid="future-sealed-placeholder"
                      >
                        <div>
                          <p className="font-semibold">Future picks sealed</p>
                          <p className="text-muted mt-1 text-xs">
                            Unstarted events remain private.
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </section>
          ) : null}
        </div>

        <LeagueScoreboard
          games={matchup.scoreboard}
          leagueSlug={matchup.league.slug}
          week={matchup.week.nflWeek}
        />
      </div>
    </PageFrame>
  );
}
