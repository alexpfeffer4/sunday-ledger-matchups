import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRulesAndStandingsContext } from "@/application/queries/get-rules-and-standings-context";
import {
  exampleRulesetPresentation,
  seasonRulesetPresentation,
  type RulesetPresentation,
} from "@/components/rules/ruleset-presentation";
import { SeasonArchiveStandings } from "@/components/season/archive-views";
import { Stage1StandingsView } from "@/components/stage1/live-views";
import { hashRuleset } from "@/rulesets/canonicalize";
import { simulationSeason1Ruleset } from "@/rulesets/simulation-season-1";

export const metadata: Metadata = { title: "Official standings" };

export default async function StandingsPage({
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

  if (archive) {
    return <SeasonArchiveStandings archive={archive} ruleset={presentation} />;
  }
  if (live) return <Stage1StandingsView ruleset={presentation} state={live} />;
  notFound();
}
