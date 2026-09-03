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
  FINAL: "positive",
  CORRECTED: "corrected",
};

function formatScore(value: number): string {
  return formatCenticredits(BigInt(value), true);
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(new Date(value));
}

function MemberScore({
  member,
  opponent = false,
}: {
  member: PairedMatchupDto["self"];
  opponent?: boolean;
}) {
  return (
    <div className={opponent ? "text-right" : "text-left"}>
      <p
        className={`text-xs font-bold tracking-[0.08em] uppercase ${opponent ? "text-copper" : "text-registry"}`}
      >
        {opponent ? "Opponent" : "You"}
      </p>
      <h2 className="mt-1 text-lg leading-6 font-bold break-words sm:text-xl">
        {member.displayName}
      </h2>
      <p className="text-muted mt-1 text-xs sm:text-sm">
        {member.record}
        {member.seed
          ? ` · No. ${member.seed} ${member.seedKind === "PLAYOFF" ? "playoff seed" : "seed"}`
          : ""}
      </p>
      <p
        aria-label={`${member.displayName} score ${formatScore(member.scoreCenticredits)} credits`}
        className="mt-4 text-[2.125rem] leading-9 font-bold tracking-[-0.04em] tabular-nums sm:text-[2.5rem] sm:leading-10"
      >
        {formatScore(member.scoreCenticredits)}
      </p>
      <p className="text-muted mt-2 text-xs font-semibold">
        {member.decision ? `${member.decision} · ` : ""}
        {member.cardStatus}
      </p>
    </div>
  );
}

export function PairedMatchupHeader({
  matchup,
  refreshControl,
}: {
  matchup: PairedMatchupDto;
  refreshControl: ReactNode;
}) {
  return (
    <section
      aria-labelledby="paired-matchup-heading"
      className="border-boundary bg-surface rounded-xl border p-4 shadow-[var(--shadow-card)] sm:p-6"
    >
      <div className="border-boundary flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <p className="text-muted text-xs font-bold tracking-[0.08em] uppercase">
            Week {matchup.week.nflWeek} · {matchup.week.scope.toLowerCase()}
          </p>
          <h2 className="sr-only" id="paired-matchup-heading">
            {matchup.self.displayName} versus {matchup.opponent.displayName}
          </h2>
        </div>
        <StatusBadge tone={phaseTones[matchup.phase]}>
          {matchup.phaseLabel}
        </StatusBadge>
      </div>

      <div
        aria-atomic="true"
        aria-live="polite"
        className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 py-5 sm:gap-8 sm:py-7"
      >
        <MemberScore member={matchup.self} />
        <p
          aria-hidden="true"
          className="text-muted pt-14 text-xs font-bold tracking-[0.12em] uppercase"
        >
          vs
        </p>
        <MemberScore member={matchup.opponent} opponent />
      </div>

      <div className="border-boundary flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">
            Updated{" "}
            <time dateTime={matchup.freshness.updatedAt}>
              {formatUpdatedAt(matchup.freshness.updatedAt)}
            </time>
          </p>
          {matchup.freshness.message ? (
            <p
              className="text-pending mt-1 max-w-3xl text-sm leading-5"
              role="status"
            >
              {matchup.freshness.message}
            </p>
          ) : (
            <p className="text-muted mt-1 text-xs">
              Refresh checks official stored state; it does not start a provider
              import.
            </p>
          )}
        </div>
        {refreshControl}
      </div>
    </section>
  );
}
