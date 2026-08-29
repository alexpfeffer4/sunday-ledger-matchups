import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isOddsProviderConfigured } from "@/adapters/providers/the-odds-api/client";
import { getLeagueInvites } from "@/application/queries/get-league-invites";
import { getLiveOddsImport } from "@/application/queries/get-live-odds-import";
import { getLiveStage1League } from "@/application/queries/get-live-stage1-league";
import { getLiveWeekOperations } from "@/application/queries/get-live-week-operations";
import { getMyLeagueSummary } from "@/application/queries/get-my-league-summary";
import { getSeasonArchive } from "@/application/queries/get-season-archive";
import { Stage1CommissionerView } from "@/components/stage1/live-views";

export const metadata: Metadata = { title: "Commissioner" };

export default async function CommissionerPage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  const [
    archive,
    live,
    latestLiveImport,
    liveWeekOperations,
    invites,
    leagueManagement,
  ] = await Promise.all([
    getSeasonArchive(leagueSlug),
    getLiveStage1League(leagueSlug),
    getLiveOddsImport(leagueSlug),
    getLiveWeekOperations(leagueSlug),
    getLeagueInvites(leagueSlug),
    getMyLeagueSummary(leagueSlug),
  ]);
  if (archive) redirect(`/l/${leagueSlug}/matchup`);
  if (live) {
    return (
      <Stage1CommissionerView
        invites={invites}
        leagueManagement={leagueManagement}
        latestLiveImport={latestLiveImport}
        liveWeekOperations={liveWeekOperations}
        providerConfigured={isOddsProviderConfigured()}
        state={live}
      />
    );
  }
  notFound();
}
