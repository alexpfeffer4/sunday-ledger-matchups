import type {
  PairedMatchupDto,
  PositionLedgerSection,
} from "@/application/queries/project-paired-matchup";
import type { ReactNode } from "react";
import { LeagueScoreboard } from "@/components/matchup/league-scoreboard";
import { PairedMatchupHeader } from "@/components/matchup/paired-matchup-header";
import { PositionLedgerRow } from "@/components/matchup/position-ledger-row";
import { ScorePath } from "@/components/matchup/score-path";
import { PageFrame } from "@/components/league/page-frame";

const sections: Array<{
  id: PositionLedgerSection;
  title: string;
  empty: string;
}> = [
  {
    id: "SETTLED",
    title: "Settled",
    empty: "No authorized positions have settled yet.",
  },
  {
    id: "IN_PROGRESS",
    title: "In progress",
    empty: "No authorized positions are in progress.",
  },
  {
    id: "REMAINING",
    title: "Remaining",
    empty: "No authorized positions remain unsettled.",
  },
];

export function PairedMatchupView({
  matchup,
  refreshControl,
}: {
  matchup: PairedMatchupDto;
  refreshControl: ReactNode;
}) {
  return (
    <PageFrame
      dark={matchup.broadcast}
      description="Official stored returns, event-timed reveal, and one privacy-safe view of what remains."
      eyebrow={`${matchup.league.name} · ${matchup.league.mode === "LIVE" ? "Live league" : "Simulation"}`}
      title={`Week ${matchup.week.nflWeek} matchup`}
    >
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <PairedMatchupHeader
            matchup={matchup}
            refreshControl={refreshControl}
          />
          <ScorePath matchup={matchup} />

          <section
            aria-labelledby="position-ledger-heading"
            className="space-y-5"
          >
            <div>
              <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
                Position ledger
              </p>
              <h2
                className="mt-1 text-xl font-bold"
                id="position-ledger-heading"
              >
                Authorized picks in event order
              </h2>
            </div>

            {sections.map((section) => {
              const rows = matchup.rows[section.id];
              return (
                <section
                  aria-labelledby={`ledger-${section.id}`}
                  key={section.id}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3
                      className="text-base font-bold"
                      id={`ledger-${section.id}`}
                    >
                      {section.title}
                    </h3>
                    <span className="text-muted text-xs">
                      {rows.length === 0 ? "None" : `${rows.length} authorized`}
                    </span>
                  </div>
                  {rows.length > 0 ? (
                    <ol className="mt-2 space-y-2">
                      {rows.map((row) => (
                        <PositionLedgerRow key={row.id} row={row} />
                      ))}
                    </ol>
                  ) : (
                    <p className="border-boundary bg-subtle text-muted mt-2 rounded-lg border px-4 py-3 text-sm">
                      {section.empty}
                    </p>
                  )}

                  {section.id === "REMAINING" && matchup.futureSealed ? (
                    <div
                      aria-label="Future picks sealed. Unstarted events remain private."
                      className="border-boundary bg-subtle mt-2 flex min-h-24 items-center justify-center rounded-lg border px-4 py-5 text-center"
                      data-testid="future-sealed-placeholder"
                    >
                      <div>
                        <p className="font-semibold">Future picks sealed</p>
                        <p className="text-muted mt-1 text-xs">
                          Unstarted events remain private.
                        </p>
                      </div>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </section>
        </div>

        <LeagueScoreboard matchup={matchup} />
      </div>
    </PageFrame>
  );
}
