"use client";
import { useActionState } from "react";
import {
  initialAppActionState,
  type AppActionState,
} from "@/application/actions/action-state";
import {
  automationBlocker,
  automationNextLabel,
  type SeasonAutomationStatus,
} from "@/application/automation/status";
import { ActionFeedback } from "@/components/forms/action-feedback";
const button =
  "border-control hover:border-registry min-h-11 rounded-lg border px-4 text-sm font-semibold disabled:opacity-50";
const date = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "long",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});
export function SeasonAutomationPanel({
  leagueSlug,
  status,
  action,
}: {
  leagueSlug: string;
  status: SeasonAutomationStatus;
  action: (state: AppActionState, form: FormData) => Promise<AppActionState>;
}) {
  const [feedback, submit, pending] = useActionState(
    action,
    initialAppActionState,
  );
  const blocker = automationBlocker(status.next.blocker ?? status.blocker);
  return (
    <section
      aria-labelledby="season-automation-heading"
      className="border-boundary bg-surface mx-auto my-5 w-full max-w-7xl rounded-xl border p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="season-automation-heading" className="text-xl font-bold">
          Season automation
        </h2>
        <span className="text-registry text-sm font-semibold">
          {status.revoked
            ? "Revoked"
            : status.enabled
              ? "Enabled"
              : status.enrolled
                ? "Paused"
                : "Not enabled"}
        </span>
      </div>
      <p className="mt-3 font-semibold">{automationNextLabel(status)}</p>
      {status.next.dueAt ? (
        <p className="text-muted mt-1 text-sm">
          {date.format(new Date(status.next.dueAt))}
        </p>
      ) : null}
      {status.enrolled ? (
        <p className="text-graphite mt-2 text-sm">
          From Week {status.effectiveWeek} ·{" "}
          {status.preset === "ALL_NFL_GAMES"
            ? "All NFL games"
            : "Sunday afternoon onward and Monday"}{" "}
          · Tuesday at 10 a.m. ET
        </p>
      ) : null}
      {blocker ? (
        <p role="status" className="text-graphite mt-3 text-sm leading-6">
          {blocker}
        </p>
      ) : null}
      {status.validatedWeek ? (
        <p className="text-graphite mt-3 text-sm">
          Week {status.validatedWeek} players validated automatically under your
          season policy. Eligible unavailable props are checked automatically
          before their game’s cutoff.
        </p>
      ) : null}
      {!status.workerReady && status.enrolled ? (
        <p className="text-pending mt-3 text-sm">
          Your settings are saved. The scheduled worker is awaiting release
          activation.
        </p>
      ) : null}
      <form action={submit} className="mt-4 space-y-4">
        <input type="hidden" name="leagueSlug" value={leagueSlug} />
        {!status.enrolled || status.revoked ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                Start with Week
                <select
                  name="effectiveWeek"
                  defaultValue={status.minimumWeek}
                  className="border-control mt-2 min-h-11 w-full rounded-lg border px-3"
                  disabled={!status.eligible || pending}
                >
                  {Array.from(
                    { length: 19 - status.minimumWeek },
                    (_, i) => status.minimumWeek + i,
                  ).map((week) => (
                    <option key={week} value={week}>
                      {week}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold">
                Weekly games
                <select
                  name="preset"
                  defaultValue="ALL_NFL_GAMES"
                  className="border-control mt-2 min-h-11 w-full rounded-lg border px-3"
                  disabled={!status.eligible || pending}
                >
                  <option value="ALL_NFL_GAMES">
                    All NFL games (recommended)
                  </option>
                  <option value="SUNDAY_AFTERNOON_AND_MONDAY">
                    Sunday afternoon onward plus Monday
                  </option>
                </select>
              </label>
            </div>
            <input type="hidden" name="policyHash" value={status.policyHash} />
            <label className="flex min-h-11 items-start gap-3 text-sm leading-6">
              <input
                required
                type="checkbox"
                name="policyConsent"
                value="approved"
                className="mt-1.5 size-4 shrink-0"
                disabled={!status.eligible || pending}
              />
              <span>
                I approve automatic preparation, opening and season-stage
                publication for this season. Select each team’s verified highest
                standard DraftKings passing QB, rushing RB and receiving WR/TE.
                Missing or ambiguous players stay unavailable; eligible empty
                slots may fill automatically. Offered players stay fixed. No
                weekly confirmation is required.
              </span>
            </label>
            <button
              className={button}
              name="command"
              value="ENABLE"
              disabled={!status.eligible || pending}
            >
              {pending ? "Saving…" : "Approve and enable for this season"}
            </button>
            {!status.eligible ? (
              <p className="text-muted text-sm">
                Lock the roster and start the Live season first.
              </p>
            ) : null}
          </>
        ) : (
          <div className="flex flex-wrap gap-3">
            <button
              className={button}
              name="command"
              value={status.enabled ? "PAUSE" : "RESUME"}
              disabled={pending}
            >
              {status.enabled ? "Pause automation" : "Resume automation"}
            </button>
            {status.enabled &&
            (blocker || status.next.status === "SUSPENDED") ? (
              <button
                className={button}
                name="command"
                value="RETRY"
                disabled={pending}
              >
                Retry when eligible
              </button>
            ) : null}
            <a
              href="#player-menu-heading"
              className={`${button} inline-flex items-center`}
            >
              View player menu
            </a>
          </div>
        )}
        <ActionFeedback state={feedback} />
      </form>
      <details className="text-muted mt-4 text-xs">
        <summary className="min-h-8 cursor-pointer">Audit details</summary>
        <p className="mt-2">
          Policy: {status.policyRevision}. Last outcome:{" "}
          {status.lastOutcome ?? "No action yet"}.{" "}
          {status.approvedAt
            ? `Approved ${date.format(new Date(status.approvedAt))}.`
            : ""}
        </p>
        <p className="mt-2">
          Pausing stops future preparation and publication. Current quotes,
          accepted results and approved pending-slot additions continue.
        </p>
        {status.enrolled && !status.revoked ? (
          <form action={submit} className="mt-3">
            <input type="hidden" name="leagueSlug" value={leagueSlug} />
            <button
              className={button}
              name="command"
              value="REVOKE"
              disabled={pending}
            >
              Revoke season approval
            </button>
          </form>
        ) : null}
      </details>
    </section>
  );
}
