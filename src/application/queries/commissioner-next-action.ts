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
  if (
    week.rollingSubmissionsEnabled &&
    ["OPEN", "LOCKED"].includes(week.state)
  ) {
    return {
      title: week.entryClosed
        ? "Check remaining game results"
        : "Betting continues game by game",
      detail: week.entryClosed
        ? "Weekly betting has closed. Submitted bets settle from confirmed results and the week finalizes automatically."
        : `Members can add bets until each game’s kickoff; a partial allocation counts as participation. ${operations?.automationEnabled === true ? "Game checks run automatically." : operations?.automationEnabled === false ? "Automatic game checks are off; use the bounded checks in Recovery." : "Automatic game-check status could not be confirmed."}`,
      prerequisites: week.entryClosesAt
        ? `Weekly betting ${week.entryClosed ? "closed" : "closes"} ${easternTime(week.entryClosesAt)}`
        : "Each game closes at its own kickoff",
    };
  }
  const deadline = easternTime(week.commonLockAt);
  if (
    week.state === "PLANNED" &&
    Date.parse(week.commonLockAt) <= now.getTime()
  )
    return {
      title: "Week opening deadline missed",
      detail:
        "The published opening deadline has passed and cannot be reopened here. Review the limitation in Recovery; do not move the deadline or use stale odds.",
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
    if (week.finalizationMode === "AFTER_RESULTS")
      return {
        title: "Check weekly settlement",
        detail:
          "The week closes automatically once all published games and picks are settled.",
        prerequisites: "Review any unresolved game result",
      };
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
      detail: `${overdue.awayTeam} at ${overdue.homeTeam} is unresolved. Try the bounded score check in Recovery. The correction tool requires an existing final; no manual first-result process is established here. Leave the game unresolved if retrieval fails.`,
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

export function isRosterValid(state: Stage1CommissionerControlState) {
  return (
    state.league.memberCount >= 4 &&
    state.league.memberCount <= 16 &&
    state.league.memberCount % 2 === 0
  );
}

export function commissionerNextStep({
  hasLiveImport,
  providerConfigured,
  state,
}: {
  hasLiveImport: boolean;
  providerConfigured: boolean;
  state: Stage1CommissionerControlState;
}) {
  const rosterIsValid = isRosterValid(state);

  if (!state.week && !rosterIsValid) {
    return {
      detail:
        "Invite members until the roster has an even total between 4 and 16.",
      prerequisites: `${state.league.memberCount} members now · even 4–16 required`,
      title: "Complete the league roster",
    };
  }

  if (!state.week && state.league.mode === "LIVE") {
    if (!providerConfigured) {
      return {
        detail:
          "Odds are not connected yet. Finish league setup before importing the Week 1 slate.",
        prerequisites: "Odds connection needed",
        title: "Connect weekly odds",
      };
    }
    if (!hasLiveImport) {
      return {
        detail:
          "Import the current NFL markets for private review. This does not open member cards.",
        prerequisites: "Odds connected",
        title: "Import current NFL markets",
      };
    }
    return {
      detail:
        "Review the imported games, then publish the eligible Week 1 slate and card-lock time.",
      prerequisites: "Imported odds ready",
      title: "Publish the Week 1 slate",
    };
  }

  if (!state.week) {
    return {
      detail:
        "Advance the practice clock, then make the reviewed Week 1 slate available.",
      prerequisites: rosterIsValid
        ? "Practice/test Week 1 is ready"
        : `${state.league.memberCount} members · even 4–16 required`,
      title: "Make practice Week 1 available",
    };
  }

  if (state.league.mode === "LIVE" && state.week.state === "PLANNED") {
    if (state.league.lifecycle !== "DRAFT") {
      return {
        detail:
          "The slate is prepared. For a manual week, complete its existing player-menu review and opening in Recovery. An enrolled week follows its approved automatic validation and opening instead.",
        prerequisites: `Week ${state.week.nflWeek} slate prepared · cards not open`,
        title: `Open Week ${state.week.nflWeek} when ready`,
      };
    }
    if (!rosterIsValid) {
      return {
        detail:
          "The slate is published. Invite members until the roster has an even total between 4 and 16.",
        prerequisites: `${state.league.memberCount} members now · even 4–16 required`,
        title: "Complete the league roster",
      };
    }
    return {
      detail:
        "Refresh the odds one final time, freeze the roster and schedule, and open every member card.",
      prerequisites: `${state.league.memberCount}-member roster ready`,
      title: "Lock the roster and open Week 1",
    };
  }

  if (state.week.state === "OPEN") {
    if (state.week.rollingSubmissionsEnabled)
      return {
        detail:
          "Members can submit bets until each game’s kickoff. Any accepted bet counts as participation; unused allocation expires at the final cutoff.",
        prerequisites: `Week ${state.week.nflWeek} betting is open`,
        title: "Betting continues game by game",
      };
    return {
      detail:
        state.league.mode === "LIVE"
          ? "Monitor card completion and quote health. Cards lock for everyone at the published deadline."
          : "Members complete their authoritative cards before the shared deadline; then lock the week.",
      prerequisites: `Week ${state.week.nflWeek} cards are open`,
      title: "Monitor cards until lock",
    };
  }

  if (state.week.state === "LOCKED") {
    return {
      detail:
        "Record final game results as they arrive. Matchup scores update from the accepted card terms.",
      prerequisites: state.week.rollingSubmissionsEnabled
        ? "Submitted bets remain permanent; later games can still accept bets"
        : "All member cards are locked",
      title: "Record final results",
    };
  }

  if (state.week.state === "PROVISIONAL") {
    if (state.week.finalizationMode === "AFTER_RESULTS")
      return {
        detail:
          "The week closes automatically once all published games and picks are settled.",
        prerequisites: "Review any unresolved game result",
        title: "Check weekly settlement",
      };
    return {
      detail:
        "Review any correction, then finalize the week after the correction window closes.",
      prerequisites: state.week.correctionWindowClosesAt
        ? `Window closes ${easternTime(state.week.correctionWindowClosesAt)}`
        : "Awaiting correction-window close",
      title: "Finalize the week",
    };
  }

  return {
    detail:
      state.league.lifecycle === "FINAL"
        ? "The champion and season history are final. No further commissioner action is required."
        : "This week is final. Continue the season when the next weekly slate is available.",
    prerequisites: `Week ${state.week.nflWeek} is final`,
    title:
      state.league.lifecycle === "FINAL"
        ? "Season complete"
        : "Prepare the next week",
  };
}
