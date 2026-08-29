import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { fullSeasonSimulationSlug } from "@/adapters/simulation/full-season";
import { getLiveStage1League } from "@/application/queries/get-live-stage1-league";
import { getSimulationLeague } from "@/application/queries/get-simulation-league";
import { getSimulationSeasonArchive } from "@/application/queries/get-simulation-season-archive";
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
  if (league) {
    return (
      <LeagueShell
        leagueSlug={leagueSlug}
        leagueName={league.matchup.league.name}
        week={league.matchup.league.week}
        nflYear={2026}
        mode="SIMULATION"
        memberName="Pfeff"
        memberRole="Practice commissioner"
        cardStatusLabel={`${league.matchup.allocation.allocatedCredits} / 1,000 used`}
        isCommissioner
      >
        {children}
      </LeagueShell>
    );
  }

  if (leagueSlug === fullSeasonSimulationSlug) {
    const archive = await getSimulationSeasonArchive(leagueSlug);
    if (!archive) notFound();

    const viewer = archive.members.find(
      (member) => member.entryId === archive.viewerEntryId,
    );
    return (
      <LeagueShell
        leagueSlug={leagueSlug}
        leagueName="Sample Season"
        week={archive.mode === "LIVE" ? 17 : 18}
        nflYear={archive.nflYear}
        mode={archive.mode}
        memberName={viewer?.displayName ?? "Member"}
        memberRole="Archived participant"
        cardStatusLabel="Season final"
        archiveMode
      >
        {children}
      </LeagueShell>
    );
  }

  const [live, archive] = await Promise.all([
    getLiveStage1League(leagueSlug),
    getSimulationSeasonArchive(leagueSlug),
  ]);
  if (archive) {
    const viewer = archive.members.find(
      (member) => member.entryId === archive.viewerEntryId,
    );
    return (
      <LeagueShell
        leagueSlug={leagueSlug}
        leagueName={live?.league.name ?? "Sample Season"}
        week={archive.mode === "LIVE" ? 17 : 18}
        nflYear={archive.nflYear}
        mode={archive.mode}
        memberName={viewer?.displayName ?? "Member"}
        memberRole="Archived participant"
        cardStatusLabel="Season final"
        archiveMode
      >
        {children}
      </LeagueShell>
    );
  }
  if (live) {
    return (
      <LeagueShell
        leagueSlug={leagueSlug}
        leagueName={live.league.name}
        week={live.week?.nflWeek ?? 1}
        nflYear={live.league.nflYear}
        mode={live.league.mode}
        memberName={live.viewer.displayName}
        memberRole={
          live.league.role === "COMMISSIONER" ? "Commissioner" : "Member"
        }
        cardStatusLabel={
          live.ownerCard
            ? `${live.ownerCard.allocatedCredits} / 1,000 used`
            : live.league.lifecycle === "PLAYOFFS"
              ? "No card this round"
              : "Card opens at roster lock"
        }
        isCommissioner={live.league.role === "COMMISSIONER"}
      >
        {children}
      </LeagueShell>
    );
  }
  notFound();
}
