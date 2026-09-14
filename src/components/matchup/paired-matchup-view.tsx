import Link from "next/link";
import type { PairedMatchupDto } from "@/application/queries/project-paired-matchup";
import { resultChangingScenario } from "@/application/presentation/matchup-lineup";
import type { ReactNode } from "react";
import { LeagueScoreboard } from "@/components/matchup/league-scoreboard";
import {
  CompactMatchupScore,
  PairedMatchupHeader,
} from "@/components/matchup/paired-matchup-header";
import { ScorePath } from "@/components/matchup/score-path";
import { PageFrame } from "@/components/league/page-frame";
import { MatchupLineup } from "./matchup-lineup";
import { StickyMatchupScore } from "./sticky-matchup-score";
import {
  MatchupNavigation,
  type MatchupWeekOption,
} from "./matchup-navigation";

export function PairedMatchupView({
  matchup,
  refreshControl,
  weeklyClose,
  cardProgress,
  weeks,
}: {
  matchup: PairedMatchupDto;
  refreshControl: ReactNode;
  weeklyClose?: ReactNode;
  cardProgress?: ReactNode;
  weeks?: MatchupWeekOption[];
}) {
  const pregame = matchup.phase === "PREGAME";
  const completed =
    matchup.resultStatus === "FINAL" || matchup.phase === "FINAL";
  const scenario = resultChangingScenario(matchup);
  return (
    <PageFrame
      dark={matchup.broadcast}
      eyebrow={`${matchup.league.name} · ${matchup.league.mode === "LIVE" ? "Live season" : "Practice/test · Simulation"}`}
      title={`Week ${matchup.week.nflWeek} matchup`}
    >
      <div className="matchup-comparison mx-auto max-w-5xl">
        <MatchupNavigation
          games={matchup.scoreboard}
          weeks={
            weeks ?? [
              {
                week: matchup.week.nflWeek,
                href: `/l/${matchup.league.slug}/matchup`,
                current: true,
              },
            ]
          }
        />
        {matchup.spectator ? (
          <Link
            href={`/l/${matchup.league.slug}/matchup`}
            className="text-action mb-3 inline-flex min-h-11 items-center text-sm font-semibold hover:underline"
          >
            Back to your matchup
          </Link>
        ) : null}
        <StickyMatchupScore summary={<CompactMatchupScore matchup={matchup} />}>
          <PairedMatchupHeader
            matchup={matchup}
            refreshControl={refreshControl}
          />
        </StickyMatchupScore>
        <div className="space-y-5 pt-4">
          {weeklyClose}
          {!completed && !matchup.resultStatus ? cardProgress : null}
          {!pregame &&
          !completed &&
          !matchup.resultStatus &&
          matchup.scorePath.furtherSubmissionsPossible ? (
            <section
              aria-label="Matchup remains open"
              className="text-muted text-sm"
            >
              More bets can still be submitted. This matchup remains open.
            </section>
          ) : null}
          {scenario ? (
            <section
              className="border-registry bg-subtle rounded-lg border-l-4 p-4"
              aria-label="What changes the result"
            >
              <p className="text-registry text-xs font-bold">
                What changes the result
              </p>
              <p className="mt-1 text-sm font-semibold">{scenario}</p>
            </section>
          ) : null}
          <MatchupLineup matchup={matchup} />
          {!matchup.spectator &&
          !pregame &&
          !completed &&
          !matchup.resultStatus ? (
            <details className="border-boundary rounded-lg border px-4">
              <summary className="text-action min-h-11 cursor-pointer py-3 text-sm font-semibold">
                Score details & remaining returns
              </summary>
              <div className="pb-4">
                <ScorePath matchup={matchup} />
              </div>
            </details>
          ) : null}
          <details className="border-boundary border-t">
            <summary className="text-action min-h-11 cursor-pointer py-3 text-sm font-semibold">
              Around the league · Week {matchup.week.nflWeek}
            </summary>
            <LeagueScoreboard
              games={matchup.scoreboard}
              leagueSlug={matchup.league.slug}
              week={matchup.week.nflWeek}
            />
          </details>
        </div>
      </div>
    </PageFrame>
  );
}
