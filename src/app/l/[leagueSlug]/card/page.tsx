import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSimulationLeague } from "@/application/queries/get-simulation-league";
import { CardPositionRow } from "@/components/card/card-position-row";
import { AllocationMeter } from "@/components/matchup/allocation-meter";
import { PageFrame } from "@/components/league/page-frame";
import { ButtonLink } from "@/components/ui/button-link";

export const metadata: Metadata = { title: "Week 6 card" };

export default async function CardPage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  const league = getSimulationLeague(leagueSlug);
  if (!league) notFound();
  const allocation = league.matchup.allocation;

  return (
    <PageFrame
      eyebrow="Week 6 · your private card"
      title={`${allocation.remainingCredits} credits still to allocate`}
      description="Accepted terms are immutable. Only you can read these sealed receipts before their events become revealable."
      aside={
        <ButtonLink href={`/l/${leagueSlug}/slate`}>
          Allocate remaining {allocation.remainingCredits}
        </ButtonLink>
      }
    >
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <section className="border-boundary bg-surface rounded-xl border p-5 sm:p-6">
            <AllocationMeter
              {...allocation}
              commonLockLabel={league.matchup.league.commonLockLabel}
            />
            <p className="text-pending border-pending/25 bg-pending/10 mt-5 rounded-lg border px-4 py-3 text-sm leading-6">
              The final 350 credits can be completed legally in one position on
              any unused eligible event-market opportunity shown on the slate.
            </p>
          </section>

          {league.cardPositions.map((position) => (
            <CardPositionRow
              key={position.id}
              leagueSlug={leagueSlug}
              position={position}
            />
          ))}
        </div>

        <aside className="space-y-5" aria-label="Card summary">
          <section className="border-boundary bg-surface rounded-xl border p-5">
            <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
              Portfolio
            </p>
            <dl className="divide-boundary mt-4 divide-y text-sm">
              <div className="flex justify-between gap-4 py-3 first:pt-0">
                <dt className="text-graphite">Positions</dt>
                <dd className="font-semibold">3 of 20</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-graphite">Largest stake</dt>
                <dd className="font-semibold">250 credits</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-graphite">Markets used</dt>
                <dd className="font-semibold">3</dd>
              </div>
              <div className="flex justify-between gap-4 py-3 last:pb-0">
                <dt className="text-graphite">Mode</dt>
                <dd className="font-semibold">Simulation</dd>
              </div>
            </dl>
          </section>
          <section className="border-boundary bg-subtle rounded-xl border p-5 text-sm leading-6">
            <h2 className="font-bold">Privacy before reveal</h2>
            <p className="text-graphite mt-2">
              Mia receives no receipt count, stake, line, odds, or layout clue.
              The league sees a generic future-sealed state only when needed.
            </p>
          </section>
        </aside>
      </div>
    </PageFrame>
  );
}
