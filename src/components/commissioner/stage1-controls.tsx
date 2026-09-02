"use client";

import { useActionState, useEffect, type FormEvent } from "react";
import {
  createLeagueInviteAction,
  importLiveOddsAction,
  lockLiveRosterAndOpenWeekAction,
  publishLiveWeekSlateAction,
  refreshLiveWeekQuotesAction,
  revokeLeagueInviteAction,
} from "@/app/l/[leagueSlug]/actions";
import { initialAppActionState } from "@/application/actions/action-state";
import { isStandardLiveSlateEvent } from "@/application/providers/select-standard-live-slate";
import type { LeagueInviteSummary } from "@/application/queries/league-invite-dtos";
import type { LiveOddsImportReview } from "@/application/queries/get-live-odds-import";
import type { LiveWeekOperations } from "@/application/queries/get-live-week-operations";
import type { Week17CorrectionOperations } from "@/application/queries/get-week17-correction-operations";
import type { Stage1StateDto } from "@/application/queries/stage1-dtos";
import { LiveWeekCommissionerControls } from "@/components/commissioner/live-week-controls";
import { InviteLinkFeedback } from "@/components/commissioner/invite-link-feedback";
import { SimulationCommissionerControls } from "@/components/commissioner/simulation-controls";
import { ActionFeedback } from "@/components/forms/action-feedback";

export type Stage1CommissionerControlState = {
  league: Pick<
    Stage1StateDto["league"],
    "id" | "slug" | "memberCount" | "lifecycle" | "mode"
  >;
  week: Pick<
    NonNullable<Stage1StateDto["week"]>,
    "nflWeek" | "scope" | "state" | "commonLockAt" | "correctionWindowClosesAt"
  > | null;
  slate: Array<
    Pick<
      Stage1StateDto["slate"][number],
      "id" | "key" | "state" | "scheduledStartAt" | "awayTeam" | "homeTeam"
    > & { latestObservedAt: string }
  >;
  members: Array<
    Pick<Stage1StateDto["members"][number], "userId" | "displayName" | "role">
  >;
};

function ContextFields({ state }: { state: Stage1CommissionerControlState }) {
  return (
    <>
      <input type="hidden" name="leagueId" value={state.league.id} />
      <input type="hidden" name="leagueSlug" value={state.league.slug} />
      {state.week ? (
        <input type="hidden" name="expectedWeek" value={state.week.nflWeek} />
      ) : null}
    </>
  );
}

function prepareInviteOperation(
  event: FormEvent<HTMLFormElement>,
  leagueId: string,
) {
  const field = event.currentTarget.elements.namedItem("operationId");
  if (!(field instanceof HTMLInputElement)) return;
  const storageKey = `sunday-ledger:invite-operation:v1:${leagueId}`;
  try {
    const stored = localStorage.getItem(storageKey);
    const operationId = stored ?? crypto.randomUUID();
    localStorage.setItem(storageKey, operationId);
    field.value = operationId;
  } catch {
    field.value ||= crypto.randomUUID();
  }
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

function isRosterValid(state: Stage1CommissionerControlState) {
  return (
    state.league.memberCount >= 4 &&
    state.league.memberCount <= 16 &&
    state.league.memberCount % 2 === 0
  );
}

function commissionerNextStep({
  hasLiveImport,
  providerConfigured,
  state,
}: {
  hasLiveImport: boolean;
  providerConfigured: boolean;
  state: Stage1CommissionerControlState;
}) {
  const rosterIsValid = isRosterValid(state);

  if (!state.week && !rosterIsValid) {
    return {
      detail:
        "Invite members until the roster has an even total between 4 and 16.",
      prerequisites: `${state.league.memberCount} members now · even 4–16 required`,
      title: "Complete the league roster",
    };
  }

  if (!state.week && state.league.mode === "LIVE") {
    if (!providerConfigured) {
      return {
        detail:
          "Odds are not connected yet. Finish league setup before importing the Week 1 slate.",
        prerequisites: "Odds connection needed",
        title: "Connect weekly odds",
      };
    }
    if (!hasLiveImport) {
      return {
        detail:
          "Import the current NFL markets for private review. This does not open member cards.",
        prerequisites: "Odds connected",
        title: "Import current NFL markets",
      };
    }
    return {
      detail:
        "Review the imported games, then publish the eligible Week 1 slate and card-lock time.",
      prerequisites: "Imported odds ready",
      title: "Publish the Week 1 slate",
    };
  }

  if (!state.week) {
    return {
      detail:
        "Advance the practice clock, then make the reviewed Week 1 slate available.",
      prerequisites: rosterIsValid
        ? "Practice/test Week 1 is ready"
        : `${state.league.memberCount} members · even 4–16 required`,
      title: "Make practice Week 1 available",
    };
  }

  if (state.league.mode === "LIVE" && state.week.state === "PLANNED") {
    if (!rosterIsValid) {
      return {
        detail:
          "The slate is published. Invite members until the roster has an even total between 4 and 16.",
        prerequisites: `${state.league.memberCount} members now · even 4–16 required`,
        title: "Complete the league roster",
      };
    }
    return {
      detail:
        "Refresh the odds one final time, freeze the roster and schedule, and open every member card.",
      prerequisites: `${state.league.memberCount}-member roster ready`,
      title: "Lock the roster and open Week 1",
    };
  }

  if (state.week.state === "OPEN") {
    return {
      detail:
        state.league.mode === "LIVE"
          ? "Monitor card completion and quote health. Cards lock for everyone at the published deadline."
          : "Members complete their authoritative cards before the shared deadline; then lock the week.",
      prerequisites: `Week ${state.week.nflWeek} cards are open`,
      title: "Monitor cards until lock",
    };
  }

  if (state.week.state === "LOCKED") {
    return {
      detail:
        "Record final game results as they arrive. Matchup scores update from the accepted card terms.",
      prerequisites: "All member cards are locked",
      title: "Record final results",
    };
  }

  if (state.week.state === "PROVISIONAL") {
    return {
      detail:
        "Review any correction, then finalize the week after the correction window closes.",
      prerequisites: state.week.correctionWindowClosesAt
        ? `Window closes ${eventTimestampFormatter.format(new Date(state.week.correctionWindowClosesAt))} ET`
        : "Awaiting correction-window close",
      title: "Finalize the week",
    };
  }

  return {
    detail:
      state.league.lifecycle === "FINAL"
        ? "The champion and season history are final. No further commissioner action is required."
        : "This week is final. Continue the season when the next weekly slate is available.",
    prerequisites: `Week ${state.week.nflWeek} is final`,
    title:
      state.league.lifecycle === "FINAL"
        ? "Season complete"
        : "Prepare the next week",
  };
}

export function Stage1CommissionerControls({
  invites,
  latestLiveImport,
  liveWeekOperations,
  providerConfigured,
  state,
  week17CorrectionOperations = null,
}: {
  invites: LeagueInviteSummary[];
  latestLiveImport: LiveOddsImportReview | null;
  liveWeekOperations: LiveWeekOperations | null;
  providerConfigured: boolean;
  state: Stage1CommissionerControlState;
  week17CorrectionOperations?: Week17CorrectionOperations | null;
}) {
  const [inviteState, inviteAction, inviting] = useActionState(
    createLeagueInviteAction,
    initialAppActionState,
  );
  const [revokeInviteState, revokeInviteAction, revokingInvite] =
    useActionState(revokeLeagueInviteAction, initialAppActionState);
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
  const nextStep = commissionerNextStep({
    hasLiveImport: latestLiveImport !== null,
    providerConfigured,
    state,
  });
  const rosterIsValid = isRosterValid(state);

  useEffect(() => {
    if (inviteState.status !== "success") return;
    try {
      localStorage.removeItem(
        `sunday-ledger:invite-operation:v1:${state.league.id}`,
      );
    } catch {
      // A fresh operation still works when browser storage is unavailable.
    }
  }, [inviteState.status, state.league.id]);

  return (
    <div className="space-y-5">
      <section className="border-registry bg-registry/5 rounded-xl border p-5 shadow-[var(--shadow-card)]">
        <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
          Next action
        </p>
        <h2 className="mt-2 text-xl font-bold">{nextStep.title}</h2>
        <p className="text-graphite mt-2 text-sm leading-6">
          {nextStep.detail}
        </p>
        <p className="border-registry/20 text-registry mt-4 border-t pt-3 text-xs font-semibold">
          {nextStep.prerequisites}
        </p>
      </section>

      <section className="border-boundary bg-surface rounded-xl border p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
              League formation
            </p>
            <h2 className="mt-2 text-lg font-bold">Invite members first</h2>
          </div>
          <span
            className={`inline-flex min-h-7 items-center self-start rounded-full border px-3 text-xs font-bold ${
              rosterIsValid
                ? "border-positive/30 bg-positive/10 text-positive"
                : "border-pending/30 bg-pending/10 text-pending"
            }`}
          >
            {rosterIsValid ? "✓ Roster ready" : "Roster needs members"}
          </span>
        </div>
        <p className="text-graphite mt-3 text-sm leading-6">
          {state.league.lifecycle === "DRAFT"
            ? "Share one private link with the group. It previews the league before each person creates an account or signs in."
            : "The competitive roster is frozen. Existing members keep access, but invitations can no longer add members."}
        </p>

        <div className="border-boundary mt-5 rounded-lg border p-4">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="text-sm font-bold">Joined members</h3>
            <p className="text-muted text-xs font-semibold">
              {state.league.memberCount}/16
            </p>
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {state.members.map((member) => (
              <li
                className="bg-subtle flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 text-sm"
                key={member.userId}
              >
                <span className="min-w-0 truncate font-semibold">
                  {member.displayName}
                </span>
                <span className="text-muted shrink-0 text-xs">
                  {member.role === "COMMISSIONER" ? "Commissioner" : "Member"}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-muted mt-3 text-xs leading-5">
            {rosterIsValid
              ? `${state.league.memberCount} is a valid even roster. You may continue to Week 1 setup.`
              : "Continue inviting until 4–16 members have joined and the total is even."}
          </p>
        </div>

        {state.league.lifecycle === "DRAFT" ? (
          <form
            action={inviteAction}
            className="mt-5"
            onSubmit={(event) => prepareInviteOperation(event, state.league.id)}
          >
            <ContextFields state={state} />
            <input name="operationId" type="hidden" />
            <p className="text-sm font-semibold">Default invitation</p>
            <p className="text-muted mt-1 text-xs leading-5">
              Expires in 7 days · up to{" "}
              {Math.max(1, 16 - state.league.memberCount)} joins
            </p>
            <button
              className={`${buttonClass} mt-3`}
              disabled={inviting || state.league.memberCount >= 16}
              type="submit"
            >
              {inviting
                ? "Creating…"
                : state.league.memberCount >= 16
                  ? "Roster at capacity"
                  : "Create default invitation link"}
            </button>
            <details className="border-boundary mt-4 border-t pt-4">
              <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">
                Advanced invitation settings
              </summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">
                  Link expires
                  <select
                    className="border-control bg-surface focus:border-registry mt-2 min-h-11 w-full rounded-lg border px-3"
                    defaultValue="7"
                    name="expiresInDays"
                  >
                    <option value="1">In 1 day</option>
                    <option value="7">In 7 days</option>
                    <option value="14">In 14 days</option>
                    <option value="30">In 30 days</option>
                  </select>
                </label>
                <label className="text-sm font-semibold">
                  Maximum joins
                  <input
                    className="border-control bg-surface focus:border-registry mt-2 min-h-11 w-full rounded-lg border px-3 font-mono"
                    defaultValue={Math.max(1, 16 - state.league.memberCount)}
                    max={15}
                    min={1}
                    name="maxUses"
                    type="number"
                  />
                </label>
              </div>
            </details>
          </form>
        ) : null}
        <InviteLinkFeedback key={inviteState.value} state={inviteState} />

        <p className="border-boundary text-negative mt-5 border-t pt-4 text-xs leading-5 font-semibold">
          Locking the roster later freezes membership and the season schedule.
          Invitation links cannot add members after that point.
        </p>

        {invites.length > 0 ? (
          <details className="border-boundary mt-4 border-t pt-4">
            <summary className="min-h-11 cursor-pointer content-center text-sm font-bold">
              Manage recent invitations · {invites.length}
            </summary>
            <div className="divide-boundary mt-3 divide-y">
              {invites.map((invite) => (
                <div
                  className="flex flex-col justify-between gap-3 py-3 sm:flex-row sm:items-center"
                  key={invite.id}
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {invite.status} · {invite.uses} of {invite.max_uses} joins
                      used
                    </p>
                    <p className="text-muted mt-1 text-xs">
                      Expires{" "}
                      {eventTimestampFormatter.format(
                        new Date(invite.expires_at),
                      )}{" "}
                      ET
                    </p>
                  </div>
                  {invite.active ? (
                    <form action={revokeInviteAction}>
                      <ContextFields state={state} />
                      <input name="inviteId" type="hidden" value={invite.id} />
                      <button
                        className="border-negative text-negative hover:bg-negative/5 min-h-11 rounded-lg border px-4 text-xs font-semibold disabled:opacity-50"
                        disabled={revokingInvite}
                        type="submit"
                      >
                        Revoke
                      </button>
                    </form>
                  ) : null}
                </div>
              ))}
            </div>
            <ActionFeedback state={revokeInviteState} />
          </details>
        ) : null}
      </section>

      {!state.week && state.league.mode === "LIVE" ? (
        <section
          className={`${rosterIsValid ? "border-registry bg-surface" : "border-boundary bg-subtle"} rounded-xl border p-5`}
        >
          <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
            Week 1 setup
          </p>
          <h2 className="mt-2 font-bold">
            {rosterIsValid
              ? "Import current NFL markets"
              : "Finish the roster before odds work"}
          </h2>
          <p className="text-graphite mt-2 text-sm leading-6">
            {rosterIsValid
              ? "Import the current DraftKings winner, spread, and total lines for review. Members will not see them until you publish the slate."
              : "Provider and market controls become available after an even roster of 4–16 members has joined."}
          </p>
          <form action={importAction} className="mt-4">
            <ContextFields state={state} />
            <button
              className={buttonClass}
              disabled={!providerConfigured || importing || !rosterIsValid}
              type="submit"
            >
              {importing ? "Importing…" : "Import NFL markets for review"}
            </button>
          </form>
          {!providerConfigured ? (
            <p className="text-pending mt-3 text-xs leading-5 font-semibold">
              Odds are not connected for this league yet.
            </p>
          ) : null}
          <ActionFeedback state={importState} />

          {latestLiveImport ? (
            <div className="border-boundary mt-5 border-t pt-5">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                <div>
                  <p className="text-sm font-bold">
                    Imported games · {latestLiveImport.eventCount}
                  </p>
                  <p className="text-muted mt-1 text-xs">
                    DraftKings odds · fetched{" "}
                    {importTimestampFormatter.format(
                      new Date(latestLiveImport.fetchedAt),
                    )}{" "}
                    ET
                  </p>
                </div>
                <span className="text-positive text-xs font-semibold">
                  Ready to publish
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
                            {event.markets.length} available lines ·{" "}
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
                  Once published, the selected games and card-lock time cannot
                  be changed. Member cards remain closed until the roster is
                  locked.
                </p>
                <button
                  className={`${buttonClass} mt-4`}
                  disabled={publishingLiveSlate || !rosterIsValid}
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
              Import current markets to review the Week 1 games.
            </p>
          )}
        </section>
      ) : !state.week ? (
        <SimulationCommissionerControls state={state} />
      ) : state.league.mode === "LIVE" && state.week.state === "PLANNED" ? (
        <section className="border-registry bg-surface rounded-xl border p-5">
          <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
            Week 1 · eligible slate published
          </p>
          <h2 className="mt-2 font-bold">
            {state.slate.length} NFL games selected
          </h2>
          <p className="text-graphite mt-2 text-sm leading-6">
            Members can see the selected games and card-lock time. Cards open
            after you lock the roster.
          </p>
          <dl className="border-boundary mt-4 space-y-3 border-t pt-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-graphite">Cards lock</dt>
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
              Odds are not connected for this league yet.
            </p>
          ) : null}
          <ActionFeedback state={refreshQuotesState} />
          <div className="border-boundary mt-5 border-t pt-4">
            <p className="text-sm font-bold">
              Roster readiness · {state.league.memberCount}/4 minimum
            </p>
            <p className="text-muted mt-1 text-xs leading-5">
              Cards can open when the roster has an even 4–16 members.
            </p>
          </div>
          <form action={liveRosterLockAction} className="mt-4">
            <ContextFields state={state} />
            <p className="text-negative text-xs leading-5 font-semibold">
              Once confirmed, the roster, rules, and 14-week schedule cannot be
              changed. Every Week 1 card opens with 1,000 credits.
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
      ) : state.league.mode === "LIVE" ? (
        <LiveWeekCommissionerControls
          latestLiveImport={latestLiveImport}
          liveWeekOperations={liveWeekOperations}
          providerConfigured={providerConfigured}
          state={state}
          week17CorrectionOperations={week17CorrectionOperations}
        />
      ) : (
        <SimulationCommissionerControls state={state} />
      )}
    </div>
  );
}
