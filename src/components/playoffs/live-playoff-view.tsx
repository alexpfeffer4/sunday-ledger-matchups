import type { LivePlayoffState } from "@/application/queries/live-playoff-dtos";
import { PageFrame } from "@/components/league/page-frame";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCenticredits } from "@/domain/odds/american";

type BracketEntry =
  LivePlayoffState["publication"]["bracket"]["stages"][number]["games"][number]["sideA"];

function EntryLine({ entry }: { entry: BracketEntry }) {
  if (!entry) {
    return <span className="text-muted text-sm font-semibold">TBD</span>;
  }
  return (
    <span className="flex min-w-0 items-center gap-2 text-sm">
      <span className="text-registry shrink-0 font-mono font-bold">
        {entry.qualificationSeed
          ? `No. ${entry.qualificationSeed}`
          : `RS ${entry.regularSeasonSeed}`}
      </span>
      <span className="truncate font-semibold">{entry.displayName}</span>
    </span>
  );
}

export function LivePlayoffView({ state }: { state: LivePlayoffState }) {
  const { publication } = state;
  const qualifierIds = new Set(
    publication.qualifiers.map((qualifier) => qualifier.entryId),
  );
  const fieldComplete =
    publication.actualQualifierCount === publication.expectedQualifierCount;

  return (
    <PageFrame
      eyebrow={`${state.league.nflYear} playoffs · official through Week 14`}
      title="The playoff field is on the record"
      description={`The top ${publication.expectedQualifierCount} eligible entries were frozen from the final regular-season table. Week 15 markets cannot change these seeds.`}
      aside={
        <StatusBadge tone={fieldComplete ? "positive" : "pending"}>
          {publication.actualQualifierCount} qualified
        </StatusBadge>
      }
    >
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="bracket-title">
          <div>
            <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
              Immutable bracket template
            </p>
            <h2 id="bracket-title" className="mt-2 text-xl font-bold">
              {publication.bracket.format === "SMALL_FOUR"
                ? "Four-entry championship path"
                : "Six-entry reseeded championship path"}
            </h2>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {publication.bracket.stages.map((stage) => (
              <article
                className="border-boundary bg-surface rounded-xl border p-5"
                key={stage.week}
              >
                <p className="text-muted text-xs font-bold tracking-[0.08em] uppercase">
                  Week {stage.week} · {stage.scope.toLowerCase()}
                </p>
                <h3 className="mt-2 font-bold">{stage.label}</h3>
                {stage.byes?.length ? (
                  <div className="border-positive/25 bg-positive/10 mt-4 rounded-lg border p-3">
                    <p className="text-positive text-xs font-bold uppercase">
                      Week 15 byes
                    </p>
                    <div className="mt-2 space-y-2">
                      {stage.byes.map((entry, index) => (
                        <EntryLine entry={entry} key={index} />
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="mt-4 space-y-3">
                  {stage.games.map((game) => (
                    <div
                      className="border-boundary bg-subtle rounded-lg border p-3"
                      key={`${stage.week}-${game.game}`}
                    >
                      <p className="text-muted text-xs font-semibold">
                        {game.label}
                      </p>
                      <div className="mt-3 space-y-2">
                        <EntryLine entry={game.sideA} />
                        <EntryLine entry={game.sideB} />
                      </div>
                    </div>
                  ))}
                </div>
                {stage.reseedRule ? (
                  <p className="text-muted mt-4 text-xs leading-5">
                    No. 1 faces the lowest remaining qualification seed; No. 2
                    faces the other opening-round winner.
                  </p>
                ) : null}
              </article>
            ))}
          </div>
          <section className="border-boundary bg-subtle mt-5 rounded-xl border p-5">
            <h2 className="font-bold">Published advancement rule</h2>
            <p className="text-graphite mt-2 text-sm leading-6">
              If a playoff matchup ends with exactly equal weekly scores, the
              higher qualification seed advances. An incomplete playoff card is
              an automatic elimination.
            </p>
          </section>
        </section>

        <aside className="space-y-5">
          <section className="border-boundary bg-surface rounded-xl border p-5">
            <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
              Qualification snapshot
            </p>
            <h2 className="mt-2 font-bold">Official field</h2>
            <ol className="divide-boundary mt-4 divide-y">
              {publication.qualifiers.map((qualifier) => (
                <li
                  className="grid grid-cols-[34px_1fr_auto] items-center gap-2 py-3 first:pt-0 last:pb-0"
                  key={qualifier.entryId}
                >
                  <span className="text-registry font-mono font-bold">
                    {qualifier.qualificationSeed}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {qualifier.displayName}
                    </span>
                    <span className="text-muted text-xs">
                      Regular-season No. {qualifier.regularSeasonSeed}
                    </span>
                  </span>
                  <span className="text-muted text-xs">
                    {qualifier.wins}-{qualifier.losses}-{qualifier.ties}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section className="border-boundary bg-surface rounded-xl border p-5">
            <h2 className="font-bold">Week 14 audit</h2>
            <div className="mt-4 space-y-3">
              {publication.standings.map((standing) => (
                <div
                  className="grid grid-cols-[28px_1fr_auto] items-center gap-2 text-sm"
                  key={standing.entryId}
                >
                  <span className="font-mono">{standing.seed}</span>
                  <span className="min-w-0 truncate">
                    {standing.displayName}
                  </span>
                  <span
                    className={
                      qualifierIds.has(standing.entryId)
                        ? "text-positive font-semibold"
                        : standing.attendanceMisses >=
                            publication.attendanceMissLimit
                          ? "text-negative font-semibold"
                          : "text-muted"
                    }
                  >
                    {qualifierIds.has(standing.entryId)
                      ? "Qualified"
                      : standing.attendanceMisses >=
                          publication.attendanceMissLimit
                        ? "Ineligible"
                        : formatCenticredits(
                            BigInt(standing.pointsForCenticredits),
                            true,
                          )}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <p className="text-muted font-mono text-xs break-all">
            Qualification hash · {publication.inputHash}
          </p>
        </aside>
      </div>
    </PageFrame>
  );
}
