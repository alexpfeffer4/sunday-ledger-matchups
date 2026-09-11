import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAuthoritativePlayoffState } from "@/application/queries/get-live-playoff-state";
import { getAuthoritativeLeagueState } from "@/application/queries/get-live-stage1-league";
import { getSeasonArchive } from "@/application/queries/get-season-archive";
import { LivePlayoffView } from "@/components/playoffs/live-playoff-view";
import { SeasonArchivePlayoffs } from "@/components/season/archive-views";
import { PlayoffPendingView } from "@/components/playoffs/playoff-pending-view";

export const metadata: Metadata = { title: "Playoff race" };

export default async function PlayoffsPage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  const [live, livePlayoffs, archive] = await Promise.all([
    getAuthoritativeLeagueState(leagueSlug),
    getAuthoritativePlayoffState(leagueSlug),
    getSeasonArchive(leagueSlug),
  ]);
  if (archive) return <SeasonArchivePlayoffs archive={archive} />;
  if (livePlayoffs)
    return (
      <LivePlayoffView
        state={livePlayoffs}
        viewerEntryId={live?.viewer.entryId}
        activeWeek={live?.week?.nflWeek}
      />
    );
  if (live) return <PlayoffPendingView state={live} />;
  notFound();
}
