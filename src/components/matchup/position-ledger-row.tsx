import type { PositionLedgerItem } from "@/application/queries/project-paired-matchup";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCenticredits, formatCredits } from "@/domain/odds/american";

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `−${Math.abs(odds)}`;
}

function formatEventTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(new Date(value));
}

function rowState(row: PositionLedgerItem): {
  label: string;
  tone: "corrected" | "live" | "negative" | "positive" | "sealed" | "void";
} {
  if (row.corrected) return { label: "Corrected", tone: "corrected" };
  if (row.outcome === "WIN") return { label: "Won", tone: "positive" };
  if (row.outcome === "LOSS") return { label: "Lost", tone: "negative" };
  if (row.outcome === "PUSH") return { label: "Push", tone: "void" };
  if (row.outcome === "VOID") return { label: "Void", tone: "void" };
  if (row.section === "IN_PROGRESS")
    return { label: "In progress", tone: "live" };
  return { label: "Remaining", tone: "sealed" };
}

export function PositionLedgerRow({ row }: { row: PositionLedgerItem }) {
  const status = rowState(row);
  const returnLabel =
    row.returnedCenticredits === null
      ? "Pending"
      : formatCenticredits(BigInt(row.returnedCenticredits), true);

  return (
    <li
      aria-label={`${row.memberName}, ${row.eventLabel}, ${row.proposition}, ${formatOdds(row.americanOdds)}, ${formatCredits(row.stakeCredits)} credits staked, ${status.label}, ${returnLabel} credits returned`}
      className={`bg-surface rounded-lg border p-4 ${row.side === "SELF" ? "border-boundary border-l-registry border-l-4" : "border-boundary border-l-copper border-l-4"}`}
      data-position-id={row.id}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={`text-xs font-bold tracking-[0.07em] uppercase ${row.side === "SELF" ? "text-registry" : "text-copper"}`}
          >
            {row.side === "SELF" ? "You" : row.memberName}
          </p>
          <p className="mt-1 text-sm font-semibold break-words">
            {row.eventLabel}
          </p>
          <p className="text-muted mt-1 text-xs">
            {formatEventTime(row.scheduledStartAt)} ·{" "}
            {row.marketType.toLowerCase()}
          </p>
        </div>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-end">
        <div className="min-w-0">
          <p className="text-muted text-xs">Accepted pick</p>
          <p className="mt-1 font-semibold break-words">{row.proposition}</p>
        </div>
        <div className="text-right">
          <p className="text-muted text-xs">Odds</p>
          <p className="mt-1 font-mono font-semibold">
            {formatOdds(row.americanOdds)}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-muted text-xs">Stake</p>
          <p className="mt-1 font-mono font-semibold">
            {formatCredits(row.stakeCredits)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-muted text-xs">Returned</p>
          <p className="mt-1 font-mono font-semibold">{returnLabel}</p>
        </div>
      </div>
    </li>
  );
}
