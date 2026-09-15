"use client";

import { useActionState } from "react";
import {
  initialAppActionState,
  type AppActionState,
} from "@/application/actions/action-state";
import { ActionFeedback } from "@/components/forms/action-feedback";
import type { Stage1StateDto } from "@/application/queries/stage1-dtos";
import { easternTime } from "@/application/queries/score-freshness";
import type { RestoredCardDraft } from "./card-draft-storage";
import { marketOptionCopy } from "./market-option-copy";
import { OutcomeSelector } from "./outcome-selector";
import { sameSelection, marketLabel } from "./selection-identity";

type SlateEvent = Stage1StateDto["slate"][number];
type Market = SlateEvent["markets"][number];

/** Published slots stay visible when quotes are missing. Never invent an offer. */
export function PlayerPropsGame({
  event,
  drafts,
  acceptedPositions,
  bettingOpen,
  onSelect,
  leagueId,
  leagueSlug,
  refreshAction,
}: {
  leagueId?: string;
  leagueSlug?: string;
  refreshAction?: (
    previous: AppActionState,
    form: FormData,
  ) => Promise<AppActionState>;
  event: SlateEvent;
  drafts: RestoredCardDraft[];
  acceptedPositions: NonNullable<Stage1StateDto["ownerCard"]>["positions"];
  bettingOpen: boolean;
  onSelect: (
    event: SlateEvent,
    market: Market,
    draft: RestoredCardDraft | undefined,
  ) => void;
}) {
  const [refreshState, refresh, refreshing] = useActionState(
    refreshAction ?? (async () => initialAppActionState),
    initialAppActionState,
  );
  const slots = event.playerProps ?? [];
  const available = slots.filter(
    (slot) =>
      slot.subjectId &&
      event.markets.some(
        (market) =>
          market.subjectId === slot.subjectId &&
          market.statistic === slot.statistic &&
          market.qualityStatus === "HEALTHY",
      ),
  ).length;
  return (
    <details className="group border-boundary bg-surface rounded-lg border p-4">
      <summary className="min-h-11 cursor-pointer list-none marker:hidden">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-lg font-bold break-words">
              {event.awayTeam} at {event.homeTeam}
            </span>
            <span className="text-muted mt-1 block text-xs">
              {easternTime(event.scheduledStartAt)}
            </span>
          </span>
          <span aria-hidden="true" className="text-muted py-1 text-xl">
            <span className="group-open:hidden">+</span>
            <span className="hidden group-open:inline">−</span>
          </span>
        </span>
        <span className="text-graphite mt-3 block text-sm font-semibold">
          {bettingOpen
            ? `${available} of 6 props available · View players`
            : "Betting closed · View players"}
        </span>
      </summary>
      {refreshAction && leagueId && leagueSlug && bettingOpen ? (
        <form action={refresh} className="mt-3">
          <input type="hidden" name="leagueId" value={leagueId} />
          <input type="hidden" name="leagueSlug" value={leagueSlug} />
          <input type="hidden" name="eventId" value={event.id} />
          <button
            type="submit"
            disabled={refreshing}
            className="text-action min-h-11 text-sm font-semibold disabled:opacity-50"
          >
            {refreshing ? "Checking player lines…" : "Refresh player lines"}
          </button>
          <ActionFeedback state={refreshState} />
        </form>
      ) : null}
      <div className="border-boundary divide-boundary mt-4 divide-y border-t">
        {slots.length === 0 ? (
          <p className="text-muted py-4 text-sm">
            The player menu is not available for this game. Game lines remain
            available.
          </p>
        ) : (
          slots.map((slot) => {
            const outcomes = event.markets.filter(
              (market) =>
                slot.subjectId &&
                market.subjectId === slot.subjectId &&
                market.statistic === slot.statistic &&
                market.period === "FULL_GAME",
            );
            const representative = outcomes[0];
            const identity = {
              eventId: event.id,
              marketType: `PLAYER_${slot.statistic}`,
              subjectId: slot.subjectId,
              statistic: slot.statistic,
              period: "FULL_GAME",
            };
            const selectedDraft = drafts.find((draft) =>
              sameSelection(draft, identity),
            );
            const accepted = acceptedPositions.some((position) =>
              sameSelection(position, identity),
            );
            const unavailable = !slot.subjectId
              ? !bettingOpen
                ? "Unavailable for this game."
                : slot.lateFillEligible
                  ? "Unavailable now · Check back before kickoff."
                  : "Player unavailable for this week"
              : outcomes.length === 0
                ? "Awaiting line"
                : outcomes.every((market) => market.qualityStatus !== "HEALTHY")
                  ? "Temporarily unavailable"
                  : null;
            return (
              <article
                key={`${slot.team}:${slot.slot}`}
                className="grid min-w-0 gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(220px,1.15fr)] sm:items-center"
              >
                <div className="min-w-0">
                  <h3 className="text-sm leading-5 font-semibold break-words">
                    {slot.subjectLabel ??
                      `${slot.team} ${slot.slot === "QB_PASS" ? "quarterback" : slot.slot === "RB_RUSH" ? "running back" : "receiver"}`}
                  </h3>
                  <p className="text-muted mt-1 text-xs">
                    {slot.team} ·{" "}
                    {slot.position ??
                      (slot.slot === "QB_PASS"
                        ? "QB"
                        : slot.slot === "RB_RUSH"
                          ? "RB"
                          : "WR/TE")}{" "}
                    ·{" "}
                    {marketLabel(
                      representative?.marketType ?? `PLAYER_${slot.statistic}`,
                    )}
                  </p>
                  {accepted || selectedDraft ? (
                    <p className="text-positive mt-1 text-xs font-semibold">
                      {accepted ? "Submitted" : "In your drafts"}
                    </p>
                  ) : null}
                  {slot.subjectId && slot.publicationMode === "AUTOMATIC" ? (
                    <p className="text-muted mt-1 text-xs">
                      Added automatically before kickoff.
                    </p>
                  ) : null}
                </div>
                {unavailable ? (
                  <p className="bg-subtle text-muted rounded-md px-3 py-4 text-sm">
                    {unavailable}
                  </p>
                ) : (
                  <OutcomeSelector
                    label={`${slot.subjectLabel} ${marketLabel(identity.marketType)} outcomes`}
                    selectedId={selectedDraft?.marketSnapshotId ?? null}
                    onSelect={(id) => {
                      const market = outcomes.find((item) => item.id === id);
                      if (market) onSelect(event, market, selectedDraft);
                    }}
                    options={outcomes.map((market) => ({
                      id: market.id,
                      ...marketOptionCopy({
                        ...market,
                        awayTeam: event.awayTeam,
                        homeTeam: event.homeTeam,
                        fallbackLabel: market.proposition,
                      }),
                      unavailableReason: !bettingOpen
                        ? "Betting closed"
                        : accepted
                          ? "Bet already submitted for this player and statistic"
                          : market.qualityStatus !== "HEALTHY"
                            ? "Current quote is unavailable"
                            : undefined,
                    }))}
                  />
                )}
              </article>
            );
          })
        )}
      </div>
      <p className="text-muted mt-2 text-xs leading-5">
        Full game, including overtime. Game lines and player props share your
        weekly credits.
      </p>
    </details>
  );
}
