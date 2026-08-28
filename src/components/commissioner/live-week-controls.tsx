"use client";

import { useActionState } from "react";
import {
  correctLiveEventResultAction,
  finalizeStage1WeekAction,
  importLiveScoresAction,
  lockStage1WeekAction,
  refreshLiveWeekQuotesAction,
  voidLiveEventAfterPostponementAction,
} from "@/app/l/[leagueSlug]/actions";
import { initialAppActionState } from "@/application/actions/action-state";
import type { LiveWeekOperations } from "@/application/queries/get-live-week-operations";
import type { Stage1CommissionerControlState } from "@/components/commissioner/stage1-controls";
import { ActionFeedback } from "@/components/forms/action-feedback";

const buttonClass =
  "border-control hover:border-registry hover:text-registry min-h-11 w-full rounded-lg border px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";

const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/New_York",
});

function ContextFields({ state }: { state: Stage1CommissionerControlState }) {
  return (
    <>
      <input type="hidden" name="leagueId" value={state.league.id} />
      <input type="hidden" name="leagueSlug" value={state.league.slug} />
    </>
  );
}

function scoreLine(event: LiveWeekOperations["events"][number]): string {
  if (!event.result) return "Awaiting official result";
  if (event.result.status === "VOID") return "VOID";
  return (
    event.awayTeam +
    " " +
    event.result.awayScore +
    " · " +
    event.homeTeam +
    " " +
    event.result.homeScore
  );
}

export function LiveWeekCommissionerControls({
  liveWeekOperations,
  providerConfigured,
  state,
}: {
  liveWeekOperations: LiveWeekOperations | null;
  providerConfigured: boolean;
  state: Stage1CommissionerControlState;
}) {
  const [quoteState, quoteAction, refreshingQuotes] = useActionState(
    refreshLiveWeekQuotesAction,
    initialAppActionState,
  );
  const [lockState, lockAction, locking] = useActionState(
    lockStage1WeekAction,
    initialAppActionState,
  );
  const [scoreState, scoreAction, importingScores] = useActionState(
    importLiveScoresAction,
    initialAppActionState,
  );
  const [correctionState, correctionAction, correcting] = useActionState(
    correctLiveEventResultAction,
    initialAppActionState,
  );
  const [voidState, voidAction, voiding] = useActionState(
    voidLiveEventAfterPostponementAction,
    initialAppActionState,
  );
  const [finalizeState, finalizeAction, finalizing] = useActionState(
    finalizeStage1WeekAction,
    initialAppActionState,
  );

  if (!state.week) return null;

  return (
    <>
      <section className="border-boundary bg-surface rounded-xl border p-5">
        <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
          Week 1 · Live controls
        </p>
        <h2 className="mt-2 font-bold">
          {state.week.state === "OPEN"
            ? "Cards remain open until common lock"
            : "Card compliance is frozen"}
        </h2>
        <p className="text-graphite mt-2 text-sm leading-6">
          Common lock is{" "}
          {timestampFormatter.format(new Date(state.week.commonLockAt))} ET. The
          database rejects late positions even if the explicit lock command runs
          afterward.
        </p>
        {state.week.state === "OPEN" ? (
          <>
            <form action={quoteAction} className="mt-4">
              <ContextFields state={state} />
              <button
                className={buttonClass}
                disabled={!providerConfigured || refreshingQuotes}
                type="submit"
              >
                {refreshingQuotes
                  ? "Refreshing published quotes…"
                  : "Refresh current odds before lock"}
              </button>
            </form>
            <form action={lockAction} className="mt-3">
              <ContextFields state={state} />
              <button className={buttonClass} disabled={locking} type="submit">
                {locking ? "Locking…" : "Lock all Week 1 cards"}
              </button>
            </form>
            <ActionFeedback state={quoteState} />
            <ActionFeedback state={lockState} />
          </>
        ) : (
          <p className="text-positive mt-4 text-sm font-semibold">
            No position can now be added or changed.
          </p>
        )}
      </section>

      {state.week.state !== "OPEN" ? (
        <section className="border-registry bg-surface rounded-xl border p-5">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
            <div>
              <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
                The Odds API · official score feed
              </p>
              <h2 className="mt-2 font-bold">NFL event results</h2>
            </div>
            {liveWeekOperations?.latestImportAt ? (
              <p className="text-muted text-xs">
                Checked{" "}
                {timestampFormatter.format(
                  new Date(liveWeekOperations.latestImportAt),
                )}{" "}
                ET
              </p>
            ) : null}
          </div>
          <p className="text-graphite mt-2 text-sm leading-6">
            One refresh checks exactly the published games. Completed scores
            settle immutable receipts; changed provider finals append visible
            corrections. Each refresh uses two provider credits.
          </p>
          <form action={scoreAction} className="mt-4">
            <ContextFields state={state} />
            <button
              className={buttonClass}
              disabled={
                !providerConfigured ||
                importingScores ||
                state.week.state === "FINAL"
              }
              type="submit"
            >
              {importingScores
                ? "Checking NFL scores…"
                : state.week.state === "FINAL"
                  ? "Week finalized"
                  : "Refresh NFL scores & settle completed games"}
            </button>
          </form>
          <ActionFeedback state={scoreState} />

          <div className="divide-boundary mt-5 divide-y border-t">
            {(liveWeekOperations?.events ?? []).map((event) => (
              <article className="py-5 last:pb-0" key={event.id}>
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                  <div>
                    <h3 className="text-sm font-bold">
                      {event.awayTeam} at {event.homeTeam}
                    </h3>
                    <p className="text-muted mt-1 text-xs">
                      {event.state} ·{" "}
                      {timestampFormatter.format(
                        new Date(event.scheduledStartAt),
                      )}{" "}
                      ET
                    </p>
                  </div>
                  <p
                    className={
                      event.result
                        ? "font-mono text-sm font-bold"
                        : "text-pending text-xs font-semibold"
                    }
                  >
                    {scoreLine(event)}
                  </p>
                </div>

                {event.result ? (
                  <div className="border-boundary bg-subtle mt-3 rounded-lg border p-3 text-xs leading-5">
                    <p className="font-semibold">
                      Version {event.result.version} ·{" "}
                      {event.result.source === "THE_ODDS_API"
                        ? "Provider"
                        : "Objective correction"}
                      {event.correctionCount > 0
                        ? " · " +
                          event.correctionCount +
                          " correction" +
                          (event.correctionCount === 1 ? "" : "s")
                        : ""}
                    </p>
                    <p className="text-muted mt-1">{event.result.reason}</p>
                  </div>
                ) : null}

                {event.result?.status === "FINAL" &&
                state.week?.state !== "FINAL" ? (
                  <details className="mt-3">
                    <summary className="text-action cursor-pointer text-sm font-semibold">
                      Record an objective correction
                    </summary>
                    <form
                      action={correctionAction}
                      className="mt-3 grid gap-3 sm:grid-cols-2"
                    >
                      <ContextFields state={state} />
                      <input type="hidden" name="eventId" value={event.id} />
                      <label className="text-xs font-semibold">
                        {event.awayTeam}
                        <input
                          className="border-control bg-surface mt-1 min-h-11 w-full rounded-lg border px-3 text-base"
                          defaultValue={event.result.awayScore ?? ""}
                          inputMode="numeric"
                          max="999"
                          min="0"
                          name="awayScore"
                          required
                          type="number"
                        />
                      </label>
                      <label className="text-xs font-semibold">
                        {event.homeTeam}
                        <input
                          className="border-control bg-surface mt-1 min-h-11 w-full rounded-lg border px-3 text-base"
                          defaultValue={event.result.homeScore ?? ""}
                          inputMode="numeric"
                          max="999"
                          min="0"
                          name="homeScore"
                          required
                          type="number"
                        />
                      </label>
                      <label className="text-xs font-semibold sm:col-span-2">
                        Visible objective reason
                        <textarea
                          className="border-control bg-surface mt-1 min-h-24 w-full rounded-lg border p-3 text-sm"
                          maxLength={500}
                          minLength={10}
                          name="reason"
                          placeholder="Explain the official scoring correction and its source."
                          required
                        />
                      </label>
                      <button
                        className={buttonClass + " sm:col-span-2"}
                        disabled={correcting}
                        type="submit"
                      >
                        {correcting
                          ? "Recording correction…"
                          : "Append corrected result"}
                      </button>
                    </form>
                  </details>
                ) : null}

                {!event.result && event.canVoidAfterPostponement ? (
                  <form action={voidAction} className="mt-3">
                    <ContextFields state={state} />
                    <input type="hidden" name="eventId" value={event.id} />
                    <button
                      className={buttonClass}
                      disabled={voiding}
                      type="submit"
                    >
                      {voiding
                        ? "Voiding…"
                        : "Void after 48-hour postponement window"}
                    </button>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
          {!liveWeekOperations ? (
            <p className="text-pending mt-4 text-sm">
              The Live result read model is not available yet.
            </p>
          ) : null}
          <ActionFeedback state={correctionState} />
          <ActionFeedback state={voidState} />
        </section>
      ) : null}

      {state.week.state === "PROVISIONAL" || state.week.state === "FINAL" ? (
        <section className="border-copper bg-surface rounded-xl border p-5">
          <h2 className="font-bold">
            {state.week.state === "FINAL"
              ? "Week 1 is final"
              : "24-hour correction window"}
          </h2>
          <p className="text-graphite mt-2 text-sm leading-6">
            {state.week.state === "FINAL"
              ? "Final score, matchup, and standings versions are append-only."
              : "Initial settlement is provisional through " +
                (state.week.correctionWindowClosesAt
                  ? timestampFormatter.format(
                      new Date(state.week.correctionWindowClosesAt),
                    )
                  : "the published closing time") +
                " ET. The database rejects early finalization."}
          </p>
          {state.week.state === "PROVISIONAL" ? (
            <form action={finalizeAction} className="mt-4">
              <ContextFields state={state} />
              <button
                className={buttonClass}
                disabled={finalizing}
                type="submit"
              >
                {finalizing ? "Finalizing…" : "Finalize Week 1"}
              </button>
            </form>
          ) : null}
          <ActionFeedback state={finalizeState} />
        </section>
      ) : null}
    </>
  );
}
