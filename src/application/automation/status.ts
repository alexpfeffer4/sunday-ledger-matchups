import { z } from "zod";
export const seasonAutomationSchema = z.object({
  seasonId: z.uuid(),
  eligible: z.boolean(),
  minimumWeek: z.number().int(),
  enabled: z.boolean(),
  revoked: z.boolean(),
  enrolled: z.boolean(),
  effectiveWeek: z.number().nullable(),
  preset: z.enum(["ALL_NFL_GAMES", "SUNDAY_AFTERNOON_AND_MONDAY"]).nullable(),
  policyRevision: z.string(),
  policyHash: z.string(),
  approvedAt: z.string().nullable(),
  lastOutcome: z.string().nullable(),
  blocker: z.string().nullable(),
  workerReady: z.boolean(),
  automaticMenuWeek: z.number().nullable(),
  validatedWeek: z.number().nullable(),
  next: z.object({
    status: z.string(),
    operation: z.string().optional(),
    week: z.number().optional(),
    dueAt: z.string().optional(),
    blocker: z.string().optional(),
  }),
});
export type SeasonAutomationStatus = z.infer<typeof seasonAutomationSchema>;
const blockers: Record<string, string> = {
  PREVIOUS_WEEK_RESULTS:
    "Waiting for the previous week’s final results. Player results may arrive overnight.",
  PROPS_PREPARING:
    "Initial player evidence is being prepared. Individual unavailable slots can stay empty when the complete slate and source readiness are verified.",
  ENTRY_CUTOFF_PASSED:
    "A selected game’s betting cutoff has passed. The published deadline cannot be reopened. Review Recovery; do not substitute games or stale odds.",
  POLICY_UNAVAILABLE:
    "The saved approval no longer matches the current policy. Revoke the old approval, then review and approve the current policy in Season settings.",
  SCHEDULE_INCOMPLETE:
    "The official game schedule is incomplete. Preparation cannot proceed until the source supplies the complete slate.",
  SCHEDULE_TIME_PENDING: "A selected game’s kickoff time is not confirmed yet.",
  MANUAL_PREPARATION:
    "This week was prepared manually. Complete its existing review and opening in Recovery; season approval does not replace that review.",
  BEFORE_EFFECTIVE_WEEK:
    "Earlier weeks still need their existing manual preparation. Automation begins with the approved future week.",
  REVIEW_WINDOW: "Waiting for the existing score-review period to finish.",
  READINESS_UNAVAILABLE:
    "Source or processing readiness is unavailable. Individual empty player slots are not the cause. No commissioner control here can repair source configuration.",
  SLATE_OR_EVIDENCE_INCOMPLETE:
    "The complete expected slate or its source evidence is missing. Unavailable individual props alone do not block opening.",
  STATE_CHANGED:
    "The season or menu changed during an attempt. The next check uses the current state.",
  SCHEDULE_UNAVAILABLE: "The official schedule could not be loaded.",
  MARKETS_UNAVAILABLE: "Current game markets are missing for a selected game.",
  PROVIDER_BUDGET:
    "Market acquisition is waiting for provider readiness, cooldown or credit budget. Existing limits remain in effect.",
  START_SEASON:
    "The season must be started before future-week automation can operate.",
  OPERATION_FAILED:
    "The operation failed, but its cause is not available here. Refresh the status and inspect Recovery before requesting a guarded retry.",
};
export function automationBlocker(code: string | null | undefined) {
  return code
    ? (blockers[code] ??
        "The operating cause could not be confirmed. Refresh the status; no automatic completion can be promised.")
    : null;
}

const operationLabels: Record<string, string> = {
  OPEN: "Open bets",
  VALIDATE: "Validate players automatically",
  PREPARE: "Prepare games and player menu",
  SYNC_SCHEDULE: "Check the official season schedule",
  QUALIFY: "Publish playoff qualification after review closes",
  CHAMPION: "Finalize the champion after review closes",
  ARCHIVE: "Publish the completed season archive after review closes",
  RECONCILE: "Check deadlines and completed results",
};
const waitingCauses = new Set([
  "PREVIOUS_WEEK_RESULTS",
  "REVIEW_WINDOW",
  "PROPS_PREPARING",
  "BEFORE_EFFECTIVE_WEEK",
]);
const sourceCauses = new Set([
  "SCHEDULE_INCOMPLETE",
  "SCHEDULE_TIME_PENDING",
  "SCHEDULE_UNAVAILABLE",
  "MARKETS_UNAVAILABLE",
  "PROVIDER_BUDGET",
  "SLATE_OR_EVIDENCE_INCOMPLETE",
]);
export type AutomationPresentation = {
  label: string;
  detail: string;
  attention: boolean;
  next: string | null;
  dueAt: string | null;
  retry: boolean;
};

/** Presentation only. The existing RPC remains the authority for scheduling,
 * consent and eligibility. Never turn a missing/novel state into Enabled. */
export function automationPresentation(
  value: SeasonAutomationStatus | null,
): AutomationPresentation {
  const result = (
    label: string,
    detail: string,
    attention = false,
    next: string | null = null,
    dueAt: string | null = null,
    retry = false,
  ): AutomationPresentation => ({
    label,
    detail,
    attention,
    next,
    dueAt,
    retry,
  });
  const unknown = () =>
    result(
      "Operating status unconfirmed",
      "Refresh this page to check again. Saved settings and results are unchanged; automatic operation could not be confirmed.",
      true,
    );
  if (!value) return unknown();
  const { next } = value;
  if (value.revoked)
    return result(
      "Season approval revoked",
      "Future preparation and publication are stopped. Review and approve the policy again in Season settings to enroll; resume does not renew revoked consent.",
    );
  if (!value.enrolled)
    return next.status === "NOT_ENROLLED" && !value.enabled
      ? result(
          "Manual season operation",
          value.eligible
            ? "Prepare and publish future weeks through the existing controls. Optional season automation is available in Season settings."
            : "Finish the roster, publish the first slate, then explicitly lock the roster and start the season. Automation can be approved afterward.",
        )
      : unknown();
  if (!value.effectiveWeek || !value.preset || !value.approvedAt)
    return unknown();
  if (!value.enabled)
    return next.status === "PAUSED"
      ? result(
          "Future week automation paused",
          "Covered future preparation and publication are stopped. Resume in Season settings keeps the existing approval. Current quotes, scores, player results and approved pending props continue.",
        )
      : unknown();
  if (next.status === "COMPLETE")
    return result(
      "Season archive complete",
      "No further season publication is needed.",
    );
  if (!value.workerReady)
    return result(
      "Needs attention · automation unavailable",
      "Season approval is saved, but the scheduled worker is unavailable. Refresh to recheck. This console cannot activate or repair the worker; a deployment/configuration review is needed.",
      true,
    );
  const cause = next.blocker ?? value.blocker;
  const detail =
    cause === "PREVIOUS_WEEK_RESULTS" &&
    Number.isInteger(next.week) &&
    next.week! > 1 &&
    next.week! <= 18
      ? `Waiting for Week ${next.week! - 1} to be final. Player results may arrive overnight.`
      : automationBlocker(cause);
  const operation = next.operation ? operationLabels[next.operation] : null;
  const dueAt =
    next.dueAt && Number.isFinite(Date.parse(next.dueAt)) ? next.dueAt : null;
  if (next.dueAt && !dueAt) return unknown();
  if (
    next.operation &&
    (!operation ||
      !Number.isInteger(next.week) ||
      next.week! < 1 ||
      next.week! > 18)
  )
    return unknown();
  const operationLabel = operation ? `${operation} · Week ${next.week}` : null;
  if (next.status === "SUSPENDED")
    return result(
      "Needs attention · automation suspended",
      detail ??
        "Automatic attempts have stopped. Inspect Recovery before requesting a guarded retry.",
      true,
      operationLabel,
      null,
      true,
    );
  if (!["WAITING", "DUE", "BLOCKED"].includes(next.status)) return unknown();
  if (cause && !blockers[cause]) return unknown();
  if (next.status === "BLOCKED")
    return result(
      sourceCauses.has(cause ?? "")
        ? "Waiting for provider data"
        : "Needs attention · preparation blocked",
      `${detail ?? "The prerequisite could not be confirmed."} The worker rechecks eligibility; no completion time is confirmed.`,
      true,
      operationLabel,
    );
  if (value.lastOutcome === "FAILED" && value.blocker && !next.blocker)
    return result(
      dueAt ? "Retry scheduled" : "Needs attention · retry unconfirmed",
      detail ?? "The last attempt failed.",
      !dueAt,
      operationLabel,
      dueAt,
      true,
    );
  if (next.blocker && !waitingCauses.has(next.blocker)) return unknown();
  if (!operationLabel && !next.blocker) return unknown();
  if (next.blocker === "BEFORE_EFFECTIVE_WEEK")
    return result(
      "Manual work before approved scope",
      detail!,
      false,
      `Automation begins with Week ${value.effectiveWeek}`,
    );
  return result(
    "No action needed now",
    detail ??
      "The next operation runs when its time and readiness checks allow. No weekly player confirmation is required.",
    false,
    operationLabel ??
      (next.week
        ? `Week ${next.week}: target Tuesday 8 a.m. ET preparation, 10 a.m. opening, subject to finality and readiness. Exact date pending.`
        : "Waiting for the next eligible season step"),
    dueAt,
  );
}

export function automationNextLabel(value: SeasonAutomationStatus): string {
  const display = automationPresentation(value);
  return display.attention ? display.label : (display.next ?? display.label);
}

export function automationCoversWeek(
  value: SeasonAutomationStatus | null,
  week: number,
): boolean {
  return Boolean(
    value?.enrolled &&
    value.enabled &&
    !value.revoked &&
    value.effectiveWeek !== null &&
    week >= value.effectiveWeek,
  );
}

/** Pausing stops work but does not revoke the enrolled preparation authority. */
export function automationOwnsWeek(
  value: SeasonAutomationStatus | null,
  week: number,
): boolean {
  return Boolean(
    value?.enrolled &&
    !value.revoked &&
    value.effectiveWeek !== null &&
    week >= value.effectiveWeek,
  );
}
