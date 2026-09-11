import Link from "next/link";
import type { LivePlayoffState } from "@/application/queries/live-playoff-dtos";
import { easternTime } from "@/application/queries/score-freshness";
import { MatchupStateRefresh } from "@/components/matchup/matchup-state-refresh";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCenticredits } from "@/domain/odds/american";

export function currentPlayoffRound(
  state: LivePlayoffState,
  activeWeek?: number,
) {
  if (activeWeek !== undefined && activeWeek >= 15) {
    const matching = state.rounds.filter((round) => round.week === activeWeek);
    return matching.length === 1 ? matching[0] : null;
  }
  const rounds = state.rounds.toSorted((a, b) => a.week - b.week);
  return (
    rounds.find((round) => round.state !== "FINAL") ?? rounds.at(-1) ?? null
  );
}

export function playoffRoundLabel(
  week: number,
  contest: LivePlayoffState["rounds"][number]["matchups"][number],
) {
  const exhibition =
    contest.role === "EXHIBITION" || contest.scope === "EXHIBITION";
  if (week === 18 && exhibition) return "Week 18 exhibition";
  const label = contest.byeExhibition
    ? "Bye exhibition"
    : exhibition
      ? "Exhibition"
      : contest.role === "PLACEMENT" || contest.scope === "PLACEMENT"
        ? "Placement"
        : contest.role === "THIRD_PLACE"
          ? "Third place"
          : contest.label;
  return `Week ${week} · ${label}`;
}

export function CurrentPlayoffContest({
  state,
  viewerEntryId,
  activeWeek,
}: {
  state: LivePlayoffState;
  viewerEntryId?: string;
  activeWeek?: number;
}) {
  const round = currentPlayoffRound(state, activeWeek);
  const contests =
    round?.matchups.filter((matchup) =>
      [matchup.sideA.entryId, matchup.sideB.entryId].includes(
        viewerEntryId ?? "",
      ),
    ) ?? [];
  const contest = contests.length === 1 ? contests[0] : null;
  const self =
    contest?.sideA.entryId === viewerEntryId ? contest?.sideA : contest?.sideB;
  const opponent =
    contest?.sideA.entryId === viewerEntryId ? contest?.sideB : contest?.sideA;
  const qualifier = state.publication.qualifiers.find(
    (entry) => entry.entryId === viewerEntryId,
  );
  const automatic =
    state.publication.bracket.format === "FOUR_SLOT" ||
    state.publication.bracket.format === "SIX_SLOT"
      ? state.publication.bracket.automaticWeek15Advancements.find(
          (entry) => entry.entry.entryId === viewerEntryId,
        )
      : null;
  // Earlier competitive rounds scheduled only their participants, not every member.
  const legacyAbsence =
    state.publication.legacy &&
    round?.scope === "PLAYOFF" &&
    round.week < 18 &&
    contests.length === 0;
  const expectedMissing =
    (activeWeek !== undefined && activeWeek >= 15 && !round) ||
    (round !== null && !contest && !legacyAbsence);
  const championship = contest?.role === "CHAMPIONSHIP";
  const result = contest?.result;
  const selfA = contest?.sideA.entryId === viewerEntryId;
  const decision = selfA ? result?.sideADecision : result?.sideBDecision;
  const miss =
    (selfA ? result?.sideAParticipation : result?.sideBParticipation) ===
    "EXHIBITION_MISS";
  const isFinal = result?.status === "FINAL";

  return (
    <section
      aria-labelledby="your-playoff-contest"
      className="border-boundary bg-surface mt-6 rounded-xl border p-4 sm:p-6"
    >
      <p className="text-registry text-sm font-semibold">Your current round</p>
      <h2 id="your-playoff-contest" className="mt-2 text-xl font-bold">
        {expectedMissing
          ? "Your playoff matchup is unavailable"
          : round
            ? contest
              ? playoffRoundLabel(round.week, contest)
              : `Week ${round.week} · No assigned matchup`
            : "Week 15 awaits publication"}
      </h2>
      {expectedMissing ? (
        <>
          <p className="text-graphite mt-3 text-sm leading-6">
            We could not load your expected matchup. This does not mean you have
            a bye or are out. Refresh, then ask your commissioner to check the
            published round if it remains unavailable.
          </p>
          <div className="mt-3">
            <MatchupStateRefresh label="Refresh playoffs" />
          </div>
        </>
      ) : legacyAbsence ? (
        <p className="text-graphite mt-3 text-sm leading-6">
          This published round has no matchup assigned to you. Earlier playoff
          formats did not schedule every member each round. Check the published
          bracket below for byes and advancement.
        </p>
      ) : contest && self && opponent ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StatusBadge tone={round?.state === "FINAL" ? "sealed" : "pending"}>
              {round?.state === "OPEN"
                ? "Cards open"
                : round?.state === "PLANNED"
                  ? "Round published"
                  : round?.state === "LOCKED"
                    ? "Cards locked"
                    : round?.state === "PROVISIONAL"
                      ? "Provisional"
                      : "Final"}
            </StatusBadge>
            <span className="text-graphite text-sm">
              {contest.label}
              {contest.byeExhibition ? " · Bye exhibition" : ""}
            </span>
          </div>
          <p className="mt-4 text-lg font-bold break-words">
            {self.qualificationSeed ? `No. ${self.qualificationSeed} · ` : ""}
            {self.displayName}{" "}
            <span className="text-muted font-normal">vs.</span>{" "}
            {opponent.qualificationSeed
              ? `No. ${opponent.qualificationSeed} · `
              : ""}
            {opponent.displayName}
          </p>
          {result ? (
            <p
              className={`mt-3 text-lg font-semibold tabular-nums ${decision === "WIN" ? "text-positive" : decision === "LOSS" ? "text-negative" : "text-graphite"}`}
            >
              {!isFinal ? "Provisional: " : ""}
              {miss
                ? "Exhibition miss"
                : decision === "WIN"
                  ? "You won"
                  : decision === "LOSS"
                    ? "You lost"
                    : decision === "TIE"
                      ? "You tied"
                      : "Exhibition result"}{" "}
              ·{" "}
              {formatCenticredits(
                BigInt(
                  selfA
                    ? result.sideAScoreCenticredits
                    : result.sideBScoreCenticredits,
                ),
                true,
              )}{" "}
              –{" "}
              {formatCenticredits(
                BigInt(
                  selfA
                    ? result.sideBScoreCenticredits
                    : result.sideAScoreCenticredits,
                ),
                true,
              )}
            </p>
          ) : round ? (
            <p className="text-graphite mt-3 text-sm">
              Cards {round.state === "LOCKED" ? "locked" : "lock"}{" "}
              <time dateTime={round.commonLockAt}>
                {easternTime(round.commonLockAt)}
              </time>
              .
            </p>
          ) : null}
          <p className="text-graphite mt-3 text-sm leading-6">
            {round?.week === 18
              ? "This exhibition cannot change the champion, standings, or playoff eligibility. The season archive completes after Week 18 is final."
              : state.publication.championFinality
                ? "The champion is confirmed. Week 18 exhibitions cannot change this championship result; the complete archive follows after Week 18 is final."
                : !contest.role && contest.scope === "PLAYOFF"
                  ? "See the published bracket below for this contest's effect on championship advancement."
                  : championship
                    ? result?.advancingEntryId
                      ? `${result.advancingEntryId === viewerEntryId ? "You" : opponent.displayName} ${isFinal ? "advance" + (result.advancingEntryId === viewerEntryId ? "" : "s") : "would advance"}${round?.week === 17 ? " to champion confirmation" : " to the next championship round"}.${decision === "TIE" ? " The higher qualification seed advances an exact tie." : ""}`
                      : round?.week === 17
                        ? "The championship becomes official after the Week 17 correction window and champion confirmation."
                        : "Win to reach the next championship round. An exact tie advances the higher qualification seed."
                    : contest.byeExhibition && automatic
                      ? "Your championship bye advances you to Week 16. This separate exhibition cannot change that advancement."
                      : contest.role === "THIRD_PLACE"
                        ? "Play for third place. This result does not advance the championship bracket."
                        : "This matchup does not advance the championship bracket or change regular-season standings."}
          </p>
          <Link
            className="bg-registry text-canvas mt-4 inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold"
            href={`/l/${state.league.slug}/matchup`}
          >
            Open your matchup
          </Link>
        </>
      ) : (
        <p className="text-graphite mt-3 text-sm leading-6">
          The playoff field is published. Your commissioner can publish the
          first round; your matchup will appear here.
        </p>
      )}
      {!state.publication.championFinality &&
      qualifier &&
      !expectedMissing &&
      !legacyAbsence ? (
        <p className="text-muted border-boundary mt-4 border-t pt-3 text-sm leading-6">
          Championship path · No. {qualifier.qualificationSeed} qualification
          seed.{" "}
          {state.publication.bracket.format === "FOUR_SLOT" ||
          state.publication.bracket.format === "SMALL_FOUR"
            ? "Week 16 semifinals → Week 17 championship."
            : "Week 15 opening round → Week 16 semifinals → Week 17 championship."}{" "}
          Surviving teams are reseeded for the semifinals.
        </p>
      ) : null}
    </section>
  );
}
