import type { SeasonAutomationStatus } from "@/application/automation/status";
import type { Stage1CommissionerControlState } from "@/components/commissioner/stage1-controls";
import type { Stage1StateDto } from "@/application/queries/stage1-dtos";

export const commissionerFixtureStatus: SeasonAutomationStatus = {
  seasonId: "00000000-0000-4000-8000-000000000002",
  eligible: true,
  minimumWeek: 3,
  enabled: true,
  revoked: false,
  enrolled: true,
  effectiveWeek: 3,
  preset: "ALL_NFL_GAMES",
  policyRevision: "SEASON_AUTOMATION_V1",
  policyHash: "a".repeat(64),
  approvedAt: "2026-09-16T14:00:00Z",
  lastOutcome: "SCHEDULE_READY",
  blocker: null,
  workerReady: true,
  automaticMenuWeek: null,
  validatedWeek: null,
  next: { status: "WAITING", week: 3, blocker: "PREVIOUS_WEEK_RESULTS" },
};
export const commissionerFixtureLeague: Stage1StateDto["league"] = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Sunday Friends — A deliberately long league name for mobile review",
  slug: "fixture-preview",
  mode: "LIVE",
  role: "COMMISSIONER",
  nflYear: 2026,
  lifecycle: "REGULAR",
  memberCount: 10,
};
export const commissionerFixtureControls: Stage1CommissionerControlState = {
  league: commissionerFixtureLeague,
  week: {
    nflWeek: 2,
    scope: "REGULAR",
    state: "OPEN",
    commonLockAt: "2026-09-20T16:55:00Z",
    correctionWindowClosesAt: null,
    rollingSubmissionsEnabled: true,
    entryClosed: false,
    entryClosesAt: "2026-09-22T00:15:00Z",
    finalizationMode: "AFTER_RESULTS",
  },
  members: [],
  slate: [],
};
export const commissionerFixtureScenarios: Record<
  string,
  SeasonAutomationStatus | null
> = {
  "Healthy waiting": commissionerFixtureStatus,
  "Scheduled opening": {
    ...commissionerFixtureStatus,
    next: {
      status: "WAITING",
      operation: "OPEN",
      week: 3,
      dueAt: "2026-09-22T14:00:00Z",
    },
  },
  "Provider data missing": {
    ...commissionerFixtureStatus,
    next: { status: "BLOCKED", week: 3, blocker: "SCHEDULE_INCOMPLETE" },
  },
  "Readiness missing": {
    ...commissionerFixtureStatus,
    next: { status: "BLOCKED", week: 3, blocker: "READINESS_UNAVAILABLE" },
  },
  "Retry scheduled": {
    ...commissionerFixtureStatus,
    lastOutcome: "FAILED",
    blocker: "SCHEDULE_UNAVAILABLE",
    next: {
      status: "WAITING",
      operation: "SYNC_SCHEDULE",
      week: 3,
      dueAt: "2026-09-22T12:15:00Z",
    },
  },
  Suspended: {
    ...commissionerFixtureStatus,
    lastOutcome: "FAILED",
    blocker: "OPERATION_FAILED",
    next: {
      status: "SUSPENDED",
      operation: "PREPARE",
      week: 3,
      blocker: "OPERATION_FAILED",
    },
  },
  "Worker unavailable": { ...commissionerFixtureStatus, workerReady: false },
  Paused: {
    ...commissionerFixtureStatus,
    enabled: false,
    next: { status: "PAUSED" },
  },
  Revoked: {
    ...commissionerFixtureStatus,
    enabled: false,
    revoked: true,
    next: { status: "REVOKED" },
  },
  "Status unavailable": null,
  "Manual league": {
    ...commissionerFixtureStatus,
    enrolled: false,
    enabled: false,
    effectiveWeek: null,
    preset: null,
    approvedAt: null,
    next: { status: "NOT_ENROLLED" },
  },
  Postseason: {
    ...commissionerFixtureStatus,
    next: {
      status: "WAITING",
      operation: "QUALIFY",
      week: 15,
      dueAt: "2026-12-15T12:00:00Z",
    },
  },
};
