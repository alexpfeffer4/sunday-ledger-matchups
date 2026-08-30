import Link from "next/link";
import type { SeasonMemoryProjection } from "@/domain/history/project-season-memory";
import { matchupScopeLabel } from "@/domain/history/project-season-memory";
import { formatCenticredits } from "@/domain/odds/american";
import { PageFrame } from "@/components/league/page-frame";
import { StatusBadge } from "@/components/ui/status-badge";

function score(value: number): string {
  return formatCenticredits(BigInt(value), true);
}

function resultLabel(decision: "WIN" | "LOSS" | "TIE"): string {
  return { WIN: "Win", LOSS: "Loss", TIE: "Tie" }[decision];
}

export function HistoryLedger({
  memory,
  leagueSlug,
}: {
  memory: SeasonMemoryProjection;
  leagueSlug: string;
}) {
  return (
    <PageFrame
      description="Every row is the latest finalized official matchup version. Corrections preserve their prior version and explanation."
      eyebrow={`${memory.league.nflYear} active season · private league record`}
      title="History ledger"
    >
      {memory.activeHistory.length === 0 ? (
        <section className="border-boundary bg-surface mt-7 rounded-xl border p-6">
          <h2 className="text-lg font-bold">No finalized matchups yet</h2>
          <p className="text-graphite mt-2 text-sm leading-6">
            Provisional scores stay on the matchup page. This ledger begins when
            the first official matchup version is final.
          </p>
          <Link
            className="text-action mt-4 inline-flex min-h-11 items-center font-semibold hover:underline"
            href={`/l/${leagueSlug}/matchup`}
          >
            Return to current matchup
          </Link>
        </section>
      ) : (
        <ol className="mt-7 space-y-4">
          {memory.activeHistory.map((matchup) => (
            <li
              className="border-boundary bg-surface rounded-xl border p-5 sm:p-6"
              id={`result-${matchup.versionId}`}
              key={matchup.id}
            >
              <article aria-labelledby={`history-${matchup.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-muted text-xs font-bold tracking-[0.08em] uppercase">
                      {matchup.nflYear} · Week {matchup.nflWeek} ·{" "}
                      {matchupScopeLabel(matchup)}
                    </p>
                    <h2
                      className="mt-1 text-lg font-bold"
                      id={`history-${matchup.id}`}
                    >
                      {matchup.self.name} vs. {matchup.opponent.name}
                    </h2>
                  </div>
                  <StatusBadge
                    tone={
                      matchup.corrected
                        ? "corrected"
                        : matchup.self.decision === "WIN"
                          ? "positive"
                          : matchup.self.decision === "LOSS"
                            ? "negative"
                            : "void"
                    }
                  >
                    {matchup.self.participation === "EXHIBITION_MISS"
                      ? "Exhibition miss"
                      : matchup.corrected
                        ? `Corrected ${resultLabel(matchup.self.decision)}`
                        : resultLabel(matchup.self.decision)}
                  </StatusBadge>
                </div>
                {matchup.self.participation === "EXHIBITION_MISS" ? (
                  <p className="text-copper mt-3 text-sm font-semibold">
                    Exhibition miss · zero for this exhibition only. Official
                    record, Points For, all-play, eligibility, seed, and bracket
                    are unchanged.
                  </p>
                ) : null}
                <p
                  aria-label={`${matchup.self.name} ${score(matchup.self.scoreCenticredits)} credits, ${matchup.opponent.name} ${score(matchup.opponent.scoreCenticredits)} credits`}
                  className="mt-4 font-mono text-xl font-bold"
                >
                  {score(matchup.self.scoreCenticredits)}–
                  {score(matchup.opponent.scoreCenticredits)}
                </p>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
                  <Link
                    className="text-action inline-flex min-h-11 items-center font-semibold hover:underline"
                    href={`/l/${leagueSlug}/rivalry/${matchup.self.entryId}/${matchup.opponent.entryId}`}
                  >
                    View rivalry with {matchup.opponent.name}
                  </Link>
                </div>
                <details className="border-boundary mt-3 rounded-lg border px-4 py-2">
                  <summary className="min-h-11 cursor-pointer py-2 font-semibold">
                    Official result receipt
                  </summary>
                  <dl className="text-graphite grid gap-3 pb-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted">Final version</dt>
                      <dd className="mt-1 font-mono text-xs break-all">
                        {matchup.versionId}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Superseded version</dt>
                      <dd className="mt-1 font-mono text-xs break-all">
                        {matchup.supersedesVersionId ?? "None"}
                      </dd>
                    </div>
                  </dl>
                  {matchup.corrections.map((correction) => (
                    <p
                      className="border-corrected/30 text-graphite border-t py-3 text-sm leading-6"
                      key={correction.id}
                    >
                      {correction.eventLabel}: {correction.beforeEvent} →{" "}
                      {correction.afterEvent}. {correction.actorName}:{" "}
                      {correction.reason}
                    </p>
                  ))}
                </details>
              </article>
            </li>
          ))}
        </ol>
      )}
    </PageFrame>
  );
}
