import type { LivePlayoffState } from "@/application/queries/live-playoff-dtos";
import { PageFrame } from "@/components/league/page-frame";
import { StatusBadge } from "@/components/ui/status-badge";
import { AuditDetails } from "@/components/ui/audit-details";
import { formatCenticredits } from "@/domain/odds/american";

type PublishedRound = LivePlayoffState["rounds"][number];
type RoundEntry = PublishedRound["matchups"][number]["sideA"];

const roleLabels = {
  CHAMPIONSHIP: "Championship",
  THIRD_PLACE: "Third place",
  PLACEMENT: "Placement",
  EXHIBITION: "Exhibition",
} as const;

const roundTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/New_York",
});

export function LivePlayoffView({ state }: { state: LivePlayoffState }) {
  const { publication } = state;
  const qualifierIds = new Set(
    publication.qualifiers.map((qualifier) => qualifier.entryId),
  );
  const phase8Bracket =
    publication.bracket.format === "FOUR_SLOT" ||
    publication.bracket.format === "SIX_SLOT"
      ? publication.bracket
      : null;

  return (
    <PageFrame
      eyebrow={`${state.league.nflYear} playoffs · official through Week 14`}
      title="The playoff field is set"
      description="Eligibility is applied first. When fewer than four members are eligible, the highest remaining Week 14 finishers are reinstated only until the championship field reaches four."
      aside={
        <StatusBadge tone="positive">
          {publication.actualQualifierCount} selected
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
              Every member · one matchup each week
            </h2>
          </div>
          <StatusBadge tone={state.rounds.length ? "positive" : "pending"}>
            {state.rounds.length
              ? `${state.rounds.length} week${state.rounds.length === 1 ? "" : "s"} published`
              : "Week 15 pending"}
          </StatusBadge>
        </div>
        <p className="text-graphite mt-2 max-w-3xl text-sm leading-6">
          Weeks 15–17 include every member exactly once. Championship games are
          assigned first; remaining members are paired from the frozen Week 14
          order.
        </p>
        {state.rounds.length ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {state.rounds.map((round) => (
              <PublishedRoundCard key={round.id} round={round} />
            ))}
          </div>
        ) : (
          <div className="border-boundary bg-surface mt-4 rounded-xl border p-5">
            <p className="text-graphite text-sm leading-6">
              Qualification is final for this version. The commissioner can
              publish Week 15 from the stored bracket facts.
            </p>
          </div>
        )}
      </section>

      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="bracket-title">
          <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
            Championship bracket
          </p>
          <h2 id="bracket-title" className="mt-2 text-xl font-bold">
            {phase8Bracket?.format === "SIX_SLOT"
              ? "Six-slot championship path"
              : "Four-slot championship path"}
          </h2>

          {phase8Bracket ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {phase8Bracket.slots.map((slot) => (
                <article
                  className="border-boundary bg-surface rounded-xl border p-4"
                  key={slot.slot}
                >
                  <p className="text-muted text-xs font-bold uppercase">
                    Slot {slot.slot}
                  </p>
                  {slot.entry ? (
                    <div className="mt-2">
                      <p className="font-semibold break-words">
                        No. {slot.entry.qualificationSeed} ·{" "}
                        {slot.entry.displayName}
                      </p>
                      <p className="text-muted mt-1 text-xs">
                        Regular-season No. {slot.entry.regularSeasonSeed}
                      </p>
                    </div>
                  ) : (
                    <p className="text-muted mt-2 font-semibold">Vacant</p>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="border-boundary bg-subtle mt-4 rounded-xl border p-5 text-sm">
              This preserved bracket was published under the earlier Stage 3
              format and remains readable without alteration.
            </p>
          )}

          {phase8Bracket?.automaticWeek15Advancements.length ? (
            <section
              aria-labelledby="automatic-advancement-title"
              className="border-positive/25 bg-positive/10 mt-5 rounded-xl border p-5"
            >
              <h3 id="automatic-advancement-title" className="font-bold">
                Automatic advancement
              </h3>
              <ul className="mt-3 space-y-2 text-sm">
                {phase8Bracket.automaticWeek15Advancements.map((advance) => (
                  <li key={`${advance.entry.entryId}-${advance.reason}`}>
                    No. {advance.entry.qualificationSeed} ·{" "}
                    {advance.entry.displayName}
                    {advance.reason === "TOP_TWO_SEED_BYE"
                      ? " — Week 15 bracket bye; receives a separate bye exhibition."
                      : " — advances through the vacant opposing slot."}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="border-boundary bg-subtle mt-5 rounded-xl border p-5">
            <h3 className="font-bold">Championship advancement</h3>
            <p className="text-graphite mt-2 text-sm leading-6">
              Only championship matchups advance the bracket. Exact score ties
              and dual incompletions advance the higher qualification seed; a
              single incomplete championship card is eliminated. Third-place,
              placement, and exhibition results never advance the bracket.
            </p>
          </section>
        </section>

        <aside className="space-y-5">
          <section className="border-boundary bg-surface rounded-xl border p-5">
            <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
              Playoff field
            </p>
            <h2 className="mt-2 font-bold">Official selection</h2>
            <ol className="divide-boundary mt-4 divide-y">
              {publication.qualifiers.map((qualifier) => {
                const reinstated =
                  qualifier.selectionReason ===
                  "MINIMUM_FOUR_CHAMPIONSHIP_FIELD";
                return (
                  <li
                    className="grid grid-cols-[30px_1fr] gap-2 py-3 first:pt-0 last:pb-0"
                    key={qualifier.entryId}
                  >
                    <span className="text-registry font-mono font-bold">
                      {qualifier.qualificationSeed}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold break-words">
                        {qualifier.displayName}
                      </span>
                      <span className="text-muted block text-xs">
                        Regular-season No. {qualifier.regularSeasonSeed} ·{" "}
                        {qualifier.attendanceMissesUsedByQualification ??
                          qualifier.attendanceMisses}{" "}
                        attendance misses
                      </span>
                      <span
                        className={`mt-1 block text-xs font-semibold ${reinstated ? "text-copper" : "text-positive"}`}
                      >
                        {reinstated
                          ? "Reinstated to complete the four-member championship field"
                          : "Eligible qualifier"}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="border-boundary bg-surface rounded-xl border p-5">
            <h2 className="font-bold">Final Week 14 order</h2>
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
                        : "text-muted"
                    }
                  >
                    {qualifierIds.has(standing.entryId)
                      ? "Selected"
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

          <AuditDetails context="This evidence identifies the single effective qualification version and its correction lineage.">
            <dl className="space-y-3">
              <div>
                <dt className="text-muted">Effective bracket version</dt>
                <dd className="mt-1 font-semibold">
                  Version {publication.version}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Correction evidence</dt>
                <dd className="mt-1 text-xs">
                  {publication.correctionEvidence.priorVersionCount
                    ? `Supersedes ${publication.correctionEvidence.priorVersionCount} prior version${publication.correctionEvidence.priorVersionCount === 1 ? "" : "s"}.`
                    : "Original published version."}
                </dd>
              </div>
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
            Week {round.week}
          </p>
          <h3 className="mt-2 font-bold">All-member matchups</h3>
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
      <p className="text-positive mt-1 text-xs font-semibold">
        {round.matchups.length} matchups · every member received one card
      </p>
      <div className="mt-4 space-y-3">
        {round.matchups.map((matchup) => {
          const role =
            matchup.role ??
            (matchup.scope === "PLAYOFF" ? "CHAMPIONSHIP" : matchup.scope);
          return (
            <div
              className="border-boundary bg-subtle rounded-lg border p-3"
              key={matchup.id}
            >
              <p className="text-muted text-xs font-semibold">
                {matchup.label} · {roleLabels[role]}
              </p>
              {matchup.byeExhibition ? (
                <p className="text-registry mt-1 text-xs">
                  Bye exhibition · cannot affect advancement
                </p>
              ) : null}
              <div className="mt-3 space-y-2">
                <RoundEntryLine
                  advances={
                    matchup.result?.advancingEntryId === matchup.sideA.entryId
                  }
                  decision={matchup.result?.sideADecision ?? undefined}
                  entry={matchup.sideA}
                  participation={matchup.result?.sideAParticipation}
                  score={matchup.result?.sideAScoreCenticredits}
                />
                <RoundEntryLine
                  advances={
                    matchup.result?.advancingEntryId === matchup.sideB.entryId
                  }
                  decision={matchup.result?.sideBDecision ?? undefined}
                  entry={matchup.sideB}
                  participation={matchup.result?.sideBParticipation}
                  score={matchup.result?.sideBScoreCenticredits}
                />
              </div>
            </div>
          );
        })}
      </div>
      <AuditDetails
        className="mt-4 border-b-0 pb-0"
        context="This evidence identifies the effective round version and its source results."
      >
        <dl className="space-y-2">
          <div>
            <dt className="text-muted">Effective round</dt>
            <dd>Version {round.version}</dd>
          </div>
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
  participation,
  score,
}: {
  advances: boolean;
  decision?: "WIN" | "LOSS" | "TIE";
  entry: RoundEntry;
  participation?: "COMPLETED" | "EXHIBITION_MISS";
  score?: number;
}) {
  const exhibitionMiss = participation === "EXHIBITION_MISS";
  return (
    <div
      className={`flex flex-col justify-between gap-1 rounded-md px-2 py-1.5 min-[360px]:flex-row min-[360px]:items-center ${advances ? "bg-positive/10 text-positive" : ""}`}
    >
      <span className="min-w-0 text-sm font-semibold break-words">
        {entry.qualificationSeed ? `No. ${entry.qualificationSeed} · ` : ""}
        {entry.displayName}
      </span>
      <span
        className={`shrink-0 text-xs font-bold ${exhibitionMiss ? "text-copper" : "font-mono"}`}
      >
        {exhibitionMiss
          ? "Exhibition miss · 0"
          : score === undefined
            ? "—"
            : `${formatCenticredits(BigInt(score), true)}${decision ? ` · ${decision}` : ""}`}
      </span>
    </div>
  );
}
