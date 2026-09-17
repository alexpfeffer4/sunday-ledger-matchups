"use client";

import Link from "next/link";
import { PageFrame } from "./page-frame";
import { ScheduleNavigator } from "./schedule-navigator";
import { useBrowsingChoices } from "./use-browsing-choices";
import { PickFilters } from "@/components/card/pick-filters";
import { OwnerCardProgress } from "@/components/card/owner-card-progress";
import type { OwnerCardContext } from "@/components/card/owner-card-context";
import { previewEvents } from "@/components/card/player-props-preview";
import { PlayerPropsGame } from "@/components/card/player-props-game";
import { useCardDraft } from "@/components/card/use-card-draft";
import { simulationSeason14Ruleset } from "@/rulesets/simulation-season-1-4";

const events = previewEvents.slice(0, 2).map((event, index) => ({
  ...event,
  scheduledStartAt: index ? "2026-09-22T00:15:00Z" : "2026-09-18T00:15:00Z",
}));
const market = events[1]!.markets[0]!;
const accepted = events[0]!.markets[0]!;
const context: OwnerCardContext = {
  leagueId: "ui2-presentation-only",
  leagueSlug: "ui2-presentation-only",
  mode: "SIMULATION",
  simulatedNow: "2026-09-16T12:00:00Z",
  rules: simulationSeason14Ruleset,
  slate: events,
  week: {
    id: "ui2-week-2",
    nflWeek: 2,
    scope: "REGULAR",
    state: "OPEN",
    opensAt: "2026-09-16T12:00:00Z",
    commonLockAt: "2026-09-18T00:15:00Z",
    lockedAt: null,
    correctionWindowClosesAt: null,
    entryClosesAt: "2026-09-22T00:15:00Z",
    entryClosed: false,
    rollingSubmissionsEnabled: true,
    propsEnabled: true,
  },
  ownerCard: {
    id: "ui2-fixture-card",
    entryId: "ui2-fixture-owner",
    grantedCredits: 1000,
    grantedAt: "2026-09-16T12:00:00Z",
    compliance: "COMPLIANT",
    lockedAt: null,
    allocatedCredits: 300,
    remainingCredits: 700,
    canSubmit: false,
    positions: [
      {
        ...accepted,
        id: "ui2-accepted",
        eventId: events[0]!.id,
        eventLabel: "Harbor Club at Lake Club",
        eventKey: events[0]!.key,
        scheduledStartAt: events[0]!.scheduledStartAt,
        stakeCredits: 300,
        quoteObservedAt: accepted.observedAt,
        acceptedAt: "2026-09-16T12:00:00Z",
        receiptHash: "f".repeat(64),
      },
    ],
  },
};

/** Shared member UI with fictional state. No submit, provider, or Auth action. */
export function Ui2Preview({
  screen,
}: {
  screen: "slate" | "card" | "schedule";
}) {
  const browsing = useBrowsingChoices(
    screen === "slate" ? "ui2-fixture:picks" : null,
    screen === "slate"
      ? {
          day: { options: ["ALL", "THU", "MON"], fallback: "ALL" },
          type: { options: ["GAME", "PLAYER"], fallback: "GAME" },
        }
      : {},
  );
  const { drafts, setDrafts, clearDrafts } = useCardDraft(context);
  return (
    <PageFrame
      eyebrow="UI-2 · Fictional presentation fixture"
      title={
        screen === "slate"
          ? "Make picks"
          : screen === "card"
            ? "My Card"
            : "Schedule"
      }
      description="Test the browsing and credit summaries with synthetic data. No bets can be submitted and no account, provider or league is connected."
    >
      <nav
        aria-label="Preview destinations"
        className="mb-5 flex flex-wrap gap-4 text-sm font-semibold"
      >
        <Link
          className="text-action inline-flex min-h-11 items-center"
          href="/preview/member/slate"
        >
          Make picks
        </Link>
        <Link
          className="text-action inline-flex min-h-11 items-center"
          href="/preview/member/card"
        >
          My Card
        </Link>
        <Link
          className="text-action inline-flex min-h-11 items-center"
          href="/preview/member/schedule"
        >
          Schedule
        </Link>
      </nav>
      {screen === "schedule" ? (
        <ScheduleNavigator
          initialWeek={2}
          browsingScope="ui2-fixture:season:current2"
          weeks={[1, 2, 3].map((week) => ({
            week,
            label: `Week ${week}`,
            status: week === 1 ? "Final" : week === 2 ? "Open" : "Published",
            matchups: [
              {
                id: `game-${week}`,
                sideAName: "Harbor Club — A deliberately long member name",
                sideBName: "River Club",
                sideAScoreCenticredits: week === 1 ? 120000 : null,
                sideBScoreCenticredits: week === 1 ? 105000 : null,
                status: week === 1 ? "Final" : "Scheduled",
                competition: "Regular season",
                currentMember: true,
              },
            ],
          }))}
        />
      ) : (
        <>
          <OwnerCardProgress
            context={context}
            onSlatePage={screen === "slate"}
            onCardPage={screen === "card"}
          />
          <div className="my-4 flex flex-wrap gap-3">
            <button
              type="button"
              className="border-control min-h-11 rounded-lg border px-4 text-sm font-semibold"
              onClick={() =>
                setDrafts([
                  {
                    eventId: events[1]!.id,
                    marketSnapshotId: market.id,
                    americanOdds: market.americanOdds,
                    payloadHash: market.payloadHash,
                    proposition: market.proposition,
                    marketType: market.marketType,
                    outcomeKey: market.outcomeKey,
                    subjectId: market.subjectId,
                    subjectLabel: market.subjectLabel,
                    statistic: market.statistic,
                    period: market.period,
                    stakeCredits: 200,
                    reviewedAmericanOdds: market.americanOdds,
                    reviewedLineMilli: market.lineMilli,
                    reviewedProposition: market.proposition,
                    reviewedPayloadHash: market.payloadHash,
                    quoteReviewRequired: false,
                  },
                ])
              }
            >
              Load 200-credit sample draft
            </button>
            <button
              type="button"
              className="text-action min-h-11 px-3 text-sm font-semibold"
              onClick={clearDrafts}
            >
              Clear sample draft
            </button>
          </div>
          {screen === "slate" ? (
            <div className="space-y-3">
              <PickFilters
                availableFilters={["ALL", "THU", "MON"]}
                activeKickoffFilter={browsing.values.day!}
                marketView={browsing.values.type!}
                propsEnabled
                invalid={browsing.invalid}
                select={browsing.select}
              />
              {events
                .filter(
                  (_, index) =>
                    browsing.values.day === "ALL" ||
                    (index ? "MON" : "THU") === browsing.values.day,
                )
                .map((event) =>
                  browsing.values.type === "PLAYER" ? (
                    <PlayerPropsGame
                      key={event.id}
                      event={event}
                      drafts={drafts}
                      acceptedPositions={context.ownerCard!.positions}
                      bettingOpen={false}
                      onSelect={() => {}}
                    />
                  ) : (
                    <section
                      className="border-boundary rounded-lg border p-4"
                      key={event.id}
                    >
                      <h2 className="font-bold">
                        {event.awayTeam} at {event.homeTeam}
                      </h2>
                      <p className="text-muted mt-2 text-sm">
                        Game lines · Presentation only
                      </p>
                    </section>
                  ),
                )}
            </div>
          ) : (
            <p className="text-muted mt-4 text-sm">
              The sample accepted bet is fixed at 300 credits. The draft is kept
              separately on this device.
            </p>
          )}
        </>
      )}
    </PageFrame>
  );
}
