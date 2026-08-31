import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAuthoritativeLeagueState } from "@/application/queries/get-live-stage1-league";
import { Stage1SlateView } from "@/components/stage1/live-views";

export const metadata: Metadata = { title: "Weekly slate" };

export default async function SlatePage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  const live = await getAuthoritativeLeagueState(leagueSlug);
  if (live) return <Stage1SlateView state={live} />;
  notFound();
}
