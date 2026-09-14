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
import { getCommissionerCardStatus } from "@/application/queries/get-commissioner-card-status";
import { getPlayerPropMenu } from "@/application/queries/get-player-prop-menu";
import { PlayerPropMenuReview } from "@/components/commissioner/player-prop-menu-review";
import {
  preparePlayerPropMenuAction,
  confirmPlayerPropMenuAction,
  refreshPlayerPropQuotesAction,
} from "../player-prop-actions";

export const metadata: Metadata = { title: "Commissioner" };
export const maxDuration = 120;

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
    const menu =
      live.commissioner.isCommissioner && live.week?.propsEnabled
        ? await getPlayerPropMenu(leagueSlug)
        : null;
    const cardStatus =
      live.commissioner.isCommissioner &&
      !ownerRehearsal &&
      live.week &&
      live.week.state !== "PLANNED"
        ? await getCommissionerCardStatus(leagueSlug)
        : null;
    return (
      <>
        {menu?.enabled && (
          <PlayerPropMenuReview
            leagueId={live.league.id}
            leagueSlug={leagueSlug}
            slots={menu.slots.map((slot) => ({
              ...slot,
              candidates: slot.candidates ?? [],
            }))}
            frozen={menu.frozen}
            prepareAction={preparePlayerPropMenuAction}
            confirmAction={confirmPlayerPropMenuAction}
            refreshAction={refreshPlayerPropQuotesAction}
          />
        )}
        <Stage1CommissionerView
          cardStatus={cardStatus}
          invites={invites}
          leagueManagement={leagueManagement}
          latestLiveImport={latestLiveImport}
          liveWeekOperations={liveWeekOperations}
          providerConfigured={isOddsProviderConfigured()}
          ownerRehearsal={ownerRehearsal !== null}
          state={live}
          week17CorrectionOperations={week17CorrectionOperations}
        />
      </>
    );
  }
  if (archive) redirect(`/l/${leagueSlug}/matchup`);
  notFound();
}
