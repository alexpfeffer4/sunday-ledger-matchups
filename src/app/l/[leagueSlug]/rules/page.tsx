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
import { hashRuleset } from "@/rulesets/canonicalize";
import { simulationSeason1Ruleset } from "@/rulesets/simulation-season-1";

export const metadata: Metadata = { title: "League rules" };

function credits(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

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
      simulationSeason1Ruleset,
      await hashRuleset(simulationSeason1Ruleset),
    );
  } else if (persistedSnapshot) {
    presentation = seasonRulesetPresentation(persistedSnapshot);
  } else {
    throw new Error("The persisted season Ruleset is unavailable.");
  }
  const ruleset = presentation.canonicalJson;
  const isV11 = ruleset.version === "1.1";
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
      body: `${credits(ruleset.card.weeklyAllocationCredits)} fresh virtual credits, ${ruleset.card.minimumPositions}–${ruleset.card.maximumPositions} picks, a ${credits(ruleset.card.minimumStakeCredits)}-credit minimum, and whole-credit stakes.${isV11 && !ruleset.card.carryoverCredits ? " Nothing carries forward." : ""}${isV11 && ruleset.card.acceptanceUnit === "WHOLE_CARD_ATOMIC" ? " Picks stay editable until Confirm and seal card accepts the complete card at once." : ""}`,
    },
    {
      title: "Markets and big-favorite limit",
      body: `${marketNames}. A favorite shorter than ${odds(ruleset.concentration.heavyFavoriteThresholdAmerican)} may use at most ${credits(ruleset.concentration.heavyFavoriteSinglePositionCapCredits)} credits; a price at ${odds(ruleset.concentration.heavyFavoriteThresholdAmerican)} or longer may use up to ${credits(ruleset.concentration.standardSinglePositionCapCredits)}. There is no blanket odds band or aggregate favorite cap.${isV11 ? " This package is settled for POC V1." : ""}`,
    },
    {
      title: "Card lock and reveal",
      body: `Cards lock ${ruleset.slate.commonLockOffsetMinutes} minutes before the first selected game.${isV11 && ruleset.slate.revealTrigger === "EVENT_START" ? " Each pick reveals when its game begins." : ""}`,
    },
    {
      title: "Scoring",
      body: isV11
        ? `A win returns stake plus profit, a loss returns zero, and a push or void returns stake. Returns round half up to ${(ruleset.settlement.precisionCenticredits / 100).toFixed(2)} credit.`
        : `Returns round half up to ${(ruleset.settlement.precisionCenticredits / 100).toFixed(2)} credit under this historical snapshot.`,
    },
    {
      title: "Attendance",
      body: isV11
        ? `An incomplete card records a loss, ${ruleset.attendance.incompleteCardPointsForCenticredits} Points For, and ${ruleset.attendance.incompleteCardMisses} miss. If both cards are incomplete, both members lose. Reaching ${ruleset.attendance.playoffIneligibilityAtMisses} regular-season misses removes playoff eligibility.`
        : `Reaching ${ruleset.attendance.playoffIneligibilityAtMisses} regular-season misses removes playoff eligibility.`,
    },
    {
      title: "Standings and playoffs",
      body:
        tiebreakers.length > 0
          ? `${tiebreakers.join(", ")}. The mini-table applies only when every tied pair has the same positive meeting count. After Week ${ruleset.schedule.regularSeasonWeeks}, the top ${qualifierCount} eligible members qualify; Week ${ruleset.schedule.championshipWeek} decides the champion and Week ${ruleset.schedule.exhibitionWeek} is exhibition only.`
          : `This historical V1.0 snapshot did not persist tiebreak metadata. Its identity remains preserved below. The regular season ends after Week ${ruleset.schedule.regularSeasonWeeks}.`,
    },
    {
      title: "Corrections and finality",
      body: `Documented NFL score corrections remain visible for ${ruleset.settlement.correctionWindowHours} hours. Season rules do not change after the snapshot freezes at roster lock.`,
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
          : presentation.frozenAt
            ? "These season rules were frozen at roster lock."
            : "These persisted season rules are published now and freeze at roster lock."
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
              ? "Frozen"
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
          <section className="border-boundary border-t pt-5">
            <h2 className="font-bold">Commissioner limits</h2>
            <p className="text-graphite mt-2 text-sm leading-6">
              Commissioners cannot read sealed picks or directly edit scores,
              records, schedules, seeds, brackets, or winners. Official
              corrections stay visible.
            </p>
          </section>
          <RulesetAuditDetails presentation={presentation} />
        </aside>
      </div>
    </PageFrame>
  );
}
