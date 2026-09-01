import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAuthoritativeLeagueState } from "@/application/queries/get-live-stage1-league";
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
  const [live, archive] = await Promise.all([
    getAuthoritativeLeagueState(leagueSlug),
    getSeasonArchive(leagueSlug),
  ]);
  if (archive) {
    return <SeasonArchiveHome archive={archive} leagueSlug={leagueSlug} />;
  }
  if (live) return <Stage1LeagueView state={live} />;
  notFound();
}
