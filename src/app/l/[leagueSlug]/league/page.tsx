import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSimulationLeague } from "@/application/queries/get-simulation-league";
import { PageFrame } from "@/components/league/page-frame";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Week 6 league" };

const activity = [
  {
    time: "Saturday · 4:41 PM ET",
    title: "Pfeff accepted a sealed position",
    detail: "No terms are public before reveal.",
  },
  {
    time: "Saturday · 2:08 PM ET",
    title: "Lee’s card is ready",
    detail: "Exactly 1,000 credits accepted before common lock.",
  },
  {
    time: "Friday · 6:30 PM ET",
    title: "Week 6 slate published",
    detail: "Common lock is Sunday at 12:55 PM ET.",
  },
];

export default async function LeaguePage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  const league = getSimulationLeague(leagueSlug);
  if (!league) notFound();

  return (
    <PageFrame
      eyebrow="West 21st Ledger · Week 6"
      title="Around the league"
      description="Weekly pairings and structured league moments. Sealed position terms never enter this feed."
      aside={
        <Link
          href={`/l/${leagueSlug}/standings`}
          className="text-action inline-flex min-h-11 items-center text-sm font-semibold hover:underline"
        >
          Open official standings
        </Link>
      }
    >
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-labelledby="scoreboard-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="scoreboard-title" className="text-xl font-bold">
              Week 6 scoreboard
            </h2>
            <StatusBadge tone="pending">Cards open</StatusBadge>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {league.scoreboard.map((game) => (
              <article
                key={game.id}
                className={`bg-surface rounded-xl border p-5 ${game.isViewerMatchup ? "border-registry shadow-[var(--shadow-card)]" : "border-boundary"}`}
              >
                <p className="text-muted text-xs font-bold tracking-[0.08em] uppercase">
                  {game.isViewerMatchup ? "Your matchup" : "Scheduled matchup"}
                </p>
                {[game.sideA, game.sideB].map((side, index) => (
                  <div
                    key={side.name}
                    className={`mt-4 flex items-center justify-between gap-4 ${index === 1 ? "border-boundary border-t pt-4" : ""}`}
                  >
                    <div>
                      <p className="font-bold">{side.name}</p>
                      <p className="text-muted mt-0.5 text-xs">{side.record}</p>
                    </div>
                    <p className="text-sealed text-xs font-semibold">
                      {side.cardState}
                    </p>
                  </div>
                ))}
              </article>
            ))}
          </div>
        </section>

        <aside aria-labelledby="moments-title">
          <section className="border-boundary bg-surface rounded-xl border p-5">
            <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
              Structured activity
            </p>
            <h2 id="moments-title" className="mt-2 text-lg font-bold">
              League moments
            </h2>
            <ol className="border-boundary mt-5 border-l pl-5">
              {activity.map((item) => (
                <li key={item.time} className="relative pb-6 last:pb-0">
                  <span
                    aria-hidden="true"
                    className="bg-registry absolute top-1.5 -left-[1.42rem] h-2 w-2 rounded-full"
                  />
                  <p className="text-muted text-xs">{item.time}</p>
                  <p className="mt-1 text-sm font-bold">{item.title}</p>
                  <p className="text-graphite mt-1 text-sm leading-5">
                    {item.detail}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </PageFrame>
  );
}
