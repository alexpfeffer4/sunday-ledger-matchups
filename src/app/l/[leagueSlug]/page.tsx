import { redirect } from "next/navigation";

export default async function LeagueIndexPage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  redirect(`/l/${leagueSlug}/matchup`);
}
