// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { seasonRulesetSnapshotSchema } from "@/application/queries/season-ruleset-dtos";
import {
  exampleRulesetPresentation,
  seasonRulesetPresentation,
  StandingsRulesetSummary,
} from "@/components/rules/ruleset-presentation";
import { simulationSeason11Ruleset } from "@/rulesets/simulation-season-1-1";
import { simulationSeason1Ruleset } from "@/rulesets/simulation-season-1";
import { frozenCardRulesFixture } from "../fixtures/card-rules";

describe("Ruleset presentation", () => {
  it("shows historical standings rules while the next week uses an upgrade", () => {
    const previous = {
      ...frozenCardRulesFixture("SIMULATION", simulationSeason11Ruleset),
      sha256Hash: "b".repeat(64),
    };
    const current = seasonRulesetSnapshotSchema.parse({
      ...frozenCardRulesFixture("SIMULATION"),
      throughWeek: 2,
      weekRules: [
        {
          week: 1,
          version: "1.1",
          snapshotId: "00000000-0000-4000-8000-000000000001",
          sha256Hash: previous.sha256Hash,
        },
        {
          week: 2,
          version: "1.2",
          snapshotId: "00000000-0000-4000-8000-000000000002",
          sha256Hash: "a".repeat(64),
        },
      ],
      priorRules: [previous],
    });
    const historical = seasonRulesetPresentation(current, 1);
    expect(historical.rulesetVersion).toBe("1.1");
    expect(historical.sha256Hash).toBe(previous.sha256Hash);
    expect(historical.canonicalJson).toEqual(previous.canonicalJson);
    expect(seasonRulesetPresentation(current, 2).rulesetVersion).toBe("1.2");
    expect(seasonRulesetPresentation(current).throughWeek).toBe(2);
    expect(() => seasonRulesetPresentation(current, 3)).toThrow(
      "The rules for these standings are unavailable.",
    );
  });
  it("explains the persisted tiebreak order before technical evidence", () => {
    render(
      <StandingsRulesetSummary
        presentation={exampleRulesetPresentation(
          simulationSeason1Ruleset,
          "a".repeat(64),
        )}
      />,
    );

    expect(screen.getByText("How ties are ordered")).toBeInTheDocument();
    expect(screen.getByText(/Matchup win percentage/)).toHaveTextContent(
      /Stored deterministic random tiebreak value/,
    );
    expect(screen.queryByText(/All-play percentage/)).not.toBeInTheDocument();
    expect(screen.getByText("Audit details")).toBeInTheDocument();
    expect(
      screen.getByText("Illustrative only · not a season snapshot"),
    ).toBeInTheDocument();
  });

  it("keeps the frozen V1.1 tiebreak visible as historical rules evidence", () => {
    render(
      <StandingsRulesetSummary
        presentation={exampleRulesetPresentation(
          simulationSeason11Ruleset,
          "b".repeat(64),
        )}
      />,
    );

    expect(screen.getByText(/All-play percentage/)).toBeInTheDocument();
    cleanup();
  });

  it("rejects metadata that disagrees with canonical snapshot identity", () => {
    const parsed = seasonRulesetSnapshotSchema.safeParse({
      rulesetId: "FORGED-RULESET",
      rulesetVersion: simulationSeason1Ruleset.version,
      productBibleId: simulationSeason1Ruleset.productBibleId,
      productBibleVersion: simulationSeason1Ruleset.productBibleVersion,
      mode: simulationSeason1Ruleset.mode,
      canonicalJson: simulationSeason1Ruleset,
      sha256Hash: "a".repeat(64),
      publishedAt: "2026-08-28T00:00:00Z",
      frozenAt: null,
    });

    expect(parsed.success).toBe(false);
  });
});
