import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLiveStage1League } from "@/application/queries/get-live-stage1-league";
import { getSimulationLeague } from "@/application/queries/get-simulation-league";
import { PageFrame } from "@/components/league/page-frame";
import { Stage1ReceiptView } from "@/components/stage1/live-views";
import { StatusBadge } from "@/components/ui/status-badge";
import { simulationSeason1Ruleset } from "@/rulesets/simulation-season-1";

export const metadata: Metadata = { title: "Position receipt" };

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `−${Math.abs(odds)}`;
}

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ leagueSlug: string; receiptId: string }>;
}) {
  const { leagueSlug, receiptId } = await params;
  const live = await getLiveStage1League(leagueSlug);
  if (live) {
    if (
      !live.ownerCard?.positions.some((position) => position.id === receiptId)
    )
      notFound();
    return <Stage1ReceiptView state={live} receiptId={receiptId} />;
  }
  const league = getSimulationLeague(leagueSlug);
  if (!league) notFound();
  const receipt = league.cardPositions.find((item) => item.id === receiptId);
  if (!receipt) notFound();

  const facts = [
    ["Position", receipt.displayLine],
    ["Normalized proposition", receipt.proposition],
    ["Market", receipt.marketLabel],
    ["Stake", `${receipt.stakeCredits} credits`],
    ["Accepted odds", formatOdds(receipt.americanOdds)],
    ["Maximum return", `${receipt.maximumReturnLabel} credits`],
    ["Quote observed", receipt.quoteAtLabel],
    ["Accepted", receipt.acceptedAtLabel],
    [
      "Ruleset",
      `${simulationSeason1Ruleset.id} · ${simulationSeason1Ruleset.version}`,
    ],
  ];

  return (
    <PageFrame
      eyebrow="Week 6 · immutable evidence"
      title="Position receipt"
      description="This simulation receipt preserves the exact terms used by the shared acceptance and settlement contract."
      aside={<StatusBadge tone="sealed">Accepted · sealed</StatusBadge>}
    >
      <div className="mt-7 max-w-4xl">
        <section className="border-boundary bg-surface rounded-xl border p-5 shadow-[var(--shadow-card)] sm:p-7">
          <div className="border-boundary flex flex-col justify-between gap-3 border-b pb-5 sm:flex-row sm:items-start">
            <div>
              <p className="text-muted text-xs font-bold tracking-[0.08em] uppercase">
                {receipt.eventLabel} · {receipt.kickoffLabel}
              </p>
              <h2 className="mt-2 text-2xl font-bold">{receipt.displayLine}</h2>
            </div>
            <p className="text-muted font-mono text-xs">{receipt.id}</p>
          </div>
          <dl className="divide-boundary divide-y">
            {facts.map(([label, value]) => (
              <div
                key={label}
                className="grid gap-1 py-4 sm:grid-cols-[190px_1fr] sm:gap-6"
              >
                <dt className="text-muted text-sm">{label}</dt>
                <dd className="text-sm font-semibold break-words">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="border-boundary mt-2 rounded-lg border p-4">
            <p className="text-muted text-xs font-bold tracking-[0.08em] uppercase">
              Request evidence
            </p>
            <p className="mt-2 font-mono text-xs leading-5 break-all">
              {receipt.receiptHash}
            </p>
          </div>
          <div className="border-boundary mt-6 border-t pt-5">
            <p className="text-graphite text-sm leading-6">
              Sealed until the event is reliably live. After reveal, settlement
              and any correction append to this lifecycle; the accepted terms do
              not change.
            </p>
            <Link
              className="text-action mt-3 inline-flex min-h-11 items-center text-sm font-semibold hover:underline"
              href={`/l/${leagueSlug}/card`}
            >
              Back to My Card
            </Link>
          </div>
        </section>
      </div>
    </PageFrame>
  );
}
