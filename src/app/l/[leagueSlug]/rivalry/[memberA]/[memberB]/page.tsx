import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAuthoritativeLeagueState } from "@/application/queries/get-live-stage1-league";
import { getWeeklyCloseState } from "@/application/queries/get-weekly-close-state";
import { RivalryHeader } from "@/components/history/rivalry-header";
import { Stage1DeferredView } from "@/components/stage1/live-views";
import {
  projectRivalry,
  projectSeasonMemory,
} from "@/domain/history/project-season-memory";

export const metadata: Metadata = { title: "Rivalry record" };

export default async function RivalryPage({
  params,
}: {
  params: Promise<{
    leagueSlug: string;
    memberA: string;
    memberB: string;
  }>;
}) {
  const { leagueSlug, memberA, memberB } = await params;
  const [live, weeklyCloseState] = await Promise.all([
    getAuthoritativeLeagueState(leagueSlug),
    getWeeklyCloseState(leagueSlug),
  ]);
  if (!live) notFound();
  if (weeklyCloseState) {
    const memory = projectSeasonMemory(weeklyCloseState);
    const rivalry = projectRivalry(memory, memberA, memberB);
    if (!rivalry) notFound();
    return <RivalryHeader leagueName={live.league.name} rivalry={rivalry} />;
  }
  return (
    <Stage1DeferredView
      state={live}
      title="No official rivalry record yet"
      description="Final head-to-head matchups will appear here."
    />
  );
}
