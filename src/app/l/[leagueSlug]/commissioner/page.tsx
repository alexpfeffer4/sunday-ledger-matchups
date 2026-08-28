import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isOddsProviderConfigured } from "@/adapters/providers/the-odds-api/client";
import { getLiveOddsImport } from "@/application/queries/get-live-odds-import";
import { getLiveStage1League } from "@/application/queries/get-live-stage1-league";
import { getLiveWeekOperations } from "@/application/queries/get-live-week-operations";
import { getLeagueInvites } from "@/application/queries/get-league-invites";
import { getSimulationLeague } from "@/application/queries/get-simulation-league";
import { getSimulationSeasonArchive } from "@/application/queries/get-simulation-season-archive";
import { PageFrame } from "@/components/league/page-frame";
import { Stage1CommissionerView } from "@/components/stage1/live-views";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Commissioner" };

const operations = [
  {
    title: "Move to kickoff",
    detail: "Advance the practice week without creating a score.",
    available: true,
  },
  {
    title: "Update game status",
    detail: "Move practice games from scheduled to live or final.",
    available: true,
  },
  {
    title: "Lock all cards",
    detail: "Close every Week 6 card at the published deadline.",
    available: false,
  },
  {
    title: "Score Week 6",
    detail: "Available after every selected game has a final result.",
    available: false,
  },
];

export default async function CommissionerPage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  const [archive, live, latestLiveImport, liveWeekOperations, invites] =
    await Promise.all([
      getSimulationSeasonArchive(leagueSlug),
      getLiveStage1League(leagueSlug),
      getLiveOddsImport(leagueSlug),
      getLiveWeekOperations(leagueSlug),
      getLeagueInvites(leagueSlug),
    ]);
  if (archive) redirect(`/l/${leagueSlug}/matchup`);
  if (live)
    return (
      <Stage1CommissionerView
        invites={invites}
        latestLiveImport={latestLiveImport}
        liveWeekOperations={liveWeekOperations}
        providerConfigured={isOddsProviderConfigured()}
        state={live}
      />
    );
  const league = getSimulationLeague(leagueSlug);
  if (!league) notFound();

  return (
    <PageFrame
      eyebrow="Practice league · Week 6"
      title="Commissioner home"
      description="Keep the roster, weekly card, and results moving."
      aside={<StatusBadge tone="positive">League active</StatusBadge>}
    >
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <section className="border-boundary bg-surface rounded-xl border p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
                  Before cards lock
                </p>
                <h2 className="mt-2 text-xl font-bold">Cards ready</h2>
              </div>
              <p className="font-mono text-lg font-bold">1 of 10 ready</p>
            </div>
            <div
              className="bg-subtle mt-5 h-2 overflow-hidden rounded-full"
              role="progressbar"
              aria-label="One of ten cards ready"
              aria-valuemin={0}
              aria-valuemax={10}
              aria-valuenow={1}
            >
              <div className="bg-registry h-full w-[10%]" />
            </div>
            <p className="text-muted mt-3 text-xs leading-5">
              Individual card status remains private until cards lock.
            </p>
          </section>

          <section aria-labelledby="operations-title">
            <h2 id="operations-title" className="text-xl font-bold">
              League controls
            </h2>
            <div className="divide-boundary border-boundary mt-4 divide-y border-y">
              {operations.map((operation) => (
                <article
                  key={operation.title}
                  className="grid gap-4 py-5 sm:grid-cols-[1fr_220px] sm:items-center"
                >
                  <div>
                    <h3 className="font-bold">{operation.title}</h3>
                    <p className="text-graphite mt-2 text-sm leading-6">
                      {operation.detail}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled
                    className="border-control text-muted min-h-11 w-full cursor-not-allowed rounded-lg border px-4 text-sm font-semibold opacity-70"
                  >
                    {operation.available
                      ? "Unavailable in this example"
                      : "Available later this week"}
                  </button>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="border-boundary bg-surface rounded-xl border p-5">
            <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
              Season setup
            </p>
            <dl className="divide-boundary mt-4 divide-y text-sm">
              <div className="flex justify-between gap-4 py-3 first:pt-0">
                <dt className="text-graphite">Rules</dt>
                <dd className="font-semibold">Set</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-graphite">Roster</dt>
                <dd className="font-semibold">10 members</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-graphite">Schedule</dt>
                <dd className="font-semibold">Published</dd>
              </div>
              <div className="flex justify-between gap-4 py-3 last:pb-0">
                <dt className="text-graphite">Week 6 slate</dt>
                <dd className="font-semibold">Published</dd>
              </div>
            </dl>
          </section>
          <section className="border-negative/25 bg-negative/10 rounded-xl border p-5">
            <h2 className="text-negative font-bold">Commissioner limits</h2>
            <p className="text-graphite mt-2 text-sm leading-6">
              Commissioners cannot view sealed picks or edit scores, records,
              schedules, seeds, brackets, incomplete-card status, or winners.
            </p>
          </section>
        </aside>
      </div>
    </PageFrame>
  );
}
