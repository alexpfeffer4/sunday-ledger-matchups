import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLiveStage1League } from "@/application/queries/get-live-stage1-league";
import { getSimulationLeague } from "@/application/queries/get-simulation-league";
import { PositionPreview } from "@/components/card/position-preview";
import { PageFrame } from "@/components/league/page-frame";
import { Stage1EventView } from "@/components/stage1/live-views";

export const metadata: Metadata = { title: "Position preview" };

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueSlug: string; eventId: string }>;
  searchParams: Promise<{ outcome?: string }>;
}) {
  const { leagueSlug, eventId } = await params;
  const live = await getLiveStage1League(leagueSlug);
  if (live) {
    const view = <Stage1EventView state={live} eventId={eventId} />;
    if (!live.slate.some((event) => event.id === eventId)) notFound();
    return view;
  }
  const { outcome: selectedOutcomeId } = await searchParams;
  const league = getSimulationLeague(leagueSlug);
  const game = league?.slate.find((candidate) => candidate.id === eventId);
  const outcome = game?.markets
    .flatMap((market) => market.outcomes)
    .find((candidate) => candidate.id === selectedOutcomeId);
  if (!league || !game || !outcome) notFound();

  return (
    <PageFrame
      eyebrow={`${game.kickoffLabel} · ${game.updateLabel}`}
      title={`${game.awayTeam} at ${game.homeTeam}`}
      description="Review the exact proposition, current quote, weekly-card effect, and permanent-receipt warning before acceptance."
      aside={
        <Link
          href={`/l/${leagueSlug}/slate`}
          className="text-action min-h-11 py-2 text-sm font-semibold"
        >
          ← Back to slate
        </Link>
      }
    >
      <div className="mx-auto max-w-2xl">
        <PositionPreview outcome={outcome} />
      </div>
    </PageFrame>
  );
}
