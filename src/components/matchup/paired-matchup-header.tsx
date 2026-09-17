import { easternTime } from "@/application/queries/score-freshness";
import type {
  PairedMatchupDto,
  PairedMatchupPhase,
} from "@/application/queries/project-paired-matchup";
import type { CSSProperties, ReactNode } from "react";
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

function scoreStyle(value: number | null): CSSProperties {
  return {
    "--score-length": Math.max(formatScore(value).length, 4),
  } as CSSProperties;
}

export function CompactMatchupScore({
  matchup,
}: {
  matchup: PairedMatchupDto;
}) {
  return (
    <div className="matchup-compact-card">
      {[matchup.self, matchup.opponent].map((member, index) => (
        <div className="matchup-compact-member" key={index}>
          <p className="matchup-compact-name">{member.displayName}</p>
          {matchup.phase !== "PREGAME" ? (
            <p
              className="matchup-compact-score"
              style={scoreStyle(member.scoreCenticredits)}
            >
              {formatScore(member.scoreCenticredits)}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function MemberScore({
  member,
  opponent = false,
  pregame = false,
  completed = false,
  final = false,
  spectator = false,
  rolling = false,
  entryClosed = false,
}: {
  member: PairedMatchupDto["self"];
  opponent?: boolean;
  pregame?: boolean;
  completed?: boolean;
  final?: boolean;
  spectator?: boolean;
  rolling?: boolean;
  entryClosed?: boolean;
}) {
  return (
    <div
      className={`matchup-member text-left ${opponent ? "matchup-opponent" : "matchup-self"}`}
    >
      <p
        className={`text-xs font-bold tracking-[0.08em] uppercase ${opponent ? "text-copper" : "text-registry"}`}
      >
        {spectator ? "Member" : opponent ? "Opponent" : "You"}
      </p>
      <h2 className="mt-1 text-lg leading-6 font-bold break-words sm:text-xl">
        {member.displayName}
      </h2>
      <p className="matchup-secondary text-muted mt-1 text-xs sm:text-sm">
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
          style={scoreStyle(member.scoreCenticredits)}
          className="matchup-score mt-4 text-[2.125rem] leading-9 font-bold tracking-[-0.04em] tabular-nums sm:text-[2.5rem] sm:leading-10"
        >
          {formatScore(member.scoreCenticredits)}
        </p>
      ) : null}
      {(!pregame || (rolling && member.outstanding !== null)) &&
      !(
        final &&
        member.outstanding?.picks === 0 &&
        member.outstanding.credits === 0
      ) ? (
        <div
          role="group"
          aria-label={`${member.displayName} outstanding picks and credits`}
          className="matchup-secondary mt-3 text-sm leading-5 break-words tabular-nums"
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
      {rolling &&
      !opponent &&
      !spectator &&
      member.availableCredits !== null &&
      member.availableCredits !== undefined ? (
        <p
          className="matchup-secondary text-muted mt-2 text-sm leading-5 tabular-nums"
          aria-label={`${member.displayName} unused credits`}
        >
          {entryClosed ? (
            <>
              <strong>
                {(member.expiredCredits ?? 0).toLocaleString("en-US")}
              </strong>{" "}
              credits expired
            </>
          ) : (
            <>
              <strong>{member.availableCredits.toLocaleString("en-US")}</strong>{" "}
              credits available to bet
            </>
          )}
        </p>
      ) : null}
      {!completed &&
      (rolling || ((!pregame || opponent) && !(spectator && pregame))) ? (
        <div
          role="group"
          aria-label={`${member.displayName} card status`}
          className="matchup-secondary text-muted mt-2 text-xs font-semibold"
        >
          {pregame ? (
            <StatusBadge
              tone={
                ["Sealed", "Submitted"].includes(member.cardStatus)
                  ? "sealed"
                  : "pending"
              }
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
      <h2 className="sr-only" id="paired-matchup-heading">
        {matchup.self.displayName} versus {matchup.opponent.displayName}
      </h2>
      <div className="matchup-secondary border-boundary flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div>
          <p className="text-muted text-sm font-semibold">
            Weekly score · Week {matchup.week.nflWeek} ·{" "}
            {matchup.week.competition ??
              (matchup.week.scope === "REGULAR"
                ? "Regular season"
                : matchup.week.scope.toLowerCase())}
          </p>
        </div>
        <StatusBadge tone={phaseTones[matchup.phase]}>
          {matchup.phase === "CORRECTED" && matchup.resultStatus
            ? completed
              ? "Corrected final"
              : "Corrected · picks settled"
            : matchup.phaseLabel}
        </StatusBadge>
      </div>

      {matchup.self.decision ? (
        <div className="matchup-secondary mt-5">
          <h3
            className={`text-2xl font-bold break-words ${matchup.spectator ? "text-graphite" : matchup.self.decision === "WIN" ? "text-positive" : matchup.self.decision === "LOSS" ? "text-negative" : "text-graphite"}`}
          >
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
            {matchup.self.scoreCenticredits !== null &&
            matchup.opponent.scoreCenticredits !== null
              ? `Margin: ${formatScore(Math.abs(matchup.self.scoreCenticredits - matchup.opponent.scoreCenticredits))} credits. `
              : ""}
            {matchup.week.scope === "REGULAR"
              ? matchup.spectator
                ? `${matchup.self.displayName}: ${matchup.self.record}. ${matchup.opponent.displayName}: ${matchup.opponent.record}.`
                : `Season record: ${matchup.self.record}.`
              : "This result does not change the regular-season standings."}
            {matchup.resultStatus === "PROVISIONAL"
              ? " Both cards are settled. The week becomes final when all its games finish and picks settle."
              : ""}
          </p>
        </div>
      ) : null}

      <div className="paired-scores grid grid-cols-2 items-start py-4 sm:py-5">
        <MemberScore
          member={matchup.self}
          pregame={matchup.phase === "PREGAME"}
          completed={completed || matchup.resultStatus !== null}
          final={completed}
          spectator={matchup.spectator}
          rolling={matchup.week.rollingSubmissionsEnabled}
          entryClosed={matchup.week.entryClosed}
        />
        <MemberScore
          member={matchup.opponent}
          opponent
          pregame={matchup.phase === "PREGAME"}
          completed={completed || matchup.resultStatus !== null}
          final={completed}
          spectator={matchup.spectator}
          rolling={matchup.week.rollingSubmissionsEnabled}
          entryClosed={matchup.week.entryClosed}
        />
      </div>

      <details className="matchup-secondary border-boundary border-t text-xs leading-5">
        <summary className="text-action min-h-11 cursor-pointer py-3 font-semibold">
          How scoring works
        </summary>
        <p className="text-muted pb-3">
          Weekly score is the confirmed credit return from settled bets,
          including returned stakes. Outstanding includes live and unstarted
          picks. Credits outstanding are their original stakes, not potential
          returns. Available credits are unused credits you can still bet. This
          week’s rules determine incomplete-card results.
        </p>
      </details>

      {matchup.phase === "PREGAME" ? (
        <>
          <div className="matchup-secondary">{cardProgress}</div>
          <div className="matchup-secondary mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted text-xs">
              Picks reveal after each game’s start is confirmed.
            </p>
            {refreshControl}
          </div>
        </>
      ) : !completed ? (
        <div className="matchup-secondary border-boundary flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div>
            <p className="text-muted text-xs">
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
            {matchup.freshness.delayed &&
            matchup.freshness.message &&
            !matchup.resultStatus ? (
              <p className="text-pending mt-1 max-w-3xl text-sm leading-5">
                {matchup.freshness.message}
              </p>
            ) : null}
          </div>

          {refreshControl}
        </div>
      ) : null}
      {matchup.phase !== "PREGAME" && !completed ? (
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
      ) : null}
    </section>
  );
}
