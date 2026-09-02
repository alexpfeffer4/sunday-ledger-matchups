"use client";

import { useActionState } from "react";
import {
  advanceStage1ClockAction,
  applySimulationFixtureResultsAction,
  finalizeChampionBracketAction,
  finalizeStage1WeekAction,
  lockLiveRosterAndOpenWeekAction,
  lockStage1WeekAction,
  publishLivePlayoffQualificationAction,
  publishLiveSeasonArchiveAction,
  publishSimulationFixtureWeekAction,
} from "@/app/l/[leagueSlug]/actions";
import { initialAppActionState } from "@/application/actions/action-state";
import type { Stage1CommissionerControlState } from "@/components/commissioner/stage1-controls";
import { ActionFeedback } from "@/components/forms/action-feedback";

const buttonClass =
  "border-control hover:border-registry hover:text-registry min-h-11 w-full rounded-lg border px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";

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

function fixtureOpensAt(week: number): string {
  return new Date(Date.UTC(2026, 8, 13 + (week - 1) * 7, 16)).toISOString();
}

function after(value: string, milliseconds: number): string {
  return new Date(new Date(value).getTime() + milliseconds).toISOString();
}

export function SimulationCommissionerControls({
  state,
}: {
  state: Stage1CommissionerControlState;
}) {
  const [publishState, publishAction, publishing] = useActionState(
    publishSimulationFixtureWeekAction,
    initialAppActionState,
  );
  const [rosterState, rosterAction, lockingRoster] = useActionState(
    lockLiveRosterAndOpenWeekAction,
    initialAppActionState,
  );
  const [clockState, clockAction, advancing] = useActionState(
    advanceStage1ClockAction,
    initialAppActionState,
  );
  const [lockState, lockAction, locking] = useActionState(
    lockStage1WeekAction,
    initialAppActionState,
  );
  const [resultState, resultAction, applyingResult] = useActionState(
    applySimulationFixtureResultsAction,
    initialAppActionState,
  );
  const [finalizeState, finalizeAction, finalizing] = useActionState(
    finalizeStage1WeekAction,
    initialAppActionState,
  );
  const [qualificationState, qualificationAction, qualifying] = useActionState(
    publishLivePlayoffQualificationAction,
    initialAppActionState,
  );
  const [championState, championAction, finalizingChampion] = useActionState(
    finalizeChampionBracketAction,
    initialAppActionState,
  );
  const [archiveState, archiveAction, archiving] = useActionState(
    publishLiveSeasonArchiveAction,
    initialAppActionState,
  );
  const week = state.week;
  const nextWeek = week ? Math.min(18, week.nflWeek + 1) : 1;
  const latestKickoff = state.slate.reduce(
    (latest, event) =>
      event.scheduledStartAt > latest ? event.scheduledStartAt : latest,
    week?.commonLockAt ?? fixtureOpensAt(nextWeek),
  );
  const rosterValid =
    state.league.memberCount >= 4 &&
    state.league.memberCount <= 16 &&
    state.league.memberCount % 2 === 0;

  return (
    <div className="space-y-5" aria-label="Practice and test season controls">
      <section className="border-registry bg-registry/5 rounded-xl border p-5">
        <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
          Practice/test · Simulation
        </p>
        <h2 className="mt-2 text-xl font-bold">Approved fixture operations</h2>
        <p className="text-graphite mt-2 text-sm leading-6">
          This advanced mode uses a fixed 18-week data pack for rehearsal. It
          follows the same roster, card, scoring, standings, playoff, Week 18,
          and archive lifecycle as Live without calling the live provider.
        </p>
      </section>

      {!week ? (
        <section className="border-boundary bg-surface rounded-xl border p-5">
          <h2 className="font-bold">Make practice Week 1 available</h2>
          <p className="text-graphite mt-2 text-sm leading-6">
            First advance to the reviewed quote time, then publish the fixed
            slate. No teams, odds, or results are accepted from this form.
          </p>
          <form action={clockAction} className="mt-4">
            <ContextFields state={state} />
            <input type="hidden" name="target" value={fixtureOpensAt(1)} />
            <button className={buttonClass} disabled={advancing} type="submit">
              Advance to Week 1 publication time
            </button>
          </form>
          <form action={publishAction} className="mt-3">
            <ContextFields state={state} />
            <input type="hidden" name="week" value="1" />
            <button
              className={buttonClass}
              disabled={publishing || !rosterValid}
              type="submit"
            >
              Make reviewed Week 1 available
            </button>
          </form>
          <ActionFeedback state={clockState} />
          <ActionFeedback state={publishState} />
        </section>
      ) : null}

      {week?.state === "PLANNED" ? (
        <section className="border-boundary bg-surface rounded-xl border p-5">
          <h2 className="font-bold">Freeze roster and open cards</h2>
          <p className="text-graphite mt-2 text-sm leading-6">
            This shared command freezes the V1.1 ruleset and complete 14-week
            schedule, then grants one 1,000-credit card per member.
          </p>
          <form action={rosterAction} className="mt-4">
            <ContextFields state={state} />
            <button
              className={buttonClass}
              disabled={lockingRoster || !rosterValid}
              type="submit"
            >
              Lock {state.league.memberCount}-member roster &amp; open cards
            </button>
          </form>
          <ActionFeedback state={rosterState} />
        </section>
      ) : null}

      {week && ["OPEN", "LOCKED", "PROVISIONAL"].includes(week.state) ? (
        <section className="border-boundary bg-surface rounded-xl border p-5">
          <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
            Practice/test Week {week.nflWeek} · {week.state.toLowerCase()}
          </p>
          <h2 className="mt-2 font-bold">Clock, cards, and practice results</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <form action={clockAction}>
              <ContextFields state={state} />
              <input
                type="hidden"
                name="target"
                value={after(week.commonLockAt, 60_000)}
              />
              <button
                className={buttonClass}
                disabled={advancing}
                type="submit"
              >
                Advance past common lock
              </button>
            </form>
            <form action={lockAction}>
              <ContextFields state={state} />
              <button
                className={buttonClass}
                disabled={locking || week.state !== "OPEN"}
                type="submit"
              >
                Lock all cards
              </button>
            </form>
            <form action={clockAction}>
              <ContextFields state={state} />
              <input
                type="hidden"
                name="target"
                value={after(latestKickoff, 6 * 60_000)}
              />
              <button
                className={buttonClass}
                disabled={advancing}
                type="submit"
              >
                Advance through kickoff
              </button>
            </form>
            <form action={resultAction}>
              <ContextFields state={state} />
              <input type="hidden" name="week" value={week.nflWeek} />
              <input type="hidden" name="step" value="LIVE" />
              <button
                className={buttonClass}
                disabled={applyingResult}
                type="submit"
              >
                Mark fixture events live
              </button>
            </form>
            <form action={clockAction}>
              <ContextFields state={state} />
              <input
                type="hidden"
                name="target"
                value={after(
                  latestKickoff,
                  week.nflWeek === 7 ? 49 * 60 * 60_000 : 4 * 60 * 60_000,
                )}
              />
              <button
                className={buttonClass}
                disabled={advancing}
                type="submit"
              >
                Advance to scripted finals
              </button>
            </form>
            <form action={resultAction}>
              <ContextFields state={state} />
              <input type="hidden" name="week" value={week.nflWeek} />
              <input type="hidden" name="step" value="FINAL" />
              <button
                className={buttonClass}
                disabled={applyingResult}
                type="submit"
              >
                Import scripted results
              </button>
            </form>
          </div>
          {[8, 17].includes(week.nflWeek) ? (
            <div className="border-copper mt-4 border-t pt-4">
              <form action={clockAction}>
                <ContextFields state={state} />
                <input
                  type="hidden"
                  name="target"
                  value={after(latestKickoff, 31 * 60 * 60_000)}
                />
                <button
                  className={buttonClass}
                  disabled={advancing}
                  type="submit"
                >
                  Advance to correction evidence
                </button>
              </form>
              <form action={resultAction} className="mt-3">
                <ContextFields state={state} />
                <input type="hidden" name="week" value={week.nflWeek} />
                <input type="hidden" name="step" value="CORRECTION" />
                <button
                  className={buttonClass}
                  disabled={applyingResult}
                  type="submit"
                >
                  Append scripted objective correction
                </button>
              </form>
            </div>
          ) : null}
          {week.correctionWindowClosesAt ? (
            <form action={clockAction} className="mt-4">
              <ContextFields state={state} />
              <input
                type="hidden"
                name="target"
                value={after(week.correctionWindowClosesAt, 60_000)}
              />
              <button
                className={buttonClass}
                disabled={advancing}
                type="submit"
              >
                Advance past correction window
              </button>
            </form>
          ) : null}
          <form action={finalizeAction} className="mt-3">
            <ContextFields state={state} />
            <button
              className={buttonClass}
              disabled={finalizing || week.state !== "PROVISIONAL"}
              type="submit"
            >
              Finalize Week {week.nflWeek}
            </button>
          </form>
          <ActionFeedback state={clockState} />
          <ActionFeedback state={lockState} />
          <ActionFeedback state={resultState} />
          <ActionFeedback state={finalizeState} />
        </section>
      ) : null}

      {week?.state === "FINAL" && week.nflWeek < 14 ? (
        <section className="border-boundary bg-surface rounded-xl border p-5">
          <h2 className="font-bold">Make practice Week {nextWeek} available</h2>
          <form action={clockAction} className="mt-4">
            <ContextFields state={state} />
            <input
              type="hidden"
              name="target"
              value={fixtureOpensAt(nextWeek)}
            />
            <button className={buttonClass} disabled={advancing} type="submit">
              Advance to Week {nextWeek} publication time
            </button>
          </form>
          <form action={publishAction} className="mt-3">
            <ContextFields state={state} />
            <input type="hidden" name="week" value={nextWeek} />
            <button className={buttonClass} disabled={publishing} type="submit">
              Make reviewed Week {nextWeek} available
            </button>
          </form>
          <ActionFeedback state={clockState} />
          <ActionFeedback state={publishState} />
        </section>
      ) : null}

      {week?.state === "FINAL" &&
      week.nflWeek === 14 &&
      state.league.lifecycle === "REGULAR" ? (
        <section className="border-boundary bg-surface rounded-xl border p-5">
          <h2 className="font-bold">Confirm the playoff field</h2>
          <form action={qualificationAction} className="mt-4">
            <ContextFields state={state} />
            <button className={buttonClass} disabled={qualifying} type="submit">
              Confirm playoff qualification
            </button>
          </form>
          <ActionFeedback state={qualificationState} />
        </section>
      ) : null}

      {week?.state === "FINAL" &&
      week.nflWeek >= 14 &&
      week.nflWeek < 17 &&
      state.league.lifecycle === "PLAYOFFS" ? (
        <section className="border-boundary bg-surface rounded-xl border p-5">
          <h2 className="font-bold">Make playoff Week {nextWeek} available</h2>
          <form action={clockAction} className="mt-4">
            <ContextFields state={state} />
            <input
              type="hidden"
              name="target"
              value={fixtureOpensAt(nextWeek)}
            />
            <button className={buttonClass} disabled={advancing} type="submit">
              Advance to Week {nextWeek} publication time
            </button>
          </form>
          <form action={publishAction} className="mt-3">
            <ContextFields state={state} />
            <input type="hidden" name="week" value={nextWeek} />
            <button className={buttonClass} disabled={publishing} type="submit">
              Make Week {nextWeek} available
            </button>
          </form>
          <ActionFeedback state={clockState} />
          <ActionFeedback state={publishState} />
        </section>
      ) : null}

      {week?.state === "FINAL" &&
      week.nflWeek === 17 &&
      state.league.lifecycle === "PLAYOFFS" ? (
        <section className="border-boundary bg-surface rounded-xl border p-5">
          <h2 className="font-bold">Finalize champion and bracket</h2>
          <form action={championAction} className="mt-4">
            <ContextFields state={state} />
            <button
              className={buttonClass}
              disabled={finalizingChampion}
              type="submit"
            >
              Confirm champion finality
            </button>
          </form>
          <ActionFeedback state={championState} />
        </section>
      ) : null}

      {week?.state === "FINAL" &&
      week.nflWeek === 17 &&
      state.league.lifecycle === "CHAMPION_FINAL" ? (
        <section className="border-boundary bg-surface rounded-xl border p-5">
          <h2 className="font-bold">Make Week 18 exhibitions available</h2>
          <form action={clockAction} className="mt-4">
            <ContextFields state={state} />
            <input type="hidden" name="target" value={fixtureOpensAt(18)} />
            <button className={buttonClass} disabled={advancing} type="submit">
              Advance to Week 18 publication time
            </button>
          </form>
          <form action={publishAction} className="mt-3">
            <ContextFields state={state} />
            <input type="hidden" name="week" value="18" />
            <button className={buttonClass} disabled={publishing} type="submit">
              Make Week 18 exhibitions available
            </button>
          </form>
          <ActionFeedback state={clockState} />
          <ActionFeedback state={publishState} />
        </section>
      ) : null}

      {week?.state === "FINAL" &&
      week.nflWeek === 18 &&
      state.league.lifecycle === "WEEK_18_EXHIBITION" ? (
        <section className="border-positive bg-surface rounded-xl border p-5">
          <h2 className="font-bold">Finalize authoritative archive</h2>
          <p className="text-graphite mt-2 text-sm leading-6">
            The shared archive builder derives the final document from stored
            Week 1–18 facts. No archive payload is accepted here.
          </p>
          <form action={archiveAction} className="mt-4">
            <ContextFields state={state} />
            <button className={buttonClass} disabled={archiving} type="submit">
              Finalize season archive
            </button>
          </form>
          <ActionFeedback state={archiveState} />
        </section>
      ) : null}
    </div>
  );
}
