import type { LivePlayoffState } from "@/application/queries/live-playoff-dtos";
import { PageFrame } from "@/components/league/page-frame";
import { StatusBadge } from "@/components/ui/status-badge";
import { AuditDetails } from "@/components/ui/audit-details";
import { formatCenticredits } from "@/domain/odds/american";

type BracketEntry =
  LivePlayoffState["publication"]["bracket"]["stages"][number]["games"][number]["sideA"];

type PublishedRound = LivePlayoffState["rounds"][number];

const roundTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/New_York",
});

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
      <span className="font-semibold break-words">{entry.displayName}</span>
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
      title="The playoff field is set"
      description={`The top ${publication.expectedQualifierCount} eligible members qualified from the final regular-season standings.`}
      aside={
        <StatusBadge tone={fieldComplete ? "positive" : "pending"}>
          {publication.actualQualifierCount} qualified
        </StatusBadge>
      }
    >
      <section aria-labelledby="published-rounds-title" className="mt-7">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
              Playoff schedule
            </p>
            <h2 id="published-rounds-title" className="mt-2 text-xl font-bold">
              Published rounds and advancement
            </h2>
          </div>
          <StatusBadge tone={state.rounds.length ? "positive" : "pending"}>
            {state.rounds.length
              ? `${state.rounds.length} round${state.rounds.length === 1 ? "" : "s"} published`
              : "Week 15 pending"}
          </StatusBadge>
        </div>

        {state.rounds.length ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {state.rounds.map((round) => (
              <PublishedRoundCard key={round.id} round={round} />
            ))}
          </div>
        ) : (
          <div className="border-boundary bg-surface mt-4 rounded-xl border p-5">
            <p className="text-graphite text-sm leading-6">
              The field is set. The commissioner can now prepare Week 15 from
              this bracket.
            </p>
          </div>
        )}
      </section>

      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="bracket-title">
          <div>
            <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
              Championship bracket
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
              Playoff field
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
                    <span className="block text-sm font-semibold break-words">
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
            <h2 className="font-bold">Final Week 14 standings</h2>
            <div className="mt-4 space-y-3">
              {publication.standings.map((standing) => (
                <div
                  className="grid grid-cols-[28px_1fr_auto] items-center gap-2 text-sm"
                  key={standing.entryId}
                >
                  <span className="font-mono">{standing.seed}</span>
                  <span className="min-w-0 break-words">
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

          <AuditDetails context="This evidence verifies the official field and final Week 14 standings shown above.">
            <dl>
              <div>
                <dt className="text-muted">Qualification hash</dt>
                <dd className="mt-1 font-mono text-xs break-all">
                  {publication.inputHash}
                </dd>
              </div>
            </dl>
          </AuditDetails>
        </aside>
      </div>
    </PageFrame>
  );
}

function PublishedRoundCard({ round }: { round: PublishedRound }) {
  return (
    <article className="border-registry bg-surface rounded-xl border p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-registry text-xs font-bold tracking-[0.08em] uppercase">
            Week {round.week} · {round.scope.toLowerCase()}
          </p>
          <h3 className="mt-2 font-bold">
            {round.week === 17
              ? "Finals"
              : round.scope === "EXHIBITION"
                ? "Exhibition round"
                : "Championship round"}
          </h3>
        </div>
        <StatusBadge
          tone={
            round.state === "FINAL"
              ? "positive"
              : round.state === "OPEN"
                ? "live"
                : "pending"
          }
        >
          {round.state.toLowerCase()}
        </StatusBadge>
      </div>
      <p className="text-muted mt-2 text-xs">
        Cards lock {roundTimeFormatter.format(new Date(round.commonLockAt))} ET
      </p>
      <div className="mt-4 space-y-3">
        {round.matchups.map((matchup) => {
          const sideAAdvances =
            matchup.result?.advancingEntryId === matchup.sideA.entryId;
          const sideBAdvances =
            matchup.result?.advancingEntryId === matchup.sideB.entryId;
          return (
            <div
              className="border-boundary bg-subtle rounded-lg border p-3"
              key={matchup.id}
            >
              <p className="text-muted text-xs font-semibold">
                {matchup.label} · {matchup.scope.toLowerCase()}
              </p>
              <div className="mt-3 space-y-2">
                <RoundEntryLine
                  advances={sideAAdvances}
                  decision={matchup.result?.sideADecision}
                  entry={matchup.sideA}
                  score={matchup.result?.sideAScoreCenticredits}
                />
                <RoundEntryLine
                  advances={sideBAdvances}
                  decision={matchup.result?.sideBDecision}
                  entry={matchup.sideB}
                  score={matchup.result?.sideBScoreCenticredits}
                />
              </div>
              {matchup.result?.status === "FINAL" &&
              matchup.scope === "PLAYOFF" ? (
                <p className="text-positive mt-3 text-xs font-semibold">
                  {sideAAdvances || sideBAdvances
                    ? "Advancement recorded from the final result"
                    : "Final result recorded"}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      <AuditDetails
        className="mt-4 border-b-0 pb-0"
        context="This evidence verifies the published round and results shown above."
      >
        <dl>
          <div>
            <dt className="text-muted">Round hash</dt>
            <dd className="mt-1 font-mono text-[0.6875rem] break-all">
              {round.inputHash}
            </dd>
          </div>
        </dl>
      </AuditDetails>
    </article>
  );
}

function RoundEntryLine({
  advances,
  decision,
  entry,
  score,
}: {
  advances: boolean;
  decision?: "WIN" | "LOSS" | "TIE";
  entry: PublishedRound["matchups"][number]["sideA"];
  score?: number;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-md px-2 py-1.5 ${advances ? "bg-positive/10 text-positive" : ""}`}
    >
      <span className="min-w-0 text-sm font-semibold break-words">
        {entry.qualificationSeed ? `No. ${entry.qualificationSeed} · ` : ""}
        {entry.displayName}
      </span>
      <span className="shrink-0 font-mono text-xs font-bold">
        {score === undefined
          ? "—"
          : `${formatCenticredits(BigInt(score), true)}${decision ? ` · ${decision}` : ""}`}
      </span>
    </div>
  );
}
