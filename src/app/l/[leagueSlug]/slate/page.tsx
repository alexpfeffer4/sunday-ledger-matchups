import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLiveStage1League } from "@/application/queries/get-live-stage1-league";
import { getSimulationLeague } from "@/application/queries/get-simulation-league";
import { PageFrame } from "@/components/league/page-frame";
import { GameRow } from "@/components/slate/game-row";
import { Stage1SlateView } from "@/components/stage1/live-views";

export const metadata: Metadata = { title: "Week 6 slate" };

const windowLabels = {
  SUN_EARLY: "Sunday early",
  SUN_LATE: "Sunday late",
  SUN_NIGHT: "Sunday night",
  MON_NIGHT: "Monday night",
} as const;

export default async function SlatePage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  const live = await getLiveStage1League(leagueSlug);
  if (live) return <Stage1SlateView state={live} />;
  const league = getSimulationLeague(leagueSlug);
  if (!league) notFound();

  return (
    <PageFrame
      eyebrow="Week 6 · DraftKings reference markets"
      title="Eligible slate"
      description="Main pregame moneyline, spread, and total markets only. The published slate and common lock freeze after the first accepted receipt."
      aside={
        <div className="bg-subtle rounded-lg px-4 py-3 text-sm">
          <p className="font-semibold">650 allocated · 350 remaining</p>
          <p className="text-muted mt-1 text-xs">
            Common lock Sunday · 12:55 PM ET
          </p>
        </div>
      }
    >
      <div
        className="border-boundary mt-7 flex gap-2 overflow-x-auto border-b pb-3"
        aria-label="Kickoff windows"
      >
        {["Upcoming", "Sun early", "Sun late", "Sun night", "Mon"].map(
          (label, index) => (
            <button
              key={label}
              type="button"
              className={`min-h-11 shrink-0 border-b-2 px-3 text-sm font-semibold ${index === 0 ? "border-registry text-registry" : "text-graphite border-transparent"}`}
            >
              {label}
            </button>
          ),
        )}
      </div>

      <div className="mt-7 space-y-8">
        {Object.entries(windowLabels).map(([window, label]) => {
          const games = league.slate.filter(
            (game) => game.kickoffWindow === window,
          );
          if (games.length === 0) return null;
          return (
            <section key={window} aria-labelledby={`window-${window}`}>
              <div className="mb-3 flex items-center gap-3">
                <h2
                  id={`window-${window}`}
                  className="text-graphite text-sm font-bold tracking-[0.08em] uppercase"
                >
                  {label}
                </h2>
                <div className="bg-boundary h-px flex-1" />
              </div>
              <div className="space-y-4">
                {games.map((game) => (
                  <GameRow key={game.id} game={game} leagueSlug={leagueSlug} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </PageFrame>
  );
}
