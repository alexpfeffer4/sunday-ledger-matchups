import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLiveStage1League } from "@/application/queries/get-live-stage1-league";
import { getSeasonArchive } from "@/application/queries/get-season-archive";
import { SeasonArchiveHome } from "@/components/season/archive-views";
import { Stage1MatchupView } from "@/components/stage1/live-views";

export const metadata: Metadata = { title: "Matchup" };

export default async function MatchupPage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  const [live, archive] = await Promise.all([
    getLiveStage1League(leagueSlug),
    getSeasonArchive(leagueSlug),
  ]);
  if (archive) {
    return <SeasonArchiveHome archive={archive} leagueSlug={leagueSlug} />;
  }
  if (live) return <Stage1MatchupView state={live} />;
  notFound();
}
