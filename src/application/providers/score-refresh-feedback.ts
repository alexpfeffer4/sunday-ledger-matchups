import type { AppActionState } from "@/application/actions/action-state";

export type ScoreRefreshResult = {
  status: "BUSY" | "IDLE" | "DISABLED" | "FAILED" | "PARTIAL" | "SUCCEEDED";
  eventCount: number;
  failureCodes?: string[];
};

/** These are already safe participant messages; do not run them through the
 * generic command-error sanitizer, which discards unrecognized explanations. */
export function scoreRefreshFeedback(
  result: ScoreRefreshResult,
): AppActionState {
  switch (result.status) {
    case "BUSY":
      return {
        status: "error",
        message:
          "A score check is already running or just finished. Wait a minute, then refresh this page.",
      };
    case "DISABLED":
      return {
        status: "error",
        message:
          "Scheduled score checks are disabled. No game updates were requested.",
      };
    case "IDLE":
      return {
        status: "success",
        message:
          "No eligible games need a score check right now. Games that have not started stay sealed; games outside the capture window need objective-result recovery.",
      };
    case "FAILED":
      if (result.failureCodes?.includes("PROVIDER_EVENTS_MISSING"))
        return {
          status: "error",
          message:
            "The score provider returned no matching game updates. Existing results are unchanged. Start confirmation will wait for verified provider data.",
        };
      if (result.failureCodes?.includes("EVENT_IDENTITY_CHANGED"))
        return {
          status: "error",
          message:
            "The provider returned game details that differ from the published slate. No updates were applied. The site operator needs to review the game identity or kickoff.",
        };
      if (result.failureCodes?.includes("INVALID_SCORE_EVIDENCE"))
        return {
          status: "error",
          message:
            "The provider's scores or update times could not be verified. No updates were applied; game-start confirmation remains pending.",
        };
      if (
        result.failureCodes?.some(
          (code) =>
            code === "AUTHORIZATION_FAILED" || code.startsWith("DATABASE_"),
        )
      )
        return {
          status: "error",
          message:
            "Score processing failed on the server. No updates were applied. The site operator needs to review the failed import.",
        };
      return {
        status: "error",
        message:
          "No game updates could be verified from the score provider. Existing results are unchanged. Check the game update status below before retrying.",
      };
    case "PARTIAL":
      return {
        status: "success",
        message: `${result.eventCount} NFL game updates captured; some games are still unavailable. Only provider-confirmed final results settle cards.`,
      };
    case "SUCCEEDED":
      return {
        status: "success",
        message: `${result.eventCount} NFL game updates captured. Only provider-confirmed final results settle cards.`,
      };
  }
}

export function scoreRefreshError(message: string): AppActionState {
  if (message.includes("QUOTE_REFRESH_COOLDOWN"))
    return scoreRefreshFeedback({ status: "BUSY", eventCount: 0 });
  if (message.includes("QUOTE_REFRESH_BUDGET"))
    return {
      status: "error",
      message:
        "The score provider's request limit has been reached. Existing results are unchanged; wait for the request allowance to reset.",
    };
  if (message.includes("PROVIDER_UNCONFIGURED"))
    return {
      status: "error",
      message:
        "Score checks are not configured. Existing results are unchanged; the site operator needs to restore the provider connection.",
    };
  return {
    status: "error",
    message:
      "The score check could not finish. Refresh this page to see whether any updates were captured before trying again.",
  };
}
