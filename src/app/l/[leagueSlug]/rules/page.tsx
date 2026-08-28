import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLiveStage1League } from "@/application/queries/get-live-stage1-league";
import { getSimulationLeague } from "@/application/queries/get-simulation-league";
import { getSimulationSeasonArchive } from "@/application/queries/get-simulation-season-archive";
import { PageFrame } from "@/components/league/page-frame";
import { StatusBadge } from "@/components/ui/status-badge";
import { hashRuleset } from "@/rulesets/canonicalize";
import { simulationSeason1Ruleset } from "@/rulesets/simulation-season-1";

export const metadata: Metadata = { title: "League rules" };

export default async function LeagueRulesPage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  const [live, archive] = await Promise.all([
    getLiveStage1League(leagueSlug),
    getSimulationSeasonArchive(leagueSlug),
  ]);
  const league = getSimulationLeague(leagueSlug);
  if (!live && !league && !archive) notFound();
  const rulesetHash = await hashRuleset(simulationSeason1Ruleset);
  const rosterSize = archive?.members.length ?? live?.members.length ?? 10;
  const qualifierCount = rosterSize <= 8 ? 4 : 6;

  const rules = [
    {
      title: "Weekly card",
      body: "Exactly 1,000 fresh virtual credits, 1–20 picks, a 50-credit minimum, and whole-credit stakes. Nothing carries forward.",
    },
    {
      title: "Markets and concentration",
      body: "Pregame winner, spread, and total markets. One pick per game and market. Favorites shorter than −200 are capped at 750 credits; every other eligible pick is capped at 1,000.",
    },
    {
      title: "Card lock and reveal",
      body: "Cards lock five minutes before the first selected game. Picks reveal only after their game kicks off.",
    },
    {
      title: "Scoring",
      body: "A win returns stake plus profit, a loss returns zero, and a push or void returns stake. Receipt returns round half up to 0.01 credit.",
    },
    {
      title: "Attendance",
      body: "An incomplete card receives an automatic loss, zero Points For, and one miss. A third regular-season miss removes playoff eligibility.",
    },
    {
      title: "Season and playoffs",
      body: `The regular season is Weeks 1–14. The top ${qualifierCount} eligible members qualify for this league’s playoffs. Week 17 decides the champion, and Week 18 is exhibition only.`,
    },
  ];

  return (
    <PageFrame
      eyebrow={`${live?.league.name ?? (archive ? "West 21st Ledger Archive" : "West 21st Ledger")} · league rules`}
      title="League rules"
      description="These rules apply to every member for the full season."
      aside={<StatusBadge tone="positive">Set for 2026</StatusBadge>}
    >
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="divide-boundary border-boundary divide-y border-y">
          {rules.map((rule) => (
            <section
              key={rule.title}
              className="grid gap-2 py-5 sm:grid-cols-[200px_1fr] sm:gap-7"
            >
              <h2 className="font-bold">{rule.title}</h2>
              <p className="text-graphite text-sm leading-6">{rule.body}</p>
            </section>
          ))}
        </div>

        <aside className="space-y-5">
          <details className="border-boundary border-y py-4">
            <summary className="cursor-pointer font-bold">
              Technical details
            </summary>
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="text-muted">Ruleset</dt>
                <dd className="mt-1 font-semibold break-words">
                  {simulationSeason1Ruleset.id}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Product baseline</dt>
                <dd className="mt-1 font-semibold">
                  {simulationSeason1Ruleset.productBibleId}
                </dd>
              </div>
              <div>
                <dt className="text-muted">SHA-256</dt>
                <dd className="mt-1 font-mono text-xs leading-5 break-all">
                  {rulesetHash}
                </dd>
              </div>
            </dl>
          </details>
          <section className="border-boundary border-t pt-5">
            <h2 className="font-bold">Commissioner limits</h2>
            <p className="text-graphite mt-2 text-sm leading-6">
              Commissioners cannot read sealed picks or edit weekly scores,
              records, schedules, seeds, brackets, or winners. Official
              corrections stay visible.
            </p>
          </section>
        </aside>
      </div>
    </PageFrame>
  );
}
