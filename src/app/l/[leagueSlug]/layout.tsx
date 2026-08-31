import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { exampleSeasonSlug } from "@/adapters/example/example-season";
import { getLiveStage1League } from "@/application/queries/get-live-stage1-league";
import { getSeasonArchive } from "@/application/queries/get-season-archive";
import { LeagueShell } from "@/components/league/league-shell";

export default async function LeagueLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  if (leagueSlug === exampleSeasonSlug) {
    const archive = await getSeasonArchive(leagueSlug);
    if (!archive) notFound();

    const viewer = archive.members.find(
      (member) => member.entryId === archive.viewerEntryId,
    );
    return (
      <LeagueShell
        leagueSlug={leagueSlug}
        leagueName="Example Season"
        week={18}
        nflYear={archive.nflYear}
        mode={archive.mode}
        memberName={viewer?.displayName ?? "Member"}
        memberRole="Example participant"
        cardStatusLabel="Read-only"
        archiveMode
        exampleMode
      >
        {children}
      </LeagueShell>
    );
  }

  const [live, archive] = await Promise.all([
    getLiveStage1League(leagueSlug),
    getSeasonArchive(leagueSlug),
  ]);
  if (archive) {
    const viewer = archive.members.find(
      (member) => member.entryId === archive.viewerEntryId,
    );
    return (
      <LeagueShell
        leagueSlug={leagueSlug}
        leagueName={live?.league.name ?? "League archive"}
        week={18}
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
            : ["PLAYOFFS", "CHAMPION_FINAL"].includes(live.league.lifecycle)
              ? live.league.lifecycle === "CHAMPION_FINAL"
                ? "Champion final · Week 18 next"
                : "No card this round"
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
