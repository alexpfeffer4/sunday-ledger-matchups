import type { LiveWeekOperations } from "@/application/queries/get-live-week-operations";
import type { Stage1CommissionerControlState } from "@/components/commissioner/stage1-controls";
import {
  easternTime,
  FINAL_CHECK_OFFSET_MS,
  scoreFreshness,
} from "@/application/queries/score-freshness";

export function timedCommissionerAction(
  state: Stage1CommissionerControlState,
  operations: LiveWeekOperations | null,
  now: Date,
) {
  const week = state.week;
  if (state.league.mode !== "LIVE" || !week) return null;
  const deadline = easternTime(week.commonLockAt);
  if (
    week.state === "PLANNED" &&
    Date.parse(week.commonLockAt) <= now.getTime()
  )
    return {
      title: "Week opening deadline missed",
      detail:
        "The published lock has passed. Do not move the deadline or use stale odds; follow the recovery runbook before opening a replacement season.",
      prerequisites: `Card deadline was ${deadline}`,
    };
  if (week.state === "OPEN")
    return Date.parse(week.commonLockAt) <= now.getTime()
      ? {
          title: "Lock the week now",
          detail:
            "The database already rejects late cards. Locking records incomplete cards and enables the scheduled game checks; until then, updates wait.",
          prerequisites: `Due ${deadline}`,
        }
      : {
          title: "Monitor cards until lock",
          detail:
            "Members can review fresh odds themselves. At the deadline, lock the week so game checks can begin.",
          prerequisites: `Lock Week ${week.nflWeek} at ${deadline}`,
        };
  if (week.state === "PROVISIONAL") {
    const closes = week.correctionWindowClosesAt;
    const due = closes !== null && Date.parse(closes) <= now.getTime();
    return {
      title: due
        ? "Review and finalize the week"
        : "Review provisional results",
      detail: due
        ? "The correction window has closed. Resolve any outstanding correction, then finalize to unlock the next week."
        : "Results remain provisional. Check any official correction; finalization stays unavailable until the deadline.",
      prerequisites: closes
        ? `Correction window ${due ? "closed" : "closes"} ${easternTime(closes)}`
        : "Waiting for the correction deadline",
    };
  }
  if (week.state !== "LOCKED") return null;
  const freshness = scoreFreshness(operations, now);
  const unresolved = (operations?.events ?? []).filter(
    (event) => !event.result,
  );
  const overdue = unresolved.find(
    (event) =>
      Date.parse(event.scheduledStartAt) + 48 * 60 * 60_000 <= now.getTime(),
  );
  if (overdue)
    return {
      title: "Recover the missing final result",
      detail: `${overdue.awayTeam} at ${overdue.homeTeam} is unresolved. Capture an identifiable official result now; use the documented void path only if its conditions apply. Never finalize an unresolved week.`,
      prerequisites: `Capture target was ${easternTime(new Date(Date.parse(overdue.scheduledStartAt) + 48 * 60 * 60_000).toISOString())}`,
    };
  if (freshness.delayed)
    return {
      title: "Check the delayed game update",
      detail: `${freshness.message} Use the score check below, then the recovery steps if it fails.`,
      prerequisites: freshness.nextCheckAt
        ? `Scheduled check ${easternTime(freshness.nextCheckAt)}`
        : "Operator check required",
    };
  const next =
    freshness.nextCheckAt ??
    (unresolved[0]
      ? new Date(
          Date.parse(unresolved[0].scheduledStartAt) + FINAL_CHECK_OFFSET_MS,
        ).toISOString()
      : null);
  return {
    title: operations?.automationEnabled
      ? "Await the next game check"
      : "Check games at the scheduled times",
    detail:
      "Confirm starts near kickoff. Check results about four hours after each kickoff; settle only confirmed finals. A longer game stays pending and is checked again.",
    prerequisites: next
      ? `Next check ${easternTime(next)}${operations?.automationEnabled ? "" : " · automatic checks are off"}`
      : "Review captured results",
  };
}
