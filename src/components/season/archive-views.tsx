import Link from "next/link";
import type { SimulationSeasonArchiveDto } from "@/application/queries/season-archive-dtos";
import { PageFrame } from "@/components/league/page-frame";
import {
  StandingsRulesetSummary,
  type RulesetPresentation,
} from "@/components/rules/ruleset-presentation";
import { StatusBadge } from "@/components/ui/status-badge";

function score(centicredits: number): string {
  return (centicredits / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function memberName(
  archive: SimulationSeasonArchiveDto,
  entryId: string,
): string {
  return (
    archive.members.find((member) => member.entryId === entryId)?.displayName ??
    "Unknown member"
  );
}

function matchupLine(
  archive: SimulationSeasonArchiveDto,
  matchup: SimulationSeasonArchiveDto["week18"][number],
) {
  return {
    sideA: memberName(archive, matchup.sideAEntryId),
    sideB: memberName(archive, matchup.sideBEntryId),
    winner: matchup.winnerEntryId
      ? memberName(archive, matchup.winnerEntryId)
      : null,
  };
}

export function SeasonArchiveHome({
  archive,
  leagueSlug,
}: {
  archive: SimulationSeasonArchiveDto;
  leagueSlug: string;
}) {
  const isExample = archive.mode === "SIMULATION";
  const champion = memberName(archive, archive.playoffs.championEntryId);
  const runnerUp = memberName(archive, archive.playoffs.runnerUpEntryId);
  const third = archive.playoffs.thirdPlaceEntryId
    ? memberName(archive, archive.playoffs.thirdPlaceEntryId)
    : null;
  const viewer = archive.regularSeason.finalStandings.find(
    (standing) => standing.entryId === archive.viewerEntryId,
  );

  return (
    <PageFrame
      eyebrow={
        isExample
          ? "Example Season · read-only illustration"
          : `${archive.nflYear} season · official archive`
      }
      title={
        isExample
          ? `${champion} won this Example Season`
          : `${champion} won the Ledger`
      }
      description={
        isExample
          ? "A neutral, noncompetitive illustration of a complete regular season, playoffs, champion, and Week 18 exhibitions. Nothing here can be changed."
          : "The complete regular season, playoff bracket, champion, and official corrections are saved here."
      }
      aside={
        <StatusBadge tone={isExample ? "pending" : "positive"}>
          {isExample ? "Example Season" : "Season final"}
        </StatusBadge>
      }
    >
      <section className="border-champion bg-archive mt-7 rounded-xl border-2 p-6 sm:p-8">
        <p className="text-champion text-xs font-bold tracking-[0.12em] uppercase">
          {isExample ? "Example champion" : `${archive.nflYear} champion`}
        </p>
        <div className="mt-4 grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <h2 className="text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
              {champion}
            </h2>
            <p className="text-graphite mt-2">
              Defeated {runnerUp} in Week 17 ·{" "}
              {third
                ? `${third} finished third`
                : "the third-place matchup finished tied"}
            </p>
          </div>
          <Link
            className="text-action inline-flex min-h-11 items-center font-semibold hover:underline"
            href={`/l/${leagueSlug}/playoffs`}
          >
            Open final bracket
          </Link>
        </div>
      </section>

      <div className="border-boundary mt-6 grid gap-x-6 border-y sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Regular season", "14 weeks"],
          [
            isExample ? "Illustrative matchups" : "Official matchups",
            `${archive.schedule.matchups.length}`,
          ],
          ["Playoff field", `Top ${archive.playoffs.qualifierCount} eligible`],
          ["Week 18", `${archive.week18.length} exhibitions`],
        ].map(([label, value]) => (
          <section className="p-5" key={label}>
            <p className="text-muted text-xs font-bold tracking-[0.08em] uppercase">
              {label}
            </p>
            <p className="mt-2 text-lg font-bold">{value}</p>
          </section>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="border-boundary bg-surface rounded-xl border p-6">
          <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
            Season record
          </p>
          <h2 className="mt-2 text-xl font-bold">
            The full season at a glance
          </h2>
          <p className="text-graphite mt-3 max-w-3xl leading-7">
            Review all {archive.regularSeason.weeks.length} regular-season
            weeks, {archive.schedule.matchups.length} matchups, every final
            card, the playoff path, and the Week 18 exhibitions.
          </p>
          <div className="mt-5 flex flex-wrap gap-4">
            <Link
              className="text-action inline-flex min-h-11 items-center font-semibold hover:underline"
              href={`/l/${leagueSlug}/schedule`}
            >
              Review all 14 weeks
            </Link>
            <Link
              className="text-action inline-flex min-h-11 items-center font-semibold hover:underline"
              href={`/l/${leagueSlug}/history`}
            >
              Open matchup history
            </Link>
          </div>
        </section>
        {viewer ? (
          <aside className="border-boundary bg-surface rounded-xl border p-5">
            <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
              Your final line
            </p>
            <h2 className="mt-2 text-xl font-bold">
              No. {viewer.seed} · {viewer.wins}–{viewer.losses}
              {viewer.ties > 0 ? `–${viewer.ties}` : ""}
            </h2>
            <dl className="divide-boundary mt-4 divide-y text-sm">
              <div className="flex justify-between gap-4 py-3 first:pt-0">
                <dt>Points For</dt>
                <dd className="font-mono font-semibold">
                  {score(viewer.pointsForCenticredits)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt>Attendance misses</dt>
                <dd className="font-semibold">{viewer.attendanceMisses}</dd>
              </div>
              <div className="flex justify-between gap-4 py-3 last:pb-0">
                <dt>Playoff state</dt>
                <dd className="font-semibold">
                  {archive.playoffs.qualifiers.some(
                    (qualifier) => qualifier.entryId === viewer.entryId,
                  )
                    ? "Qualified"
                    : "Did not qualify"}
                </dd>
              </div>
            </dl>
          </aside>
        ) : null}
      </div>
    </PageFrame>
  );
}

export function SeasonArchiveSchedule({
  archive,
}: {
  archive: SimulationSeasonArchiveDto;
}) {
  const isExample = archive.mode === "SIMULATION";
  return (
    <PageFrame
      eyebrow={
        isExample
          ? "Example Season · read-only schedule"
          : "Published at roster lock · final"
      }
      title={`${archive.nflYear} regular-season schedule`}
      description={
        isExample
          ? "Illustrative neutral pairings for all 14 regular-season weeks. This static schedule is not Live or authoritative Simulation competition."
          : "One opponent per member in every scoring week. Pairing frequencies are balanced, consecutive rematches are absent, and the publication remained unchanged through the season."
      }
      aside={
        <StatusBadge tone={isExample ? "pending" : "positive"}>
          {isExample ? "Example Season" : "14 weeks final"}
        </StatusBadge>
      }
    >
      <details className="border-boundary mt-7 border-y py-4">
        <summary className="cursor-pointer font-bold">
          Technical schedule details
        </summary>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted">Algorithm</dt>
            <dd className="mt-1 font-semibold">
              {archive.schedule.algorithmVersion}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Schedule seed</dt>
            <dd className="mt-1 truncate font-mono text-xs">
              {archive.schedule.seed}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Output hash</dt>
            <dd className="mt-1 truncate font-mono text-xs">
              {archive.schedule.outputHash}
            </dd>
          </div>
        </dl>
      </details>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {archive.regularSeason.weeks.map((week) => (
          <section
            className="border-boundary bg-surface rounded-xl border p-5"
            key={week.week}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold">Week {week.week}</h2>
              <span className="text-positive text-xs font-semibold">Final</span>
            </div>
            <div className="divide-boundary mt-3 divide-y">
              {week.matchups.map((matchup) => {
                const line = matchupLine(archive, matchup);
                return (
                  <div className="py-3 text-sm" key={matchup.id}>
                    <div className="flex justify-between gap-3">
                      <span
                        className={
                          matchup.winnerEntryId === matchup.sideAEntryId
                            ? "font-bold"
                            : ""
                        }
                      >
                        {line.sideA}
                      </span>
                      <span className="font-mono">
                        {score(matchup.sideAScoreCenticredits)}
                      </span>
                    </div>
                    <div className="mt-1 flex justify-between gap-3">
                      <span
                        className={
                          matchup.winnerEntryId === matchup.sideBEntryId
                            ? "font-bold"
                            : ""
                        }
                      >
                        {line.sideB}
                      </span>
                      <span className="font-mono">
                        {score(matchup.sideBScoreCenticredits)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </PageFrame>
  );
}

export function SeasonArchiveStandings({
  archive,
  ruleset,
}: {
  archive: SimulationSeasonArchiveDto;
  ruleset: RulesetPresentation;
}) {
  const qualifierIds = new Set(
    archive.playoffs.qualifiers.map((qualifier) => qualifier.entryId),
  );
  return (
    <PageFrame
      eyebrow={
        ruleset.context === "EXAMPLE"
          ? "Example Season through Week 14"
          : "Official through Week 14"
      }
      title={
        ruleset.context === "EXAMPLE"
          ? "Example regular-season standings"
          : "Final regular-season standings"
      }
      description={
        ruleset.context === "EXAMPLE"
          ? "Read-only illustrative standings with the complete published tiebreak chain below."
          : "Record comes first, followed by Points For, all-play, attendance, and the league’s published final tiebreaker."
      }
      aside={
        <StatusBadge
          tone={ruleset.context === "EXAMPLE" ? "pending" : "positive"}
        >
          {ruleset.context === "EXAMPLE"
            ? "Example Season"
            : "Qualification final"}
        </StatusBadge>
      }
    >
      <div className="border-boundary bg-surface mt-7 overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <caption className="sr-only">
              Final {archive.nflYear} season standings
            </caption>
            <thead className="bg-subtle text-muted text-xs tracking-[0.08em] uppercase">
              <tr>
                {[
                  "Seed",
                  "Member",
                  "Record",
                  "Points For",
                  "All-play",
                  "Misses",
                  "Playoffs",
                ].map((heading) => (
                  <th className="px-4 py-3 font-bold" key={heading} scope="col">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-boundary divide-y">
              {archive.regularSeason.finalStandings.map((standing) => (
                <tr
                  className={
                    standing.entryId === archive.viewerEntryId
                      ? "bg-registry/5"
                      : ""
                  }
                  key={standing.entryId}
                >
                  <td className="px-4 py-4 font-mono font-semibold">
                    {standing.seed}
                  </td>
                  <th className="px-4 py-4">{standing.displayName}</th>
                  <td className="px-4 py-4">
                    {standing.wins}–{standing.losses}
                    {standing.ties > 0 ? `–${standing.ties}` : ""}
                  </td>
                  <td className="px-4 py-4 font-mono">
                    {score(standing.pointsForCenticredits)}
                  </td>
                  <td className="px-4 py-4">
                    {standing.allPlayHalfWinUnits / 2}–
                    {standing.allPlayComparisonCount -
                      standing.allPlayHalfWinUnits / 2}
                  </td>
                  <td className="px-4 py-4">{standing.attendanceMisses}</td>
                  <td className="px-4 py-4 font-semibold">
                    {!standing.playoffEligible
                      ? "Ineligible"
                      : qualifierIds.has(standing.entryId)
                        ? "Qualified"
                        : "Outside field"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <StandingsRulesetSummary presentation={ruleset} />
    </PageFrame>
  );
}

export function SeasonArchivePlayoffs({
  archive,
}: {
  archive: SimulationSeasonArchiveDto;
}) {
  const isExample = archive.mode === "SIMULATION";
  const champion = memberName(archive, archive.playoffs.championEntryId);
  return (
    <PageFrame
      eyebrow={
        isExample
          ? "Example Season · illustrative playoffs"
          : `${archive.nflYear} playoffs · official`
      }
      title={`${champion} completed ${isExample ? "this example bracket" : "the bracket"}`}
      description={
        isExample
          ? "A read-only illustration of qualification, reseeding, the title path, and separate Week 18 exhibitions."
          : "Qualification froze after Week 14. Opening-round winners were reseeded, an exact tie would have advanced the higher qualification seed, and Week 18 remained outside the title path."
      }
      aside={
        <StatusBadge tone={isExample ? "pending" : "positive"}>
          {isExample ? "Example Season" : "Bracket final"}
        </StatusBadge>
      }
    >
      <div className="mt-7 grid gap-5 lg:grid-cols-3">
        {[15, 16, 17].map((week) => {
          const games = archive.playoffs.games.filter(
            (game) => game.week === week,
          );
          return (
            <section
              aria-labelledby={`playoff-week-${week}`}
              className="border-boundary bg-surface rounded-xl border p-5"
              key={week}
            >
              <h2 id={`playoff-week-${week}`} className="font-bold">
                {week === 15
                  ? "Week 15 · opening round"
                  : week === 16
                    ? "Week 16 · semifinals"
                    : "Week 17 · finals"}
              </h2>
              {week === 15 && archive.playoffs.qualifierCount === 6 ? (
                <p className="text-muted mt-2 text-xs">
                  Seeds 1 and 2 advanced on explicit byes.
                </p>
              ) : null}
              <div className="mt-4 space-y-4">
                {games.map((game) => {
                  const line = matchupLine(archive, game);
                  return (
                    <article
                      className="border-boundary bg-subtle rounded-lg border p-4"
                      key={game.id}
                    >
                      <p className="text-muted text-xs font-semibold">
                        {game.label}
                      </p>
                      <div className="mt-3 flex justify-between gap-3 text-sm">
                        <span
                          className={
                            game.winnerEntryId === game.sideAEntryId
                              ? "font-bold"
                              : ""
                          }
                        >
                          {line.sideA}
                        </span>
                        <span className="font-mono">
                          {score(game.sideAScoreCenticredits)}
                        </span>
                      </div>
                      <div className="mt-2 flex justify-between gap-3 text-sm">
                        <span
                          className={
                            game.winnerEntryId === game.sideBEntryId
                              ? "font-bold"
                              : ""
                          }
                        >
                          {line.sideB}
                        </span>
                        <span className="font-mono">
                          {score(game.sideBScoreCenticredits)}
                        </span>
                      </div>
                      <p className="text-positive mt-3 text-xs font-semibold">
                        {line.winner
                          ? `${line.winner} ${game.scope === "PLAYOFF" ? "advanced" : "won"}${game.advancementReason ? ` · ${game.advancementReason.toLowerCase().replaceAll("_", " ")}` : ""}`
                          : "Matchup finished tied"}
                      </p>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <section className="border-boundary bg-archive mt-6 rounded-xl border p-5">
        <h2 className="font-bold">Week 18 stayed exhibition-only</h2>
        <p className="text-graphite mt-2 text-sm leading-6">
          {archive.week18.length} final-week matchups were retained in history.
          None changed the champion, regular-season record, qualification seed,
          or playoff result.
        </p>
      </section>
    </PageFrame>
  );
}

export function SeasonArchiveHistory({
  archive,
}: {
  archive: SimulationSeasonArchiveDto;
}) {
  const isExample = archive.mode === "SIMULATION";
  const games = [
    ...archive.regularSeason.weeks.flatMap((week) => week.matchups),
    ...archive.playoffs.games,
    ...archive.week18,
  ]
    .filter((game) =>
      [game.sideAEntryId, game.sideBEntryId].includes(archive.viewerEntryId),
    )
    .sort((left, right) => left.week - right.week);
  const viewer = memberName(archive, archive.viewerEntryId);

  return (
    <PageFrame
      eyebrow={
        isExample ? "Example Season · read-only history" : "Season history"
      }
      title={`${viewer}’s ${archive.nflYear} matchup history`}
      description={
        isExample
          ? "Illustrative regular-season, playoff, placement, and exhibition results are labelled separately."
          : "Regular season, playoff, placement, and exhibition results are tracked separately."
      }
      aside={
        <StatusBadge tone={isExample ? "pending" : "positive"}>
          {isExample ? "Example Season" : "Archive complete"}
        </StatusBadge>
      }
    >
      <section className="border-boundary bg-surface mt-7 overflow-hidden rounded-xl border">
        <div className="divide-boundary divide-y">
          {games.map((game) => {
            const viewerIsA = game.sideAEntryId === archive.viewerEntryId;
            const opponentId = viewerIsA
              ? game.sideBEntryId
              : game.sideAEntryId;
            const viewerScore = viewerIsA
              ? game.sideAScoreCenticredits
              : game.sideBScoreCenticredits;
            const opponentScore = viewerIsA
              ? game.sideBScoreCenticredits
              : game.sideAScoreCenticredits;
            const decision = viewerIsA
              ? game.sideADecision
              : game.sideBDecision;
            return (
              <article
                className="grid gap-3 p-4 sm:grid-cols-[120px_1fr_auto] sm:items-center sm:p-5"
                key={game.id}
              >
                <div>
                  <p className="font-bold">Week {game.week}</p>
                  <p className="text-muted mt-1 text-xs">{game.scope}</p>
                </div>
                <div>
                  <p className="font-semibold">
                    {viewer} vs {memberName(archive, opponentId)}
                  </p>
                  <p className="text-muted mt-1 text-xs">{game.label}</p>
                </div>
                <p className="font-mono text-sm font-semibold">
                  <span
                    className={
                      decision === "WIN"
                        ? "text-positive"
                        : decision === "LOSS"
                          ? "text-negative"
                          : "text-pending"
                    }
                  >
                    {decision === "WIN" ? "W" : decision === "LOSS" ? "L" : "T"}
                  </span>{" "}
                  {score(viewerScore)}–{score(opponentScore)}
                </p>
              </article>
            );
          })}
        </div>
      </section>
    </PageFrame>
  );
}
