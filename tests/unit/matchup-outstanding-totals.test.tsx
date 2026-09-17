// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  leagueMatchupCardsSchema,
  type LeagueMatchupCards,
} from "@/application/queries/league-matchup-dtos";
import { projectPairedMatchup } from "@/application/queries/project-paired-matchup";
import { projectLeagueMatchup } from "@/application/queries/project-league-matchup";
import { PairedMatchupView } from "@/components/matchup/paired-matchup-view";
import {
  makePhase6State,
  unrevealableReceiptText,
} from "../fixtures/phase6-paired-matchup";

afterEach(cleanup);

function fixture(
  phase:
    | "PREGAME"
    | "LOCKED"
    | "PARTIAL_REVEAL"
    | "PROVISIONAL"
    | "FINAL" = "PARTIAL_REVEAL",
) {
  const { state, operations, now } = makePhase6State(phase);
  const cards: LeagueMatchupCards = {
    weekId: state.week!.id,
    cards: [state.viewer.entryId, state.matchup!.opponentEntryId].map(
      (entryId, i) => ({
        entryId,
        readiness: phase === "PREGAME" ? null : "COMPLIANT",
        scoreCenticredits: null,
        positions: [],
        outstanding:
          phase === "PREGAME"
            ? null
            : phase === "FINAL" || phase === "PROVISIONAL"
              ? { picks: 0, credits: 0 }
              : i === 0
                ? { picks: 2, credits: 600 }
                : { picks: 3, credits: 750 },
      }),
    ),
  };
  return {
    state,
    cards,
    operations,
    now,
    project: () =>
      projectPairedMatchup(state, operations, now, new Map(), cards)!,
  };
}

describe("post-lock outstanding matchup totals", () => {
  it.each(["LOCKED", "PARTIAL_REVEAL"] as const)(
    "shows authorized hidden-inclusive totals in %s without disclosing picks or potential returns",
    (phase) => {
      const f = fixture(phase);
      const matchup = f.project();
      expect(matchup.opponent.outstanding).toEqual({ picks: 3, credits: 750 });
      expect(matchup.scorePath.opponentRemainingMaximumCenticredits).toBeNull();
      expect(JSON.stringify(matchup)).not.toContain(unrevealableReceiptText);
      render(<PairedMatchupView matchup={matchup} refreshControl={null} />);
      expect(
        screen.getByLabelText("Alex Ledger outstanding picks and credits"),
      ).toHaveTextContent("2 picks outstanding600 credits outstanding");
      expect(
        screen.getByLabelText("Jordan Rival outstanding picks and credits"),
      ).toHaveTextContent("3 picks outstanding750 credits outstanding");
      expect(screen.queryByText("No picks remain unsettled.")).toBeNull();
    },
  );

  it("keeps totals absent pre-lock while preserving sealed status", () => {
    render(
      <PairedMatchupView
        matchup={fixture("PREGAME").project()}
        refreshControl={null}
      />,
    );
    expect(screen.queryByLabelText(/outstanding picks and credits/)).toBeNull();
    expect(screen.getByLabelText("Jordan Rival card status")).toHaveTextContent(
      "Sealed",
    );
  });

  it("distinguishes unavailable totals from an actual zero after settlement", () => {
    const f = fixture();
    delete f.cards.cards[1]!.outstanding;
    const oldPayload = leagueMatchupCardsSchema.parse(f.cards);
    const matchup = projectPairedMatchup(
      f.state,
      f.operations,
      f.now,
      new Map(),
      oldPayload,
    )!;
    render(<PairedMatchupView matchup={matchup} refreshControl={null} />);
    expect(
      screen.getByLabelText("Jordan Rival outstanding picks and credits"),
    ).toHaveTextContent("Outstanding totals unavailable");
    cleanup();
    render(
      <PairedMatchupView
        matchup={fixture("FINAL").project()}
        refreshControl={null}
      />,
    );
    expect(
      screen.queryByLabelText("Jordan Rival outstanding picks and credits"),
    ).toBeNull();
    cleanup();
    const provisional = fixture("PROVISIONAL").project();
    render(<PairedMatchupView matchup={provisional} refreshControl={null} />);
    expect(
      screen.getByLabelText("Jordan Rival outstanding picks and credits"),
    ).toHaveTextContent("0 picks outstanding0 credits outstanding");
    cleanup();
    const unavailableFinal = fixture("FINAL").project();
    unavailableFinal.opponent.outstanding = null;
    render(
      <PairedMatchupView matchup={unavailableFinal} refreshControl={null} />,
    );
    expect(
      screen.getByLabelText("Jordan Rival outstanding picks and credits"),
    ).toHaveTextContent("Outstanding totals unavailable");
  });

  it("uses the selected members' totals when browsing another pairing", () => {
    const f = fixture();
    const game = {
      ...f.state.schedule[0]!,
      id: "10000000-0000-4000-8000-000000000004",
      sideAEntryId: "10000000-0000-4000-8000-000000000005",
      sideBEntryId: "10000000-0000-4000-8000-000000000006",
      sideAName: "Soup",
      sideBName: "Lee",
      result: null,
    };
    f.state.schedule.push(game);
    f.cards.cards.push(
      {
        entryId: game.sideAEntryId,
        readiness: "COMPLIANT",
        scoreCenticredits: 0,
        positions: [],
        outstanding: { picks: 1, credits: 300 },
      },
      {
        entryId: game.sideBEntryId,
        readiness: "INCOMPLETE",
        scoreCenticredits: 0,
        positions: [],
        outstanding: { picks: 0, credits: 0 },
      },
    );
    const matchup = projectLeagueMatchup(
      f.state,
      f.project(),
      f.cards,
      game.id,
    )!;
    render(<PairedMatchupView matchup={matchup} refreshControl={null} />);
    expect(
      screen.getByLabelText("Soup outstanding picks and credits"),
    ).toHaveTextContent("1 pick outstanding300 credits outstanding");
    expect(
      screen.getByLabelText("Lee outstanding picks and credits"),
    ).toHaveTextContent("0 picks outstanding0 credits outstanding");
    expect(Object.values(matchup.rows).flat()).toHaveLength(0);
  });

  it("does not carry another week's totals into the current matchup", () => {
    const f = fixture();
    f.cards.weekId = "10000000-0000-4000-8000-000000000099";
    expect(f.project().self.outstanding).toBeNull();
    expect(f.project().opponent.outstanding).toBeNull();
  });
});
