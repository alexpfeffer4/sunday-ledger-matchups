"use client";

import Link from "next/link";
import { useActionState, useEffect, type FormEvent } from "react";
import {
  correctLiveEventResultAction,
  finalizeChampionBracketAction,
  finalizeStage1WeekAction,
  importLiveOddsAction,
  importLiveScoresAction,
  lockStage1WeekAction,
  publishLivePlayoffQualificationAction,
  publishLiveSeasonArchiveAction,
  publishNextLivePostseasonWeekAction,
  publishNextLiveWeekSlateAction,
  publishWeek18ExhibitionAction,
  refreshLiveWeekQuotesAction,
  voidLiveEventAfterPostponementAction,
} from "@/app/l/[leagueSlug]/actions";
import { initialAppActionState } from "@/application/actions/action-state";
import { isStandardLiveSlateEvent } from "@/application/providers/select-standard-live-slate";
import type { LiveOddsImportReview } from "@/application/queries/get-live-odds-import";
import type { LiveWeekOperations } from "@/application/queries/get-live-week-operations";
import type { Week17CorrectionOperations } from "@/application/queries/get-week17-correction-operations";
import type { Stage1CommissionerControlState } from "@/components/commissioner/stage1-controls";
import { ActionFeedback } from "@/components/forms/action-feedback";
import { AuditDetails } from "@/components/ui/audit-details";

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
      {state.week ? (
        <input type="hidden" name="expectedWeek" value={state.week.nflWeek} />
      ) : null}
    </>
  );
}

function prepareCorrectionOperation(
  event: FormEvent<HTMLFormElement>,
  leagueId: string,
) {
  const operationField = event.currentTarget.elements.namedItem("operationId");
  const eventField = event.currentTarget.elements.namedItem("eventId");
  const scopeField = event.currentTarget.elements.namedItem("correctionScope");
  if (
    !(operationField instanceof HTMLInputElement) ||
    !(eventField instanceof HTMLInputElement)
  )
    return;

  const scope =
    scopeField instanceof HTMLInputElement ? scopeField.value : "CURRENT_WEEK";
  const storageKey = `sunday-ledger:correction-operation:v1:${leagueId}:${eventField.value}:${scope}`;
  try {
    const stored = localStorage.getItem(storageKey);
    const operationId = stored ?? crypto.randomUUID();
    localStorage.setItem(storageKey, operationId);
    operationField.value = operationId;
  } catch {
    operationField.value ||= crypto.randomUUID();
  }
}

function clearCompletedCorrectionOperation(
  leagueId: string,
  operationId: string,
) {
  const prefix = `sunday-ledger:correction-operation:v1:${leagueId}:`;
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix) && localStorage.getItem(key) === operationId)
        localStorage.removeItem(key);
    }
  } catch {
    // A later correction still gets a fresh in-page operation identifier.
  }
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

function LateWeek17CorrectionControls({
  correcting,
  correctionAction,
  operations,
  state,
}: {
  correcting: boolean;
  correctionAction: (payload: FormData) => void;
  operations: Week17CorrectionOperations;
  state: Stage1CommissionerControlState;
}) {
  return (
    <section className="border-boundary bg-surface rounded-xl border p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
            Authorized Week 17 correction
          </p>
          <h2 className="mt-2 font-bold">Append objective result evidence</h2>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-bold ${
            operations.pairingReplaceable
              ? "border-pending/30 bg-pending/10 text-pending"
              : "border-positive/30 bg-positive/10 text-positive"
          }`}
        >
          {operations.pairingPublished
            ? operations.pairingReplaceable
              ? "Week 18 pairing replaceable"
              : "Week 18 pairing frozen"
            : "Week 18 not published"}
        </span>
      </div>
      <p className="text-graphite mt-3 text-sm leading-6">
        A documented official-score correction appends every affected result,
        champion, bracket, and final-archive version. It never reopens receipts
        or edits a prior Week 18 pairing or result.
      </p>
      <div className="divide-boundary mt-4 divide-y border-t">
        {operations.events.map((event) => (
          <details className="py-4" key={event.id}>
            <summary className="text-action min-h-11 cursor-pointer content-center text-sm font-semibold">
              {event.awayTeam} {event.result.awayScore ?? "—"} ·{" "}
              {event.homeTeam} {event.result.homeScore ?? "—"}
            </summary>
            <form
              action={correctionAction}
              className="mt-3 grid gap-3 sm:grid-cols-2"
              onSubmit={(submitEvent) =>
                prepareCorrectionOperation(submitEvent, state.league.id)
              }
            >
              <ContextFields state={state} />
              <input type="hidden" name="eventId" value={event.id} />
              <input type="hidden" name="operationId" />
              <input
                name="correctionScope"
                type="hidden"
                value="FINALIZED_WEEK17"
              />
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
                  placeholder="Identify the official scoring correction and source."
                  required
                />
              </label>
              <button
                className={buttonClass + " sm:col-span-2"}
                disabled={correcting}
                type="submit"
              >
                {correcting
                  ? "Appending correction…"
                  : "Append documented correction"}
              </button>
            </form>
            <p className="text-muted mt-3 text-xs">
              Result version {event.result.version} · {event.correctionCount}{" "}
              prior correction
              {event.correctionCount === 1 ? "" : "s"}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function LiveWeekCommissionerControls({
  latestLiveImport,
  liveWeekOperations,
  providerConfigured,
  state,
  week17CorrectionOperations,
}: {
  latestLiveImport: LiveOddsImportReview | null;
  liveWeekOperations: LiveWeekOperations | null;
  providerConfigured: boolean;
  state: Stage1CommissionerControlState;
  week17CorrectionOperations: Week17CorrectionOperations | null;
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
  const [oddsImportState, oddsImportAction, importingOdds] = useActionState(
    importLiveOddsAction,
    initialAppActionState,
  );
  const [nextWeekState, nextWeekAction, publishingNextWeek] = useActionState(
    publishNextLiveWeekSlateAction,
    initialAppActionState,
  );
  const [postseasonWeekState, postseasonWeekAction, publishingPostseasonWeek] =
    useActionState(publishNextLivePostseasonWeekAction, initialAppActionState);
  const [
    playoffQualificationState,
    playoffQualificationAction,
    publishingPlayoffQualification,
  ] = useActionState(
    publishLivePlayoffQualificationAction,
    initialAppActionState,
  );
  const [championState, championAction, finalizingChampion] = useActionState(
    finalizeChampionBracketAction,
    initialAppActionState,
  );
  const [week18State, week18Action, publishingWeek18] = useActionState(
    publishWeek18ExhibitionAction,
    initialAppActionState,
  );
  const [archiveState, archiveAction, finalizingArchive] = useActionState(
    publishLiveSeasonArchiveAction,
    initialAppActionState,
  );

  useEffect(() => {
    if (correctionState.status !== "success" || !correctionState.value) return;
    clearCompletedCorrectionOperation(state.league.id, correctionState.value);
  }, [correctionState.status, correctionState.value, state.league.id]);

  if (!state.week) return null;
  const weekNumber = state.week.nflWeek;
  const nextWeekNumber = weekNumber + 1;
  const nextWeekImport =
    latestLiveImport &&
    new Date(latestLiveImport.fetchedAt).getTime() >
      new Date(state.week.commonLockAt).getTime()
      ? latestLiveImport
      : null;

  return (
    <>
      <section className="border-boundary bg-surface rounded-xl border p-5">
        <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
          Week {weekNumber} · Live controls
        </p>
        <h2 className="mt-2 font-bold">
          {state.week.state === "OPEN"
            ? "Cards remain open until the published deadline"
            : "Cards are locked"}
        </h2>
        <p className="text-graphite mt-2 text-sm leading-6">
          Cards lock at{" "}
          {timestampFormatter.format(new Date(state.week.commonLockAt))} ET.
          Picks cannot be added or changed after that time.
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
                {locking ? "Locking…" : `Lock all Week ${weekNumber} cards`}
              </button>
            </form>
            <ActionFeedback state={quoteState} />
            <ActionFeedback state={lockState} />
          </>
        ) : (
          <p className="text-positive mt-4 text-sm font-semibold">
            No pick can now be added or changed.
          </p>
        )}
      </section>

      {state.week.state !== "OPEN" ? (
        <section className="border-registry bg-surface rounded-xl border p-5">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
            <div>
              <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
                NFL score updates
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
            Refresh the published games for live and final scores. Completed
            games score the affected picks, and official changes remain visible
            as corrections.
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
                    <p className="font-semibold">{event.result.reason}</p>
                    <AuditDetails
                      className="mt-2 border-b-0 pb-0"
                      context="This evidence identifies the stored result behind the score and correction reason shown above."
                    >
                      <dl className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <dt className="text-muted">Result version</dt>
                          <dd className="mt-1 font-semibold">
                            {event.result.version}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted">Source</dt>
                          <dd className="mt-1 font-semibold">
                            {event.result.source === "THE_ODDS_API"
                              ? "Official feed"
                              : "Objective correction"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted">Corrections</dt>
                          <dd className="mt-1 font-semibold">
                            {event.correctionCount}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-muted">Event ID</dt>
                          <dd className="mt-1 font-mono break-all">
                            {event.id}
                          </dd>
                        </div>
                      </dl>
                    </AuditDetails>
                  </div>
                ) : null}

                {event.result?.status === "FINAL" &&
                state.week?.state !== "FINAL" ? (
                  <details className="mt-3">
                    <summary className="text-action inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold">
                      Record an objective correction
                    </summary>
                    <form
                      action={correctionAction}
                      className="mt-3 grid gap-3 sm:grid-cols-2"
                      onSubmit={(submitEvent) =>
                        prepareCorrectionOperation(submitEvent, state.league.id)
                      }
                    >
                      <ContextFields state={state} />
                      <input type="hidden" name="eventId" value={event.id} />
                      <input type="hidden" name="operationId" />
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
              Current NFL result controls are not available yet.
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
              ? `Week ${weekNumber} is final`
              : "24-hour correction window"}
          </h2>
          <p className="text-graphite mt-2 text-sm leading-6">
            {state.week.state === "FINAL"
              ? "The matchup score and standings are final."
              : "Initial settlement is provisional through " +
                (state.week.correctionWindowClosesAt
                  ? timestampFormatter.format(
                      new Date(state.week.correctionWindowClosesAt),
                    )
                  : "the published closing time") +
                " ET. The week cannot be finalized before then."}
          </p>
          {state.week.state === "PROVISIONAL" ? (
            <form action={finalizeAction} className="mt-4">
              <ContextFields state={state} />
              <button
                className={buttonClass}
                disabled={finalizing}
                type="submit"
              >
                {finalizing ? "Finalizing…" : `Finalize Week ${weekNumber}`}
              </button>
            </form>
          ) : null}
          <ActionFeedback state={finalizeState} />
        </section>
      ) : null}

      {state.week.state === "FINAL" && weekNumber < 14 ? (
        <section className="border-registry bg-surface rounded-xl border p-5">
          <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
            Week {nextWeekNumber} setup
          </p>
          <h2 className="mt-2 font-bold">Open Week {nextWeekNumber}</h2>
          <p className="text-graphite mt-2 text-sm leading-6">
            Import current NFL markets, review the selected games, and publish
            the week. Matchups come from the season schedule, and every member
            receives a fresh 1,000-credit card.
          </p>
          <form action={oddsImportAction} className="mt-4">
            <ContextFields state={state} />
            <button
              className={buttonClass}
              disabled={!providerConfigured || importingOdds}
              type="submit"
            >
              {importingOdds
                ? "Importing current markets…"
                : `Import Week ${nextWeekNumber} NFL markets for review`}
            </button>
          </form>
          {!providerConfigured ? (
            <p className="text-pending mt-3 text-xs leading-5 font-semibold">
              Odds are not connected for this league yet.
            </p>
          ) : null}
          <ActionFeedback state={oddsImportState} />

          {nextWeekImport ? (
            <div className="border-boundary mt-5 border-t pt-5">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                <div>
                  <p className="text-sm font-bold">
                    Latest reviewed import · {nextWeekImport.eventCount} events
                  </p>
                  <p className="text-muted mt-1 text-xs">
                    Last checked{" "}
                    {timestampFormatter.format(
                      new Date(nextWeekImport.fetchedAt),
                    )}{" "}
                    ET · not yet member-visible
                  </p>
                </div>
                <span className="text-positive text-xs font-semibold">
                  Ready for review
                </span>
              </div>
              <form action={nextWeekAction} className="mt-4">
                <ContextFields state={state} />
                <input
                  name="importId"
                  type="hidden"
                  value={nextWeekImport.importId}
                />
                <fieldset>
                  <legend className="text-sm font-bold">
                    Select the eligible Week {nextWeekNumber} games
                  </legend>
                  <p className="text-muted mt-1 text-xs leading-5">
                    Standard Sunday games at 1:00 p.m. ET or later and Monday
                    games start selected. Earlier and Thursday games require an
                    affirmative selection.
                  </p>
                  <div className="divide-boundary mt-3 divide-y">
                    {nextWeekImport.events.map((event) => (
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
                            {timestampFormatter.format(
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
                  be changed. Every Week {nextWeekNumber} card will open.
                </p>
                <button
                  className={`${buttonClass} mt-4`}
                  disabled={publishingNextWeek}
                  type="submit"
                >
                  {publishingNextWeek
                    ? `Publishing Week ${nextWeekNumber}…`
                    : `Make Week ${nextWeekNumber} available & open all cards`}
                </button>
              </form>
              <ActionFeedback state={nextWeekState} />
            </div>
          ) : (
            <p className="text-muted mt-4 text-sm leading-6">
              Import current odds after Week {weekNumber} cards lock to prepare
              Week {nextWeekNumber}.
            </p>
          )}
        </section>
      ) : null}

      {state.week.state === "FINAL" &&
      state.league.lifecycle === "PLAYOFFS" &&
      weekNumber < 17 ? (
        <section className="border-registry bg-surface rounded-xl border p-5">
          <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
            Week {nextWeekNumber} playoff setup
          </p>
          <h2 className="mt-2 font-bold">Open playoff Week {nextWeekNumber}</h2>
          <p className="text-graphite mt-2 text-sm leading-6">
            Import current NFL markets and review the selected games. Matchups
            are derived from the terminal bracket and results. Every member
            receives exactly one matchup and one new card.
            {weekNumber === 14 && state.league.memberCount <= 8
              ? " Week 15 is the required non-elimination exhibition round."
              : null}
          </p>
          <form action={oddsImportAction} className="mt-4">
            <ContextFields state={state} />
            <button
              className={buttonClass}
              disabled={!providerConfigured || importingOdds}
              type="submit"
            >
              {importingOdds
                ? "Importing current markets…"
                : `Import Week ${nextWeekNumber} NFL markets for review`}
            </button>
          </form>
          {!providerConfigured ? (
            <p className="text-pending mt-3 text-xs leading-5 font-semibold">
              Odds are not connected for this league yet.
            </p>
          ) : null}
          <ActionFeedback state={oddsImportState} />

          {nextWeekImport ? (
            <div className="border-boundary mt-5 border-t pt-5">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                <div>
                  <p className="text-sm font-bold">
                    Latest reviewed import · {nextWeekImport.eventCount} events
                  </p>
                  <p className="text-muted mt-1 text-xs">
                    Last checked{" "}
                    {timestampFormatter.format(
                      new Date(nextWeekImport.fetchedAt),
                    )}{" "}
                    ET · not yet member-visible
                  </p>
                </div>
                <span className="text-positive text-xs font-semibold">
                  Ready for review
                </span>
              </div>
              <form action={postseasonWeekAction} className="mt-4">
                <ContextFields state={state} />
                <input
                  name="importId"
                  type="hidden"
                  value={nextWeekImport.importId}
                />
                <fieldset>
                  <legend className="text-sm font-bold">
                    Select the eligible Week {nextWeekNumber} games
                  </legend>
                  <p className="text-muted mt-1 text-xs leading-5">
                    Standard Sunday games at 1:00 p.m. ET or later and Monday
                    games start selected. Earlier and Thursday games require an
                    affirmative selection.
                  </p>
                  <div className="divide-boundary mt-3 divide-y">
                    {nextWeekImport.events.map((event) => (
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
                            {timestampFormatter.format(
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
                  Once published, the selected games, matchups, and card-lock
                  time for Week {nextWeekNumber} cannot be changed.
                </p>
                <button
                  className={`${buttonClass} mt-4`}
                  disabled={publishingPostseasonWeek}
                  type="submit"
                >
                  {publishingPostseasonWeek
                    ? `Publishing Week ${nextWeekNumber}…`
                    : `Make playoff Week ${nextWeekNumber} available`}
                </button>
              </form>
              <ActionFeedback state={postseasonWeekState} />
            </div>
          ) : (
            <p className="text-muted mt-4 text-sm leading-6">
              Import current odds after Week {weekNumber} cards lock to prepare
              the next playoff round.
            </p>
          )}
        </section>
      ) : null}

      {state.week.state === "FINAL" &&
      state.league.lifecycle === "PLAYOFFS" &&
      weekNumber === 17 ? (
        <section className="border-copper bg-surface rounded-xl border p-5">
          <p className="text-copper text-xs font-bold tracking-[0.08em] uppercase">
            Champion review
          </p>
          <h2 className="mt-2 font-bold">Week 17 results are final</h2>
          <p className="text-graphite mt-2 text-sm leading-6">
            Confirm the champion and final bracket from the stored Week 17
            results. Placement and the champion cannot be selected manually.
          </p>
          <form action={championAction} className="mt-4">
            <ContextFields state={state} />
            <button
              className={buttonClass}
              disabled={finalizingChampion}
              type="submit"
            >
              {finalizingChampion
                ? "Confirming champion…"
                : "Finalize champion & bracket"}
            </button>
          </form>
          <ActionFeedback state={championState} />
        </section>
      ) : null}

      {state.week.state === "FINAL" &&
      state.league.lifecycle === "CHAMPION_FINAL" &&
      weekNumber === 17 ? (
        <section className="border-registry bg-surface rounded-xl border p-5">
          <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
            Week 18 exhibition setup
          </p>
          <h2 className="mt-2 font-bold">
            Champion fixed · archive still open
          </h2>
          <p className="text-graphite mt-2 text-sm leading-6">
            Import the Week 18 provider slate. Final placement and adjacent
            pairings are derived automatically, and every member receives one
            normal card and one exhibition matchup.
          </p>
          <form action={oddsImportAction} className="mt-4">
            <ContextFields state={state} />
            <button
              className={buttonClass}
              disabled={!providerConfigured || importingOdds}
              type="submit"
            >
              {importingOdds
                ? "Importing current markets…"
                : "Import Week 18 NFL markets for review"}
            </button>
          </form>
          <ActionFeedback state={oddsImportState} />
          {nextWeekImport ? (
            <form action={week18Action} className="mt-5 border-t pt-5">
              <ContextFields state={state} />
              <input
                name="importId"
                type="hidden"
                value={nextWeekImport.importId}
              />
              <fieldset>
                <legend className="text-sm font-bold">
                  Select the eligible Week 18 games
                </legend>
                <p className="text-muted mt-1 text-xs leading-5">
                  This selects only the provider slate. Final placement,
                  pairings, and participants cannot be edited.
                </p>
                <div className="divide-boundary mt-3 divide-y">
                  {nextWeekImport.events.map((event) => (
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
                      <span className="text-sm font-semibold">
                        {event.awayTeam} at {event.homeTeam}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <button
                className={`${buttonClass} mt-4`}
                disabled={publishingWeek18}
                type="submit"
              >
                {publishingWeek18
                  ? "Publishing exhibitions…"
                  : "Make Week 18 exhibitions available"}
              </button>
            </form>
          ) : null}
          <ActionFeedback state={week18State} />
        </section>
      ) : null}

      {state.week.state === "FINAL" &&
      state.league.lifecycle === "WEEK_18_EXHIBITION" &&
      weekNumber === 18 ? (
        <section className="border-copper bg-surface rounded-xl border p-5">
          <p className="text-copper text-xs font-bold tracking-[0.08em] uppercase">
            Complete archive
          </p>
          <h2 className="mt-2 font-bold">Week 18 exhibitions are final</h2>
          <p className="text-graphite mt-2 text-sm leading-6">
            Publish the complete Weeks 1–18 archive from stored cards, receipts,
            results, qualification evidence, and champion history.
          </p>
          <form action={archiveAction} className="mt-4">
            <ContextFields state={state} />
            <button
              className={buttonClass}
              disabled={finalizingArchive}
              type="submit"
            >
              {finalizingArchive
                ? "Publishing final archive…"
                : "Publish complete season archive"}
            </button>
          </form>
          <ActionFeedback state={archiveState} />
        </section>
      ) : null}

      {week17CorrectionOperations ? (
        <LateWeek17CorrectionControls
          correcting={correcting}
          correctionAction={correctionAction}
          operations={week17CorrectionOperations}
          state={state}
        />
      ) : null}

      {state.week.state === "FINAL" && weekNumber === 14 ? (
        <section className="border-copper bg-surface rounded-xl border p-5">
          <p className="text-copper text-xs font-bold tracking-[0.08em] uppercase">
            Regular season complete
          </p>
          <h2 className="mt-2 font-bold">Week 14 standings are final</h2>
          <p className="text-graphite mt-2 text-sm leading-6">
            The regular season is complete. Next, confirm the playoff field.
          </p>
          {state.league.lifecycle === "REGULAR" ? (
            <>
              <form action={playoffQualificationAction} className="mt-4">
                <ContextFields state={state} />
                <p className="text-negative text-sm leading-6 font-semibold">
                  Qualification is derived automatically. An authorized Week 14
                  correction appends a new bracket version before any downstream
                  card seals; prior versions remain visible.
                </p>
                <button
                  className={`${buttonClass} mt-4`}
                  disabled={publishingPlayoffQualification}
                  type="submit"
                >
                  {publishingPlayoffQualification
                    ? "Confirming playoff field…"
                    : "Confirm playoff field"}
                </button>
              </form>
              <ActionFeedback state={playoffQualificationState} />
            </>
          ) : (
            <Link
              className="text-action mt-4 inline-flex min-h-11 items-center font-semibold hover:underline"
              href={`/l/${state.league.slug}/playoffs`}
            >
              Open the official bracket
            </Link>
          )}
        </section>
      ) : null}
    </>
  );
}
