import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLiveStage1League } from "@/application/queries/get-live-stage1-league";
import { Stage1DeferredView } from "@/components/stage1/live-views";

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
  const { leagueSlug } = await params;
  const live = await getLiveStage1League(leagueSlug);
  if (!live) notFound();
  return (
    <Stage1DeferredView
      state={live}
      title="No official rivalry record yet"
      description="Final head-to-head matchups will appear here."
    />
  );
}
