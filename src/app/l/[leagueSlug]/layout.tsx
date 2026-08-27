import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getSimulationLeague } from "@/application/queries/get-simulation-league";
import { LeagueShell } from "@/components/league/league-shell";

export default async function LeagueLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  const league = getSimulationLeague(leagueSlug);
  if (!league) notFound();

  return (
    <LeagueShell
      leagueSlug={leagueSlug}
      leagueName={league.matchup.league.name}
      week={league.matchup.league.week}
    >
      {children}
    </LeagueShell>
  );
}
