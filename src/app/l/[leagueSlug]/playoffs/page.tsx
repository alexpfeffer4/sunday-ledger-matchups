import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAuthoritativePlayoffState } from "@/application/queries/get-live-playoff-state";
import { getCommissionerAutomationStatus } from "@/application/queries/get-season-automation";
import { getLeagueState } from "@/application/queries/get-live-stage1-league";
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
    getLeagueState(leagueSlug),
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
  if (live) {
    // This status RPC is commissioner-only. Members receive conditional guidance,
    // never commissioner policy data or a guessed enrollment state.
    const automation =
      live.commissioner.isCommissioner &&
      live.league.mode === "LIVE" &&
      live.week?.nflWeek === 14 &&
      live.week.state === "FINAL"
        ? await getCommissionerAutomationStatus(leagueSlug)
        : undefined;
    return <PlayoffPendingView state={live} automation={automation} />;
  }
  notFound();
}
