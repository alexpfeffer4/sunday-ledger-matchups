import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLiveRegularSeasonSchedule } from "@/application/queries/get-live-regular-season-schedule";
import { getLiveStage1League } from "@/application/queries/get-live-stage1-league";
import { getSeasonArchive } from "@/application/queries/get-season-archive";
import { SeasonArchiveSchedule } from "@/components/season/archive-views";
import { Stage1ScheduleView } from "@/components/stage1/live-views";

export const metadata: Metadata = { title: "Schedule" };

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  const [live, archive, liveSchedule] = await Promise.all([
    getLiveStage1League(leagueSlug),
    getSeasonArchive(leagueSlug),
    getLiveRegularSeasonSchedule(leagueSlug),
  ]);
  if (archive) return <SeasonArchiveSchedule archive={archive} />;
  if (live) {
    return <Stage1ScheduleView liveSchedule={liveSchedule} state={live} />;
  }
  notFound();
}
