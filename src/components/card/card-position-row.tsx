import Link from "next/link";
import type { CardPositionDto } from "@/application/queries/league-dtos";
import { StatusBadge } from "@/components/ui/status-badge";

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `−${Math.abs(odds)}`;
}

export function CardPositionRow({
  leagueSlug,
  position,
}: {
  leagueSlug: string;
  position: CardPositionDto;
}) {
  return (
    <article className="border-boundary bg-surface rounded-xl border p-4 shadow-[var(--shadow-card)] sm:p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <p className="text-muted text-xs font-bold tracking-[0.08em] uppercase">
            {position.marketLabel} · {position.eventLabel}
          </p>
          <h2 className="mt-2 text-lg font-bold">{position.displayLine}</h2>
          <p className="text-graphite mt-1 text-sm">{position.proposition}</p>
        </div>
        <StatusBadge tone="sealed">Sealed</StatusBadge>
      </div>
      <dl className="border-boundary mt-5 grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-4">
        <div>
          <dt className="text-muted text-xs">Stake</dt>
          <dd className="mt-1 font-mono text-sm font-semibold">
            {position.stakeCredits} credits
          </dd>
        </div>
        <div>
          <dt className="text-muted text-xs">Accepted odds</dt>
          <dd className="mt-1 font-mono text-sm font-semibold">
            {formatOdds(position.americanOdds)}
          </dd>
        </div>
        <div>
          <dt className="text-muted text-xs">Maximum return</dt>
          <dd className="mt-1 font-mono text-sm font-semibold">
            {position.maximumReturnLabel}
          </dd>
        </div>
        <div>
          <dt className="text-muted text-xs">Kickoff</dt>
          <dd className="mt-1 text-sm font-semibold">
            {position.kickoffLabel}
          </dd>
        </div>
      </dl>
      <Link
        href={`/l/${leagueSlug}/receipt/${position.id}`}
        className="text-action mt-4 inline-flex min-h-11 items-center text-sm font-semibold hover:underline"
      >
        View immutable receipt
      </Link>
    </article>
  );
}
