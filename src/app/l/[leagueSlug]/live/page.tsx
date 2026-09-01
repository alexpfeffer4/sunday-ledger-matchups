import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  liveCompatibilityHref,
  type LiveCompatibilitySearch,
} from "@/application/navigation/live-compatibility";

export const metadata: Metadata = { title: "Matchup" };

export default async function LiveCompatibilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueSlug: string }>;
  searchParams: Promise<LiveCompatibilitySearch>;
}) {
  const [{ leagueSlug }, query] = await Promise.all([params, searchParams]);
  redirect(liveCompatibilityHref(leagueSlug, query));
}
