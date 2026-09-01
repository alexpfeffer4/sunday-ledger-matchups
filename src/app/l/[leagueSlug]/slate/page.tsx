import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAuthoritativeLeagueState } from "@/application/queries/get-live-stage1-league";
import { getSeasonArchive } from "@/application/queries/get-season-archive";
import { SeasonArchiveMakePicks } from "@/components/season/archive-views";
import { Stage1SlateView } from "@/components/stage1/live-views";

export const metadata: Metadata = { title: "Make picks" };

export default async function SlatePage({
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
    return <SeasonArchiveMakePicks archive={archive} leagueSlug={leagueSlug} />;
  }
  if (live) return <Stage1SlateView state={live} />;
  notFound();
}
