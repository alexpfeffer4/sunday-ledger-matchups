import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAuthoritativePlayoffState } from "@/application/queries/get-live-playoff-state";
import { getAuthoritativeLeagueState } from "@/application/queries/get-live-stage1-league";
import { getSeasonArchive } from "@/application/queries/get-season-archive";
import { LivePlayoffView } from "@/components/playoffs/live-playoff-view";
import { SeasonArchivePlayoffs } from "@/components/season/archive-views";
import { Stage1DeferredView } from "@/components/stage1/live-views";

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
  if (livePlayoffs) return <LivePlayoffView state={livePlayoffs} />;
  if (live) {
    const week14Final =
      live.week?.nflWeek === 14 && live.week.state === "FINAL";
    return (
      <Stage1DeferredView
        state={live}
        title={
          week14Final
            ? "The final field awaits publication"
            : "The playoff race has not opened"
        }
        description={
          week14Final
            ? "Week 14 is final. The commissioner must confirm the playoff field before Week 15 opens."
            : `This ${live.league.memberCount}-member league qualifies its playoff field after Week 14 is final.`
        }
      />
    );
  }
  notFound();
}
