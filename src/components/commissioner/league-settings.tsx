"use client";

import { useActionState, useRef, useState } from "react";
import {
  deleteLeagueAction,
  removeLeagueMemberAction,
  renameLeagueAction,
  setLeagueArchivedAction,
  transferLeagueCommissionerAction,
} from "@/app/leagues/actions";
import { initialAppActionState } from "@/application/actions/action-state";
import { ActionFeedback } from "@/components/forms/action-feedback";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";

type LeagueMember = {
  displayName: string;
  role: "MEMBER" | "COMMISSIONER";
  userId: string;
};

export function LeagueSettings({
  archived,
  canDelete,
  leagueName,
  leagueSlug,
  lifecycle,
  members,
}: {
  archived: boolean;
  canDelete: boolean;
  leagueName: string;
  leagueSlug: string;
  lifecycle: string;
  members: LeagueMember[];
}) {
  const [renameState, renameAction, renaming] = useActionState(
    renameLeagueAction,
    initialAppActionState,
  );
  const [archiveState, archiveAction, archiving] = useActionState(
    setLeagueArchivedAction,
    initialAppActionState,
  );
  const [deleteState, deleteAction, deleting] = useActionState(
    deleteLeagueAction,
    initialAppActionState,
  );
  const [removeState, removeAction, removing] = useActionState(
    removeLeagueMemberAction,
    initialAppActionState,
  );
  const [transferState, transferAction, transferring] = useActionState(
    transferLeagueCommissionerAction,
    initialAppActionState,
  );
  const [removeTarget, setRemoveTarget] = useState<LeagueMember | null>(null);
  const [transferTarget, setTransferTarget] = useState<LeagueMember | null>(
    null,
  );
  const confirmationTriggerRef = useRef<HTMLElement | null>(null);
  const regularMembers = members.filter((member) => member.role === "MEMBER");
  const activeRemoveTarget =
    removeTarget &&
    regularMembers.some((member) => member.userId === removeTarget.userId)
      ? removeTarget
      : null;

  return (
    <section className="mt-8" aria-labelledby="league-settings-title">
      <h2 className="text-xl font-bold" id="league-settings-title">
        League settings
      </h2>
      <div className="mt-4 grid gap-5 xl:grid-cols-2">
        <form
          action={renameAction}
          className="border-boundary bg-surface rounded-xl border p-5"
        >
          <input name="leagueSlug" type="hidden" value={leagueSlug} />
          <h3 className="font-bold">League name</h3>
          <p className="text-graphite mt-2 text-sm leading-6">
            Renaming the league does not change its permanent URL.
          </p>
          <Field
            defaultValue={leagueName}
            label="Name"
            id="commissioner-league-name"
            maxLength={80}
            name="name"
            required
          />
          <Button
            className="mt-4 w-full"
            disabled={renaming}
            intent="secondary"
            type="submit"
          >
            {renaming ? "Saving…" : "Save name"}
          </Button>
          <ActionFeedback state={renameState} />
        </form>

        <section className="border-boundary bg-surface rounded-xl border p-5">
          <h3 className="font-bold">League visibility</h3>
          <Alert
            className="mt-3"
            title={
              archived ? `${leagueName} is archived` : "Archive, don’t delete"
            }
            tone={archived ? "warning" : "info"}
          >
            <p>
              {archived
                ? "The league remains readable and its history is preserved. Restore it at any time to return it to every member’s active list. After restoring, you return to Your leagues."
                : `Archiving ${leagueName} moves it out of every member’s active list. It stays readable, preserves its history, and can be restored at any time. After archiving, you return to Your leagues, where Restore remains available under Archived leagues.`}
            </p>
          </Alert>
          <form action={archiveAction} className="mt-4">
            <input name="leagueSlug" type="hidden" value={leagueSlug} />
            <input
              name="archived"
              type="hidden"
              value={archived ? "false" : "true"}
            />
            <Button
              className="w-full"
              disabled={archiving}
              intent="secondary"
              type="submit"
            >
              {archiving
                ? "Updating…"
                : archived
                  ? "Restore league"
                  : "Archive league"}
            </Button>
            <ActionFeedback state={archiveState} />
          </form>
        </section>

        <section className="border-boundary bg-surface rounded-xl border p-5 xl:col-span-2">
          <h3 className="font-bold">Members and commissioner</h3>
          <p className="text-graphite mt-2 text-sm leading-6">
            Transfer commissioner ownership at any time. Members can be removed
            only before roster lock.
          </p>
          {regularMembers.length > 0 ? (
            <div className="divide-boundary mt-4 divide-y border-y">
              {regularMembers.map((member) => (
                <div
                  className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"
                  key={member.userId}
                >
                  <div>
                    <p className="font-semibold">{member.displayName}</p>
                    <p className="text-muted mt-1 text-xs">Member</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {lifecycle === "DRAFT" ? (
                      <Button
                        aria-label={`Remove ${member.displayName}`}
                        disabled={removing}
                        intent="secondary"
                        onClick={(event) => {
                          confirmationTriggerRef.current = event.currentTarget;
                          setRemoveTarget(member);
                        }}
                        type="button"
                      >
                        Remove
                      </Button>
                    ) : null}
                    <Button
                      aria-label={`Make ${member.displayName} commissioner`}
                      disabled={transferring}
                      intent="secondary"
                      onClick={(event) => {
                        confirmationTriggerRef.current = event.currentTarget;
                        setTransferTarget(member);
                      }}
                      type="button"
                    >
                      Make commissioner
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted mt-4 text-sm">
              Invite another member before transferring ownership.
            </p>
          )}
          {removeState.status === "success" ? (
            <ActionFeedback state={removeState} />
          ) : null}
          {transferState.status === "success" ? (
            <ActionFeedback state={transferState} />
          ) : null}
        </section>

        <section className="border-negative/25 bg-negative/10 rounded-xl border p-5 xl:col-span-2">
          <h3 className="text-negative font-bold">Delete empty league</h3>
          {canDelete ? (
            <form action={deleteAction} className="mt-3 max-w-xl">
              <p className="text-graphite text-sm leading-6">
                This permanently deletes the untouched one-member Draft league.
                It cannot be undone. After deletion, you return to Your leagues.
                Type <strong>{leagueName}</strong> to confirm.
              </p>
              <input name="leagueSlug" type="hidden" value={leagueSlug} />
              <Field
                autoComplete="off"
                id="delete-league-confirmation"
                label="League name"
                name="confirmationName"
                required
                tone="destructive"
              />
              <Button
                className="mt-4 w-full"
                disabled={deleting}
                intent="destructive"
                type="submit"
              >
                {deleting ? "Deleting…" : "Delete league permanently"}
              </Button>
              <ActionFeedback state={deleteState} />
            </form>
          ) : (
            <p className="text-graphite mt-2 text-sm leading-6">
              Only an untouched one-member Draft league can be permanently
              deleted. Archive this league to remove it from active lists while
              preserving its setup and competitive history.
            </p>
          )}
        </section>
      </div>
      <ConfirmDialog
        action={removeAction}
        confirmLabel={
          activeRemoveTarget
            ? `Remove ${activeRemoveTarget.displayName}`
            : "Remove member"
        }
        consequence={
          activeRemoveTarget
            ? `${activeRemoveTarget.displayName} will immediately lose access to ${leagueName} and their Draft roster spot will be deleted.`
            : "This member will lose league access and their Draft roster spot."
        }
        description="Check the named member and the exact impact before continuing."
        destination={`You will stay on the Commissioner page. The removed member will lose access on their next request.`}
        errorMessage={
          removeState.status === "error" ? removeState.message : undefined
        }
        hiddenFields={{
          leagueSlug,
          userId: activeRemoveTarget?.userId ?? "",
        }}
        onClose={() => setRemoveTarget(null)}
        open={activeRemoveTarget !== null}
        pending={removing}
        returnFocusRef={confirmationTriggerRef}
        reversibility={`There is no undo button. Before roster lock, ${activeRemoveTarget?.displayName ?? "the member"} can return only with a valid invitation, which consumes an invite use and creates a new Draft entry.`}
        target={
          activeRemoveTarget
            ? `${activeRemoveTarget.displayName} in ${leagueName}`
            : leagueName
        }
        title={
          activeRemoveTarget
            ? `Remove ${activeRemoveTarget.displayName} from ${leagueName}?`
            : "Remove member?"
        }
      />
      <ConfirmDialog
        action={transferAction}
        confirmLabel={
          transferTarget
            ? `Make ${transferTarget.displayName} commissioner`
            : "Transfer commissioner role"
        }
        consequence={
          transferTarget
            ? `${transferTarget.displayName} will gain commissioner controls. You will remain a member of ${leagueName}, but you will immediately lose commissioner controls.`
            : "The selected member will gain commissioner controls and you will lose them."
        }
        description="Commissioner transfer changes who controls the league. Review the named member before continuing."
        destination={`After the transfer, you will go to ${leagueName}’s matchup page as a regular member.`}
        errorMessage={
          transferState.status === "error" ? transferState.message : undefined
        }
        hiddenFields={{
          leagueSlug,
          userId: transferTarget?.userId ?? "",
        }}
        intent="primary"
        onClose={() => setTransferTarget(null)}
        open={transferTarget !== null}
        pending={transferring}
        returnFocusRef={confirmationTriggerRef}
        reversibility={`Only ${transferTarget?.displayName ?? "the new commissioner"} can transfer the commissioner role back to you later.`}
        target={
          transferTarget
            ? `${transferTarget.displayName} in ${leagueName}`
            : leagueName
        }
        title={
          transferTarget
            ? `Make ${transferTarget.displayName} commissioner of ${leagueName}?`
            : "Transfer commissioner role?"
        }
      />
    </section>
  );
}
