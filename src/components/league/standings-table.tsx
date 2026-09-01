import { formatCenticredits } from "@/domain/odds/american";

export type StandingsRecord = {
  entryId: string;
  rank: number;
  memberName: string;
  wins: number;
  losses: number;
  ties: number;
  pointsForCenticredits: number;
  allPlayHalfWinUnits: number;
  allPlayComparisonCount: number;
  attendanceMisses: number;
  playoffState: string;
  inPlayoffField: boolean;
  current: boolean;
};

function score(value: number): string {
  return formatCenticredits(BigInt(value), true);
}

function record(row: StandingsRecord): string {
  return `${row.wins}–${row.losses}${row.ties > 0 ? `–${row.ties}` : ""}`;
}

function allPlay(row: StandingsRecord): string {
  const wins = row.allPlayHalfWinUnits / 2;
  return `${wins}–${row.allPlayComparisonCount - wins}`;
}

function hasCutlineBefore(rows: StandingsRecord[], index: number): boolean {
  return (
    index > 0 &&
    rows[index - 1]?.inPlayoffField === true &&
    rows[index]?.inPlayoffField === false
  );
}

function YouLabel() {
  return (
    <span className="border-registry/30 bg-registry/10 text-registry ml-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-[0.04em] uppercase">
      You
    </span>
  );
}

export function StandingsTable({
  caption,
  rows,
}: {
  caption: string;
  rows: StandingsRecord[];
}) {
  return (
    <>
      <div className="mt-6 space-y-2 md:hidden">
        {rows.map((row, index) => (
          <div key={row.entryId}>
            {hasCutlineBefore(rows, index) ? (
              <p className="text-pending border-pending/40 mb-2 border-t pt-2 text-xs font-bold tracking-[0.06em] uppercase">
                Playoff cutline
              </p>
            ) : null}
            <article
              aria-label={`Rank ${row.rank}, ${row.memberName}${row.current ? ", You" : ""}, ${record(row)}, ${score(row.pointsForCenticredits)} Points For, ${row.playoffState}`}
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
                      <dt className="text-muted text-xs">Playoff state</dt>
                      <dd className="mt-0.5 font-semibold">
                        {row.playoffState}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted text-xs">All-play</dt>
                      <dd className="mt-0.5 font-semibold">{allPlay(row)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted text-xs">Attendance misses</dt>
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
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
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
                Playoff state
              </th>
              <th className="px-4 py-3" scope="col">
                All-play
              </th>
              <th className="px-4 py-3" scope="col">
                Misses
              </th>
            </tr>
          </thead>
          <tbody className="divide-boundary divide-y">
            {rows.map((row, index) => (
              <tr
                className={`${row.current ? "bg-registry/5" : ""} ${
                  hasCutlineBefore(rows, index)
                    ? "border-pending border-t-2"
                    : ""
                }`}
                key={row.entryId}
              >
                <td className="px-4 py-3 font-mono font-semibold">
                  {row.rank}
                </td>
                <th className="px-4 py-3" scope="row">
                  {row.memberName}
                  {row.current ? <YouLabel /> : null}
                </th>
                <td className="px-4 py-3">{record(row)}</td>
                <td className="px-4 py-3 font-mono">
                  {score(row.pointsForCenticredits)}
                </td>
                <td className="px-4 py-3 font-semibold">
                  {hasCutlineBefore(rows, index) ? (
                    <span className="text-pending mr-2 text-xs font-bold uppercase">
                      Below cutline
                    </span>
                  ) : null}
                  {row.playoffState}
                </td>
                <td className="px-4 py-3">{allPlay(row)}</td>
                <td className="px-4 py-3">{row.attendanceMisses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
