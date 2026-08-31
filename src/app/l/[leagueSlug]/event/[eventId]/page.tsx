import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAuthoritativeLeagueState } from "@/application/queries/get-live-stage1-league";
import { Stage1EventView } from "@/components/stage1/live-views";

export const metadata: Metadata = { title: "Pick preview" };

export default async function EventPage({
  params,
}: {
  params: Promise<{ leagueSlug: string; eventId: string }>;
}) {
  const { leagueSlug, eventId } = await params;
  const live = await getAuthoritativeLeagueState(leagueSlug);
  if (!live || !live.slate.some((event) => event.id === eventId)) notFound();
  return <Stage1EventView state={live} eventId={eventId} />;
}
