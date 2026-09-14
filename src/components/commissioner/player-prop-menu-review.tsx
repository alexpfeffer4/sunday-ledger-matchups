"use client";

import { useActionState, useState } from "react";
import type { AppActionState } from "@/application/actions/action-state";
import { initialAppActionState } from "@/application/actions/action-state";
import { ActionFeedback } from "@/components/forms/action-feedback";
import { marketLabel } from "@/components/card/selection-identity";

export type PlayerPropMenuSlot = {
  eventId: string;
  eventLabel?: string;
  team: string;
  slot: "QB_PASS" | "RB_RUSH" | "RECEIVER";
  statistic: "PASSING_YARDS" | "RUSHING_YARDS" | "RECEIVING_YARDS";
  subjectId: string | null;
  subjectLabel: string | null;
  position?: string | null;
  confirmed?: boolean;
  frozen?: boolean;
  unavailableReason?: string | null;
  candidates: Array<{
    subjectId: string;
    subjectLabel: string;
    position: string;
    roleEvidence?: string | null;
    roleRank?: number | null;
  }>;
};

type FormAction = (
  previous: AppActionState,
  form: FormData,
) => Promise<AppActionState>;

export function PlayerPropMenuReview({
  leagueSlug,
  leagueId,
  refreshAction,
  slots,
  frozen,
  prepareAction,
  confirmAction,
  canOpen = false,
  openAction,
}: {
  leagueSlug: string;
  leagueId: string;
  refreshAction: FormAction;
  slots: PlayerPropMenuSlot[];
  frozen: boolean;
  prepareAction: FormAction;
  confirmAction: FormAction;
  canOpen?: boolean;
  openAction?: FormAction;
}) {
  const [opened, openWeek, opening] = useActionState(
    openAction ?? (async () => initialAppActionState),
    initialAppActionState,
  );
  const [prepared, prepare, preparing] = useActionState(
    prepareAction,
    initialAppActionState,
  );
  const [confirmed, confirm, confirming] = useActionState(
    confirmAction,
    initialAppActionState,
  );
  const [refreshed, refresh, refreshing] = useActionState(
    refreshAction,
    initialAppActionState,
  );
  const [selections, setSelections] = useState<Record<string, string>>({});
  const keyOf = (slot: PlayerPropMenuSlot) =>
    `${slot.eventId}:${slot.team}:${slot.slot}`;
  const chosen = (slot: PlayerPropMenuSlot) =>
    selections[keyOf(slot)] ?? slot.subjectId ?? "";
  const unresolved = slots.filter((slot) => !chosen(slot)).length;
  const groups = new Map<string, PlayerPropMenuSlot[]>();
  for (const slot of slots)
    groups.set(slot.eventId, [...(groups.get(slot.eventId) ?? []), slot]);
  const pending = preparing || confirming || refreshing || opening;
  const changedChoices = slots.some(
    (slot) => chosen(slot) !== (slot.subjectId ?? ""),
  );
  return (
    <section
      aria-labelledby="player-menu-heading"
      className="border-boundary bg-surface rounded-xl border p-5"
    >
      <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
        Player props · Full slate
      </p>
      <h2 id="player-menu-heading" className="mt-2 text-xl font-bold">
        {frozen ? "This week’s player menu" : "Review the proposed player menu"}
      </h2>
      <p className="text-graphite mt-2 text-sm leading-6">
        {frozen
          ? "The first accepted bet fixed the players for this week. Lines may appear later for these players; unavailable player slots cannot be replaced."
          : "Check the proposed quarterback, running back and receiver for each team. Resolve flagged choices, then confirm the whole slate once. The first accepted bet fixes these players for everyone."}
      </p>
      {slots.length ? (
        <p className="mt-3 text-sm font-semibold">
          {groups.size} games · {slots.length - unresolved} of {groups.size * 6}{" "}
          player slots selected{unresolved ? ` · ${unresolved} unresolved` : ""}
        </p>
      ) : (
        <p className="text-muted mt-3 text-sm">
          Prepare the automatic proposal for the published games.
        </p>
      )}
      {!frozen ? (
        <form action={prepare} className="mt-3">
          <input type="hidden" name="leagueSlug" value={leagueSlug} />
          <button
            type="submit"
            disabled={pending}
            className="text-action min-h-11 text-sm font-semibold disabled:opacity-50"
          >
            {preparing
              ? "Preparing player menu…"
              : slots.length
                ? "Update proposed choices"
                : "Prepare player menu"}
          </button>
          <ActionFeedback state={prepared} />
        </form>
      ) : null}
      {slots.length ? (
        <form action={refresh} className="mt-3">
          <input type="hidden" name="leagueSlug" value={leagueSlug} />
          <input type="hidden" name="leagueId" value={leagueId} />
          <button
            type="submit"
            disabled={pending}
            className="text-action min-h-11 text-sm font-semibold disabled:opacity-50"
          >
            {refreshing
              ? "Checking full-slate player lines…"
              : "Refresh full-slate player lines"}
          </button>
          <ActionFeedback state={refreshed} />
        </form>
      ) : null}
      {slots.length ? (
        <form action={confirm} className="mt-4">
          <input type="hidden" name="leagueSlug" value={leagueSlug} />
          <input
            type="hidden"
            name="choices"
            value={JSON.stringify(
              slots.map((slot) => ({
                eventId: slot.eventId,
                team: slot.team,
                slot: slot.slot,
                subjectId: chosen(slot) || null,
              })),
            )}
          />
          <div className="space-y-3">
            {[...groups].map(([eventId, gameSlots]) => (
              <details
                key={eventId}
                className="border-boundary rounded-lg border px-4 py-2"
                open={gameSlots.some(
                  (slot) => !slot.subjectId || Boolean(slot.unavailableReason),
                )}
              >
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">
                  {gameSlots[0]?.eventLabel ??
                    [...new Set(gameSlots.map((slot) => slot.team))].join(
                      " vs. ",
                    )}{" "}
                  · {gameSlots.filter((slot) => chosen(slot)).length}/6 players
                </summary>
                <div className="divide-boundary divide-y">
                  {gameSlots.map((slot) => {
                    const key = keyOf(slot);
                    const selected = slot.candidates.find(
                      (candidate) => candidate.subjectId === chosen(slot),
                    );
                    return (
                      <div key={key} className="py-3">
                        <label
                          htmlFor={`player-menu-${key}`}
                          className="block text-sm font-semibold"
                        >
                          {slot.team} ·{" "}
                          {marketLabel(`PLAYER_${slot.statistic}`)}
                        </label>
                        {frozen ? (
                          <p className="mt-2 text-sm">
                            {slot.subjectLabel ?? "Unavailable this week"}
                            {slot.position ? ` · ${slot.position}` : ""}
                          </p>
                        ) : (
                          <select
                            id={`player-menu-${key}`}
                            value={chosen(slot)}
                            disabled={pending}
                            className="border-control bg-surface mt-2 min-h-11 w-full min-w-0 rounded-lg border px-3 text-sm"
                            onChange={(event) =>
                              setSelections((current) => ({
                                ...current,
                                [key]: event.target.value,
                              }))
                            }
                          >
                            <option value="">
                              Leave unavailable this week
                            </option>
                            {slot.subjectId &&
                            !slot.candidates.some(
                              (candidate) =>
                                candidate.subjectId === slot.subjectId,
                            ) ? (
                              <option value={slot.subjectId}>
                                {slot.subjectLabel} · {slot.position}
                              </option>
                            ) : null}
                            {slot.candidates.map((candidate) => (
                              <option
                                key={candidate.subjectId}
                                value={candidate.subjectId}
                              >
                                {candidate.subjectLabel} · {candidate.position}
                              </option>
                            ))}
                          </select>
                        )}
                        {selected?.roleEvidence ? (
                          <p className="text-muted mt-2 text-xs leading-5">
                            {selected.roleEvidence}
                          </p>
                        ) : null}
                        {slot.unavailableReason ? (
                          <p className="text-pending mt-2 text-xs leading-5">
                            {slot.unavailableReason}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </details>
            ))}
          </div>
          {!frozen ? (
            <>
              <p className="text-graphite mt-4 text-sm leading-6">
                {unresolved
                  ? `${unresolved} unresolved slots will remain unavailable once the first bet is accepted. `
                  : ""}
                A missing line for a verified player can appear later. No player
                is replaced after the menu freezes.
              </p>
              <label className="mt-3 flex min-h-11 items-start gap-3 text-sm leading-6">
                <input
                  required
                  name="confirmed"
                  value="true"
                  type="checkbox"
                  className="mt-1.5"
                />
                I reviewed the full slate and any unavailable slots.
              </label>
              <button
                type="submit"
                disabled={pending}
                className="bg-registry mt-3 min-h-12 rounded-lg px-5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {confirming
                  ? "Confirming player menu…"
                  : "Confirm full-slate player menu"}
              </button>
              <ActionFeedback state={confirmed} />
            </>
          ) : null}
        </form>
      ) : null}
      {canOpen && openAction ? (
        <form action={openWeek} className="border-boundary mt-5 border-t pt-5">
          <input type="hidden" name="leagueSlug" value={leagueSlug} />
          <p className="text-graphite text-sm leading-6">
            The player menu is reviewed. Open the week to make game lines and
            available player props ready for bets. Confirmed unresolved slots
            remain unavailable; known players can receive lines later.
          </p>
          {changedChoices ? (
            <p className="text-pending mt-2 text-sm">
              Confirm your changed player choices before opening the week.
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending || changedChoices}
            className="bg-registry mt-3 min-h-12 rounded-lg px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {opening ? "Opening week…" : "Open week for bets"}
          </button>
          <ActionFeedback state={opened} />
        </form>
      ) : null}
    </section>
  );
}
