import Link from "next/link";
import type { ReactNode } from "react";
import type { Stage1StateDto } from "@/application/queries/stage1-dtos";
import type { LiveOddsImportReview } from "@/application/queries/get-live-odds-import";
import type { LiveRegularSeasonSchedule } from "@/application/queries/get-live-regular-season-schedule";
import type { LiveWeekOperations } from "@/application/queries/get-live-week-operations";
import { Stage1CardBuilder } from "@/components/card/stage1-card-builder";
import { Stage1CommissionerControls } from "@/components/commissioner/stage1-controls";
import { PageFrame } from "@/components/league/page-frame";
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
  return (
    <PageFrame
      eyebrow={`${state.league.name} · Week ${state.week.nflWeek}`}
      title={`${state.viewer.displayName} vs ${state.matchup.opponentName}`}
      description="Matchup-first status from the sealed server read model."
      aside={liveStatus(state)}
    >
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="border-registry bg-surface rounded-xl border p-6 shadow-[var(--shadow-card)]">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div>
              <p className="text-registry text-xl font-bold">
                {state.viewer.displayName}
              </p>
              <p className="mt-3 font-mono text-3xl font-bold">
                {result ? formatScore(result.selfPointsForCenticredits) : "—"}
              </p>
            </div>
            <span className="text-muted text-xs font-bold">VS</span>
            <div className="text-right">
              <p className="text-copper text-xl font-bold">
                {state.matchup.opponentName}
              </p>
              <p className="mt-3 font-mono text-3xl font-bold">
                {result
                  ? formatScore(result.opponentPointsForCenticredits)
                  : "—"}
              </p>
            </div>
          </div>
          {result ? (
            <p className="border-boundary mt-6 border-t pt-4 text-sm font-semibold">
              {result.status} · {result.selfDecision} /{" "}
              {result.opponentDecision}
            </p>
          ) : (
            <p className="border-boundary text-muted mt-6 border-t pt-4 text-sm">
              Opponent terms stay sealed. Readiness appears only after common
              lock.
            </p>
          )}
        </section>
        <aside className="space-y-5">
          <section className="border-boundary bg-surface rounded-xl border p-5">
            <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
              Weekly allocation
            </p>
            <p className="mt-2 font-mono text-2xl font-bold">
              {state.ownerCard.allocatedCredits} / 1,000
            </p>
            <p className="text-muted mt-2 text-sm">
              {state.ownerCard.remainingCredits} credits remain ·{" "}
              {state.ownerCard.positions.length} positions
            </p>
          </section>
          <section className="border-boundary bg-subtle rounded-xl border p-5">
            <h2 className="font-bold">Opponent readiness</h2>
            <p className="text-graphite mt-2 text-sm">
              {state.matchup.opponentReadiness ?? "Sealed until common lock"}
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
        description="The deterministic slate publishes with the eight-entry roster."
      >
        <FormationPanel state={state} />
      </PageFrame>
    );
  }
  return (
    <PageFrame
      eyebrow="Stored deterministic provider fixture"
      title={`Week ${state.week.nflWeek} slate`}
      description={`Common lock ${formatDate(state.week.commonLockAt)}. Build an editable private draft, then review and seal the complete 1,000-credit card at once.`}
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
      eyebrow="Private owner read model"
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
  return (
    <PageFrame
      eyebrow="Broadcast view · reliable reveal"
      title={`${state.viewer.displayName} vs ${state.matchup.opponentName}`}
      description="Scheduled time alone never reveals a position."
      aside={liveStatus(state)}
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
          <h2 className="font-bold">Reveal boundary</h2>
          <p className="text-graphite mt-2 text-sm leading-6">
            Only receipts linked to LIVE, FINAL, VOID, or CORRECTED events enter
            this response.
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
        <div className="border-boundary bg-surface mt-7 overflow-x-auto rounded-xl border">
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
                    row.entryId === state.viewer.entryId ? "bg-registry/5" : ""
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
      )}
    </PageFrame>
  );
}

export function Stage1CommissionerView({
  latestLiveImport,
  liveWeekOperations,
  providerConfigured,
  state,
}: {
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
      eyebrow="Named idempotent operations"
      title="Commissioner console"
      description="No control can inspect sealed terms or directly edit scores, winners, records, or standings."
      aside={liveStatus(state)}
    >
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Stage1CommissionerControls
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
            <h2 className="text-negative font-bold">Permission boundary</h2>
            <p className="text-graphite mt-2 text-sm leading-6">
              The commissioner read model contains aggregate health only;
              receipt content is never selected.
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
        description="One matchup per member per week. The complete 14-week publication is deterministic and immutable; future weekly NFL slates do not change these opponents."
        aside={liveStatus(state)}
      >
        {!liveSchedule ? (
          <FormationPanel state={state} />
        ) : (
          <>
            <section className="border-boundary bg-surface mt-7 rounded-xl border p-5">
              <dl className="grid gap-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-muted">Algorithm</dt>
                  <dd className="mt-1 font-semibold">
                    {liveSchedule.algorithmVersion}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Publication</dt>
                  <dd className="mt-1 font-semibold">14 weeks · frozen</dd>
                </div>
                <div>
                  <dt className="text-muted">Output evidence</dt>
                  <dd
                    className="mt-1 truncate font-mono text-xs"
                    title={liveSchedule.outputHash}
                  >
                    {liveSchedule.outputHash}
                  </dd>
                </div>
              </dl>
              <p className="text-muted mt-4 text-xs">
                Published {formatDate(liveSchedule.publishedAt)}
              </p>
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
      description="The deterministic schedule seed and four pairings are stored as public league evidence. Position terms are not part of this publication."
      aside={liveStatus(state)}
    >
      {!state.week ? (
        <FormationPanel state={state} />
      ) : (
        <>
          <section className="border-boundary bg-surface mt-7 rounded-xl border p-5">
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Algorithm</dt>
                <dd className="mt-1 font-semibold">stage1-circle-v1</dd>
              </div>
              <div>
                <dt className="text-muted">Public schedule seed</dt>
                <dd className="mt-1 font-mono text-xs break-all">
                  {state.season.scheduleSeed}
                </dd>
              </div>
            </dl>
          </section>
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
      eyebrow={`${state.league.name} · Stage 1 boundary`}
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
