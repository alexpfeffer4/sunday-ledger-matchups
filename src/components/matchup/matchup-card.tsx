import type { MatchupHomeDto } from "@/application/queries/league-dtos";
import { AllocationMeter } from "@/components/matchup/allocation-meter";
import { StatusBadge } from "@/components/ui/status-badge";

function MemberField({
  member,
  side,
  detail,
}: {
  member: MatchupHomeDto["self"];
  side: "self" | "opponent";
  detail: string;
}) {
  const role =
    side === "self"
      ? "border-registry text-registry"
      : "border-copper text-copper";
  return (
    <div className="min-w-0 text-center">
      <div
        className={`bg-subtle mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 text-lg font-bold ${role}`}
      >
        {member.initials}
      </div>
      <p className="mt-3 truncate text-lg font-bold">{member.displayName}</p>
      <p className="text-graphite mt-0.5 text-sm">
        {member.record} · No. {member.seed} seed
      </p>
      <p className="text-graphite mt-3 text-sm font-semibold">{detail}</p>
    </div>
  );
}

export function MatchupCard({ matchup }: { matchup: MatchupHomeDto }) {
  return (
    <section
      aria-labelledby="matchup-card-title"
      className="border-boundary bg-surface rounded-xl border p-5 shadow-[var(--shadow-card)] sm:p-7"
    >
      <div className="border-boundary flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <p
            id="matchup-card-title"
            className="text-registry text-xs font-bold tracking-[0.09em] uppercase"
          >
            Week {matchup.league.week} matchup
          </p>
          <p className="text-graphite mt-1 text-sm">{matchup.rivalryLabel}</p>
        </div>
        <StatusBadge tone="sealed" icon={<span aria-hidden="true">●</span>}>
          Cards open
        </StatusBadge>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 py-7 sm:gap-8">
        <MemberField
          member={matchup.self}
          side="self"
          detail={`${matchup.allocation.allocatedCredits} used · ${matchup.allocation.remainingCredits} left`}
        />
        <div className="pt-7 text-center">
          <p className="text-muted text-xs font-bold tracking-[0.1em] uppercase">
            vs
          </p>
          <p className="text-graphite mt-2 font-mono text-xs font-semibold sm:text-sm">
            1,000 each
          </p>
        </div>
        <MemberField
          member={matchup.opponent}
          side="opponent"
          detail="Sealed until cards lock"
        />
      </div>

      <AllocationMeter
        {...matchup.allocation}
        commonLockLabel={matchup.league.commonLockLabel}
      />
    </section>
  );
}
