import type { SeasonRulesetSnapshotDto } from "@/application/queries/season-ruleset-dtos";
import type { PersistedSeasonRuleset, SeasonRuleset } from "@/rulesets/schema";

export type RulesetPresentation = {
  context: "SEASON" | "EXAMPLE";
  rulesetId: string;
  rulesetVersion: string;
  productBibleId: string;
  productBibleVersion: string;
  mode: "LIVE" | "SIMULATION";
  canonicalJson: PersistedSeasonRuleset;
  sha256Hash: string;
  publishedAt: string | null;
  frozenAt: string | null;
};

const tiebreakLabels: Record<
  SeasonRuleset["standings"]["tiebreakOrder"][number],
  string
> = {
  MATCHUP_WIN_PERCENTAGE: "Matchup win percentage",
  POINTS_FOR: "Points For",
  ALL_PLAY_PERCENTAGE: "All-play percentage",
  BALANCED_HEAD_TO_HEAD: "Balanced head-to-head mini-table, when applicable",
  FEWER_ATTENDANCE_MISSES: "Fewer attendance misses",
  HIGHEST_SINGLE_WEEK_SCORE: "Highest official single-week score",
  STORED_DETERMINISTIC_RANDOM: "Stored deterministic random tiebreak value",
};

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(new Date(value));
}

export function seasonRulesetPresentation(
  snapshot: SeasonRulesetSnapshotDto,
): RulesetPresentation {
  return { ...snapshot, context: "SEASON" };
}

export function exampleRulesetPresentation(
  ruleset: SeasonRuleset,
  sha256Hash: string,
): RulesetPresentation {
  return {
    context: "EXAMPLE",
    rulesetId: ruleset.id,
    rulesetVersion: ruleset.version,
    productBibleId: ruleset.productBibleId,
    productBibleVersion: ruleset.productBibleVersion,
    mode: ruleset.mode,
    canonicalJson: ruleset,
    sha256Hash,
    publishedAt: null,
    frozenAt: null,
  };
}

export function rulesetTiebreakLabels(
  ruleset: PersistedSeasonRuleset,
): string[] {
  if (!ruleset.standings) return [];
  return ruleset.standings.tiebreakOrder.map((key) => tiebreakLabels[key]);
}

export function RulesetAuditDetails({
  presentation,
}: {
  presentation: RulesetPresentation;
}) {
  const snapshotState =
    presentation.context === "EXAMPLE"
      ? "Illustrative only · not a season snapshot"
      : presentation.frozenAt
        ? `Frozen ${formatTimestamp(presentation.frozenAt)}`
        : "Published · freezes at roster lock";

  return (
    <details className="border-boundary border-y py-4">
      <summary className="cursor-pointer font-bold">Audit details</summary>
      <dl className="mt-4 space-y-4 text-sm">
        <div>
          <dt className="text-muted">Ruleset</dt>
          <dd className="mt-1 font-semibold break-words">
            {presentation.rulesetId} · v{presentation.rulesetVersion}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Mode</dt>
          <dd className="mt-1 font-semibold">
            {presentation.mode === "LIVE" ? "Live" : "Simulation"}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Snapshot</dt>
          <dd className="mt-1 font-semibold">{snapshotState}</dd>
        </div>
        <div>
          <dt className="text-muted">Product baseline</dt>
          <dd className="mt-1 font-semibold break-words">
            {presentation.productBibleId} · v{presentation.productBibleVersion}
          </dd>
        </div>
        <div>
          <dt className="text-muted">SHA-256</dt>
          <dd className="mt-1 font-mono text-xs leading-5 break-all">
            {presentation.sha256Hash}
          </dd>
        </div>
      </dl>
    </details>
  );
}

export function StandingsRulesetSummary({
  presentation,
}: {
  presentation: RulesetPresentation;
}) {
  const labels = rulesetTiebreakLabels(presentation.canonicalJson);

  return (
    <section className="border-boundary mt-6 border-t pt-5">
      <h2 className="font-bold">How ties are ordered</h2>
      {labels.length > 0 ? (
        <p className="text-graphite mt-2 max-w-3xl text-sm leading-6">
          {labels.join(", ")}. The mini-table is used only when every tied pair
          has met the same positive number of times.
        </p>
      ) : (
        <p className="text-graphite mt-2 max-w-3xl text-sm leading-6">
          This historical V1.0 snapshot did not persist its tiebreak metadata.
          Its recorded identity is preserved below instead of substituting a
          newer bundled Ruleset.
        </p>
      )}
      <div className="mt-4 max-w-xl">
        <RulesetAuditDetails presentation={presentation} />
      </div>
    </section>
  );
}
