import type {
  PlayoffCutlineFact,
  RecordBridgeFact,
  StandingFact,
} from "@/domain/history/project-season-memory";
import { formatCenticredits } from "@/domain/odds/american";

function score(value: number): string {
  return formatCenticredits(BigInt(value), true);
}

function record(standing: StandingFact | null): string {
  if (!standing) return "—";
  return `${standing.wins}–${standing.losses}${standing.ties > 0 ? `–${standing.ties}` : ""}`;
}

function allPlay(standing: StandingFact | null): string {
  if (!standing) return "—";
  if (standing.allPlayComparisonCount === 0) return "0.0%";
  return `${(
    (standing.allPlayHalfWinUnits / (standing.allPlayComparisonCount * 2)) *
    100
  ).toFixed(1)}%`;
}

function seed(standing: StandingFact | null): string {
  return standing?.seed ? `No. ${standing.seed}` : "—";
}

function deltaLabel(
  before: StandingFact | null,
  after: StandingFact | null,
): string {
  if (!after?.seed) return "Standing update pending";
  if (!before?.seed) return `Entered at No. ${after.seed}`;
  if (before.seed === after.seed) return "Seed unchanged";
  return after.seed < before.seed
    ? `Up ${before.seed - after.seed}`
    : `Down ${after.seed - before.seed}`;
}

function Cutline({ cutline }: { cutline: PlayoffCutlineFact }) {
  const viewerLabel = {
    CURRENTLY_INSIDE: "Currently inside",
    CURRENTLY_OUTSIDE: "Currently outside",
    QUALIFIED: "Qualified",
    DID_NOT_QUALIFY: "Did not qualify",
  }[cutline.viewerState];
  return (
    <section
      aria-labelledby="playoff-cutline-heading"
      className="border-boundary bg-subtle rounded-lg border p-4"
    >
      <p className="text-muted text-xs font-bold tracking-[0.08em] uppercase">
        {cutline.kind === "FROZEN"
          ? "Official playoff field"
          : "Current stored playoff field"}
      </p>
      <h3 className="mt-1 font-bold" id="playoff-cutline-heading">
        {viewerLabel} · top {cutline.qualifierCount}
      </h3>
      <p className="text-graphite mt-2 text-sm leading-6">
        {cutline.lastIn
          ? `Last in: No. ${cutline.lastIn.seed} ${cutline.lastIn.name}.`
          : "The stored field has no last-in row."}{" "}
        {cutline.firstOut
          ? `First out: No. ${cutline.firstOut.seed} ${cutline.firstOut.name}.`
          : "Every stored member is inside the field."}
      </p>
      {cutline.kind === "CURRENT" ? (
        <p className="text-muted mt-2 text-xs">
          Current position only; this is not a clinch or elimination claim.
        </p>
      ) : null}
    </section>
  );
}

export function RecordBridge({
  bridge,
  cutline,
}: {
  bridge: RecordBridgeFact;
  cutline: PlayoffCutlineFact | null;
}) {
  if (bridge.standingsEffect === "NONE") {
    return (
      <section
        aria-labelledby="record-bridge-heading"
        className="border-boundary bg-surface rounded-xl border p-5"
      >
        <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
          RecordBridge
        </p>
        <h3 className="mt-1 text-lg font-bold" id="record-bridge-heading">
          Regular-season standings unchanged
        </h3>
        <p className="text-graphite mt-2 text-sm leading-6">
          This {bridge.matchup.scope.toLowerCase()} result remains in history,
          but it does not change the official regular-season record, Points For,
          all-play percentage, or seed.
        </p>
      </section>
    );
  }

  const facts = [
    {
      label: "Record",
      before: record(bridge.before),
      after: record(bridge.after),
    },
    {
      label: "Points For",
      before: bridge.before ? score(bridge.before.pointsForCenticredits) : "—",
      after: bridge.after ? score(bridge.after.pointsForCenticredits) : "—",
    },
    {
      label: "All-play",
      before: allPlay(bridge.before),
      after: allPlay(bridge.after),
    },
    {
      label: "Seed",
      before: seed(bridge.before),
      after: seed(bridge.after),
    },
  ];

  return (
    <section aria-labelledby="record-bridge-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
            RecordBridge
          </p>
          <h3 className="mt-1 text-lg font-bold" id="record-bridge-heading">
            Before and after Week {bridge.matchup.nflWeek}
          </h3>
        </div>
        <p className="text-muted text-sm font-semibold">
          {deltaLabel(bridge.before, bridge.after)}
        </p>
      </div>
      <dl className="border-boundary bg-surface mt-3 grid overflow-hidden rounded-xl border sm:grid-cols-2 xl:grid-cols-4">
        {facts.map((fact) => (
          <div
            className="border-boundary border-b p-4 last:border-b-0 sm:nth-[n+3]:border-b-0 sm:nth-[odd]:border-r xl:border-r xl:border-b-0 xl:last:border-r-0"
            key={fact.label}
          >
            <dt className="text-muted text-xs font-bold tracking-[0.06em] uppercase">
              {fact.label}
            </dt>
            <dd className="mt-2 flex min-w-0 items-center gap-2 font-mono text-sm font-semibold">
              <span className="text-muted truncate">{fact.before}</span>
              <span aria-hidden="true">→</span>
              <span className="truncate">{fact.after}</span>
            </dd>
          </div>
        ))}
      </dl>
      {cutline ? (
        <div className="mt-4">
          <Cutline cutline={cutline} />
        </div>
      ) : null}
    </section>
  );
}
