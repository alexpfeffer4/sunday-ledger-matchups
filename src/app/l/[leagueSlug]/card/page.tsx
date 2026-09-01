import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAuthoritativeLeagueState } from "@/application/queries/get-live-stage1-league";
import { getSeasonArchive } from "@/application/queries/get-season-archive";
import { SeasonArchiveMyCard } from "@/components/season/archive-views";
import { Stage1CardView } from "@/components/stage1/live-views";

export const metadata: Metadata = { title: "Card" };

export default async function CardPage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  const [live, archive] = await Promise.all([
    getAuthoritativeLeagueState(leagueSlug),
    getSeasonArchive(leagueSlug),
  ]);
  if (archive) return <SeasonArchiveMyCard archive={archive} />;
  if (live) return <Stage1CardView state={live} />;
  notFound();
}
