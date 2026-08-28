"use client";

import { useActionState } from "react";
import {
  advanceStage1ClockAction,
  correctStage1ResultAction,
  createLeagueInviteAction,
  finalizeStage1WeekAction,
  importLiveOddsAction,
  initializeStage1WeekAction,
  lockLiveRosterAndOpenWeekAction,
  lockStage1WeekAction,
  publishLiveWeekSlateAction,
  publishSimulationSeasonArchiveAction,
  recordStage1ResultAction,
  refreshLiveWeekQuotesAction,
  setStage1EventLiveAction,
} from "@/app/l/[leagueSlug]/actions";
import { initialAppActionState } from "@/application/actions/action-state";
import { isStandardLiveSlateEvent } from "@/application/providers/select-standard-live-slate";
import type { LiveOddsImportReview } from "@/application/queries/get-live-odds-import";
import type { Stage1StateDto } from "@/application/queries/stage1-dtos";
import { ActionFeedback } from "@/components/forms/action-feedback";

export type Stage1CommissionerControlState = {
  league: Pick<
    Stage1StateDto["league"],
    "id" | "slug" | "memberCount" | "lifecycle" | "mode"
  >;
  week: Pick<
    NonNullable<Stage1StateDto["week"]>,
    "state" | "commonLockAt" | "correctionWindowClosesAt"
  > | null;
  slate: Array<
    Pick<
      Stage1StateDto["slate"][number],
      "id" | "key" | "state" | "scheduledStartAt" | "awayTeam" | "homeTeam"
    > & { latestObservedAt: string }
  >;
};

function ContextFields({ state }: { state: Stage1CommissionerControlState }) {
  return (
    <>
      <input type="hidden" name="leagueId" value={state.league.id} />
      <input type="hidden" name="leagueSlug" value={state.league.slug} />
    </>
  );
}

const buttonClass =
  "border-control hover:border-registry hover:text-registry min-h-11 w-full rounded-lg border px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";

const importTimestampFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/New_York",
});

const eventTimestampFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});

export function Stage1CommissionerControls({
  latestLiveImport,
  providerConfigured,
  state,
}: {
  latestLiveImport: LiveOddsImportReview | null;
  providerConfigured: boolean;
  state: Stage1CommissionerControlState;
}) {
  const [inviteState, inviteAction, inviting] = useActionState(
    createLeagueInviteAction,
    initialAppActionState,
  );
  const [initializeState, initializeAction, initializing] = useActionState(
    initializeStage1WeekAction,
    initialAppActionState,
  );
  const [archiveState, archiveAction, publishingArchive] = useActionState(
    publishSimulationSeasonArchiveAction,
    initialAppActionState,
  );
  const [importState, importAction, importing] = useActionState(
    importLiveOddsAction,
    initialAppActionState,
  );
  const [publishLiveSlateState, publishLiveSlateAction, publishingLiveSlate] =
    useActionState(publishLiveWeekSlateAction, initialAppActionState);
  const [refreshQuotesState, refreshQuotesAction, refreshingQuotes] =
    useActionState(refreshLiveWeekQuotesAction, initialAppActionState);
  const [liveRosterLockState, liveRosterLockAction, lockingLiveRoster] =
    useActionState(lockLiveRosterAndOpenWeekAction, initialAppActionState);
  const [clockState, clockAction, advancing] = useActionState(
    advanceStage1ClockAction,
    initialAppActionState,
  );
  const [lockState, lockAction, locking] = useActionState(
    lockStage1WeekAction,
    initialAppActionState,
  );
  const [liveState, liveAction, markingLive] = useActionState(
    setStage1EventLiveAction,
    initialAppActionState,
  );
  const [resultState, resultAction, recording] = useActionState(
    recordStage1ResultAction,
    initialAppActionState,
  );
  const [correctionState, correctionAction, correcting] = useActionState(
    correctStage1ResultAction,
    initialAppActionState,
  );
  const [finalizeState, finalizeAction, finalizing] = useActionState(
    finalizeStage1WeekAction,
    initialAppActionState,
  );
  const correctionEvent = state.slate.find((event) => event.key === "buf-nyj");

  return (
    <div className="space-y-5">
      <section className="border-boundary bg-surface rounded-xl border p-5">
        <h2 className="font-bold">Private invitation</h2>
        <p className="text-graphite mt-2 text-sm leading-6">
          {state.league.lifecycle === "DRAFT"
            ? "One code admits up to 15 members and expires in seven days. The database stops the roster at 16 total members."
            : "The competitive roster is frozen. Existing members keep access, but no additional member can join this season."}
        </p>
        <form action={inviteAction} className="mt-4">
          <ContextFields state={state} />
          <button
            className={buttonClass}
            disabled={inviting || state.league.lifecycle !== "DRAFT"}
            type="submit"
          >
            {inviting
              ? "Creating…"
              : state.league.lifecycle === "DRAFT"
                ? "Create 15-use invite"
                : "Roster locked"}
          </button>
        </form>
        <ActionFeedback state={inviteState} />
      </section>

      {!state.week && state.league.mode === "LIVE" ? (
        <section className="border-registry bg-surface rounded-xl border p-5">
          <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
            Live provider · private review
          </p>
          <h2 className="mt-2 font-bold">Import current NFL markets</h2>
          <p className="text-graphite mt-2 text-sm leading-6">
            Fetch DraftKings moneyline, spread, and total observations through
            The Odds API. The normalized import is stored for commissioner
            review only; this command does not publish a slate, open cards, or
            consume member credits.
          </p>
          <form action={importAction} className="mt-4">
            <ContextFields state={state} />
            <button
              className={buttonClass}
              disabled={!providerConfigured || importing}
              type="submit"
            >
              {importing ? "Importing…" : "Import NFL markets for review"}
            </button>
          </form>
          {!providerConfigured ? (
            <p className="text-pending mt-3 text-xs leading-5 font-semibold">
              The server-side provider key is not configured in this
              environment. No request can be sent yet.
            </p>
          ) : null}
          <ActionFeedback state={importState} />

          {latestLiveImport ? (
            <div className="border-boundary mt-5 border-t pt-5">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                <div>
                  <p className="text-sm font-bold">
                    Latest reviewed import · {latestLiveImport.eventCount}{" "}
                    events
                  </p>
                  <p className="text-muted mt-1 text-xs">
                    The Odds API · DraftKings reference · fetched{" "}
                    {importTimestampFormatter.format(
                      new Date(latestLiveImport.fetchedAt),
                    )}{" "}
                    ET
                  </p>
                </div>
                <span className="text-positive text-xs font-semibold">
                  Stored · not published
                </span>
              </div>
              <form action={publishLiveSlateAction} className="mt-4">
                <ContextFields state={state} />
                <input
                  type="hidden"
                  name="importId"
                  value={latestLiveImport.importId}
                />
                <fieldset>
                  <legend className="text-sm font-bold">
                    Select the eligible Week 1 games
                  </legend>
                  <p className="text-muted mt-1 text-xs leading-5">
                    Standard Sunday games at 1:00 p.m. ET or later and Monday
                    games start selected. Checking an earlier or Thursday game
                    affirmatively includes it under the Season 1 rules.
                  </p>
                  <div className="divide-boundary mt-3 divide-y">
                    {latestLiveImport.events.map((event) => (
                      <label
                        className="flex min-h-14 cursor-pointer items-start gap-3 py-3 first:pt-0 last:pb-0"
                        key={event.externalEventId}
                      >
                        <input
                          className="border-control text-registry mt-1 size-4 rounded"
                          defaultChecked={isStandardLiveSlateEvent(event)}
                          name="externalEventId"
                          type="checkbox"
                          value={event.externalEventId}
                        />
                        <span>
                          <span className="block text-sm font-semibold">
                            {event.awayTeam} at {event.homeTeam}
                          </span>
                          <span className="text-muted mt-1 block text-xs">
                            {event.markets.length} main-market outcomes ·{" "}
                            {eventTimestampFormatter.format(
                              new Date(event.scheduledStartAt),
                            )}{" "}
                            ET
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <p className="text-negative mt-4 text-sm leading-6 font-semibold">
                  Publication fixes the eligible event set and common lock. It
                  cannot be replaced; cards and credits remain closed.
                </p>
                <button
                  className={`${buttonClass} mt-4`}
                  disabled={publishingLiveSlate}
                  type="submit"
                >
                  {publishingLiveSlate
                    ? "Publishing slate…"
                    : "Publish selected Week 1 slate"}
                </button>
              </form>
              <ActionFeedback state={publishLiveSlateState} />
            </div>
          ) : (
            <p className="text-muted mt-5 text-sm">
              No live provider import is stored for this season.
            </p>
          )}
        </section>
      ) : !state.week ? (
        <>
          <section className="border-registry bg-surface rounded-xl border p-5">
            <h2 className="font-bold">Publish full simulated season</h2>
            <p className="text-graphite mt-2 text-sm leading-6">
              Requires an even roster from 4 through 16. This one-time command
              deterministically settles Weeks 1–14, applies attendance
              eligibility, completes the correct playoff bracket, records the
              champion, and publishes Week 18 as exhibition-only history.
            </p>
            <p className="text-negative mt-3 text-sm leading-6 font-semibold">
              Publishing freezes the roster and rules, finalizes the season, and
              cannot be undone.
            </p>
            <form action={archiveAction} className="mt-4">
              <ContextFields state={state} />
              <button
                className={buttonClass}
                disabled={
                  publishingArchive ||
                  state.league.lifecycle !== "DRAFT" ||
                  state.league.memberCount < 4 ||
                  state.league.memberCount > 16 ||
                  state.league.memberCount % 2 !== 0
                }
                type="submit"
              >
                {publishingArchive
                  ? "Publishing full season…"
                  : `Publish full season · ${state.league.memberCount} members`}
              </button>
            </form>
            <ActionFeedback state={archiveState} />
          </section>

          <section className="border-boundary bg-surface rounded-xl border p-5">
            <h2 className="font-bold">Or publish interactive Week 1</h2>
            <p className="text-graphite mt-2 text-sm leading-6">
              The original Stage 1 path requires exactly eight members. It
              freezes the Simulation rules, publishes four matchups, and grants
              1,000 credits to every entry for hands-on play.
            </p>
            <form action={initializeAction} className="mt-4">
              <ContextFields state={state} />
              <button
                className={buttonClass}
                disabled={initializing || state.league.memberCount !== 8}
                type="submit"
              >
                {initializing
                  ? "Publishing…"
                  : `Publish Week 1 · ${state.league.memberCount}/8 members`}
              </button>
            </form>
            <ActionFeedback state={initializeState} />
          </section>
        </>
      ) : state.league.mode === "LIVE" && state.week.state === "PLANNED" ? (
        <section className="border-registry bg-surface rounded-xl border p-5">
          <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
            Week 1 · eligible slate published
          </p>
          <h2 className="mt-2 font-bold">
            {state.slate.length} NFL events are fixed
          </h2>
          <p className="text-graphite mt-2 text-sm leading-6">
            The selected event set and common lock are member-visible and cannot
            be replaced. No schedule, matchup, card, or credit grant exists yet.
          </p>
          <dl className="border-boundary mt-4 space-y-3 border-t pt-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-graphite">Common lock</dt>
              <dd className="text-right font-semibold">
                {importTimestampFormatter.format(
                  new Date(state.week.commonLockAt),
                )}{" "}
                ET
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-graphite">Current quotes</dt>
              <dd className="text-right font-semibold">
                {importTimestampFormatter.format(
                  new Date(
                    state.slate.reduce(
                      (latest, event) =>
                        event.latestObservedAt > latest
                          ? event.latestObservedAt
                          : latest,
                      state.slate[0]?.latestObservedAt ??
                        state.week.commonLockAt,
                    ),
                  ),
                )}{" "}
                ET
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-graphite">Cards</dt>
              <dd className="font-semibold">Closed</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-graphite">Roster lock</dt>
              <dd className="font-semibold">Not started</dd>
            </div>
          </dl>
          <form action={refreshQuotesAction} className="mt-4">
            <ContextFields state={state} />
            <button
              className={buttonClass}
              disabled={!providerConfigured || refreshingQuotes}
              type="submit"
            >
              {refreshingQuotes
                ? "Refreshing published quotes…"
                : "Refresh current odds"}
            </button>
          </form>
          {!providerConfigured ? (
            <p className="text-pending mt-3 text-xs leading-5 font-semibold">
              The server-side provider key is not configured in this
              environment.
            </p>
          ) : null}
          <ActionFeedback state={refreshQuotesState} />
          <div className="border-boundary mt-5 border-t pt-4">
            <p className="text-sm font-bold">
              Roster readiness · {state.league.memberCount}/4 minimum
            </p>
            <p className="text-muted mt-1 text-xs leading-5">
              Opening cards remains unavailable until the roster has an even
              4–16 members. Refreshing odds never bypasses that competitive
              rule.
            </p>
          </div>
          <form action={liveRosterLockAction} className="mt-4">
            <ContextFields state={state} />
            <p className="text-negative text-xs leading-5 font-semibold">
              Irreversible: this freezes the roster, rules, and complete 14-week
              schedule. It then opens every Week 1 card with 1,000 fresh credits
              after one final automatic odds refresh.
            </p>
            <button
              className={`${buttonClass} mt-3`}
              disabled={
                !providerConfigured ||
                lockingLiveRoster ||
                state.league.lifecycle !== "DRAFT" ||
                state.league.memberCount < 4 ||
                state.league.memberCount > 16 ||
                state.league.memberCount % 2 !== 0
              }
              type="submit"
            >
              {lockingLiveRoster
                ? "Refreshing odds and locking…"
                : state.league.memberCount >= 4 &&
                    state.league.memberCount <= 16 &&
                    state.league.memberCount % 2 === 0
                  ? `Lock ${state.league.memberCount}-member roster & open Week 1`
                  : `Waiting for even roster · ${state.league.memberCount}/4 minimum`}
            </button>
          </form>
          <ActionFeedback state={liveRosterLockState} />
        </section>
      ) : (
        <>
          <section className="border-boundary bg-surface rounded-xl border p-5">
            <h2 className="font-bold">Clock and common lock</h2>
            <p className="text-graphite mt-2 text-sm leading-6">
              Advancing time creates no result. Database time still rejects late
              positions even before the explicit lock command.
            </p>
            <form action={clockAction} className="mt-4">
              <ContextFields state={state} />
              <input
                type="hidden"
                name="target"
                value={new Date(
                  new Date(state.week.commonLockAt).getTime() + 60_000,
                ).toISOString()}
              />
              <button
                className={buttonClass}
                disabled={advancing}
                type="submit"
              >
                {advancing ? "Advancing…" : "Advance to common lock"}
              </button>
            </form>
            <form action={lockAction} className="mt-3">
              <ContextFields state={state} />
              <button
                className={buttonClass}
                disabled={locking || state.week.state !== "OPEN"}
                type="submit"
              >
                {locking ? "Locking…" : "Lock Week 1 cards"}
              </button>
            </form>
            <ActionFeedback state={clockState} />
            <ActionFeedback state={lockState} />
          </section>

          <section className="border-boundary bg-surface rounded-xl border p-5">
            <h2 className="font-bold">Event reveal and results</h2>
            <div className="divide-boundary mt-4 divide-y">
              {state.slate.map((event) => (
                <div className="py-4 first:pt-0 last:pb-0" key={event.id}>
                  <p className="text-sm font-semibold">
                    {event.awayTeam} at {event.homeTeam}
                  </p>
                  <p className="text-muted mt-1 text-xs">
                    {event.state} · {event.key}
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <form action={clockAction}>
                      <ContextFields state={state} />
                      <input
                        type="hidden"
                        name="target"
                        value={new Date(
                          new Date(event.scheduledStartAt).getTime() + 60_000,
                        ).toISOString()}
                      />
                      <button
                        className={buttonClass}
                        disabled={advancing}
                        type="submit"
                      >
                        Advance past kickoff
                      </button>
                    </form>
                    <form action={liveAction}>
                      <ContextFields state={state} />
                      <input type="hidden" name="eventId" value={event.id} />
                      <input
                        type="hidden"
                        name="actualStartedAt"
                        value={event.scheduledStartAt}
                      />
                      <button
                        className={buttonClass}
                        disabled={
                          markingLive ||
                          event.state !== "SCHEDULED" ||
                          event.key === "pit-cin"
                        }
                        type="submit"
                      >
                        Confirm actual kickoff
                      </button>
                    </form>
                    <form action={resultAction} className="sm:col-span-2">
                      <ContextFields state={state} />
                      <input type="hidden" name="eventId" value={event.id} />
                      <input type="hidden" name="eventKey" value={event.key} />
                      <button
                        className={buttonClass}
                        disabled={
                          recording ||
                          state.week?.state === "OPEN" ||
                          (event.key === "pit-cin"
                            ? event.state !== "SCHEDULED"
                            : event.state !== "LIVE")
                        }
                        type="submit"
                      >
                        Import deterministic final
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
            <ActionFeedback state={liveState} />
            <ActionFeedback state={resultState} />
          </section>

          <section className="border-copper bg-surface rounded-xl border p-5">
            <h2 className="font-bold">Correction replay</h2>
            <p className="text-graphite mt-2 text-sm leading-6">
              Appends a corrected Buffalo–New York result and superseding
              settlements, scores, matchup result, and standings snapshot. The
              original chain remains queryable.
            </p>
            <form action={correctionAction} className="mt-4">
              <ContextFields state={state} />
              <input
                type="hidden"
                name="eventId"
                value={correctionEvent?.id ?? ""}
              />
              <button
                className={buttonClass}
                disabled={
                  correcting ||
                  !correctionEvent ||
                  !["FINAL", "CORRECTED"].includes(correctionEvent.state)
                }
                type="submit"
              >
                {correcting ? "Replaying…" : "Apply visible correction"}
              </button>
            </form>
            <ActionFeedback state={correctionState} />
          </section>

          <section className="border-boundary bg-surface rounded-xl border p-5">
            <h2 className="font-bold">Finalize after 24 hours</h2>
            {state.week.correctionWindowClosesAt ? (
              <form action={clockAction} className="mt-4">
                <ContextFields state={state} />
                <input
                  type="hidden"
                  name="target"
                  value={new Date(
                    new Date(state.week.correctionWindowClosesAt).getTime() +
                      60_000,
                  ).toISOString()}
                />
                <button
                  className={buttonClass}
                  disabled={advancing}
                  type="submit"
                >
                  Advance beyond correction window
                </button>
              </form>
            ) : null}
            <form action={finalizeAction} className="mt-3">
              <ContextFields state={state} />
              <button
                className={buttonClass}
                disabled={finalizing || state.week.state !== "PROVISIONAL"}
                type="submit"
              >
                {finalizing ? "Finalizing…" : "Finalize Week 1"}
              </button>
            </form>
            <ActionFeedback state={finalizeState} />
          </section>
        </>
      )}
    </div>
  );
}
