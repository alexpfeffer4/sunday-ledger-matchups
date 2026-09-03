import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isOddsProviderConfigured } from "@/adapters/providers/the-odds-api/client";
import { getLeagueInvites } from "@/application/queries/get-league-invites";
import { getLiveOddsImport } from "@/application/queries/get-live-odds-import";
import { getAuthoritativeLeagueState } from "@/application/queries/get-live-stage1-league";
import { getLiveWeekOperations } from "@/application/queries/get-live-week-operations";
import { getWeek17CorrectionOperations } from "@/application/queries/get-week17-correction-operations";
import { getMyLeagueSummary } from "@/application/queries/get-my-league-summary";
import { getSeasonArchive } from "@/application/queries/get-season-archive";
import { getOwnerRehearsalForLeague } from "@/application/queries/get-owner-rehearsal";
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
    week17CorrectionOperations,
    ownerRehearsal,
  ] = await Promise.all([
    getSeasonArchive(leagueSlug),
    getAuthoritativeLeagueState(leagueSlug),
    getLiveOddsImport(leagueSlug),
    getLiveWeekOperations(leagueSlug),
    getLeagueInvites(leagueSlug),
    getMyLeagueSummary(leagueSlug),
    getWeek17CorrectionOperations(leagueSlug),
    getOwnerRehearsalForLeague(leagueSlug),
  ]);
  if (live) {
    return (
      <Stage1CommissionerView
        invites={invites}
        leagueManagement={leagueManagement}
        latestLiveImport={latestLiveImport}
        liveWeekOperations={liveWeekOperations}
        providerConfigured={isOddsProviderConfigured()}
        ownerRehearsal={ownerRehearsal !== null}
        state={live}
        week17CorrectionOperations={week17CorrectionOperations}
      />
    );
  }
  if (archive) redirect(`/l/${leagueSlug}/matchup`);
  notFound();
}
