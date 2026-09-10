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
    <span className="border-registry/30 bg-registry/10 text-registry ml-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-[0.04em] uppercase">
      You
    </span>
  );
}

function IneligibleLabel() {
  return (
    <span className="border-negative/30 bg-negative/10 text-negative ml-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-[0.04em] uppercase">
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
      <div className="mt-6 space-y-2 md:hidden">
        {rows.map((row, index) => (
          <div key={row.entryId}>
            {hasPlayoffLineBefore(index) ? (
              <p className="text-pending border-pending/40 mb-2 border-t pt-2 text-xs font-bold tracking-[0.06em] uppercase">
                {playoffLineLabel}
              </p>
            ) : null}
            <article
              aria-label={`Rank ${row.rank}, ${row.memberName}${row.current ? ", You" : ""}, ${record(row)}, ${score(row.pointsForCenticredits)} Points For, ${row.attendanceMisses} incomplete weeks${row.playoffEligible ? "" : ", playoff ineligible"}`}
              className={`border-boundary bg-surface rounded-lg border px-4 py-3 ${
                row.current ? "border-l-registry bg-registry/5 border-l-4" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-registry w-7 shrink-0 font-mono text-lg font-bold">
                  {row.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold break-words">
                    {row.memberName}
                    {row.current ? <YouLabel /> : null}
                    {!row.playoffEligible ? <IneligibleLabel /> : null}
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <dt className="text-muted text-xs">Record</dt>
                      <dd className="mt-0.5 font-semibold">{record(row)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted text-xs">Points For</dt>
                      <dd className="mt-0.5 font-mono font-semibold">
                        {score(row.pointsForCenticredits)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted text-xs">Incomplete weeks</dt>
                      <dd className="mt-0.5 font-semibold">
                        {row.attendanceMisses}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </article>
          </div>
        ))}
      </div>

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
              <th className="px-4 py-3" scope="col">
                Rank
              </th>
              <th className="px-4 py-3" scope="col">
                Member
              </th>
              <th className="px-4 py-3" scope="col">
                Record
              </th>
              <th className="px-4 py-3" scope="col">
                Points For
              </th>
              <th className="px-4 py-3" scope="col">
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
                  <td className="px-4 py-3 font-mono font-semibold">
                    {row.rank}
                  </td>
                  <th className="px-4 py-3" scope="row">
                    {row.memberName}
                    {row.current ? <YouLabel /> : null}
                    {!row.playoffEligible ? <IneligibleLabel /> : null}
                  </th>
                  <td className="px-4 py-3">{record(row)}</td>
                  <td className="px-4 py-3 font-mono">
                    {score(row.pointsForCenticredits)}
                  </td>
                  <td className="px-4 py-3">{row.attendanceMisses}</td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted mt-3 text-xs leading-5">
        <strong className="text-graphite">Incomplete weeks</strong> count cards
        that were not fully sealed. {playoffIneligibilityAtMisses} makes a
        member playoff-ineligible.
      </p>
    </>
  );
}
