"use client";

import { useActionState, useRef, useState } from "react";
import {
  leaveLeagueAction,
  setLeagueArchivedAction,
} from "@/app/leagues/actions";
import { initialAppActionState } from "@/application/actions/action-state";
import { ActionFeedback } from "@/components/forms/action-feedback";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";

export function LeagueListActions({
  archived,
  leagueName,
  lifecycle,
  role,
  slug,
}: {
  archived: boolean;
  leagueName: string;
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
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const leaveTriggerRef = useRef<HTMLButtonElement>(null);

  if (archived && role === "COMMISSIONER") {
    return (
      <form action={archiveAction} className="mt-2 sm:mt-0">
        <input name="leagueSlug" type="hidden" value={slug} />
        <input name="archived" type="hidden" value="false" />
        <Button
          className="px-3"
          disabled={archiving}
          intent="quiet"
          type="submit"
        >
          {archiving ? "Restoring…" : "Restore"}
        </Button>
        <ActionFeedback state={archiveState} />
      </form>
    );
  }

  if (!archived && role === "MEMBER" && lifecycle === "DRAFT") {
    return (
      <div className="mt-2 sm:mt-0">
        <Button
          className="text-muted hover:text-negative px-3"
          disabled={leaving}
          intent="quiet"
          onClick={() => setConfirmingLeave(true)}
          ref={leaveTriggerRef}
          type="button"
        >
          Leave league
        </Button>
        <ConfirmDialog
          action={leaveAction}
          confirmLabel={`Leave ${leagueName}`}
          consequence={`You will immediately lose access to ${leagueName}, and your Draft roster spot will be deleted.`}
          description="Check the league name and what happens to your Draft entry before continuing."
          destination="You will return to Your leagues."
          errorMessage={
            leaveState.status === "error" ? leaveState.message : undefined
          }
          hiddenFields={{ leagueSlug: slug }}
          onClose={() => setConfirmingLeave(false)}
          open={confirmingLeave}
          pending={leaving}
          returnFocusRef={leaveTriggerRef}
          reversibility="There is no undo button. Before roster lock, you can return only with a valid invitation, which consumes an invite use and creates a new Draft entry."
          target={leagueName}
          title={`Leave ${leagueName}?`}
        />
        {leaveState.status === "success" ? (
          <ActionFeedback state={leaveState} />
        ) : null}
      </div>
    );
  }

  return null;
}
