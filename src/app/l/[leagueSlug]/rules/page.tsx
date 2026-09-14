import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRulesAndStandingsContext } from "@/application/queries/get-rules-and-standings-context";
import { PageFrame } from "@/components/league/page-frame";
import {
  exampleRulesetPresentation,
  RulesetAuditDetails,
  rulesetTiebreakLabels,
  seasonRulesetPresentation,
  type RulesetPresentation,
} from "@/components/rules/ruleset-presentation";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCredits } from "@/domain/odds/american";
import { usesRollingSubmissions } from "@/rulesets/card-rules";
import { hashRuleset } from "@/rulesets/canonicalize";
import { simulationSeason11Ruleset } from "@/rulesets/simulation-season-1-1";

export const metadata: Metadata = { title: "League rules" };

function odds(value: number): string {
  return value < 0 ? `−${Math.abs(value)}` : `+${value}`;
}

export default async function LeagueRulesPage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>;
}) {
  const { leagueSlug } = await params;
  const { live, archive, persistedSnapshot, isExample } =
    await getRulesAndStandingsContext(leagueSlug);
  if (!live && !archive) notFound();

  let presentation: RulesetPresentation;
  if (isExample) {
    presentation = exampleRulesetPresentation(
      simulationSeason11Ruleset,
      await hashRuleset(simulationSeason11Ruleset),
    );
  } else if (persistedSnapshot) {
    presentation = seasonRulesetPresentation(persistedSnapshot);
  } else {
    throw new Error("The persisted season Ruleset is unavailable.");
  }
  const ruleset = presentation.canonicalJson;
  const hasExpandedLifecycle = ruleset.version !== "1.0";
  const rolling = usesRollingSubmissions(ruleset);
  // The separately approved visibility amendment also covers the current
  // legacy week. Presence distinguishes the deployed projection from an old DB.
  const currentGameVisibility =
    !rolling &&
    !isExample &&
    live?.matchup?.opponentSelectedGames !== undefined;
  const phase8APlayoffRules =
    hasExpandedLifecycle && "minimumChampionshipField" in ruleset.playoffs
      ? ruleset.playoffs
      : null;
  const rosterSize = archive?.members.length ?? live?.members.length ?? 10;
  const qualifierCount =
    rosterSize <= ruleset.playoffs.smallLeagueMaximumSize
      ? ruleset.playoffs.smallLeagueQualifiers
      : ruleset.playoffs.largeLeagueQualifiers;
  const tiebreakers = rulesetTiebreakLabels(ruleset);
  const marketNames = ruleset.markets.eligible
    .map((market) =>
      market === "MONEYLINE"
        ? "game winner"
        : market === "SPREAD"
          ? "spread"
          : "total",
    )
    .join(", ");
  const rules = [
    {
      title: "Weekly card",
      body: `${formatCredits(ruleset.card.weeklyAllocationCredits)} fresh virtual credits, ${ruleset.card.minimumPositions}–${ruleset.card.maximumPositions} picks, a ${formatCredits(ruleset.card.minimumStakeCredits)}-credit minimum, and whole-credit stakes.${hasExpandedLifecycle && "carryoverCredits" in ruleset.card && !ruleset.card.carryoverCredits ? " Nothing carries forward." : ""}${hasExpandedLifecycle && "acceptanceUnit" in ruleset.card && ruleset.card.acceptanceUnit === "WHOLE_CARD_ATOMIC" ? " Picks stay editable until Confirm and seal card accepts the complete card at once." : rolling ? " Review and submit one or several bets at a time, then return to add more. Each batch is accepted together; submitted selections, odds and stakes cannot be edited, canceled or topped up. Drafts stay editable and never submit automatically. Partial allocation is valid." : ""}`,
    },
    {
      title: "Markets and big-favorite limit",
      body: `${marketNames}. A favorite shorter than ${odds(ruleset.concentration.heavyFavoriteThresholdAmerican)} may use at most ${formatCredits(ruleset.concentration.heavyFavoriteSinglePositionCapCredits)} credits; a price at ${odds(ruleset.concentration.heavyFavoriteThresholdAmerican)} or longer may use up to ${formatCredits(ruleset.concentration.standardSinglePositionCapCredits)}. There is no blanket odds band or aggregate favorite cap.${hasExpandedLifecycle ? " This package is settled for POC V1." : ""}`,
    },
    {
      title: rolling ? "Game cutoffs and reveal" : "Card lock and reveal",
      body: rolling
        ? "Each game closes for bets at its published kickoff cutoff, or earlier if it starts. A closed game does not reopen after a delay. As soon as a bet is accepted, league members see that game once, without a bet count or per-game credits. Selections, markets, odds and stakes stay private until the game's start is confirmed. Whole-card unsettled totals and unused available credits become visible five minutes before the first slate game. Later games remain open for submissions until their own cutoffs."
        : `Cards lock ${ruleset.slate.commonLockOffsetMinutes} minutes before the first selected game.${hasExpandedLifecycle && "revealTrigger" in ruleset.slate && ruleset.slate.revealTrigger === "EVENT_START" ? " Each pick reveals when its game begins." : ""}`,
    },
    ...(currentGameVisibility
      ? [
          {
            title: "Current-week game visibility",
            body: "League members can now see games already selected in this week, and a newly accepted submission makes its games visible immediately. Each game appears once, without a per-game bet count or credit breakdown. Markets, selections, lines, odds and stakes stay hidden until the game's start is confirmed. This visibility amendment does not reopen betting or change this week's full-card submission, deadline, credit or scoring rules. Drafts remain private; the existing timing for whole-card outstanding totals stays the same.",
          },
        ]
      : []),
    {
      title: "Scoring",
      body:
        hasExpandedLifecycle && "winReturn" in ruleset.settlement
          ? `A win returns stake plus profit, a loss returns zero, and a push or void returns stake. Returns round half up to ${(ruleset.settlement.precisionCenticredits / 100).toFixed(2)} credit.${rolling ? " Unused credits expire at the final eligible game's cutoff and contribute zero; a 600-credit +100 winner scores 1,200 even if 400 credits expire. Returned stakes and winnings never replenish spendable credits." : ""}`
          : `Returns round half up to ${(ruleset.settlement.precisionCenticredits / 100).toFixed(2)} credit under this historical snapshot.`,
    },
    {
      title: "Attendance",
      body: rolling
        ? `At least one accepted bet participates normally. Zero accepted bets at weekly entry closure records a loss, zero Points For and one regular-season miss; if both members submit nothing, both lose. ${ruleset.attendance.playoffIneligibilityAtMisses} regular-season misses remove playoff eligibility. A partial card never creates an attendance miss. Exhibition misses stay outside official records and eligibility.`
        : hasExpandedLifecycle &&
            "incompleteCardPointsForCenticredits" in ruleset.attendance
          ? `An incomplete card records a loss, ${ruleset.attendance.incompleteCardPointsForCenticredits} Points For, and ${ruleset.attendance.incompleteCardMisses} miss. If both cards are incomplete, both members lose. Reaching ${ruleset.attendance.playoffIneligibilityAtMisses} regular-season misses removes playoff eligibility.`
          : `Reaching ${ruleset.attendance.playoffIneligibilityAtMisses} regular-season misses removes playoff eligibility.`,
    },
    {
      title: "Standings and playoffs",
      body:
        tiebreakers.length > 0
          ? phase8APlayoffRules
            ? `${tiebreakers.join(", ")}. The mini-table applies only when every tied pair has the same positive meeting count. After Week ${ruleset.schedule.regularSeasonWeeks}, eligible members are selected first in frozen standings order. If fewer than ${phase8APlayoffRules.minimumChampionshipField} are eligible, the next members are reinstated only until the championship field reaches ${phase8APlayoffRules.minimumChampionshipField}. Every member receives one matchup and one card in Weeks 15–17; only championship games advance the bracket. Third-place, placement, and exhibition games stay separately labeled, and ${rolling ? "an exhibition with zero submitted bets" : "an incomplete exhibition"} records an Exhibition miss with zero exhibition score but no regular-season or official competitive effect.`
            : `${tiebreakers.join(", ")}. The mini-table applies only when every tied pair has the same positive meeting count. After Week ${ruleset.schedule.regularSeasonWeeks}, the top ${qualifierCount} eligible members qualify; Week ${ruleset.schedule.championshipWeek} decides the champion and Week ${ruleset.schedule.exhibitionWeek} is exhibition only.`
          : `This historical V1.0 snapshot did not persist tiebreak metadata. Its identity remains preserved below. The regular season ends after Week ${ruleset.schedule.regularSeasonWeeks}.`,
    },
    {
      title: "Corrections and finality",
      body: `${rolling ? "Results finalize automatically once no valid new bets can be added and all accepted bets are resolved. Nobody receives a zero-bet loss before weekly entry closes. " : ""}Documented NFL score corrections remain visible for ${ruleset.settlement.correctionWindowHours} hours. During development, approved submission and scoring updates apply when the next week opens. An open week, its accepted bets, and earlier results keep their original rules.`,
    },
  ];
  const leagueLabel =
    live?.league.name ??
    (presentation.context === "EXAMPLE"
      ? "Example Season"
      : ruleset.seasonLabel);

  return (
    <PageFrame
      eyebrow={`${leagueLabel} · ${presentation.context === "EXAMPLE" ? "illustrative" : presentation.mode === "LIVE" ? "Live" : "Simulation"} rules`}
      title={
        presentation.context === "EXAMPLE" ? "Example rules" : "League rules"
      }
      description={
        presentation.context === "EXAMPLE"
          ? "Illustrative Ruleset values for this read-only Example Season."
          : presentation.throughWeek
            ? `Rules for Week ${presentation.throughWeek}. Submission and scoring updates take effect in future weeks; earlier play keeps its rules.`
            : "Starting rules for this season. During development, approved submission and scoring updates can take effect when a new week opens."
      }
      aside={
        <StatusBadge
          tone={
            presentation.context === "EXAMPLE"
              ? "pending"
              : presentation.frozenAt
                ? "positive"
                : "sealed"
          }
        >
          {presentation.context === "EXAMPLE"
            ? "Example Season"
            : presentation.frozenAt
              ? "Recorded"
              : "Published"}
        </StatusBadge>
      }
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
          {presentation.weekRules && presentation.weekRules.length > 0 ? (
            <section className="border-boundary border-t pt-5">
              <h2 className="font-bold">Rules by week</h2>
              <ul className="text-graphite mt-2 space-y-1 text-sm">
                {presentation.weekRules.map((item) => (
                  <li key={item.week}>
                    Week {item.week} · Rules v{item.version}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section className="border-boundary border-t pt-5">
            <h2 className="font-bold">Commissioner limits</h2>
            <p className="text-graphite mt-2 text-sm leading-6">
              Commissioners cannot read unrevealed bet details or directly edit
              scores, records, schedules, seeds, brackets, or winners. Official
              corrections stay visible.
            </p>
          </section>
          <RulesetAuditDetails presentation={presentation} />
        </aside>
      </div>
    </PageFrame>
  );
}
