import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRulesAndStandingsContext } from "@/application/queries/get-rules-and-standings-context";
import { PageFrame } from "@/components/league/page-frame";
import {
  exampleRulesetPresentation,
  seasonRulesetPresentation,
  StandingsRulesetSummary,
  type RulesetPresentation,
} from "@/components/rules/ruleset-presentation";
import { SeasonArchiveStandings } from "@/components/season/archive-views";
import { Stage1StandingsView } from "@/components/stage1/live-views";
import { StatusBadge } from "@/components/ui/status-badge";
import { hashRuleset } from "@/rulesets/canonicalize";
import { simulationSeason1Ruleset } from "@/rulesets/simulation-season-1";

export const metadata: Metadata = { title: "Official standings" };

export default async function StandingsPage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  const {
    live,
    archive,
    persistedSnapshot,
    exampleLeague: league,
    isExample,
  } = await getRulesAndStandingsContext(leagueSlug);
  if (!live && !archive && !league) notFound();
  let presentation: RulesetPresentation;
  if (isExample) {
    presentation = exampleRulesetPresentation(
      simulationSeason1Ruleset,
      await hashRuleset(simulationSeason1Ruleset),
    );
  } else if (persistedSnapshot) {
    presentation = seasonRulesetPresentation(persistedSnapshot);
  } else {
    throw new Error("The persisted season Ruleset is unavailable.");
  }
  if (archive) {
    return <SeasonArchiveStandings archive={archive} ruleset={presentation} />;
  }
  if (live) return <Stage1StandingsView ruleset={presentation} state={live} />;
  if (!league) notFound();

  return (
    <PageFrame
      eyebrow="Example through Week 5"
      title="Standings"
      description="Read-only illustrative standings through Week 5."
      aside={<StatusBadge tone="pending">Example</StatusBadge>}
    >
      <div className="border-boundary bg-surface mt-7 overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <caption className="sr-only">
              Example standings through Week 5
            </caption>
            <thead className="bg-subtle text-muted text-xs tracking-[0.08em] uppercase">
              <tr>
                <th className="px-4 py-3 font-bold" scope="col">
                  Seed
                </th>
                <th className="px-4 py-3 font-bold" scope="col">
                  Member
                </th>
                <th className="px-4 py-3 font-bold" scope="col">
                  Record
                </th>
                <th className="px-4 py-3 font-bold" scope="col">
                  Points For
                </th>
                <th className="px-4 py-3 font-bold" scope="col">
                  All-play
                </th>
                <th className="px-4 py-3 font-bold" scope="col">
                  Misses
                </th>
                <th className="px-4 py-3 font-bold" scope="col">
                  Move
                </th>
              </tr>
            </thead>
            <tbody className="divide-boundary divide-y">
              {league.standings.map((standing) => (
                <tr
                  key={standing.id}
                  className={`${standing.isViewer ? "bg-registry/5" : ""} ${standing.seed === 6 ? "border-b-2 border-dashed border-[var(--playoff-cutline)]" : ""}`}
                >
                  <td className="px-4 py-4 font-mono font-semibold">
                    {standing.seed}
                  </td>
                  <th className="px-4 py-4" scope="row">
                    <div className="flex items-center gap-3">
                      <span className="border-boundary bg-subtle flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold">
                        {standing.initials}
                      </span>
                      <span>
                        <span className="font-bold">{standing.memberName}</span>
                        {standing.state ? (
                          <span className="text-pending ml-2 text-xs font-semibold">
                            {standing.state}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </th>
                  <td className="px-4 py-4 font-semibold">{standing.record}</td>
                  <td className="px-4 py-4 font-mono">{standing.pointsFor}</td>
                  <td className="px-4 py-4">{standing.allPlay}</td>
                  <td className="px-4 py-4">{standing.misses}</td>
                  <td className="px-4 py-4">{standing.movement}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-pending border-boundary border-t px-4 py-3 text-xs font-semibold">
          Playoff cutline follows Seed 6 · qualification is not final until Week
          14.
        </p>
      </div>

      <div className="mt-6 max-w-2xl">
        <section className="border-boundary bg-surface rounded-xl border p-5">
          <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
            Your standing
          </p>
          <h2 className="mt-2 text-lg font-bold">Pfeff · No. 5</h2>
          <p className="text-graphite mt-3 leading-6">
            3–2 official record · 5,861.60 Points For · 34–11 all-play · up two
            positions after Week 5.
          </p>
        </section>
      </div>
      <StandingsRulesetSummary presentation={presentation} />
    </PageFrame>
  );
}
