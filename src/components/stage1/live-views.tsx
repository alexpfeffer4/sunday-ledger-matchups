import Link from "next/link";
import type { ReactNode } from "react";
import type { Stage1StateDto } from "@/application/queries/stage1-dtos";
import type { LiveOddsImportReview } from "@/application/queries/get-live-odds-import";
import type { LeagueInviteSummary } from "@/application/queries/league-invite-dtos";
import type { LiveRegularSeasonSchedule } from "@/application/queries/get-live-regular-season-schedule";
import type { LiveWeekOperations } from "@/application/queries/get-live-week-operations";
import type { Week17CorrectionOperations } from "@/application/queries/get-week17-correction-operations";
import { Stage1CardBuilder } from "@/components/card/stage1-card-builder";
import { Stage1CommissionerControls } from "@/components/commissioner/stage1-controls";
import { LeagueSettings } from "@/components/commissioner/league-settings";
import type { MyLeagueSummary } from "@/application/queries/get-my-league-summary";
import { PageFrame } from "@/components/league/page-frame";
import { StandingsTable } from "@/components/league/standings-table";
import {
  ScheduleNavigator,
  type ScheduleWeekRecord,
} from "@/components/league/schedule-navigator";
import {
  StandingsRulesetSummary,
  type RulesetPresentation,
} from "@/components/rules/ruleset-presentation";
import { AllocationMeter } from "@/components/matchup/allocation-meter";
import { LeagueScoreboard } from "@/components/matchup/league-scoreboard";
import { StatusBadge } from "@/components/ui/status-badge";
import { AuditDetails } from "@/components/ui/audit-details";
import { ReceiptPanel } from "@/components/ui/receipt-panel";
import { formatCenticredits, formatCredits } from "@/domain/odds/american";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `−${Math.abs(odds)}`;
}

function formatLine(
  lineMilli: number | null,
  marketType: "MONEYLINE" | "SPREAD" | "TOTAL",
): string {
  if (lineMilli === null) return marketType === "MONEYLINE" ? "Moneyline" : "—";
  const line = lineMilli / 1000;
  return marketType === "SPREAD" && line > 0 ? `+${line}` : `${line}`;
}

function formatScore(value: number): string {
  return formatCenticredits(BigInt(value), true);
}

function competitionLabel({
  lifecycle,
  postseasonRole,
  scope,
  week,
}: {
  lifecycle: Stage1StateDto["league"]["lifecycle"];
  postseasonRole?:
    "CHAMPIONSHIP" | "THIRD_PLACE" | "PLACEMENT" | "EXHIBITION" | null;
  scope: "REGULAR" | "PLAYOFF" | "PLACEMENT" | "EXHIBITION";
  week: number;
}): string {
  if (week === 18 || scope === "EXHIBITION") return "Week 18 exhibition";
  if (postseasonRole === "CHAMPIONSHIP") {
    return lifecycle === "CHAMPION_FINAL"
      ? "Championship · champion final"
      : "Championship";
  }
  if (postseasonRole === "THIRD_PLACE") return "Third place";
  if (postseasonRole === "PLACEMENT" || scope === "PLACEMENT") {
    return "Placement";
  }
  return scope === "PLAYOFF" ? "Playoff" : "Regular season";
}

function weekStatus(state: Stage1StateDto): string {
  if (!state.week) return "Formation";
  if (state.slate.some((event) => event.state === "CORRECTED")) {
    return "Corrected";
  }
  if (state.league.lifecycle === "CHAMPION_FINAL") return "Champion final";
  if (state.league.lifecycle === "WEEK_18_EXHIBITION") {
    return "Week 18 exhibition";
  }
  const labels: Record<NonNullable<Stage1StateDto["week"]>["state"], string> = {
    PLANNED: "Published",
    OPEN: "Cards open",
    LOCKED: state.slate.some((event) => event.state === "LIVE")
      ? "Live"
      : "Cards locked",
    PROVISIONAL: "Provisional",
    FINAL: "Final",
  };
  return labels[state.week.state];
}

function memberInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "SL";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

function recordLabel(
  row: Stage1StateDto["standings"][number] | undefined,
): string {
  if (!row) return "0–0";
  return row.ties > 0
    ? `${row.wins}–${row.losses}–${row.ties}`
    : `${row.wins}–${row.losses}`;
}

function liveStatus(state: Stage1StateDto): ReactNode {
  if (!state.week) return <StatusBadge tone="pending">Forming</StatusBadge>;
  if (state.week.state === "PLANNED")
    return <StatusBadge tone="sealed">Slate published</StatusBadge>;
  if (state.week.state === "FINAL")
    return <StatusBadge tone="positive">Final</StatusBadge>;
  if (state.week.state === "PROVISIONAL")
    return <StatusBadge tone="pending">Provisional</StatusBadge>;
  if (state.week.state === "OPEN")
    return <StatusBadge tone="positive">Cards open</StatusBadge>;
  return <StatusBadge tone="sealed">Cards locked</StatusBadge>;
}

function FormationPanel({ state }: { state: Stage1StateDto }) {
  const liveSlatePublished =
    state.league.mode === "LIVE" && state.week?.state === "PLANNED";
  return (
    <div className="border-boundary bg-surface mt-7 rounded-xl border p-6">
      <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
        League formation
      </p>
      <h2 className="mt-2 text-xl font-bold">
        {liveSlatePublished
          ? `Week 1 slate published · ${state.league.memberCount} members joined`
          : `${state.league.memberCount} members joined`}
      </h2>
      <p className="text-graphite mt-3 max-w-2xl leading-7">
        {liveSlatePublished
          ? "The Week 1 games and card-lock time are set. Cards open after an even roster of 4–16 members is locked."
          : "Invite an even roster from 4 through 16 members, then open the season from the Commissioner page."}
      </p>
      {state.commissioner.isCommissioner ? (
        <Link
          className="text-action mt-4 inline-flex min-h-11 items-center font-semibold hover:underline"
          href={`/l/${state.league.slug}/commissioner`}
        >
          Open commissioner setup
        </Link>
      ) : null}
    </div>
  );
}

export function Stage1MatchupView({ state }: { state: Stage1StateDto }) {
  if (
    state.week &&
    state.league.lifecycle === "PLAYOFFS" &&
    (!state.matchup || !state.ownerCard)
  ) {
    return (
      <PageFrame
        eyebrow={`${state.league.name} · Week ${state.week.nflWeek} ${state.week.scope.toLowerCase()}`}
        title="No matchup card this round"
        description="You are not scheduled to play this round. You may have a bye or be out of the championship bracket."
        aside={liveStatus(state)}
      >
        <div className="border-boundary bg-surface mt-7 rounded-xl border p-6">
          <h2 className="text-lg font-bold">The round still runs normally</h2>
          <p className="text-graphite mt-2 max-w-2xl text-sm leading-6">
            You do not need to build a card this round. Follow the bracket for
            current matchups and advancement.
          </p>
          <Link
            className="text-action mt-4 inline-flex min-h-11 items-center font-semibold hover:underline"
            href={`/l/${state.league.slug}/playoffs`}
          >
            View playoffs
          </Link>
        </div>
      </PageFrame>
    );
  }
  if (!state.week || !state.matchup || !state.ownerCard) {
    return (
      <PageFrame
        eyebrow={`${state.league.name} · Simulation`}
        title="Your matchup"
        description="Your first matchup appears when the commissioner opens the season."
      >
        <FormationPanel state={state} />
      </PageFrame>
    );
  }
  const result = state.matchup.result;
  const selfStanding = state.standings.find(
    (row) => row.entryId === state.viewer.entryId,
  );
  const opponentStanding = state.standings.find(
    (row) => row.entryId === state.matchup?.opponentEntryId,
  );
  const nextEvent = [...state.slate].sort(
    (left, right) =>
      new Date(left.scheduledStartAt).getTime() -
      new Date(right.scheduledStartAt).getTime(),
  )[0];
  const ownerReady = state.ownerCard.remainingCredits === 0;
  const primaryAction =
    state.week.state === "OPEN"
      ? ownerReady
        ? {
            href: `/l/${state.league.slug}/card`,
            label: "Review sealed card",
          }
        : {
            href: `/l/${state.league.slug}/slate`,
            label: `Use remaining ${formatCredits(state.ownerCard.remainingCredits)}`,
          }
      : state.week.state === "FINAL"
        ? {
            href: `/l/${state.league.slug}/league`,
            label: "View final league scoreboard",
          }
        : {
            href: `/l/${state.league.slug}/league`,
            label: "View league scoreboard",
          };
  const matchupState = result
    ? result.status === "FINAL"
      ? "Final"
      : "Provisional"
    : state.week.state === "OPEN"
      ? ownerReady
        ? "Your card is ready"
        : "Cards open"
      : "Cards locked";
  const consequence = result
    ? `${result.selfDecision === "WIN" ? "Win" : result.selfDecision === "LOSS" ? "Loss" : "Tie"} filed ${result.status.toLowerCase()}. The official standings update through the result shown here.`
    : state.week.scope === "PLAYOFF"
      ? "The winner advances. If both completed cards finish with the same score, the higher regular-season seed advances."
      : `A win would move you to ${(selfStanding?.wins ?? 0) + 1}–${selfStanding?.losses ?? 0}; a loss would move you to ${selfStanding?.wins ?? 0}–${(selfStanding?.losses ?? 0) + 1}.`;
  return (
    <PageFrame
      eyebrow={`${state.league.name} · Week ${state.week.nflWeek}`}
      title={`Your Week ${state.week.nflWeek} matchup`}
      description={`Cards lock ${formatDate(state.week.commonLockAt)}. Opponent choices remain sealed until their games begin.`}
      aside={liveStatus(state)}
    >
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="border-boundary bg-surface rounded-xl border p-5 shadow-[var(--shadow-card)] sm:p-7">
            <div className="border-boundary flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
                Week {state.week.nflWeek} · {state.week.scope.toLowerCase()}
              </p>
              <StatusBadge
                tone={result ? "pending" : ownerReady ? "positive" : "sealed"}
              >
                {matchupState}
              </StatusBadge>
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 py-7 sm:gap-8">
              <div className="min-w-0 text-center">
                <div className="border-registry bg-subtle text-registry mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 text-lg font-bold">
                  {memberInitials(state.viewer.displayName)}
                </div>
                <p className="mt-3 truncate text-lg font-bold">
                  {state.viewer.displayName}
                </p>
                <p className="text-graphite mt-1 text-sm">
                  {recordLabel(selfStanding)}
                  {selfStanding ? ` · No. ${selfStanding.seed} seed` : ""}
                </p>
                <p className="text-registry mt-3 text-sm font-semibold">
                  {result
                    ? formatScore(result.selfPointsForCenticredits)
                    : `${formatCredits(state.ownerCard.allocatedCredits)} used · ${formatCredits(state.ownerCard.remainingCredits)} left`}
                </p>
              </div>
              <div className="pt-7 text-center">
                <p className="text-muted text-xs font-bold tracking-[0.1em] uppercase">
                  {result ? result.status : "vs"}
                </p>
                {!result ? (
                  <p className="text-graphite mt-2 font-mono text-xs font-semibold sm:text-sm">
                    1,000 each
                  </p>
                ) : null}
              </div>
              <div className="min-w-0 text-center">
                <div className="border-copper bg-subtle text-copper mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 text-lg font-bold">
                  {memberInitials(state.matchup.opponentName)}
                </div>
                <p className="mt-3 truncate text-lg font-bold">
                  {state.matchup.opponentName}
                </p>
                <p className="text-graphite mt-1 text-sm">
                  {recordLabel(opponentStanding)}
                  {opponentStanding
                    ? ` · No. ${opponentStanding.seed} seed`
                    : ""}
                </p>
                <p className="text-copper mt-3 text-sm font-semibold">
                  {result
                    ? formatScore(result.opponentPointsForCenticredits)
                    : state.matchup.opponentReadiness
                      ? state.matchup.opponentReadiness === "COMPLIANT"
                        ? "Card ready"
                        : state.matchup.opponentReadiness === "INCOMPLETE"
                          ? "Incomplete"
                          : "Pending"
                      : "Sealed until cards lock"}
                </p>
              </div>
            </div>

            {!result ? (
              <AllocationMeter
                allocatedCredits={state.ownerCard.allocatedCredits}
                commonLockLabel={formatDate(state.week.commonLockAt)}
                maximumPositions={20}
                positionCount={state.ownerCard.positions.length}
                remainingCredits={state.ownerCard.remainingCredits}
                weeklyAllocationCredits={1_000}
              />
            ) : (
              <p className="border-boundary border-t pt-4 text-sm font-semibold">
                {result.selfDecision} · {recordLabel(selfStanding)} current
                record
              </p>
            )}

            <Link
              className="bg-registry hover:bg-registry-hover mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-lg px-5 text-sm font-semibold text-white"
              href={primaryAction.href}
            >
              {primaryAction.label}
            </Link>
          </section>

          <section className="border-boundary border-l-registry bg-surface rounded-xl border border-l-4 p-5">
            <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
              What&apos;s at stake
            </p>
            <p className="text-graphite mt-2 leading-7">{consequence}</p>
            <Link
              className="text-action mt-3 inline-flex min-h-11 items-center font-semibold hover:underline"
              href={`/l/${state.league.slug}/standings`}
            >
              View full standings
            </Link>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="border-boundary bg-surface rounded-xl border p-5">
            <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
              Next kickoff
            </p>
            {nextEvent ? (
              <>
                <h2 className="mt-2 text-lg font-bold">
                  {nextEvent.awayTeam} at {nextEvent.homeTeam}
                </h2>
                <p className="text-graphite mt-2 text-sm">
                  {formatDate(nextEvent.scheduledStartAt)}
                </p>
                <Link
                  className="text-action mt-3 inline-flex min-h-11 items-center font-semibold hover:underline"
                  href={`/l/${state.league.slug}/event/${nextEvent.id}`}
                >
                  View game markets
                </Link>
              </>
            ) : (
              <p className="text-muted mt-2 text-sm">
                No designated game is currently published.
              </p>
            )}
          </section>
          <section className="border-boundary bg-subtle rounded-xl border p-5">
            <h2 className="font-bold">Privacy</h2>
            <p className="text-graphite mt-2 text-sm leading-6">
              Your opponent cannot see your future picks. Each pick reveals only
              when its game begins.
            </p>
          </section>
        </aside>
      </div>
    </PageFrame>
  );
}

export function Stage1SlateView({ state }: { state: Stage1StateDto }) {
  if (
    state.league.mode === "LIVE" &&
    state.week?.state === "PLANNED" &&
    state.slate.length > 0 &&
    !state.ownerCard
  ) {
    return (
      <PageFrame
        eyebrow={`${state.league.name} · Live Week 1`}
        title="Make picks"
        description={`Week 1 games are selected. Cards lock ${formatDate(state.week.commonLockAt)} and open after the roster is set.`}
        aside={liveStatus(state)}
      >
        <div className="mt-7 grid gap-4">
          {state.slate.map((event) => (
            <article
              className="border-boundary bg-surface rounded-xl border p-5"
              key={event.id}
            >
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                <div>
                  <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
                    {formatDate(event.scheduledStartAt)}
                  </p>
                  <h2 className="mt-2 text-lg font-bold">
                    {event.awayTeam} at {event.homeTeam}
                  </h2>
                </div>
                <StatusBadge tone="positive">6 outcomes stored</StatusBadge>
              </div>
              <ul className="border-boundary mt-4 grid gap-2 border-t pt-4 sm:grid-cols-2 lg:grid-cols-3">
                {event.markets.map((market) => (
                  <li
                    className="bg-subtle flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm"
                    key={market.id}
                  >
                    <span className="truncate">{market.proposition}</span>
                    <span className="shrink-0 font-mono font-semibold">
                      {formatOdds(market.americanOdds)}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </PageFrame>
    );
  }
  if (
    state.week &&
    state.league.lifecycle === "PLAYOFFS" &&
    state.slate.length > 0 &&
    !state.ownerCard
  ) {
    return (
      <PageFrame
        eyebrow={`${state.league.name} · Week ${state.week.nflWeek} ${state.week.scope.toLowerCase()}`}
        title="Make picks"
        description={`You do not have a card this round, but you can still view the selected games and card-lock time.`}
        aside={liveStatus(state)}
      >
        <div className="mt-7 grid gap-4">
          {state.slate.map((event) => (
            <article
              className="border-boundary bg-surface rounded-xl border p-5"
              key={event.id}
            >
              <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
                {formatDate(event.scheduledStartAt)}
              </p>
              <h2 className="mt-2 text-lg font-bold">
                {event.awayTeam} at {event.homeTeam}
              </h2>
              <p className="text-muted mt-2 text-sm">
                {event.markets.length} published outcomes
              </p>
            </article>
          ))}
        </div>
      </PageFrame>
    );
  }
  if (!state.week || !state.ownerCard) {
    return (
      <PageFrame
        eyebrow={`${state.league.name} · Formation`}
        title="Make picks"
        description="The Week 1 slate appears after the commissioner completes league setup."
      >
        <FormationPanel state={state} />
      </PageFrame>
    );
  }
  return (
    <PageFrame
      eyebrow="Current published odds"
      title="Make picks"
      description={`Cards lock ${formatDate(state.week.commonLockAt)}. Build a private draft, review the current terms, then confirm all 1,000 credits at once.`}
      aside={liveStatus(state)}
    >
      <Stage1CardBuilder state={state} />
    </PageFrame>
  );
}

export function Stage1CardView({ state }: { state: Stage1StateDto }) {
  if (state.week && state.league.lifecycle === "PLAYOFFS" && !state.ownerCard) {
    return (
      <PageFrame
        eyebrow={`${state.league.name} · Week ${state.week.nflWeek} ${state.week.scope.toLowerCase()}`}
        title="No card assigned this round"
        description="Only members scheduled to play this round receive a card."
        aside={liveStatus(state)}
      >
        <div className="border-boundary bg-surface mt-7 rounded-xl border p-6">
          <p className="text-graphite max-w-2xl leading-7">
            There is no card to complete and no penalty this week. Follow the
            bracket for current matchups and advancement.
          </p>
          <Link
            className="text-action mt-4 inline-flex min-h-11 items-center font-semibold hover:underline"
            href={`/l/${state.league.slug}/playoffs`}
          >
            View playoffs
          </Link>
        </div>
      </PageFrame>
    );
  }
  if (!state.week || !state.ownerCard) {
    return (
      <PageFrame
        eyebrow={`${state.league.name} · Formation`}
        title="My card"
        description="Your weekly card appears when the commissioner opens the week."
      >
        <FormationPanel state={state} />
      </PageFrame>
    );
  }
  return (
    <PageFrame
      eyebrow="Visible only to you"
      title={`My Week ${state.week.nflWeek} card`}
      description="You can always see your sealed picks. The commissioner cannot."
      aside={
        <StatusBadge
          tone={
            state.ownerCard.compliance === "COMPLIANT" ? "positive" : "sealed"
          }
        >
          {state.ownerCard.compliance === "COMPLIANT" ? "Ready" : "Incomplete"}
        </StatusBadge>
      }
    >
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          {state.ownerCard.positions.length === 0 ? (
            <p className="border-boundary bg-surface rounded-xl border p-6">
              No sealed picks yet.
            </p>
          ) : (
            <ol className="border-boundary bg-surface divide-boundary divide-y overflow-hidden rounded-lg border">
              {state.ownerCard.positions.map((position) => (
                <li className="p-4 sm:p-5" key={position.id}>
                  <div className="flex justify-between gap-4">
                    <div>
                      <p className="text-muted text-xs font-bold tracking-[0.08em] uppercase">
                        {position.marketType} · {position.eventLabel}
                      </p>
                      <h2 className="mt-2 font-bold">{position.proposition}</h2>
                    </div>
                    <p className="font-mono font-semibold">
                      {formatOdds(position.americanOdds)}
                    </p>
                  </div>
                  <dl className="border-boundary mt-4 grid grid-cols-2 gap-4 border-t pt-4 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-muted">Line</dt>
                      <dd className="mt-1 font-mono font-semibold">
                        {formatLine(position.lineMilli, position.marketType)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Stake</dt>
                      <dd className="mt-1 font-mono font-semibold">
                        {formatCredits(position.stakeCredits)}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted">Accepted</dt>
                      <dd className="mt-1 font-semibold">
                        {formatDate(position.acceptedAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Result</dt>
                      <dd className="mt-1 font-semibold">
                        {position.settlement?.outcome ?? "Pending"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Returned</dt>
                      <dd className="mt-1 font-mono font-semibold">
                        {position.settlement
                          ? formatScore(
                              position.settlement.returnedCenticredits,
                            )
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                  <Link
                    className="text-action mt-4 inline-flex text-sm font-semibold hover:underline"
                    href={`/l/${state.league.slug}/receipt/${position.id}`}
                  >
                    View receipt
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </div>
        <aside className="border-boundary bg-surface h-fit rounded-xl border p-5">
          <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
            Card total
          </p>
          <p className="mt-2 font-mono text-2xl font-bold">
            {formatCredits(state.ownerCard.allocatedCredits)} / 1,000
          </p>
          <p className="text-muted mt-2 text-sm">
            {formatCredits(state.ownerCard.remainingCredits)} left · sealed
            picks cannot be changed.
          </p>
        </aside>
      </div>
    </PageFrame>
  );
}

export function Stage1LiveView({ state }: { state: Stage1StateDto }) {
  if (!state.week || !state.matchup) {
    return (
      <PageFrame
        eyebrow={`${state.league.name} · Formation`}
        title="Live matchup"
        description="Reveal begins only after reliable actual kickoff."
      >
        <FormationPanel state={state} />
      </PageFrame>
    );
  }
  const hasLiveEvent = state.slate.some((event) => event.state === "LIVE");
  return (
    <PageFrame
      eyebrow={hasLiveEvent ? "Live now" : "Game-day matchup"}
      title={`${state.viewer.displayName} vs ${state.matchup.opponentName}`}
      description="Picks reveal game by game after kickoff. Future picks remain sealed."
      aside={liveStatus(state)}
      dark={hasLiveEvent}
    >
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="border-boundary bg-surface rounded-xl border p-5">
          <h2 className="text-lg font-bold">Opponent picks revealed by game</h2>
          <div className="mt-4 space-y-3">
            {state.matchup.opponentRevealedPositions.map((position) => (
              <article
                className="border-boundary bg-subtle rounded-lg border p-4"
                key={position.id}
              >
                <p className="text-muted text-xs">
                  {position.eventLabel} · {position.marketType}
                </p>
                <div className="mt-2 flex justify-between gap-4">
                  <p className="font-semibold">{position.proposition}</p>
                  <p className="font-mono">
                    {formatCredits(position.stakeCredits)}
                  </p>
                </div>
              </article>
            ))}
            {state.matchup.futureSealed ? (
              <div className="border-boundary bg-subtle rounded-lg border px-4 py-5 text-center">
                <p className="font-semibold">Future picks sealed</p>
                <p className="text-muted mt-1 text-xs">
                  Unstarted games remain private.
                </p>
              </div>
            ) : null}
            {state.matchup.opponentRevealedPositions.length === 0 &&
            !state.matchup.futureSealed ? (
              <p className="text-muted">No opponent picks were sealed.</p>
            ) : null}
          </div>
        </section>
        <aside className="border-boundary bg-surface h-fit rounded-xl border p-5">
          <h2 className="font-bold">What remains private</h2>
          <p className="text-graphite mt-2 text-sm leading-6">
            Only picks tied to games that have started appear here. Everything
            else remains private.
          </p>
        </aside>
      </div>
    </PageFrame>
  );
}

export function Stage1LeagueView({ state }: { state: Stage1StateDto }) {
  const week = state.week?.nflWeek ?? 1;
  const currentState = weekStatus(state);
  const games = state.schedule.map((matchup) => ({
    id: matchup.id,
    sideAName: matchup.sideAName,
    sideBName: matchup.sideBName,
    sideAScoreCenticredits: matchup.result?.sideAPointsForCenticredits ?? null,
    sideBScoreCenticredits: matchup.result?.sideBPointsForCenticredits ?? null,
    state: matchup.result?.status === "FINAL" ? "Final" : currentState,
    competition: competitionLabel({
      lifecycle: state.league.lifecycle,
      postseasonRole: matchup.postseasonRole,
      scope: matchup.scope,
      week,
    }),
    selected: [matchup.sideAEntryId, matchup.sideBEntryId].includes(
      state.viewer.entryId,
    ),
  }));

  return (
    <PageFrame
      eyebrow={`${state.league.name} · Week ${state.week?.nflWeek ?? 1}${state.week ? ` ${state.week.scope.toLowerCase()}` : ""}`}
      title="League Overview"
      description={
        state.league.lifecycle === "PLAYOFFS"
          ? "Current playoff matchups and final scores."
          : "This week’s league matchups and scores."
      }
      aside={liveStatus(state)}
    >
      {!state.week ? (
        <FormationPanel state={state} />
      ) : (
        <div className="mt-6 grid gap-7 xl:grid-cols-[minmax(0,1fr)_340px]">
          <LeagueScoreboard
            games={games}
            leagueSlug={state.league.slug}
            showOverviewLink={false}
            week={week}
          />
          <section aria-labelledby="league-members-heading" className="h-fit">
            <p className="text-muted text-xs font-bold tracking-[0.08em] uppercase">
              Member identity
            </p>
            <h2 className="mt-1 text-lg font-bold" id="league-members-heading">
              League members
            </h2>
            <ul className="border-boundary bg-surface mt-3 divide-y overflow-hidden rounded-lg border">
              {state.members.map((member) => (
                <li
                  className="flex min-h-12 items-center justify-between gap-3 px-4 py-2 text-sm"
                  key={member.userId}
                >
                  <span className="min-w-0 font-semibold break-words">
                    {member.displayName}
                    {member.entryId === state.viewer.entryId ? (
                      <span className="text-registry ml-2 text-xs font-bold">
                        You
                      </span>
                    ) : null}
                  </span>
                  <span className="text-muted shrink-0 text-xs">
                    {member.role === "COMMISSIONER" ? "Commissioner" : "Member"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </PageFrame>
  );
}

export function Stage1StandingsView({
  ruleset,
  state,
}: {
  ruleset: RulesetPresentation;
  state: Stage1StateDto;
}) {
  const playoffRules = ruleset.canonicalJson.playoffs;
  const qualifierCount =
    state.league.memberCount <= playoffRules.smallLeagueMaximumSize
      ? playoffRules.smallLeagueQualifiers
      : playoffRules.largeLeagueQualifiers;
  const rows = state.standings.map((row) => ({
    entryId: row.entryId,
    rank: row.seed,
    memberName: row.displayName,
    wins: row.wins,
    losses: row.losses,
    ties: row.ties,
    pointsForCenticredits: row.pointsForCenticredits,
    allPlayHalfWinUnits: row.allPlayHalfWinUnits,
    allPlayComparisonCount: row.allPlayComparisonCount,
    attendanceMisses: row.attendanceMisses,
    playoffState:
      row.seed <= qualifierCount
        ? state.league.lifecycle === "PLAYOFFS"
          ? "Qualified"
          : "Playoff seed"
        : state.league.lifecycle === "PLAYOFFS"
          ? "Outside field"
          : "Outside cutline",
    inPlayoffField: row.seed <= qualifierCount,
    current: row.entryId === state.viewer.entryId,
  }));

  return (
    <PageFrame
      eyebrow={
        state.league.lifecycle === "PLAYOFFS"
          ? "Regular season final · Week 14"
          : `Official through Week ${state.week?.nflWeek ?? 1}`
      }
      title="Standings"
      description={
        state.league.lifecycle === "PLAYOFFS"
          ? "The final regular-season table. Playoff results appear in the bracket."
          : "Updated after the latest final matchup."
      }
      aside={liveStatus(state)}
    >
      {state.standings.length === 0 ? (
        <div className="border-boundary bg-surface mt-7 rounded-xl border p-6">
          <p>
            Standings publish after every Week {state.week?.nflWeek ?? 1}
            matchup completes.
          </p>
        </div>
      ) : (
        <StandingsTable
          caption="Official league standings through the latest final matchup"
          rows={rows}
        />
      )}
      <StandingsRulesetSummary presentation={ruleset} />
    </PageFrame>
  );
}

export function Stage1CommissionerView({
  invites,
  leagueManagement,
  latestLiveImport,
  liveWeekOperations,
  providerConfigured,
  state,
  week17CorrectionOperations,
}: {
  invites: LeagueInviteSummary[];
  leagueManagement: MyLeagueSummary | null;
  latestLiveImport: LiveOddsImportReview | null;
  liveWeekOperations: LiveWeekOperations | null;
  providerConfigured: boolean;
  state: Stage1StateDto;
  week17CorrectionOperations: Week17CorrectionOperations | null;
}) {
  if (!state.commissioner.isCommissioner) {
    return (
      <PageFrame
        eyebrow={`${state.league.name} · Permission boundary`}
        title="Commissioner console"
        description="This account is not the league commissioner."
      >
        <div className="border-negative/25 bg-negative/10 mt-7 rounded-xl border p-5">
          Commissioner membership is required.
        </div>
      </PageFrame>
    );
  }
  return (
    <PageFrame
      eyebrow={`${state.league.name} · Commissioner`}
      title="Commissioner console"
      description="Run the season one step at a time. Member picks stay private, and published results cannot be manually rewritten."
      aside={liveStatus(state)}
    >
      <>
        <section
          aria-labelledby="commissioner-current-state"
          className="border-boundary bg-surface mt-6 rounded-lg border p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-bold" id="commissioner-current-state">
              Current league and season state
            </h2>
            {liveStatus(state)}
          </div>
          <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-muted">Lifecycle</dt>
              <dd className="font-semibold sm:mt-1">
                {state.league.lifecycle.replaceAll("_", " ")}
              </dd>
            </div>
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-muted">Members</dt>
              <dd className="font-semibold sm:mt-1">
                {state.league.memberCount}/16
              </dd>
            </div>
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-muted">Week</dt>
              <dd className="font-semibold sm:mt-1">
                {state.week
                  ? `${state.week.nflWeek} · ${state.week.state}`
                  : "Formation"}
              </dd>
            </div>
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-muted">Ready cards · Corrections</dt>
              <dd className="font-semibold sm:mt-1">
                {state.commissioner.readyCount ?? "Sealed"} ·{" "}
                {state.commissioner.correctionCount}
              </dd>
            </div>
          </dl>
        </section>

        <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Stage1CommissionerControls
            invites={invites}
            latestLiveImport={latestLiveImport}
            liveWeekOperations={liveWeekOperations}
            providerConfigured={providerConfigured}
            state={{
              league: {
                id: state.league.id,
                slug: state.league.slug,
                memberCount: state.league.memberCount,
                lifecycle: state.league.lifecycle,
                mode: state.league.mode,
              },
              week: state.week
                ? {
                    nflWeek: state.week.nflWeek,
                    scope: state.week.scope,
                    state: state.week.state,
                    commonLockAt: state.week.commonLockAt,
                    correctionWindowClosesAt:
                      state.week.correctionWindowClosesAt,
                  }
                : null,
              slate: state.slate.map((event) => ({
                id: event.id,
                key: event.key,
                state: event.state,
                scheduledStartAt: event.scheduledStartAt,
                awayTeam: event.awayTeam,
                homeTeam: event.homeTeam,
                latestObservedAt: event.markets.reduce(
                  (latest, market) =>
                    market.observedAt > latest ? market.observedAt : latest,
                  event.markets[0]?.observedAt ?? event.scheduledStartAt,
                ),
              })),
              members: state.members.map((member) => ({
                displayName: member.displayName,
                role: member.role,
                userId: member.userId,
              })),
            }}
            week17CorrectionOperations={week17CorrectionOperations}
          />
          <aside>
            <details className="border-negative/25 bg-negative/10 overflow-hidden rounded-lg border">
              <summary className="text-negative flex min-h-12 cursor-pointer list-none items-center px-5 py-3 font-bold [&::-webkit-details-marker]:hidden">
                Member privacy boundary
              </summary>
              <p className="text-graphite px-5 pb-5 text-sm leading-6">
                You can see how many cards are ready, but never a member’s picks
                before they are revealed by the game schedule.
              </p>
            </details>
          </aside>
        </div>
        {leagueManagement ? (
          <details className="border-boundary bg-surface mt-6 overflow-hidden rounded-lg border">
            <summary className="hover:bg-subtle flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 font-bold [&::-webkit-details-marker]:hidden">
              <span>Lifecycle and league settings</span>
              <span className="text-muted text-xs font-semibold">
                Reversible and destructive actions separated
              </span>
            </summary>
            <div className="border-boundary border-t px-5 pb-5">
              <LeagueSettings
                archived={leagueManagement.archivedAt !== null}
                canDelete={leagueManagement.canDelete}
                leagueName={leagueManagement.name}
                leagueSlug={leagueManagement.slug}
                lifecycle={leagueManagement.lifecycle}
                members={state.members.map((member) => ({
                  displayName: member.displayName,
                  role: member.role,
                  userId: member.userId,
                }))}
              />
            </div>
          </details>
        ) : null}
      </>
    </PageFrame>
  );
}

export function Stage1ScheduleView({
  liveSchedule,
  state,
}: {
  liveSchedule?: LiveRegularSeasonSchedule | null;
  state: Stage1StateDto;
}) {
  const currentWeek = state.week?.nflWeek ?? 1;
  const currentPair = new Map(
    state.schedule.map((matchup) => [
      [matchup.sideAEntryId, matchup.sideBEntryId].sort().join(":"),
      matchup,
    ]),
  );
  const weeks: ScheduleWeekRecord[] = liveSchedule
    ? Array.from({ length: 14 }, (_, index) => index + 1).map((week) => ({
        week,
        label: `Week ${week}`,
        status:
          week === currentWeek
            ? weekStatus(state)
            : week < currentWeek
              ? "Final"
              : "Scheduled",
        matchups: liveSchedule.matchups
          .filter((matchup) => matchup.week === week)
          .map((matchup) => {
            const current = currentPair.get(
              [matchup.sideAEntryId, matchup.sideBEntryId].sort().join(":"),
            );
            const sameOrder = current?.sideAEntryId === matchup.sideAEntryId;
            return {
              id: `${week}-${matchup.sideAEntryId}-${matchup.sideBEntryId}`,
              sideAName: matchup.sideAName,
              sideBName: matchup.sideBName,
              sideAScoreCenticredits:
                week === currentWeek
                  ? sameOrder
                    ? (current?.result?.sideAPointsForCenticredits ?? null)
                    : (current?.result?.sideBPointsForCenticredits ?? null)
                  : null,
              sideBScoreCenticredits:
                week === currentWeek
                  ? sameOrder
                    ? (current?.result?.sideBPointsForCenticredits ?? null)
                    : (current?.result?.sideAPointsForCenticredits ?? null)
                  : null,
              status:
                week === currentWeek
                  ? (current?.result?.status ?? weekStatus(state))
                  : week < currentWeek
                    ? "Final"
                    : "Scheduled",
              competition: "Regular season",
              currentMember: [
                matchup.sideAEntryId,
                matchup.sideBEntryId,
              ].includes(state.viewer.entryId),
              sideAWinner: sameOrder
                ? current?.result?.sideADecision === "WIN"
                : current?.result?.sideBDecision === "WIN",
              sideBWinner: sameOrder
                ? current?.result?.sideBDecision === "WIN"
                : current?.result?.sideADecision === "WIN",
            };
          }),
      }))
    : [];

  if (state.week && !weeks.some((week) => week.week === currentWeek)) {
    weeks.push({
      week: currentWeek,
      label:
        currentWeek === 18 ? "Week 18 · Exhibition" : `Week ${currentWeek}`,
      status: weekStatus(state),
      matchups: state.schedule.map((matchup) => ({
        id: matchup.id,
        sideAName: matchup.sideAName,
        sideBName: matchup.sideBName,
        sideAScoreCenticredits:
          matchup.result?.sideAPointsForCenticredits ?? null,
        sideBScoreCenticredits:
          matchup.result?.sideBPointsForCenticredits ?? null,
        status: matchup.result?.status ?? weekStatus(state),
        competition: competitionLabel({
          lifecycle: state.league.lifecycle,
          postseasonRole: matchup.postseasonRole,
          scope: matchup.scope,
          week: currentWeek,
        }),
        currentMember: [matchup.sideAEntryId, matchup.sideBEntryId].includes(
          state.viewer.entryId,
        ),
        sideAWinner: matchup.result?.sideADecision === "WIN",
        sideBWinner: matchup.result?.sideBDecision === "WIN",
      })),
    });
  }

  return (
    <PageFrame
      eyebrow="Published at roster lock"
      title="Schedule"
      description="Choose one week to review its authoritative matchups. Private card terms are never included."
      aside={liveStatus(state)}
    >
      {!state.week && !liveSchedule ? (
        <FormationPanel state={state} />
      ) : (
        <>
          <ScheduleNavigator initialWeek={currentWeek} weeks={weeks} />
          <AuditDetails
            className="mt-5"
            context="This evidence verifies the fixed schedule shown above. It never contains private card terms."
          >
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-muted">Method</dt>
                <dd className="mt-1 font-semibold">
                  {liveSchedule?.algorithmVersion ?? "Circle schedule"}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted">Verification code</dt>
                <dd className="mt-1 font-mono text-xs break-all">
                  {liveSchedule?.outputHash ?? state.season.scheduleSeed}
                </dd>
              </div>
              {liveSchedule ? (
                <div>
                  <dt className="text-muted">Published</dt>
                  <dd className="mt-1 font-semibold">
                    {formatDate(liveSchedule.publishedAt)}
                  </dd>
                </div>
              ) : null}
            </dl>
          </AuditDetails>
        </>
      )}
    </PageFrame>
  );
}

export function Stage1DeferredView({
  state,
  title,
  description,
}: {
  state: Stage1StateDto;
  title: string;
  description: string;
}) {
  return (
    <PageFrame
      eyebrow={state.league.name}
      title={title}
      description={description}
      aside={<StatusBadge tone="pending">Not published</StatusBadge>}
    >
      <section className="border-boundary bg-surface mt-7 max-w-3xl rounded-xl border p-6">
        <h2 className="font-bold">Current season</h2>
        <p className="text-graphite mt-3 leading-7">
          This page will fill in when the required week or season result is
          final.
        </p>
        <Link
          className="text-action mt-4 inline-flex min-h-11 items-center font-semibold hover:underline"
          href={`/l/${state.league.slug}/matchup`}
        >
          Return to current matchup
        </Link>
      </section>
    </PageFrame>
  );
}

export function Stage1EventView({
  state,
  eventId,
}: {
  state: Stage1StateDto;
  eventId: string;
}) {
  const event = state.slate.find((candidate) => candidate.id === eventId);
  if (!event || !state.ownerCard || !state.week) return null;
  return (
    <PageFrame
      eyebrow={`${event.awayTeam} at ${event.homeTeam}`}
      title="Game picks"
      description={`${formatDate(event.scheduledStartAt)} · ${event.state}`}
      aside={
        <Link
          className="text-action inline-flex min-h-11 items-center font-semibold hover:underline"
          href={`/l/${state.league.slug}/slate`}
        >
          Back to slate
        </Link>
      }
    >
      <div className="mt-7 grid gap-4 md:grid-cols-2">
        {event.markets.map((market) => (
          <article
            className="border-boundary bg-surface rounded-xl border p-5"
            key={market.id}
          >
            <div className="flex justify-between gap-4">
              <div>
                <p className="text-muted text-xs">
                  {market.marketType} ·{" "}
                  {market.qualityStatus === "HEALTHY"
                    ? "Available"
                    : "Unavailable"}
                </p>
                <h2 className="mt-2 font-bold">{market.proposition}</h2>
              </div>
              <p className="font-mono font-semibold">
                {formatOdds(market.americanOdds)}
              </p>
            </div>
            {state.week?.state === "OPEN" &&
            market.qualityStatus === "HEALTHY" ? (
              <Link
                className="border-registry text-registry hover:bg-subtle mt-4 inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-semibold"
                href={`/l/${state.league.slug}/slate`}
              >
                Select on slate
              </Link>
            ) : null}
          </article>
        ))}
      </div>
    </PageFrame>
  );
}

export function Stage1ReceiptView({
  state,
  receiptId,
}: {
  state: Stage1StateDto;
  receiptId: string;
}) {
  const receipt = state.ownerCard?.positions.find(
    (position) => position.id === receiptId,
  );
  if (!receipt) return null;
  const event = state.slate.find(
    (candidate) => candidate.id === receipt.eventId,
  );
  const corrected = event?.state === "CORRECTED";
  const result = receipt.settlement?.outcome ?? "Pending";
  return (
    <PageFrame
      eyebrow="Sealed pick"
      title="Pick receipt"
      description="Human-readable proof of the accepted terms and official result."
    >
      <ReceiptPanel
        status={
          <StatusBadge
            tone={
              corrected
                ? "corrected"
                : receipt.settlement
                  ? "positive"
                  : "sealed"
            }
          >
            {corrected
              ? "Corrected"
              : receipt.settlement
                ? "Settled"
                : "Sealed"}
          </StatusBadge>
        }
        summary={`${receipt.proposition} at ${formatOdds(receipt.americanOdds)} for ${formatCredits(receipt.stakeCredits)} credits. ${result === "Pending" ? "The official result is pending." : `Official result: ${result}.`}`}
        audit={
          <AuditDetails
            className="border-b-0 pb-0"
            context="This identifier verifies the accepted receipt described above. It does not change the stored pick or its result."
          >
            <dl>
              <div>
                <dt className="text-muted">Receipt ID</dt>
                <dd className="mt-1 font-mono text-xs break-all">
                  {receipt.receiptHash}
                </dd>
              </div>
            </dl>
          </AuditDetails>
        }
      >
        <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2">
            <dt className="text-muted text-xs uppercase">Accepted pick</dt>
            <dd className="mt-1 font-semibold">{receipt.proposition}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs uppercase">Event</dt>
            <dd className="mt-1 font-semibold">{receipt.eventLabel}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs uppercase">Market</dt>
            <dd className="mt-1 font-semibold">{receipt.marketType}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs uppercase">Line</dt>
            <dd className="mt-1 font-mono font-semibold">
              {formatLine(receipt.lineMilli, receipt.marketType)}
            </dd>
          </div>
          <div>
            <dt className="text-muted text-xs uppercase">Odds</dt>
            <dd className="mt-1 font-mono font-semibold">
              {formatOdds(receipt.americanOdds)}
            </dd>
          </div>
          <div>
            <dt className="text-muted text-xs uppercase">Stake</dt>
            <dd className="mt-1 font-mono font-semibold">
              {formatCredits(receipt.stakeCredits)}
            </dd>
          </div>
          <div>
            <dt className="text-muted text-xs uppercase">Accepted</dt>
            <dd className="mt-1 font-semibold">
              {formatDate(receipt.acceptedAt)}
            </dd>
          </div>
          <div>
            <dt className="text-muted text-xs uppercase">Result</dt>
            <dd className="mt-1 font-semibold">{result}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs uppercase">Returned credits</dt>
            <dd className="mt-1 font-mono font-semibold">
              {receipt.settlement
                ? formatScore(receipt.settlement.returnedCenticredits)
                : "Pending"}
            </dd>
          </div>
        </dl>
        {corrected ? (
          <div className="border-corrected/30 bg-corrected/10 mt-5 rounded-lg border px-4 py-3 text-sm">
            <p className="text-corrected font-bold">
              Official correction applied
            </p>
            <p className="text-graphite mt-1 leading-6">
              The official event result was corrected. The accepted pick, line,
              odds, stake, and immutable receipt remain unchanged.
            </p>
          </div>
        ) : null}
      </ReceiptPanel>
    </PageFrame>
  );
}
