import type { LiveWeekOperations } from "@/application/queries/get-live-week-operations";

export const SCORE_CHECK_GRACE_MS = 10 * 60_000;
export const FINAL_CHECK_OFFSET_MS = 4 * 60 * 60_000;

export function easternTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(new Date(value));
}

export function updateAge(value: string, now: Date): string {
  const minutes = Math.max(
    0,
    Math.floor((now.getTime() - Date.parse(value)) / 60_000),
  );
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

/** Only public event evidence participates; never receipt counts or stakes. */
export function scoreFreshness(
  operations: LiveWeekOperations | null,
  now: Date,
) {
  const events = operations?.events ?? [];
  const unfinished = events.filter((event) => !event.result);
  const due = unfinished.filter(
    (event) => Date.parse(event.scheduledStartAt) <= now.getTime(),
  );
  const stopped = due.some((event) => event.scoreCheck?.state === "STOPPED");
  const delayed = due.some((event) => {
    const start = Date.parse(event.scheduledStartAt);
    const check = event.scoreCheck;
    const finalDue = start + FINAL_CHECK_OFFSET_MS;
    const fetched = check?.fetchedAt ? Date.parse(check.fetchedAt) : 0;
    const source = check?.sourceUpdatedAt
      ? Date.parse(check.sourceUpdatedAt)
      : 0;
    if (check?.state === "STOPPED") return true;
    if (
      event.state === "SCHEDULED" &&
      now.getTime() > start + SCORE_CHECK_GRACE_MS
    )
      return true;
    if (now.getTime() > finalDue + SCORE_CHECK_GRACE_MS && fetched < finalDue)
      return true;
    if (
      now.getTime() > finalDue &&
      fetched >= finalDue &&
      source < fetched - 15 * 60_000
    )
      return true;
    return Boolean(
      check?.nextCheckAt &&
      Date.parse(check.nextCheckAt) + SCORE_CHECK_GRACE_MS < now.getTime(),
    );
  });
  const fetches = events.flatMap((event) =>
    event.scoreCheck?.fetchedAt ? [event.scoreCheck.fetchedAt] : [],
  );
  const latestFetch =
    fetches.sort().at(-1) ?? operations?.latestImportAt ?? null;
  const next =
    unfinished
      .filter((event) => event.scoreCheck?.state !== "STOPPED")
      .map((event) => {
        if (event.scoreCheck?.nextCheckAt) return event.scoreCheck.nextCheckAt;
        return new Date(
          Date.parse(event.scheduledStartAt) +
            (event.state === "SCHEDULED" ? 2 * 60_000 : FINAL_CHECK_OFFSET_MS),
        ).toISOString();
      })
      .sort()
      .at(0) ?? null;
  const unknownStart = due.some((event) => event.state === "SCHEDULED");
  return {
    delayed,
    latestFetch,
    nextCheckAt: next,
    message: stopped
      ? "Automatic checks have ended for an unresolved game. Commissioner review is required."
      : delayed
        ? unknownStart
          ? "Start confirmation is delayed. Picks stay sealed until play is confirmed."
          : "A scheduled result update is delayed. Confirmed starts and stored results remain visible."
        : unknownStart
          ? "Waiting for confirmed play. Scheduled kickoff alone does not reveal picks."
          : unfinished.length > 0
            ? "Scores settle after games finish. Results are checked about four hours after kickoff; longer games are checked again."
            : "Final game results are captured. The weekly result follows its correction window.",
  };
}
