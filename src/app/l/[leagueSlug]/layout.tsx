import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getLiveStage1League } from "@/application/queries/get-live-stage1-league";
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
  const live = await getLiveStage1League(leagueSlug);
  if (live) {
    return (
      <LeagueShell
        leagueSlug={leagueSlug}
        leagueName={live.league.name}
        week={live.week?.nflWeek ?? 1}
        nflYear={live.league.nflYear}
        mode={live.league.mode}
        dataLabel="Stored Stage 1 · Supabase"
        memberName={live.viewer.displayName}
        memberRole={
          live.league.role === "COMMISSIONER" ? "Commissioner" : "Member"
        }
        allocatedCredits={live.ownerCard?.allocatedCredits ?? 0}
      >
        {children}
      </LeagueShell>
    );
  }
  const league = getSimulationLeague(leagueSlug);
  if (!league) notFound();

  return (
    <LeagueShell
      leagueSlug={leagueSlug}
      leagueName={league.matchup.league.name}
      week={league.matchup.league.week}
      nflYear={2026}
      mode="SIMULATION"
      dataLabel="Deterministic local preview"
      memberName="Pfeff"
      memberRole="Simulation member"
      allocatedCredits={league.matchup.allocation.allocatedCredits}
    >
      {children}
    </LeagueShell>
  );
}
