"use client";
import { useActionState } from "react";
import {
  initialAppActionState,
  type AppActionState,
} from "@/application/actions/action-state";
import {
  automationBlocker,
  automationPresentation,
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
  section = "settings",
}: {
  section?: "settings" | "recovery" | "audit";
  leagueSlug: string;
  status: SeasonAutomationStatus;
  action: (state: AppActionState, form: FormData) => Promise<AppActionState>;
}) {
  const [feedback, submit, pending] = useActionState(
    action,
    initialAppActionState,
  );
  const display = automationPresentation(status);
  if (section === "recovery")
    return (
      <section aria-labelledby="automation-recovery-heading">
        <h2 id="automation-recovery-heading" className="font-bold">
          Future week automation recovery
        </h2>
        <p className="mt-2 text-sm leading-6">
          {display.label}. {display.detail}
        </p>
        {display.retry ? (
          <form action={submit} className="mt-3">
            <input type="hidden" name="leagueSlug" value={leagueSlug} />
            <button
              className={button}
              name="command"
              value="RETRY"
              disabled={pending}
            >
              {pending ? "Requesting retry…" : "Retry when eligible"}
            </button>
            <p className="text-muted mt-2 text-sm">
              A guarded retry does not bypass readiness, deadlines or provider
              credit limits. If a retry is already scheduled, this is an
              optional fallback.
            </p>
            <ActionFeedback state={feedback} />
          </form>
        ) : (
          <p className="text-muted mt-2 text-sm">
            Refresh the page to recheck status. A manual retry is offered for a
            failed or suspended operation.
          </p>
        )}
      </section>
    );
  if (section === "audit")
    return (
      <details
        id="commissioner-audit"
        className="border-boundary mt-5 border-y py-3 text-sm"
      >
        <summary className="min-h-11 cursor-pointer content-center font-bold">
          Audit details
        </summary>
        <p className="mt-2">
          Policy: {status.policyRevision}. Last outcome:{" "}
          {status.lastOutcome ?? "No action yet"}.{" "}
          {status.approvedAt && Number.isFinite(Date.parse(status.approvedAt))
            ? `Approved ${date.format(new Date(status.approvedAt))}.`
            : ""}
        </p>
        {status.validatedWeek ? (
          <p className="mt-2">
            Week {status.validatedWeek} players validated automatically under
            the saved season policy.
          </p>
        ) : null}
      </details>
    );
  if (!status.eligible && !status.enrolled)
    return (
      <section>
        <h2 className="font-bold">Optional season automation</h2>
        <p className="mt-2 text-sm">
          Available after the Live roster is locked and the season starts.
          Complete setup first.
        </p>
      </section>
    );
  return (
    <section
      aria-labelledby="season-automation-heading"
      className="border-boundary bg-surface rounded-xl border p-5"
    >
      <h2 id="season-automation-heading" className="text-xl font-bold">
        Season automation
      </h2>
      <p className="mt-2 text-sm font-semibold">{display.label}</p>
      {status.enrolled ? (
        <p className="text-graphite mt-2 text-sm">
          From Week {status.effectiveWeek} ·{" "}
          {status.preset === "ALL_NFL_GAMES"
            ? "All NFL games"
            : "Sunday afternoon onward and Monday"}
          . Preparation target: Tuesday 8 a.m. ET. Opening target: 10 a.m. ET,
          conditional on prior finality and readiness.
        </p>
      ) : null}
      {status.revoked ? (
        <p className="mt-2 text-sm">
          Revoked approval cannot be resumed. Review and approve the policy
          again below.
        </p>
      ) : null}
      {status.blocker === "POLICY_UNAVAILABLE" ||
      status.next.blocker === "POLICY_UNAVAILABLE" ? (
        <p className="text-pending mt-2 text-sm">
          {automationBlocker("POLICY_UNAVAILABLE")}
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
          <div>
            <p className="text-graphite mb-3 text-sm leading-6">
              Pause stops covered future preparation and publication.
              Current-week quotes, scores, player results and approved pending
              props continue. Resume keeps this approval; revoking it requires a
              new review and approval.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                className={button}
                name="command"
                value={status.enabled ? "PAUSE" : "RESUME"}
                disabled={pending}
              >
                {status.enabled
                  ? "Pause future week automation"
                  : "Resume future week automation"}
              </button>
              <button
                className={button}
                name="command"
                value="REVOKE"
                disabled={pending}
              >
                Revoke season approval
              </button>
            </div>
          </div>
        )}
        <ActionFeedback state={feedback} />
      </form>
    </section>
  );
}
