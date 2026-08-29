import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLiveStage1League } from "@/application/queries/get-live-stage1-league";
import { Stage1CardView } from "@/components/stage1/live-views";

export const metadata: Metadata = { title: "Card" };

export default async function CardPage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  const live = await getLiveStage1League(leagueSlug);
  if (live) return <Stage1CardView state={live} />;
  notFound();
}
