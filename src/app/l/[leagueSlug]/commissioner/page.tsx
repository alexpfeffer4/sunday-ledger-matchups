import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getLiveStage1League } from "@/application/queries/get-live-stage1-league";
import { getSimulationLeague } from "@/application/queries/get-simulation-league";
import { getSimulationSeasonArchive } from "@/application/queries/get-simulation-season-archive";
import { PageFrame } from "@/components/league/page-frame";
import { Stage1CommissionerView } from "@/components/stage1/live-views";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Commissioner console" };

const operations = [
  {
    title: "Advance simulated time",
    detail: "Monotonic clock movement only; it never creates a result itself.",
    available: true,
  },
  {
    title: "Import simulated event state",
    detail: "Use the deterministic adapter for the current simulation season.",
    available: true,
  },
  {
    title: "Lock Week 6",
    detail: "Database time enforces common lock even if this command is late.",
    available: false,
  },
  {
    title: "Settle Week 6",
    detail: "Available after all designated event results are recorded.",
    available: false,
  },
];

export default async function CommissionerPage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  const [archive, live] = await Promise.all([
    getSimulationSeasonArchive(leagueSlug),
    getLiveStage1League(leagueSlug),
  ]);
  if (archive) redirect(`/l/${leagueSlug}/matchup`);
  if (live) return <Stage1CommissionerView state={live} />;
  const league = getSimulationLeague(leagueSlug);
  if (!league) notFound();

  return (
    <PageFrame
      eyebrow="Commissioner console · simulation"
      title="Week 6 operations"
      description="This is a host dashboard for named, idempotent lifecycle commands—not a database editor or competitive override panel."
      aside={<StatusBadge tone="positive">League active</StatusBadge>}
    >
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <section className="border-boundary bg-surface rounded-xl border p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
                  Before common lock
                </p>
                <h2 className="mt-2 text-xl font-bold">Aggregate readiness</h2>
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
              Member names and incomplete states remain hidden until common
              lock.
            </p>
          </section>

          <section aria-labelledby="operations-title">
            <h2 id="operations-title" className="text-xl font-bold">
              Named operations
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {operations.map((operation) => (
                <article
                  key={operation.title}
                  className="border-boundary bg-surface rounded-xl border p-5"
                >
                  <h3 className="font-bold">{operation.title}</h3>
                  <p className="text-graphite mt-2 text-sm leading-6">
                    {operation.detail}
                  </p>
                  <button
                    type="button"
                    disabled
                    className="border-control text-muted mt-4 min-h-11 w-full cursor-not-allowed rounded-lg border px-4 text-sm font-semibold opacity-70"
                  >
                    {operation.available
                      ? "Requires Supabase connection"
                      : "Not available in current state"}
                  </button>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="border-boundary bg-surface rounded-xl border p-5">
            <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
              Published artifacts
            </p>
            <dl className="divide-boundary mt-4 divide-y text-sm">
              <div className="flex justify-between gap-4 py-3 first:pt-0">
                <dt className="text-graphite">Rules</dt>
                <dd className="font-semibold">Frozen</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-graphite">Roster</dt>
                <dd className="font-semibold">10 · locked</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-graphite">Schedule</dt>
                <dd className="font-semibold">Published</dd>
              </div>
              <div className="flex justify-between gap-4 py-3 last:pb-0">
                <dt className="text-graphite">Week 6 slate</dt>
                <dd className="font-semibold">Frozen by receipt</dd>
              </div>
            </dl>
          </section>
          <section className="border-negative/25 bg-negative/10 rounded-xl border p-5">
            <h2 className="text-negative font-bold">Permission boundary</h2>
            <p className="text-graphite mt-2 text-sm leading-6">
              Commissioners cannot view sealed positions or edit scores,
              records, schedules, seeds, brackets, incomplete-card status, or
              winners.
            </p>
          </section>
        </aside>
      </div>
    </PageFrame>
  );
}
