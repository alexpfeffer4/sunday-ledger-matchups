"use client";

import { useActionState } from "react";
import {
  deleteLeagueAction,
  removeLeagueMemberAction,
  renameLeagueAction,
  setLeagueArchivedAction,
  transferLeagueCommissionerAction,
} from "@/app/leagues/actions";
import { initialAppActionState } from "@/application/actions/action-state";
import { ActionFeedback } from "@/components/forms/action-feedback";

type LeagueMember = {
  displayName: string;
  role: "MEMBER" | "COMMISSIONER";
  userId: string;
};

const secondaryButton =
  "border-control hover:border-registry hover:text-registry min-h-10 rounded-lg border px-3 text-sm font-semibold disabled:opacity-50";

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
  const regularMembers = members.filter((member) => member.role === "MEMBER");

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
          <label
            className="mt-4 block text-sm font-semibold"
            htmlFor="commissioner-league-name"
          >
            Name
          </label>
          <input
            className="border-control focus:border-registry mt-2 min-h-11 w-full rounded-lg border px-3 outline-none"
            defaultValue={leagueName}
            id="commissioner-league-name"
            maxLength={80}
            name="name"
            required
          />
          <button
            className={`${secondaryButton} mt-4 w-full`}
            disabled={renaming}
            type="submit"
          >
            {renaming ? "Saving…" : "Save name"}
          </button>
          <ActionFeedback state={renameState} />
        </form>

        <section className="border-boundary bg-surface rounded-xl border p-5">
          <h3 className="font-bold">League visibility</h3>
          <p className="text-graphite mt-2 text-sm leading-6">
            {archived
              ? "Restore this league to everyone’s active league list."
              : "Archive this league to move it out of everyone’s active league list without deleting its history."}
          </p>
          <form action={archiveAction} className="mt-4">
            <input name="leagueSlug" type="hidden" value={leagueSlug} />
            <input
              name="archived"
              type="hidden"
              value={archived ? "false" : "true"}
            />
            <button
              className={`${secondaryButton} w-full`}
              disabled={archiving}
              type="submit"
            >
              {archiving
                ? "Updating…"
                : archived
                  ? "Restore league"
                  : "Archive league"}
            </button>
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
                      <form action={removeAction}>
                        <input
                          name="leagueSlug"
                          type="hidden"
                          value={leagueSlug}
                        />
                        <input
                          name="userId"
                          type="hidden"
                          value={member.userId}
                        />
                        <button
                          className={secondaryButton}
                          disabled={removing}
                          type="submit"
                        >
                          Remove
                        </button>
                      </form>
                    ) : null}
                    <form action={transferAction}>
                      <input
                        name="leagueSlug"
                        type="hidden"
                        value={leagueSlug}
                      />
                      <input
                        name="userId"
                        type="hidden"
                        value={member.userId}
                      />
                      <button
                        className={secondaryButton}
                        disabled={transferring}
                        type="submit"
                      >
                        Make commissioner
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted mt-4 text-sm">
              Invite another member before transferring ownership.
            </p>
          )}
          <ActionFeedback state={removeState} />
          <ActionFeedback state={transferState} />
        </section>

        <section className="border-negative/25 bg-negative/10 rounded-xl border p-5 xl:col-span-2">
          <h3 className="text-negative font-bold">Delete empty league</h3>
          {canDelete ? (
            <form action={deleteAction} className="mt-3 max-w-xl">
              <p className="text-graphite text-sm leading-6">
                This permanently deletes the untouched one-member Draft league.
                Type <strong>{leagueName}</strong> to confirm.
              </p>
              <label
                className="mt-4 block text-sm font-semibold"
                htmlFor="delete-league-confirmation"
              >
                League name
              </label>
              <input name="leagueSlug" type="hidden" value={leagueSlug} />
              <input
                autoComplete="off"
                className="border-negative/40 bg-surface focus:border-negative mt-2 min-h-11 w-full rounded-lg border px-3 outline-none"
                id="delete-league-confirmation"
                name="confirmationName"
                required
              />
              <button
                className="bg-negative mt-4 min-h-11 w-full rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-50"
                disabled={deleting}
                type="submit"
              >
                {deleting ? "Deleting…" : "Delete league permanently"}
              </button>
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
    </section>
  );
}
