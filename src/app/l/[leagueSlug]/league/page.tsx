import { getLeagueMatchupCards } from "@/application/queries/get-league-matchup-cards";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAuthoritativeLeagueState } from "@/application/queries/get-live-stage1-league";
import { getLiveWeekOperations } from "@/application/queries/get-live-week-operations";
import { getSeasonArchive } from "@/application/queries/get-season-archive";
import { SeasonArchiveHome } from "@/components/season/archive-views";
import { Stage1LeagueView } from "@/components/stage1/live-views";

export const metadata: Metadata = { title: "League" };

export default async function LeaguePage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  const [live, archive, operations] = await Promise.all([
    getAuthoritativeLeagueState(leagueSlug),
    getSeasonArchive(leagueSlug),
    getLiveWeekOperations(leagueSlug),
  ]);
  if (archive) {
    return <SeasonArchiveHome archive={archive} leagueSlug={leagueSlug} />;
  }
  if (live) {
    const leagueCards = live.week
      ? await getLeagueMatchupCards(leagueSlug, live.week.id)
      : null;
    return (
      <Stage1LeagueView
        state={live}
        operations={operations}
        leagueCards={leagueCards}
      />
    );
  }
  notFound();
}
