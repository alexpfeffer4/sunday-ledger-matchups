"use client";

import { useState } from "react";
import type { Stage1StateDto } from "@/application/queries/stage1-dtos";
import type { RestoredCardDraft } from "./card-draft-storage";
import { PlayerPropsGame } from "./player-props-game";
import { PositionEditorSheet } from "./position-editor-sheet";
import { CardTray } from "./card-tray";
import { PickReturn } from "./pick-return";
import { marketOptionCopy } from "./market-option-copy";
import { selectionKey, sameSelection, marketLabel } from "./selection-identity";

type Event = Stage1StateDto["slate"][number];
type Market = Event["markets"][number];
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const pairs = [
  ["Harbor", "Lake"],
  ["River", "Mountain"],
  ["Cedar", "Valley"],
  ["Coast", "Prairie"],
  ["Capital", "Summit"],
  ["Forest", "Bay"],
  ["Ridge", "Park"],
  ["Brook", "Grove"],
  ["North", "South"],
  ["East", "West"],
  ["Oak", "Elm"],
  ["Pine", "Maple"],
  ["Desert", "Mesa"],
  ["Hill", "Plain"],
  ["Peak", "Port"],
  ["Canyon", "Stone"],
];
const previewEvents: Event[] = pairs.map(([awayTeam, homeTeam], eventIndex) => {
  const eventId = id(eventIndex + 1);
  const slots: NonNullable<Event["playerProps"]> = [
    awayTeam!,
    homeTeam!,
  ].flatMap((team, teamIndex) =>
    (["QB_PASS", "RB_RUSH", "RECEIVER"] as const).map((slot, slotIndex) => {
      const unavailable =
        eventIndex === 0 && teamIndex === 1 && slotIndex === 2;
      return {
        eventId,
        team,
        slot,
        subjectId: unavailable
          ? null
          : id(100 + eventIndex * 6 + teamIndex * 3 + slotIndex),
        subjectLabel: unavailable
          ? null
          : slotIndex === 0
            ? `${team} · Jordan Montgomery-Wellington`
            : `${team} · ${slotIndex === 1 ? "Cameron Rivers" : "Taylor Bennett"}`,
        position:
          slotIndex === 0
            ? ("QB" as const)
            : slotIndex === 1
              ? ("RB" as const)
              : ("WR" as const),
        statistic:
          slotIndex === 0
            ? ("PASSING_YARDS" as const)
            : slotIndex === 1
              ? ("RUSHING_YARDS" as const)
              : ("RECEIVING_YARDS" as const),
        period: "FULL_GAME" as const,
        confirmed: true,
        frozen: false,
        unavailableReason: unavailable ? "Identity unresolved" : null,
      };
    }),
  );
  const markets: Market[] = slots.flatMap((slot, index) =>
    !slot.subjectId || (eventIndex === 0 && index === 4)
      ? []
      : (["OVER", "UNDER"] as const).map((side, sideIndex) => {
          const line =
            slot.statistic === "PASSING_YARDS"
              ? 245_500
              : slot.statistic === "RUSHING_YARDS"
                ? 65_500
                : 75_500;
          return {
            id: id(1000 + eventIndex * 12 + index * 2 + sideIndex),
            marketType: `PLAYER_${slot.statistic}` as Market["marketType"],
            subjectId: slot.subjectId,
            subjectLabel: slot.subjectLabel,
            subjectTeam: slot.team,
            subjectPosition: slot.position,
            statistic: slot.statistic,
            period: "FULL_GAME" as const,
            outcomeKey: side,
            proposition: `${slot.subjectLabel} ${side === "OVER" ? "over" : "under"} ${line / 1000} ${marketLabel(`PLAYER_${slot.statistic}`).toLowerCase()}`,
            lineMilli: line,
            americanOdds: sideIndex ? -105 : -115,
            qualityStatus: "HEALTHY" as const,
            maximumStakeCredits: 1000,
            observedAt: "2026-09-20T15:00:00Z",
            payloadHash: "a".repeat(64),
          };
        }),
  );
  return {
    id: eventId,
    key: `preview-${eventIndex}`,
    awayTeam: `${awayTeam} Club`,
    homeTeam: `${homeTeam} Club`,
    scheduledStartAt:
      eventIndex < 8
        ? "2026-09-20T17:00:00Z"
        : eventIndex < 15
          ? "2026-09-20T20:25:00Z"
          : "2026-09-22T00:15:00Z",
    actualStartedAt: null,
    state: "SCHEDULED",
    providerHealth: "HEALTHY",
    entryOpen: true,
    markets,
    playerProps: slots,
  };
});

/** Isolated visual sample: imports no backend, account, or submission action. */
export function PlayerPropsPreview() {
  const [size, setSize] = useState<14 | 16>(16);
  const [drafts, setDrafts] = useState<RestoredCardDraft[]>([]);
  const [editor, setEditor] = useState<{ event: Event; market: Market } | null>(
    null,
  );
  const [stake, setStake] = useState("100");
  const [review, setReview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const spent = drafts.reduce((sum, draft) => sum + draft.stakeCredits, 0);
  const openEditor = (
    event: Event,
    market: Market,
    draft: RestoredCardDraft | undefined,
  ) => {
    setEditor({ event, market });
    setStake(String(draft?.stakeCredits ?? 100));
    setError(null);
  };
  const save = () => {
    if (!editor) return;
    const identity = { ...editor.market, eventId: editor.event.id };
    const others = drafts.filter((draft) => !sameSelection(draft, identity));
    const value = Number(stake);
    if (
      !Number.isSafeInteger(value) ||
      value < 50 ||
      value + others.reduce((sum, draft) => sum + draft.stakeCredits, 0) >
        1000 ||
      others.length >= 20
    ) {
      setError(
        "Use at least 50 whole credits within the 1,000-credit weekly allocation and 20-bet limit.",
      );
      return;
    }
    setDrafts([
      ...others,
      {
        ...identity,
        marketSnapshotId: editor.market.id,
        stakeCredits: value,
        quoteReviewRequired: false,
        reviewedAmericanOdds: editor.market.americanOdds,
        reviewedProposition: editor.market.proposition,
        reviewedPayloadHash: editor.market.payloadHash,
      },
    ]);
    setEditor(null);
  };
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div
        role="status"
        className="border-pending/40 bg-pending/10 rounded-lg border p-4 text-sm leading-6"
      >
        <strong>Disabled Preview · Fictional examples</strong>
        <p>
          Explore the player menu and draft tray. Submission is disabled. No
          real accounts, quotes or results are connected.
        </p>
      </div>
      <p className="text-registry mt-7 text-xs font-bold tracking-widest uppercase">
        Sunday Ledger
      </p>
      <h1 className="mt-2 text-3xl font-bold">Make picks · Player props</h1>
      <p className="text-graphite mt-3 text-sm">
        One weekly allocation. Six player markets per game. Bets and drafts stay
        on one card.
      </p>
      <div aria-label="Example slate size" className="my-5 flex gap-2">
        {([14, 16] as const).map((count) => (
          <button
            key={count}
            type="button"
            aria-pressed={size === count}
            className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${size === count ? "bg-registry text-white" : "border-control bg-surface"}`}
            onClick={() => setSize(count)}
          >
            {count} games
          </button>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          {review ? (
            <section className="border-boundary bg-surface rounded-lg border p-5">
              <h2 className="text-xl font-bold">Review example bets</h2>
              <div className="divide-boundary mt-4 divide-y">
                {drafts.map((draft) => (
                  <article key={selectionKey(draft)} className="py-4">
                    <p className="text-sm font-semibold break-words">
                      {draft.proposition}
                    </p>
                    <PickReturn
                      stakeCredits={draft.stakeCredits}
                      americanOdds={draft.americanOdds}
                    />
                  </article>
                ))}
              </div>
              <button
                className="text-action min-h-11 text-sm font-semibold"
                type="button"
                onClick={() => setReview(false)}
              >
                Back to edit
              </button>
            </section>
          ) : (
            previewEvents
              .slice(0, size)
              .map((event) => (
                <PlayerPropsGame
                  key={event.id}
                  event={event}
                  acceptedPositions={[]}
                  drafts={drafts}
                  bettingOpen
                  onSelect={openEditor}
                />
              ))
          )}
        </div>
        <aside className="border-boundary bg-surface h-fit rounded-lg border p-5 lg:sticky lg:top-6">
          <h2 className="font-semibold">Your example drafts</h2>
          <p className="mt-3 font-mono text-2xl font-bold">
            {1000 - spent} credits left
          </p>
          <p className="text-muted mt-1 text-sm">
            {drafts.length} bets · {spent} drafted
          </p>
          <div className="divide-boundary mt-4 divide-y">
            {drafts.map((draft) => (
              <article className="py-3" key={selectionKey(draft)}>
                <p className="text-sm leading-5 font-semibold break-words">
                  {draft.proposition}
                </p>
                <p className="text-muted mt-1 text-xs">
                  {draft.stakeCredits} credits
                </p>
                <button
                  type="button"
                  className="text-action min-h-11 text-xs font-semibold"
                  onClick={() =>
                    setDrafts((current) =>
                      current.filter(
                        (item) => selectionKey(item) !== selectionKey(draft),
                      ),
                    )
                  }
                >
                  Remove
                </button>
              </article>
            ))}
          </div>
          <button
            type="button"
            disabled={!drafts.length || review}
            onClick={() => setReview(true)}
            className="bg-registry mt-4 min-h-12 w-full rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {review ? "Submission disabled in Preview" : "Review example bets"}
          </button>
        </aside>
      </div>
      <CardTray
        allocatedCredits={spent}
        remainingCredits={1000 - spent}
        pickCount={drafts.length}
        onReview={() => setReview(true)}
        reviewLabel="Review examples"
      />
      <PositionEditorSheet
        open={Boolean(editor)}
        title={editor?.market.subjectLabel ?? "Player prop"}
        context={
          editor
            ? `${editor.event.awayTeam} at ${editor.event.homeTeam} · ${marketLabel(editor.market.marketType)}`
            : ""
        }
        helper="Fictional example · no bet will be submitted"
        confirmLabel="Save example draft"
        error={error}
        maximumStakeCredits={1000}
        minimumStakeCredits={50}
        remainingCredits={1000 - spent}
        stakeCredits={stake}
        americanOdds={editor?.market.americanOdds}
        selectedOutcomeId={editor?.market.id ?? null}
        onStakeChange={setStake}
        onSubmit={save}
        onClose={() => setEditor(null)}
        onSelectOutcome={(id) => {
          if (!editor) return;
          const market = editor.event.markets.find(
            (market) => market.id === id,
          );
          if (market) setEditor({ ...editor, market });
        }}
        outcomes={
          editor
            ? editor.event.markets
                .filter((market) =>
                  sameSelection(
                    { ...market, eventId: editor.event.id },
                    { ...editor.market, eventId: editor.event.id },
                  ),
                )
                .map((market) => ({
                  id: market.id,
                  ...marketOptionCopy({
                    ...market,
                    awayTeam: editor.event.awayTeam,
                    homeTeam: editor.event.homeTeam,
                    fallbackLabel: market.proposition,
                  }),
                }))
            : []
        }
      />
    </main>
  );
}
