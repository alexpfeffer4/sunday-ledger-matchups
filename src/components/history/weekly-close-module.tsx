import Link from "next/link";
import type {
  CorrectionFact,
  PlayoffCutlineFact,
  RecordBridgeFact,
} from "@/domain/history/project-season-memory";
import { scopeLabels } from "@/domain/history/project-season-memory";
import { formatCenticredits } from "@/domain/odds/american";
import { RecordBridge } from "@/components/history/record-bridge";
import { StatusBadge } from "@/components/ui/status-badge";

function score(value: number): string {
  return formatCenticredits(BigInt(value), true);
}

function timeLabel(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function CorrectionDetails({
  correction,
  bridge,
}: {
  correction: CorrectionFact;
  bridge: RecordBridgeFact;
}) {
  const selfIsSideA =
    bridge.matchup.self.entryId === bridge.matchup.sideA.entryId;
  const beforeSelf = selfIsSideA
    ? correction.beforeSideAScoreCenticredits
    : correction.beforeSideBScoreCenticredits;
  const afterSelf = selfIsSideA
    ? correction.afterSideAScoreCenticredits
    : correction.afterSideBScoreCenticredits;
  return (
    <details className="border-corrected/30 bg-corrected/10 rounded-lg border p-4">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">
        Correction · {correction.eventLabel}
      </summary>
      <div className="text-graphite mt-2 space-y-2 text-sm leading-6">
        <p>
          Event result: {correction.beforeEvent} → {correction.afterEvent}. Your
          matchup score:{" "}
          {beforeSelf === null ? "not stored" : score(beforeSelf)} →{" "}
          {score(afterSelf)}.
        </p>
        <p>
          {correction.actorName} recorded this correction on{" "}
          <time dateTime={correction.correctedAt}>
            {timeLabel(correction.correctedAt)} UTC
          </time>
          . Reason: {correction.reason}
        </p>
      </div>
    </details>
  );
}

export function WeeklyCloseModule({
  bridge,
  cutline,
  leagueSlug,
}: {
  bridge: RecordBridgeFact;
  cutline: PlayoffCutlineFact | null;
  leagueSlug: string;
}) {
  const { matchup } = bridge;
  const resultLabel = matchup.corrected
    ? matchup.status === "FINAL"
      ? "Corrected final"
      : "Corrected provisional"
    : matchup.status === "FINAL"
      ? "Matchup final"
      : "Provisional";
  const resultTone = matchup.corrected
    ? "corrected"
    : matchup.status === "FINAL"
      ? "positive"
      : "pending";
  const stateSentence =
    matchup.self.decision === "TIE"
      ? `${matchup.self.name} and ${matchup.opponent.name} finished tied.`
      : matchup.self.decision === "WIN"
        ? `${matchup.self.name} won by ${score(matchup.marginCenticredits)} credits.`
        : `${matchup.opponent.name} won by ${score(matchup.marginCenticredits)} credits.`;

  return (
    <section
      aria-labelledby="weekly-close-heading"
      className="border-boundary bg-subtle rounded-xl border p-5 sm:p-6"
      data-testid="weekly-close-module"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
            Weekly close · {scopeLabels[matchup.scope]}
          </p>
          <h2 className="mt-1 text-xl font-bold" id="weekly-close-heading">
            Week {matchup.nflWeek} result
          </h2>
          <p className="text-graphite mt-2 text-sm leading-6">
            {stateSentence}
          </p>
        </div>
        <StatusBadge tone={resultTone}>{resultLabel}</StatusBadge>
      </div>

      <div
        aria-label={`${matchup.self.name} ${score(matchup.self.scoreCenticredits)} credits, ${matchup.opponent.name} ${score(matchup.opponent.scoreCenticredits)} credits`}
        className="border-boundary bg-surface mt-5 grid gap-3 rounded-xl border p-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center"
      >
        <div>
          <p className="font-bold">{matchup.self.name}</p>
          <p className="mt-1 font-mono text-2xl font-bold">
            {score(matchup.self.scoreCenticredits)}
          </p>
        </div>
        <span aria-hidden="true" className="text-muted hidden sm:block">
          —
        </span>
        <div className="sm:text-right">
          <p className="font-bold">{matchup.opponent.name}</p>
          <p className="mt-1 font-mono text-2xl font-bold">
            {score(matchup.opponent.scoreCenticredits)}
          </p>
        </div>
      </div>

      <p className="text-graphite mt-3 text-xs leading-5">
        {matchup.status === "PROVISIONAL"
          ? bridge.correctionWindowClosesAt
            ? `Correction window closes ${timeLabel(bridge.correctionWindowClosesAt)} UTC.`
            : "This result remains provisional; no correction deadline is stored."
          : bridge.correctionWindowClosesAt
            ? `Correction window closed ${timeLabel(bridge.correctionWindowClosesAt)} UTC.`
            : "This matchup result is final."}
        {matchup.nflWeek === 17 && matchup.scope === "PLAYOFF"
          ? " This receipt does not by itself assert champion or archive finality."
          : ""}
      </p>

      {matchup.corrections.length > 0 ? (
        <div className="mt-4 space-y-3">
          {matchup.corrections.map((correction) => (
            <CorrectionDetails
              bridge={bridge}
              correction={correction}
              key={correction.id}
            />
          ))}
        </div>
      ) : null}

      <div className="mt-6">
        <RecordBridge bridge={bridge} cutline={cutline} />
      </div>

      <nav
        aria-label="Completed result destinations"
        className="border-boundary mt-5 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap sm:gap-5"
      >
        <Link
          className="text-action inline-flex min-h-11 items-center font-semibold hover:underline"
          href={`/l/${leagueSlug}/history#result-${matchup.versionId}`}
        >
          Open final receipt in history
        </Link>
        <Link
          className="text-action inline-flex min-h-11 items-center font-semibold hover:underline"
          href={`/l/${leagueSlug}/rivalry/${matchup.self.entryId}/${matchup.opponent.entryId}`}
        >
          View factual rivalry record
        </Link>
        {bridge.nextOpponent ? (
          <Link
            className="text-action inline-flex min-h-11 items-center font-semibold hover:underline"
            href={`/l/${leagueSlug}/matchup`}
          >
            Week {bridge.nextOpponent.nflWeek}: {bridge.nextOpponent.name}
          </Link>
        ) : (
          <span className="text-muted inline-flex min-h-11 items-center text-sm">
            Next opponent is not published yet.
          </span>
        )}
      </nav>
    </section>
  );
}
