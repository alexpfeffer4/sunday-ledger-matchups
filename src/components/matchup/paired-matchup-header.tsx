import { easternTime } from "@/application/queries/score-freshness";
import type {
  PairedMatchupDto,
  PairedMatchupPhase,
} from "@/application/queries/project-paired-matchup";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCenticredits } from "@/domain/odds/american";

const phaseTones: Record<
  PairedMatchupPhase,
  "corrected" | "live" | "pending" | "positive" | "sealed"
> = {
  PREGAME: "pending",
  LOCKED: "sealed",
  PARTIAL_REVEAL: "pending",
  LIVE: "live",
  DELAYED: "pending",
  PROVISIONAL: "pending",
  FINAL: "sealed",
  CORRECTED: "corrected",
};

function formatScore(value: number | null): string {
  return value === null ? "—" : formatCenticredits(BigInt(value), true);
}

function MemberScore({
  member,
  opponent = false,
  pregame = false,
  completed = false,
  spectator = false,
}: {
  member: PairedMatchupDto["self"];
  opponent?: boolean;
  pregame?: boolean;
  completed?: boolean;
  spectator?: boolean;
}) {
  return (
    <div className={`matchup-member ${opponent ? "text-right" : "text-left"}`}>
      <p
        className={`text-xs font-bold tracking-[0.08em] uppercase ${opponent ? "text-copper" : "text-registry"}`}
      >
        {spectator ? "Member" : opponent ? "Opponent" : "You"}
      </p>
      <h2 className="mt-1 text-lg leading-6 font-bold break-words sm:text-xl">
        {member.displayName}
      </h2>
      <p className="text-muted mt-1 text-xs sm:text-sm">
        {member.record}
        {member.seed
          ? ` · No. ${member.seed} ${member.seedKind === "PLAYOFF" ? "playoff seed" : "in standings"}`
          : ""}
      </p>
      {!pregame ? (
        <p
          aria-label={
            member.scoreCenticredits === null
              ? `${member.displayName} score unavailable`
              : `${member.displayName} score ${formatScore(member.scoreCenticredits)} credits`
          }
          className="mt-4 text-[2.125rem] leading-9 font-bold tracking-[-0.04em] tabular-nums sm:text-[2.5rem] sm:leading-10"
        >
          {formatScore(member.scoreCenticredits)}
        </p>
      ) : null}
      {!pregame ? (
        <div
          role="group"
          aria-label={`${member.displayName} outstanding picks and credits`}
          className="mt-3 text-sm leading-5 break-words tabular-nums"
        >
          {member.outstanding ? (
            <>
              <p>
                <strong>{member.outstanding.picks}</strong>{" "}
                {member.outstanding.picks === 1 ? "pick" : "picks"} outstanding
              </p>
              <p className="text-muted mt-1">
                <strong>
                  {member.outstanding.credits.toLocaleString("en-US")}
                </strong>{" "}
                credits outstanding
              </p>
            </>
          ) : (
            <p className="text-muted">Outstanding totals unavailable</p>
          )}
        </div>
      ) : null}
      {!completed && (!pregame || opponent) && !(spectator && pregame) ? (
        <div
          role="group"
          aria-label={`${member.displayName} card status`}
          className="text-muted mt-2 text-xs font-semibold"
        >
          {pregame ? (
            <StatusBadge
              tone={member.cardStatus === "Sealed" ? "sealed" : "pending"}
            >
              {member.cardStatus}
            </StatusBadge>
          ) : (
            member.cardStatus
          )}
        </div>
      ) : null}
    </div>
  );
}

export function PairedMatchupHeader({
  matchup,
  refreshControl,
  cardProgress,
}: {
  matchup: PairedMatchupDto;
  refreshControl: ReactNode;
  cardProgress?: ReactNode;
}) {
  const completed =
    matchup.resultStatus === "FINAL" || matchup.phase === "FINAL";
  return (
    <section
      aria-labelledby="paired-matchup-heading"
      className="paired-matchup-card border-boundary bg-surface rounded-xl border p-4 shadow-[var(--shadow-card)] sm:p-6"
    >
      <div className="border-boundary flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div>
          <p className="text-muted text-sm font-semibold">
            Week {matchup.week.nflWeek} ·{" "}
            {matchup.week.competition ??
              (matchup.week.scope === "REGULAR"
                ? "Regular season"
                : matchup.week.scope.toLowerCase())}
          </p>
          <h2 className="sr-only" id="paired-matchup-heading">
            {matchup.self.displayName} versus {matchup.opponent.displayName}
          </h2>
        </div>
        <StatusBadge tone={phaseTones[matchup.phase]}>
          {matchup.phase === "CORRECTED" && matchup.resultStatus
            ? completed
              ? "Corrected final"
              : "Corrected provisional"
            : matchup.phaseLabel}
        </StatusBadge>
      </div>

      {matchup.self.decision ? (
        <div className="mt-5">
          <h3
            className={`text-2xl font-bold break-words ${matchup.spectator ? "text-graphite" : matchup.self.decision === "WIN" ? "text-positive" : matchup.self.decision === "LOSS" ? "text-negative" : "text-graphite"}`}
          >
            {matchup.resultStatus === "PROVISIONAL" ? "Provisional: " : ""}
            {matchup.spectator
              ? matchup.self.decision === "TIE"
                ? "Matchup tied"
                : `${matchup.self.decision === "WIN" ? matchup.self.displayName : matchup.opponent.displayName} won`
              : matchup.self.decision === "WIN"
                ? "You won"
                : matchup.self.decision === "LOSS"
                  ? "You lost"
                  : "You tied"}
          </h3>
          <p className="text-graphite mt-2 text-sm break-words">
            {matchup.week.scope === "REGULAR"
              ? matchup.spectator
                ? `${matchup.self.displayName}: ${matchup.self.record}. ${matchup.opponent.displayName}: ${matchup.opponent.record}.`
                : `Season record: ${matchup.self.record}.`
              : "This result does not change the regular-season standings."}
            {matchup.resultStatus === "PROVISIONAL"
              ? " Scores can still change during the correction window."
              : ""}
          </p>
        </div>
      ) : null}

      <div className="paired-scores grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 py-4 sm:gap-8 sm:py-5">
        <MemberScore
          member={matchup.self}
          pregame={matchup.phase === "PREGAME"}
          completed={completed}
          spectator={matchup.spectator}
        />
        <p
          aria-hidden="true"
          className="paired-vs text-muted pt-14 text-xs font-bold tracking-[0.12em] uppercase"
        >
          vs
        </p>
        <MemberScore
          member={matchup.opponent}
          opponent
          pregame={matchup.phase === "PREGAME"}
          completed={completed}
          spectator={matchup.spectator}
        />
      </div>

      {matchup.phase !== "PREGAME" &&
      (matchup.self.outstanding || matchup.opponent.outstanding) ? (
        <p className="text-muted mb-3 text-xs leading-5">
          Outstanding includes live and unstarted picks. Credits are the
          original stakes, not potential returns.
        </p>
      ) : null}

      {matchup.phase === "PREGAME" ? (
        <>
          {cardProgress}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted text-xs">
              Picks reveal after each game’s start is confirmed.
            </p>
            {refreshControl}
          </div>
        </>
      ) : !completed ? (
        <div className="border-boundary flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">
              {matchup.freshness.updatedAt ? (
                <>
                  Scores checked {matchup.freshness.ageLabel}
                  {" · "}
                  <time dateTime={matchup.freshness.updatedAt}>
                    {easternTime(matchup.freshness.updatedAt)}
                  </time>
                </>
              ) : (
                "Scores not checked yet"
              )}
            </p>
            {matchup.freshness.message ? (
              <p className="text-pending mt-1 max-w-3xl text-sm leading-5">
                {matchup.freshness.message}
              </p>
            ) : (
              <p className="text-muted mt-1 text-xs">
                Refresh shows the latest saved result.
              </p>
            )}
          </div>
          <span className="sr-only" role="status" aria-atomic="true">
            {matchup.phaseLabel}.{" "}
            {matchup.spectator ? matchup.self.displayName : "Your"} score{" "}
            {matchup.self.scoreCenticredits === null
              ? "unavailable"
              : formatScore(matchup.self.scoreCenticredits)}
            . {matchup.spectator ? matchup.opponent.displayName : "Opponent"}{" "}
            score{" "}
            {matchup.opponent.scoreCenticredits === null
              ? "unavailable"
              : formatScore(matchup.opponent.scoreCenticredits)}
            .
          </span>
          {refreshControl}
        </div>
      ) : null}
    </section>
  );
}
