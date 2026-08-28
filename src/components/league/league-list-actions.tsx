"use client";

import { useActionState } from "react";
import {
  leaveLeagueAction,
  setLeagueArchivedAction,
} from "@/app/leagues/actions";
import { initialAppActionState } from "@/application/actions/action-state";
import { ActionFeedback } from "@/components/forms/action-feedback";

export function LeagueListActions({
  archived,
  lifecycle,
  role,
  slug,
}: {
  archived: boolean;
  lifecycle: string;
  role: string;
  slug: string;
}) {
  const [archiveState, archiveAction, archiving] = useActionState(
    setLeagueArchivedAction,
    initialAppActionState,
  );
  const [leaveState, leaveAction, leaving] = useActionState(
    leaveLeagueAction,
    initialAppActionState,
  );

  if (archived && role === "COMMISSIONER") {
    return (
      <form action={archiveAction} className="mt-2 sm:mt-0">
        <input name="leagueSlug" type="hidden" value={slug} />
        <input name="archived" type="hidden" value="false" />
        <button
          className="text-registry hover:underline disabled:opacity-60"
          disabled={archiving}
          type="submit"
        >
          {archiving ? "Restoring…" : "Restore"}
        </button>
        <ActionFeedback state={archiveState} />
      </form>
    );
  }

  if (!archived && role === "MEMBER" && lifecycle === "DRAFT") {
    return (
      <form action={leaveAction} className="mt-2 sm:mt-0">
        <input name="leagueSlug" type="hidden" value={slug} />
        <button
          className="text-muted hover:text-negative disabled:opacity-60"
          disabled={leaving}
          type="submit"
        >
          {leaving ? "Leaving…" : "Leave league"}
        </button>
        <ActionFeedback state={leaveState} />
      </form>
    );
  }

  return null;
}
