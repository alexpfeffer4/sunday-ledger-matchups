// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CommissionerCardStatusPanel } from "@/components/commissioner/card-status";
import { Stage1CommissionerView } from "@/components/stage1/live-views";
import { makePhase6State } from "../fixtures/phase6-paired-matchup";

vi.mock("server-only", () => ({}));
afterEach(cleanup);
const status = {
  weekId: "85000000-0000-4000-8000-000000000001",
  nflWeek: 1,
  cards: [
    { entryId: "one", displayName: "Alex", sealed: true },
    { entryId: "two", displayName: "Drew", sealed: false },
    { entryId: "three", displayName: "Jordan", sealed: null },
  ],
};
it("counts only confirmed seals and distinguishes unavailable status", () => {
  render(<CommissionerCardStatusPanel status={status} />);
  expect(screen.getByText("1 of 3 cards sealed")).toBeVisible();
  expect(screen.getByText("Alex").closest("li")).toHaveTextContent("Sealed");
  expect(screen.getByText("Drew").closest("li")).toHaveTextContent(
    "Not sealed",
  );
  expect(screen.getByText("Jordan").closest("li")).toHaveTextContent(
    "Status unavailable",
  );
  expect(screen.getByText(/published deadline applies/)).toBeVisible();
});
it("does not turn a failed read into zero sealed cards", () => {
  render(<CommissionerCardStatusPanel status={null} />);
  expect(screen.getByText(/Card status is unavailable/)).toBeVisible();
  expect(screen.queryByText(/0 of/)).toBeNull();
});
it("does not render the roster for a member even if status was passed", () => {
  const { state } = makePhase6State("PREGAME");
  state.commissioner.isCommissioner = false;
  render(
    <Stage1CommissionerView
      state={state}
      cardStatus={status}
      invites={[]}
      leagueManagement={null}
      latestLiveImport={null}
      liveWeekOperations={null}
      providerConfigured={false}
      week17CorrectionOperations={null}
    />,
  );
  expect(screen.queryByText("Alex")).toBeNull();
  expect(screen.queryByText(/cards sealed/)).toBeNull();
  expect(
    screen.getByText("Commissioner membership is required."),
  ).toBeVisible();
});
