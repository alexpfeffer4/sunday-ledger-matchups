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
  if (bridge.matchup.status !== "FINAL") return null;

  if (bridge.standingsEffect === "NONE") {
    return (
      <section aria-labelledby="record-bridge-heading" className="py-2">
        <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
          Standings impact
        </p>
        <h3 className="mt-1 text-lg font-bold" id="record-bridge-heading">
          Regular-season standings unchanged
        </h3>
        <p className="text-graphite mt-2 text-sm leading-6">
          This {bridge.matchup.scope.toLowerCase()} result remains in history,
          but it does not change the official regular-season record, Points For,
          or standings position.
        </p>
      </section>
    );
  }

  if (!bridge.after) return null;

  const facts = [
    {
      label: "Record",
      before: bridge.before ? record(bridge.before) : null,
      after: record(bridge.after),
    },
    {
      label: "Points For",
      before: bridge.before ? score(bridge.before.pointsForCenticredits) : null,
      after: score(bridge.after.pointsForCenticredits),
    },
    {
      label: "Standings position",
      before: bridge.before?.seed ? seed(bridge.before) : null,
      after: seed(bridge.after),
    },
  ];

  return (
    <section aria-labelledby="record-bridge-heading" className="record-bridge">
      <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
        Standings impact
      </p>
      <h3 className="mt-1 text-lg font-bold" id="record-bridge-heading">
        What Week {bridge.matchup.nflWeek} changed
      </h3>
      <dl className="record-bridge-facts mt-3 grid gap-3">
        {facts.map((fact) => (
          <div className="min-w-0" key={fact.label}>
            <dt className="text-muted text-xs font-bold tracking-[0.06em] uppercase">
              {fact.label}
            </dt>
            <dd className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-sm font-semibold tabular-nums">
              {fact.before !== null ? (
                <span className="text-muted inline-flex items-baseline gap-2">
                  <span>
                    <span className="sr-only">Before: </span>
                    {fact.before}
                  </span>
                  <span aria-hidden="true">→</span>
                </span>
              ) : null}
              <span>
                <span className="sr-only">After: </span>
                {fact.after}
              </span>
            </dd>
          </div>
        ))}
      </dl>
      {cutline ? <Cutline cutline={cutline} /> : null}
    </section>
  );
}
