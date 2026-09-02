import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { exampleSeasonSlug } from "@/adapters/example/example-season";
import { getAuthoritativeLeagueState } from "@/application/queries/get-live-stage1-league";
import { getSeasonArchive } from "@/application/queries/get-season-archive";
import { LeagueShell } from "@/components/league/league-shell";
import type { Stage1StateDto } from "@/application/queries/stage1-dtos";
import { formatCredits } from "@/domain/odds/american";

function shellPhaseLabel(state: Stage1StateDto): string {
  if (state.league.lifecycle === "CHAMPION_FINAL") return "Champion final";
  if (state.league.lifecycle === "WEEK_18_EXHIBITION") {
    return "Week 18 exhibition";
  }
  if (state.league.lifecycle === "FINAL") return "Archive final";
  if (!state.week) return "Formation";
  const slate = state.slate ?? [];
  if (slate.some((event) => event.state === "CORRECTED")) {
    return "Corrected";
  }
  if (slate.some((event) => event.state === "LIVE")) return "Live";
  if (
    slate.some(
      (event) =>
        event.providerHealth === "DEGRADED" ||
        (event.state === "SCHEDULED" &&
          new Date(event.scheduledStartAt).getTime() <= Date.now()),
    )
  ) {
    return "Updates delayed";
  }
  if (
    state.week.state === "LOCKED" &&
    slate.some((event) => ["FINAL", "VOID", "CORRECTED"].includes(event.state))
  ) {
    return "Partial reveal";
  }
  const labels: Record<NonNullable<Stage1StateDto["week"]>["state"], string> = {
    PLANNED: "Published",
    OPEN: "Cards open",
    LOCKED: "Cards locked",
    PROVISIONAL: "Provisional",
    FINAL: "Final",
  };
  return labels[state.week.state];
}

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
        phaseLabel="Archive final"
        archiveMode
        exampleMode
      >
        {children}
      </LeagueShell>
    );
  }

  const [live, archive] = await Promise.all([
    getAuthoritativeLeagueState(leagueSlug),
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
        phaseLabel="Archive final"
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
            ? `${formatCredits(live.ownerCard.allocatedCredits)} / 1,000 used`
            : ["PLAYOFFS", "CHAMPION_FINAL"].includes(live.league.lifecycle)
              ? live.league.lifecycle === "CHAMPION_FINAL"
                ? "Champion final · Week 18 next"
                : "No card this round"
              : "Card opens at roster lock"
        }
        phaseLabel={shellPhaseLabel(live)}
        isCommissioner={live.league.role === "COMMISSIONER"}
      >
        {children}
      </LeagueShell>
    );
  }
  notFound();
}
