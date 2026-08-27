import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLiveStage1League } from "@/application/queries/get-live-stage1-league";
import { getSimulationLeague } from "@/application/queries/get-simulation-league";
import { getSimulationSeasonArchive } from "@/application/queries/get-simulation-season-archive";
import { PageFrame } from "@/components/league/page-frame";
import { MatchupCard } from "@/components/matchup/matchup-card";
import { SeasonArchiveHome } from "@/components/season/archive-views";
import { Stage1MatchupView } from "@/components/stage1/live-views";
import { ButtonLink } from "@/components/ui/button-link";

export const metadata: Metadata = { title: "Week 6 matchup" };

export default async function MatchupPage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  const [live, archive] = await Promise.all([
    getLiveStage1League(leagueSlug),
    getSimulationSeasonArchive(leagueSlug),
  ]);
  if (archive) {
    return <SeasonArchiveHome archive={archive} leagueSlug={leagueSlug} />;
  }
  if (live) return <Stage1MatchupView state={live} />;
  const league = getSimulationLeague(leagueSlug);
  if (!league) notFound();
  const matchup = league.matchup;

  return (
    <PageFrame
      eyebrow={`Week ${matchup.league.week} · ${matchup.league.commonLockLabel} · cards open`}
      title="Your Week 6 matchup"
      description="Both members begin with the same fresh weekly allocation. Your opponent’s card remains structurally absent until the rules allow a reveal."
    >
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <MatchupCard matchup={matchup} />
          <div className="flex flex-col gap-3 sm:flex-row">
            <ButtonLink href={`/l/${leagueSlug}/slate`} className="sm:min-w-56">
              Allocate remaining 350
            </ButtonLink>
            <ButtonLink
              href={`/l/${leagueSlug}/card`}
              variant="secondary"
              className="sm:min-w-48"
            >
              Review sealed positions
            </ButtonLink>
          </div>

          <section
            className="border-boundary border-t pt-6"
            aria-labelledby="stakes-title"
          >
            <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
              Season consequence
            </p>
            <h2 id="stakes-title" className="mt-2 text-xl font-bold">
              What’s at stake
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="border-boundary bg-surface rounded-lg border p-5">
                <p className="text-muted text-xs font-bold tracking-[0.08em] uppercase">
                  Record
                </p>
                <p className="mt-2 leading-6">{matchup.consequence.record}</p>
              </div>
              <div className="border-boundary bg-surface rounded-lg border p-5">
                <p className="text-muted text-xs font-bold tracking-[0.08em] uppercase">
                  Playoff race
                </p>
                <p className="mt-2 leading-6">{matchup.consequence.playoff}</p>
              </div>
            </div>
            <p className="text-graphite mt-4 text-sm">
              {matchup.consequence.context}
            </p>
          </section>

          <section
            className="border-boundary border-t pt-6"
            aria-labelledby="kickoff-title"
          >
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
                  Designated slate
                </p>
                <h2 id="kickoff-title" className="mt-2 text-xl font-bold">
                  Next kickoff
                </h2>
              </div>
              <Link
                href={`/l/${leagueSlug}/slate`}
                className="text-action min-h-11 py-2 text-sm font-semibold hover:underline"
              >
                View full slate
              </Link>
            </div>
            <div className="border-boundary bg-surface mt-4 rounded-lg border p-5">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <p className="font-bold">
                    {matchup.nextKickoff.awayTeam} at{" "}
                    {matchup.nextKickoff.homeTeam}
                  </p>
                  <p className="text-graphite mt-1 text-sm">
                    {matchup.nextKickoff.kickoffLabel} ·{" "}
                    {matchup.nextKickoff.updateLabel}
                  </p>
                </div>
                <p className="text-sealed text-sm font-semibold">
                  {matchup.nextKickoff.existingPositionLabel}
                </p>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-5" aria-label="League context">
          <section className="border-boundary bg-surface rounded-xl border p-5">
            <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
              Playoff race
            </p>
            <h2 className="mt-2 text-lg font-bold">
              One game above the cutline
            </h2>
            <div className="mt-4 space-y-3 text-sm">
              {[
                ["4", "Drew", "3–2"],
                ["5", "Pfeff", "3–2"],
                ["6", "Lee", "2–3"],
              ].map(([seed, name, record]) => (
                <div
                  key={seed}
                  className={`border-boundary grid grid-cols-[28px_1fr_auto] items-center gap-2 border-b pb-3 last:border-0 last:pb-0 ${name === "Pfeff" ? "text-registry font-bold" : ""}`}
                >
                  <span>{seed}</span>
                  <span>{name}</span>
                  <span>{record}</span>
                </div>
              ))}
            </div>
            <div className="text-pending mt-3 border-t-2 border-dashed border-[var(--playoff-cutline)] pt-2 text-xs font-semibold">
              Playoff cutline
            </div>
          </section>
          <section className="border-boundary bg-surface rounded-xl border p-5">
            <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
              League matchups
            </p>
            <div className="divide-boundary mt-4 divide-y">
              {matchup.leagueMatchups.map((game) => (
                <div
                  key={game.id}
                  className={`py-3 first:pt-0 last:pb-0 ${game.isViewerMatchup ? "font-semibold" : ""}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm">
                      {game.sideA} <span className="text-muted">vs</span>{" "}
                      {game.sideB}
                    </span>
                    <span className="text-muted text-xs">{game.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </PageFrame>
  );
}
