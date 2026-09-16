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
  PREVIOUS_WEEK_RESULTS: "Waiting for the previous week’s final results.",
  PROPS_PREPARING:
    "The initial player evidence is being prepared automatically. Unavailable slots can stay empty when the week opens.",
  ENTRY_CUTOFF_PASSED:
    "A selected game’s betting cutoff has passed. Pause automation and review this week’s recovery options.",
  POLICY_UNAVAILABLE:
    "The approved season policy no longer matches. Review and approve the updated policy before resuming.",
  SCHEDULE_INCOMPLETE:
    "The official game schedule is incomplete. Retry after the schedule source recovers.",
  SCHEDULE_TIME_PENDING: "A selected game’s kickoff time is not confirmed yet.",
  MANUAL_PREPARATION:
    "This week was prepared manually. Complete its existing review and opening, then automation can continue.",
  BEFORE_EFFECTIVE_WEEK: "Automation begins with the selected future week.",
  REVIEW_WINDOW: "Waiting for the existing score-review period to finish.",
  READINESS_UNAVAILABLE:
    "Source or processing readiness is unavailable. Check the existing props readiness controls, then retry.",
  SLATE_OR_EVIDENCE_INCOMPLETE:
    "The expected slate or its source evidence is incomplete. Retry after the source recovers.",
  STATE_CHANGED:
    "The season or menu changed during this attempt. Automation will recheck the current state.",
  SCHEDULE_UNAVAILABLE:
    "The official schedule could not be loaded. A bounded retry is scheduled.",
  MARKETS_UNAVAILABLE:
    "Current markets are missing for a selected game. A bounded retry is scheduled.",
  PROVIDER_BUDGET:
    "Market acquisition is waiting for provider readiness, cooldown or budget. Existing limits remain in effect.",
};
export function automationBlocker(code: string | null | undefined) {
  return code
    ? (blockers[code] ??
        "Automation needs attention. Check Audit details, resolve the cause, then retry.")
    : null;
}
export function automationNextLabel(value: SeasonAutomationStatus): string {
  if (value.revoked) return "Season approval revoked";
  if (!value.enrolled) return "Choose when automation starts";
  if (!value.enabled) return "Future week automation is paused";
  if (value.next.status === "COMPLETE") return "Season archive complete";
  const week = value.next.week;
  switch (value.next.operation) {
    case "OPEN":
      return `Week ${week} will open once ready`;
    case "VALIDATE":
      return `Week ${week} players will be validated automatically`;
    case "PREPARE":
      return `Week ${week} will be prepared automatically`;
    case "SYNC_SCHEDULE":
      return "Loading the official season schedule";
    case "QUALIFY":
      return "Playoff qualification will publish after review closes";
    case "CHAMPION":
      return "The champion will be finalized after review closes";
    case "ARCHIVE":
      return "The completed season will be archived automatically";
    case "RECONCILE":
      return "Checking deadlines and completed results";
    default:
      return week ? `Waiting to prepare Week ${week}` : "Automation is enabled";
  }
}
