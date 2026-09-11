import { Fragment } from "react";
import { formatCenticredits } from "@/domain/odds/american";

export type StandingsRecord = {
  entryId: string;
  rank: number;
  memberName: string;
  wins: number;
  losses: number;
  ties: number;
  pointsForCenticredits: number;
  attendanceMisses: number;
  playoffEligible: boolean;
  inPlayoffField: boolean;
  current: boolean;
};

function score(value: number): string {
  return formatCenticredits(BigInt(value), true);
}

function record(row: StandingsRecord): string {
  return `${row.wins}–${row.losses}${row.ties > 0 ? `–${row.ties}` : ""}`;
}

function YouLabel() {
  return (
    <span className="border-registry/30 bg-registry/10 text-registry ml-2 inline-flex rounded-full border px-2 py-0.5 text-xs font-bold tracking-[0.04em] uppercase">
      You
    </span>
  );
}

function IneligibleLabel() {
  return (
    <span className="border-negative/30 bg-negative/10 text-negative ml-2 inline-flex rounded-full border px-2 py-0.5 text-xs font-bold tracking-[0.04em] uppercase">
      Ineligible
    </span>
  );
}

export function StandingsTable({
  caption,
  playoffIneligibilityAtMisses,
  rows,
}: {
  caption: string;
  playoffIneligibilityAtMisses: number;
  rows: StandingsRecord[];
}) {
  const playoffLineLabel = "Playoff line";
  const lastPlayoffFieldIndex = rows.reduce(
    (lastIndex, row, index) => (row.inPlayoffField ? index : lastIndex),
    -1,
  );
  const hasPlayoffLineBefore = (index: number) =>
    index > 0 && index === lastPlayoffFieldIndex + 1;
  return (
    <>
      <section
        aria-label={caption}
        className="standings-mobile border-boundary mt-5 md:hidden"
      >
        <div
          aria-hidden="true"
          className="standings-mobile-head text-muted grid grid-cols-[minmax(0,0.35fr)_minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1.4fr)] items-end gap-2 border-b pb-2 text-xs"
        >
          <span>#</span>
          <span>Member</span>
          <span className="text-right">Record</span>
          <span className="text-right">Points For</span>
        </div>
        <ol className="divide-boundary divide-y">
          {rows.map((row, index) => (
            <li key={row.entryId}>
              {hasPlayoffLineBefore(index) ? (
                <p className="text-pending border-pending border-t-2 py-2 text-xs font-semibold">
                  {playoffLineLabel}
                </p>
              ) : null}
              <div
                className={`standings-mobile-row grid grid-cols-[minmax(0,0.35fr)_minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1.4fr)] items-baseline gap-x-2 border-l-[3px] py-3 pr-1 ${row.current ? "border-l-registry bg-registry/5" : "border-l-transparent"}`}
              >
                <span className="text-registry text-right font-mono text-sm font-semibold tabular-nums">
                  <span className="sr-only">Rank </span>
                  {row.rank}
                </span>
                <span className="standings-member min-w-0 text-sm font-semibold break-words">
                  {row.memberName}
                  {row.current ? (
                    <span className="text-registry mt-1 block text-xs">
                      You
                    </span>
                  ) : null}
                </span>
                <span className="standings-metric text-right text-sm tabular-nums">
                  <span className="standings-metric-label sr-only">
                    Record{" "}
                  </span>
                  <span className="standings-value">{record(row)}</span>
                </span>
                <span className="standings-metric text-right font-mono text-sm tabular-nums">
                  <span className="standings-metric-label sr-only">
                    Points For{" "}
                  </span>
                  <span className="standings-value">
                    {score(row.pointsForCenticredits)}
                  </span>
                </span>
                {row.attendanceMisses > 0 || !row.playoffEligible ? (
                  <span
                    className={`standings-eligibility col-span-3 col-start-2 mt-1 text-xs ${row.playoffEligible ? "text-muted" : "text-negative"}`}
                  >
                    {row.attendanceMisses} incomplete week
                    {row.attendanceMisses === 1 ? "" : "s"}
                    {row.playoffEligible ? "" : " · Playoff ineligible"}
                  </span>
                ) : (
                  <span className="sr-only">0 incomplete weeks</span>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div
        aria-label="Scrollable standings table"
        className="border-boundary bg-surface mt-6 hidden overflow-x-auto rounded-lg border md:block"
        role="region"
        tabIndex={0}
      >
        <table className="w-full min-w-[600px] border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-subtle text-muted text-xs tracking-[0.06em] uppercase">
            <tr>
              <th className="px-4 py-3 text-right" scope="col">
                Rank
              </th>
              <th className="px-4 py-3" scope="col">
                Member
              </th>
              <th className="px-4 py-3 text-right" scope="col">
                Record
              </th>
              <th className="px-4 py-3 text-right" scope="col">
                Points For
              </th>
              <th className="px-4 py-3 text-right" scope="col">
                Incomplete weeks
              </th>
            </tr>
          </thead>
          <tbody className="divide-boundary divide-y">
            {rows.map((row, index) => (
              <Fragment key={row.entryId}>
                {hasPlayoffLineBefore(index) ? (
                  <tr>
                    <td
                      className="border-pending bg-pending/5 text-pending border-y-2 px-4 py-2 text-xs font-bold tracking-[0.06em] uppercase"
                      colSpan={5}
                    >
                      {playoffLineLabel}
                    </td>
                  </tr>
                ) : null}
                <tr className={row.current ? "bg-registry/5" : ""}>
                  <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                    {row.rank}
                  </td>
                  <th className="px-4 py-3" scope="row">
                    {row.memberName}
                    {row.current ? <YouLabel /> : null}
                    {!row.playoffEligible ? <IneligibleLabel /> : null}
                  </th>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {record(row)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {score(row.pointsForCenticredits)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.attendanceMisses}
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted mt-3 text-sm leading-6">
        <strong className="text-graphite">Incomplete weeks</strong> count
        regular-season cards that were not fully sealed before the deadline.{" "}
        {playoffIneligibilityAtMisses} makes a member playoff-ineligible.
      </p>
    </>
  );
}
