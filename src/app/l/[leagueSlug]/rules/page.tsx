import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLiveStage1League } from "@/application/queries/get-live-stage1-league";
import { getSimulationLeague } from "@/application/queries/get-simulation-league";
import { PageFrame } from "@/components/league/page-frame";
import { StatusBadge } from "@/components/ui/status-badge";
import { hashRuleset } from "@/rulesets/canonicalize";
import { simulationSeason1Ruleset } from "@/rulesets/simulation-season-1";

export const metadata: Metadata = { title: "Frozen league rules" };

export default async function LeagueRulesPage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  const live = await getLiveStage1League(leagueSlug);
  const league = getSimulationLeague(leagueSlug);
  if (!live && !league) notFound();
  const rulesetHash = await hashRuleset(simulationSeason1Ruleset);
  const qualifierCount = live && live.members.length <= 8 ? 4 : 6;

  const rules = [
    {
      title: "Weekly card",
      body: "Exactly 1,000 fresh virtual credits, 1–20 positions, 50-credit minimum, and whole-credit stakes. Nothing carries forward.",
    },
    {
      title: "Markets and concentration",
      body: "Main pregame winner, spread, and total markets. One position per event-market. Favorites shorter than −200 are capped at 750 credits; every other eligible position is capped at 1,000.",
    },
    {
      title: "Common lock and reveal",
      body: "Common lock is five minutes before the earliest designated game. Positions reveal only when their event is reliably live, never from scheduled time alone.",
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
      body: `The regular season is Weeks 1–14. This league qualifies the top ${qualifierCount} eligible entries under its frozen roster-size rule. Week 17 decides the champion and Week 18 is exhibition only.`,
    },
  ];

  return (
    <PageFrame
      eyebrow={`${live?.league.name ?? "West 21st Ledger"} · participant rulebook`}
      title="Frozen simulation rules"
      description="The canonical snapshot is visible to every member and remains linked to receipts, results, standings, brackets, corrections, and history."
      aside={<StatusBadge tone="positive">Frozen</StatusBadge>}
    >
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="border-boundary bg-surface divide-boundary divide-y rounded-xl border px-5 sm:px-6">
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
          <section className="border-boundary bg-surface rounded-xl border p-5">
            <p className="text-registry text-xs font-bold tracking-[0.09em] uppercase">
              Snapshot identity
            </p>
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
          </section>
          <section className="border-boundary bg-subtle rounded-xl border p-5">
            <h2 className="font-bold">Trust boundary</h2>
            <p className="text-graphite mt-2 text-sm leading-6">
              Commissioners cannot read sealed positions or edit weekly scores,
              records, schedules, seeds, brackets, or winners. Corrections
              append objective evidence and a reason.
            </p>
          </section>
        </aside>
      </div>
    </PageFrame>
  );
}
