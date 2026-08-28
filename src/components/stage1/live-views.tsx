import Link from "next/link";
import type { ReactNode } from "react";
import type { Stage1StateDto } from "@/application/queries/stage1-dtos";
import type { LiveOddsImportReview } from "@/application/queries/get-live-odds-import";
import type { LeagueInviteSummary } from "@/application/queries/league-invite-dtos";
import type { LiveRegularSeasonSchedule } from "@/application/queries/get-live-regular-season-schedule";
import type { LiveWeekOperations } from "@/application/queries/get-live-week-operations";
import { Stage1CardBuilder } from "@/components/card/stage1-card-builder";
import { Stage1CommissionerControls } from "@/components/commissioner/stage1-controls";
import { PageFrame } from "@/components/league/page-frame";
import { AllocationMeter } from "@/components/matchup/allocation-meter";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCenticredits } from "@/domain/odds/american";

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

function formatScore(value: number): string {
  return formatCenticredits(BigInt(value), true);
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
          ? "The eligible NFL events and common lock are fixed. Competitive play remains closed until an even roster of 4–16 locks and the balanced schedule, matchups, and weekly cards publish."
          : "A full season can publish with any even roster from 4 through 16; the interactive Week 1 demo publishes at exactly eight. Until a path is chosen, there is no schedule, slate, card, opponent readiness, or hidden competitive state to infer."}
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
        description="Your entry is not scheduled in this round. That can mean a bye, an exhibition exclusion, or the end of its championship path."
        aside={liveStatus(state)}
      >
        <div className="border-boundary bg-surface mt-7 rounded-xl border p-6">
          <h2 className="text-lg font-bold">The round still runs normally</h2>
          <p className="text-graphite mt-2 max-w-2xl text-sm leading-6">
            No private card was created for this entry, so there is nothing to
            seal. Published matchups and advancement remain visible on the
            playoff ledger.
          </p>
          <Link
            className="text-action mt-4 inline-flex min-h-11 items-center font-semibold hover:underline"
            href={`/l/${state.league.slug}/playoffs`}
          >
            Open the playoff ledger
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
        description="The first matchup appears when the eight-entry roster publishes."
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
            label: `Allocate remaining ${state.ownerCard.remainingCredits}`,
          }
      : state.week.state === "FINAL"
        ? {
            href: `/l/${state.league.slug}/league`,
            label: "View final league scoreboard",
          }
        : {
            href: `/l/${state.league.slug}/live`,
            label: "Open live matchup",
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
                    : `${state.ownerCard.allocatedCredits} allocated · ${state.ownerCard.remainingCredits} remaining`}
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
                      : "Sealed until common lock"}
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
              Your opponent cannot inspect your future selections. Each position
              reveals only when its game begins.
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
        title="Published NFL slate"
        description={`The eligible event set is immutable. Common lock ${formatDate(state.week.commonLockAt)}; cards stay closed until the roster and schedule publish.`}
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
        title="Published NFL slate"
        description={`This round's event set is immutable. Your entry has no card this round, but the official markets and common lock remain visible.`}
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
        title="Week 1 slate"
        description="The Week 1 slate appears after the commissioner completes league setup."
      >
        <FormationPanel state={state} />
      </PageFrame>
    );
  }
  return (
    <PageFrame
      eyebrow="Current published odds"
      title={`Week ${state.week.nflWeek} slate`}
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
        description="Cards are granted only to entries scheduled in the published postseason round."
        aside={liveStatus(state)}
      >
        <div className="border-boundary bg-surface mt-7 rounded-xl border p-6">
          <p className="text-graphite max-w-2xl leading-7">
            There is no allocation to complete and no penalty for this entry.
            Follow the official bracket for the current matchup field and
            advancement.
          </p>
          <Link
            className="text-action mt-4 inline-flex min-h-11 items-center font-semibold hover:underline"
            href={`/l/${state.league.slug}/playoffs`}
          >
            Open the playoff ledger
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
        description="The weekly card is granted when the commissioner publishes the operational slate."
      >
        <FormationPanel state={state} />
      </PageFrame>
    );
  }
  return (
    <PageFrame
      eyebrow="Visible only to you"
      title={`My Week ${state.week.nflWeek} card`}
      description="Your exact accepted terms are always visible to you and never available to the commissioner."
      aside={
        <StatusBadge
          tone={
            state.ownerCard.compliance === "COMPLIANT" ? "positive" : "sealed"
          }
        >
          {state.ownerCard.compliance}
        </StatusBadge>
      }
    >
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {state.ownerCard.positions.length === 0 ? (
            <p className="border-boundary bg-surface rounded-xl border p-6">
              No accepted positions yet.
            </p>
          ) : (
            state.ownerCard.positions.map((position) => (
              <article
                className="border-boundary bg-surface rounded-xl border p-5"
                key={position.id}
              >
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
                    <dt className="text-muted">Stake</dt>
                    <dd className="mt-1 font-mono font-semibold">
                      {position.stakeCredits}
                    </dd>
                  </div>
                  <div>
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
                        ? formatScore(position.settlement.returnedCenticredits)
                        : "—"}
                    </dd>
                  </div>
                </dl>
                <Link
                  className="text-action mt-4 inline-flex text-sm font-semibold hover:underline"
                  href={`/l/${state.league.slug}/receipt/${position.id}`}
                >
                  Open immutable receipt
                </Link>
              </article>
            ))
          )}
        </div>
        <aside className="border-boundary bg-surface h-fit rounded-xl border p-5">
          <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
            Allocation meter
          </p>
          <p className="mt-2 font-mono text-2xl font-bold">
            {state.ownerCard.allocatedCredits} / 1,000
          </p>
          <p className="text-muted mt-2 text-sm">
            {state.ownerCard.remainingCredits} remaining · accepted decisions
            cannot be canceled.
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
      description="Positions reveal game by game after actual kickoff. Future selections remain sealed."
      aside={liveStatus(state)}
      dark={hasLiveEvent}
    >
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="border-boundary bg-surface rounded-xl border p-5">
          <h2 className="text-lg font-bold">
            Opponent positions revealed by event
          </h2>
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
                  <p className="font-mono">{position.stakeCredits}</p>
                </div>
              </article>
            ))}
            {state.matchup.futureSealed ? (
              <div className="border-boundary bg-subtle rounded-lg border px-4 py-5 text-center">
                <p className="font-semibold">Future positions sealed</p>
                <p className="text-muted mt-1 text-xs">
                  One generic placeholder; no hidden count, allocation, market,
                  or geometry.
                </p>
              </div>
            ) : null}
            {state.matchup.opponentRevealedPositions.length === 0 &&
            !state.matchup.futureSealed ? (
              <p className="text-muted">No opponent positions were accepted.</p>
            ) : null}
          </div>
        </section>
        <aside className="border-boundary bg-surface h-fit rounded-xl border p-5">
          <h2 className="font-bold">What remains private</h2>
          <p className="text-graphite mt-2 text-sm leading-6">
            Only selections tied to games that have started appear here. No
            future position count, allocation, or outcome is disclosed.
          </p>
        </aside>
      </div>
    </PageFrame>
  );
}

export function Stage1LeagueView({ state }: { state: Stage1StateDto }) {
  return (
    <PageFrame
      eyebrow={`${state.league.name} · Week ${state.week?.nflWeek ?? 1}${state.week ? ` ${state.week.scope.toLowerCase()}` : ""}`}
      title="Around the league"
      description={
        state.league.lifecycle === "PLAYOFFS"
          ? "The published postseason pairings and latest result versions; sealed terms never enter this scoreboard."
          : "Frozen scheduled matchups; sealed terms never enter this scoreboard."
      }
      aside={liveStatus(state)}
    >
      {!state.week ? (
        <FormationPanel state={state} />
      ) : (
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          {state.schedule.map((matchup) => (
            <article
              className={`bg-surface rounded-xl border p-5 ${[matchup.sideAEntryId, matchup.sideBEntryId].includes(state.viewer.entryId) ? "border-registry" : "border-boundary"}`}
              key={matchup.id}
            >
              <p className="text-muted text-xs font-bold tracking-[0.08em] uppercase">
                {matchup.scope.toLowerCase()} · Matchup {matchup.displayOrder}
              </p>
              <div className="mt-4 flex justify-between gap-4">
                <p className="font-bold">{matchup.sideAName}</p>
                <p className="font-mono">
                  {matchup.result
                    ? formatScore(matchup.result.sideAPointsForCenticredits)
                    : "—"}
                </p>
              </div>
              <div className="border-boundary mt-4 flex justify-between gap-4 border-t pt-4">
                <p className="font-bold">{matchup.sideBName}</p>
                <p className="font-mono">
                  {matchup.result
                    ? formatScore(matchup.result.sideBPointsForCenticredits)
                    : "—"}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </PageFrame>
  );
}

export function Stage1StandingsView({ state }: { state: Stage1StateDto }) {
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
          ? "The regular-season ordering is frozen. Postseason results advance the bracket without rewriting these standings."
          : "The latest snapshot derives from the newest official result-version chain."
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
        <>
          <div className="mt-7 space-y-3 sm:hidden">
            {state.standings.map((row) => {
              const playoffCutline = state.league.memberCount <= 8 ? 4 : 6;
              return (
                <details
                  className={`border-boundary bg-surface rounded-xl border ${
                    row.entryId === state.viewer.entryId
                      ? "border-l-registry border-l-4"
                      : ""
                  }`}
                  key={row.entryId}
                >
                  <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-4 [&::-webkit-details-marker]:hidden">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="text-registry w-7 shrink-0 font-mono font-bold">
                        {row.seed}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-bold">{row.displayName}</p>
                        <p className="text-muted mt-1 text-xs">
                          {row.wins}–{row.losses}
                          {row.ties ? `–${row.ties}` : ""} ·{" "}
                          {formatScore(row.pointsForCenticredits)} PF
                        </p>
                      </div>
                    </div>
                    <span className="text-muted shrink-0 text-xs font-semibold">
                      {row.seed <= playoffCutline
                        ? "Playoff seed"
                        : "Outside cutline"}
                    </span>
                  </summary>
                  <dl className="border-boundary grid grid-cols-2 gap-4 border-t px-4 py-4 text-sm">
                    <div>
                      <dt className="text-muted text-xs">All-play</dt>
                      <dd className="mt-1 font-semibold">
                        {row.allPlayHalfWinUnits / 2}–
                        {row.allPlayComparisonCount -
                          row.allPlayHalfWinUnits / 2}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted text-xs">Attendance misses</dt>
                      <dd className="mt-1 font-semibold">
                        {row.attendanceMisses} of 3
                      </dd>
                    </div>
                  </dl>
                </details>
              );
            })}
          </div>
          <div className="border-boundary bg-surface mt-7 hidden overflow-x-auto rounded-xl border sm:block">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-subtle text-muted text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Seed</th>
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Record</th>
                  <th className="px-4 py-3">Points For</th>
                  <th className="px-4 py-3">All-play</th>
                  <th className="px-4 py-3">Misses</th>
                </tr>
              </thead>
              <tbody className="divide-boundary divide-y">
                {state.standings.map((row) => (
                  <tr
                    className={
                      row.entryId === state.viewer.entryId
                        ? "bg-registry/5"
                        : ""
                    }
                    key={row.entryId}
                  >
                    <td className="px-4 py-4 font-mono font-semibold">
                      {row.seed}
                    </td>
                    <th className="px-4 py-4">{row.displayName}</th>
                    <td className="px-4 py-4">
                      {row.wins}-{row.losses}-{row.ties}
                    </td>
                    <td className="px-4 py-4 font-mono">
                      {formatScore(row.pointsForCenticredits)}
                    </td>
                    <td className="px-4 py-4">
                      {row.allPlayHalfWinUnits / 2}-
                      {row.allPlayComparisonCount - row.allPlayHalfWinUnits / 2}
                    </td>
                    <td className="px-4 py-4">{row.attendanceMisses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </PageFrame>
  );
}

export function Stage1CommissionerView({
  invites,
  latestLiveImport,
  liveWeekOperations,
  providerConfigured,
  state,
}: {
  invites: LeagueInviteSummary[];
  latestLiveImport: LiveOddsImportReview | null;
  liveWeekOperations: LiveWeekOperations | null;
  providerConfigured: boolean;
  state: Stage1StateDto;
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
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
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
                  correctionWindowClosesAt: state.week.correctionWindowClosesAt,
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
          }}
        />
        <aside className="space-y-5">
          <section className="border-boundary bg-surface rounded-xl border p-5">
            <h2 className="font-bold">Current state</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt>Members</dt>
                <dd>{state.league.memberCount}/16 maximum</dd>
              </div>
              <div className="flex justify-between">
                <dt>Week</dt>
                <dd>{state.week?.state ?? "FORMING"}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Ready cards</dt>
                <dd>{state.commissioner.readyCount ?? "Sealed"}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Corrections</dt>
                <dd>{state.commissioner.correctionCount}</dd>
              </div>
            </dl>
          </section>
          <section className="border-negative/25 bg-negative/10 rounded-xl border p-5">
            <h2 className="text-negative font-bold">Member privacy</h2>
            <p className="text-graphite mt-2 text-sm leading-6">
              You can see how many cards are ready, but never a member’s picks
              before they are revealed by the game schedule.
            </p>
          </section>
        </aside>
      </div>
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
  if (state.league.mode === "LIVE") {
    return (
      <PageFrame
        eyebrow="Published at roster lock"
        title="2026 regular-season schedule"
        description="One matchup per member per week. Once the roster locks, all 14 weeks are published and future NFL slates do not change these opponents."
        aside={liveStatus(state)}
      >
        {!liveSchedule ? (
          <FormationPanel state={state} />
        ) : (
          <>
            <section className="border-boundary bg-surface mt-7 rounded-xl border p-5">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                  <p className="font-semibold">14-week schedule locked</p>
                  <p className="text-muted mt-1 text-xs">
                    Published {formatDate(liveSchedule.publishedAt)}
                  </p>
                </div>
                <StatusBadge tone="positive">Verified</StatusBadge>
              </div>
              <details className="border-boundary mt-4 border-t pt-4 text-sm">
                <summary className="cursor-pointer font-semibold">
                  Schedule verification
                </summary>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-muted">Method</dt>
                    <dd className="mt-1 font-semibold">
                      {liveSchedule.algorithmVersion}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-muted">Verification code</dt>
                    <dd
                      className="mt-1 truncate font-mono text-xs"
                      title={liveSchedule.outputHash}
                    >
                      {liveSchedule.outputHash}
                    </dd>
                  </div>
                </dl>
              </details>
            </section>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 14 }, (_, index) => index + 1).map(
                (week) => {
                  const matchups = liveSchedule.matchups.filter(
                    (matchup) => matchup.week === week,
                  );
                  return (
                    <section
                      aria-labelledby={`live-schedule-week-${week}`}
                      className={`rounded-xl border p-5 ${
                        week === state.week?.nflWeek
                          ? "border-registry bg-registry/5"
                          : "border-boundary bg-surface"
                      }`}
                      key={week}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h2
                          className="font-bold"
                          id={`live-schedule-week-${week}`}
                        >
                          Week {week}
                        </h2>
                        <span className="text-muted text-xs font-semibold">
                          {week === state.week?.nflWeek
                            ? state.week.state
                            : week < (state.week?.nflWeek ?? 1)
                              ? "Final"
                              : "Scheduled"}
                        </span>
                      </div>
                      <div className="divide-boundary mt-3 divide-y">
                        {matchups.map((matchup) => {
                          const isViewerMatchup = [
                            matchup.sideAEntryId,
                            matchup.sideBEntryId,
                          ].includes(state.viewer.entryId);
                          return (
                            <p
                              className={`py-2.5 text-sm ${
                                isViewerMatchup
                                  ? "text-registry font-bold"
                                  : "text-graphite"
                              }`}
                              key={`${matchup.sideAEntryId}-${matchup.sideBEntryId}`}
                            >
                              {matchup.sideAName}{" "}
                              <span className="text-muted">vs</span>{" "}
                              {matchup.sideBName}
                            </p>
                          );
                        })}
                      </div>
                    </section>
                  );
                },
              )}
            </div>
          </>
        )}
      </PageFrame>
    );
  }

  return (
    <PageFrame
      eyebrow="Published at roster lock"
      title="2026 Week 1 schedule"
      description="The four Week 1 pairings are published for the league. Private card terms are never included in the schedule."
      aside={liveStatus(state)}
    >
      {!state.week ? (
        <FormationPanel state={state} />
      ) : (
        <>
          <details className="border-boundary bg-surface mt-7 rounded-xl border p-5 text-sm">
            <summary className="cursor-pointer font-semibold">
              Schedule verification
            </summary>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-muted">Method</dt>
                <dd className="mt-1 font-semibold">Circle schedule</dd>
              </div>
              <div>
                <dt className="text-muted">Verification code</dt>
                <dd className="mt-1 font-mono text-xs break-all">
                  {state.season.scheduleSeed}
                </dd>
              </div>
            </dl>
          </details>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {state.schedule.map((matchup) => (
              <article
                className={`bg-surface rounded-xl border p-5 ${
                  [matchup.sideAEntryId, matchup.sideBEntryId].includes(
                    state.viewer.entryId,
                  )
                    ? "border-registry"
                    : "border-boundary"
                }`}
                key={matchup.id}
              >
                <p className="text-muted text-xs font-bold tracking-[0.08em] uppercase">
                  Week 1 · Matchup {matchup.displayOrder}
                </p>
                <p className="mt-4 font-bold">{matchup.sideAName}</p>
                <p className="text-muted my-2 text-xs">vs</p>
                <p className="font-bold">{matchup.sideBName}</p>
              </article>
            ))}
          </div>
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
      eyebrow={`${state.league.name} · Season boundary`}
      title={title}
      description={description}
      aside={<StatusBadge tone="pending">Not published</StatusBadge>}
    >
      <section className="border-boundary bg-surface mt-7 max-w-3xl rounded-xl border p-6">
        <h2 className="font-bold">
          Week {state.week?.nflWeek ?? 1} remains the source of truth
        </h2>
        <p className="text-graphite mt-3 leading-7">
          The current operational week and latest official standings snapshot
          remain authoritative. No placeholder history or postseason fact is
          inferred from private or incomplete data.
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
      title="Event market sheet"
      description={`${formatDate(event.scheduledStartAt)} · ${event.state} · ${event.providerHealth}`}
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
                  {market.marketType} · {market.qualityStatus}
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
                Select in Card Builder
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
  return (
    <PageFrame
      eyebrow="Immutable position receipt"
      title={receipt.proposition}
      description="Accepted terms are permanent; corrections append downstream versions without changing this artifact."
      aside={<StatusBadge tone="sealed">SEALED</StatusBadge>}
    >
      <div className="border-boundary bg-surface mt-7 rounded-xl border p-6">
        <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-muted text-xs uppercase">Event</dt>
            <dd className="mt-1 font-semibold">{receipt.eventLabel}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs uppercase">Market</dt>
            <dd className="mt-1 font-semibold">{receipt.marketType}</dd>
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
              {receipt.stakeCredits}
            </dd>
          </div>
          <div>
            <dt className="text-muted text-xs uppercase">Accepted</dt>
            <dd className="mt-1 font-semibold">
              {formatDate(receipt.acceptedAt)}
            </dd>
          </div>
          <div>
            <dt className="text-muted text-xs uppercase">Current settlement</dt>
            <dd className="mt-1 font-semibold">
              {receipt.settlement?.outcome ?? "Pending"}
            </dd>
          </div>
        </dl>
        <p className="border-boundary text-muted mt-6 border-t pt-4 font-mono text-xs break-all">
          Receipt hash · {receipt.receiptHash}
        </p>
      </div>
    </PageFrame>
  );
}
