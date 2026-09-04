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

function seed(standing: StandingFact | null): string {
  return standing?.seed ? `No. ${standing.seed}` : "—";
}

function deltaLabel(
  before: StandingFact | null,
  after: StandingFact | null,
): string {
  if (!after?.seed) return "Standings pending";
  if (!before?.seed) return `Now No. ${after.seed}`;
  if (before.seed === after.seed) return `Still No. ${after.seed}`;
  return after.seed < before.seed
    ? `Up ${before.seed - after.seed} · now No. ${after.seed}`
    : `Down ${after.seed - before.seed} · now No. ${after.seed}`;
}

function Cutline({ cutline }: { cutline: PlayoffCutlineFact }) {
  const viewerLabel = {
    CURRENTLY_INSIDE: `Inside the top ${cutline.qualifierCount}`,
    CURRENTLY_OUTSIDE: `Outside the top ${cutline.qualifierCount}`,
    QUALIFIED: `Qualified for the ${cutline.qualifierCount}-team playoffs`,
    DID_NOT_QUALIFY: `Outside the ${cutline.qualifierCount}-team playoff field`,
  }[cutline.viewerState];
  return (
    <section
      aria-labelledby="playoff-cutline-heading"
      className="border-boundary mt-5 border-t pt-5"
    >
      <p className="text-graphite text-xs font-bold tracking-[0.08em] uppercase">
        {cutline.kind === "FROZEN"
          ? "Official playoff field"
          : "Playoff picture"}
      </p>
      <h3 className="mt-1 font-bold" id="playoff-cutline-heading">
        {viewerLabel}
      </h3>
      <p className="text-graphite mt-2 text-sm leading-6">
        {cutline.lastIn
          ? `Cut line: No. ${cutline.lastIn.seed} ${cutline.lastIn.name}.`
          : "No cut line is available yet."}{" "}
        {cutline.firstOut
          ? `First out: No. ${cutline.firstOut.seed} ${cutline.firstOut.name}.`
          : "Every member is currently inside the field."}
      </p>
      {cutline.kind === "CURRENT" ? (
        <p className="text-graphite mt-2 text-xs">
          This is today’s position, not a clinch or elimination.
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
          Standings impact
        </p>
        <h3 className="mt-1 text-lg font-bold" id="record-bridge-heading">
          Regular-season standings unchanged
        </h3>
        <p className="text-graphite mt-2 text-sm leading-6">
          This {bridge.matchup.scope.toLowerCase()} result remains in history,
          but it does not change the official regular-season record, Points For,
          or seed.
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
            Standings impact
          </p>
          <h3 className="mt-1 text-lg font-bold" id="record-bridge-heading">
            What Week {bridge.matchup.nflWeek} changed
          </h3>
        </div>
        <p className="text-graphite text-sm font-semibold">
          {deltaLabel(bridge.before, bridge.after)}
        </p>
      </div>
      <dl className="border-boundary bg-surface mt-3 grid overflow-hidden rounded-xl border sm:grid-cols-3">
        {facts.map((fact) => (
          <div
            className="border-boundary border-b p-4 last:border-b-0 sm:border-b-0 sm:[&:not(:last-child)]:border-r"
            key={fact.label}
          >
            <dt className="text-muted text-xs font-bold tracking-[0.06em] uppercase">
              {fact.label}
            </dt>
            <dd className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-3">
              <span>
                <span className="text-muted block text-[10px] font-bold tracking-[0.05em] uppercase">
                  Before
                </span>
                <span className="text-muted mt-1 block font-mono text-sm font-semibold whitespace-nowrap">
                  {fact.before}
                </span>
              </span>
              <span aria-hidden="true" className="pb-0.5">
                →
              </span>
              <span>
                <span className="text-muted block text-[10px] font-bold tracking-[0.05em] uppercase">
                  After
                </span>
                <span className="mt-1 block font-mono text-sm font-semibold whitespace-nowrap">
                  {fact.after}
                </span>
              </span>
            </dd>
          </div>
        ))}
      </dl>
      {cutline ? <Cutline cutline={cutline} /> : null}
    </section>
  );
}
