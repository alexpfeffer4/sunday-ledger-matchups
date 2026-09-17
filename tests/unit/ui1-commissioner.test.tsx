// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  automationCoversWeek,
  automationPresentation,
} from "@/application/automation/status";
import {
  commissionerFixtureStatus as healthy,
  commissionerFixtureScenarios as scenarios,
} from "@/adapters/example/commissioner-preview";
import { CommissionerDisclosure } from "@/components/commissioner/commissioner-disclosure";
import {
  Stage1CommissionerView,
  Stage1MatchupView,
} from "@/components/stage1/live-views";
import { SeasonAutomationPanel } from "@/components/commissioner/season-automation-panel";
import { LiveWeekCommissionerControls } from "@/components/commissioner/live-week-controls";
import { PlayerPropMenuReview } from "@/components/commissioner/player-prop-menu-review";
import { PlayoffPendingView } from "@/components/playoffs/playoff-pending-view";
import { makePhase6State } from "../fixtures/phase6-paired-matchup";
vi.mock("server-only", () => ({}));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-13T12:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});
const noSave = async () => ({ status: "success" as const, message: "test" });

describe("authoritative automation presentation", () => {
  it("keeps healthy finality waiting free of retry or an invented date", () => {
    expect(automationPresentation(healthy)).toMatchObject({
      attention: false,
      retry: false,
      dueAt: null,
    });
  });
  it.each([
    "Suspended",
    "Worker unavailable",
    "Readiness missing",
    "Status unavailable",
  ])("%s overrides healthy operation", (name) => {
    const display = automationPresentation(scenarios[name]);
    expect(display.attention).toBe(true);
    expect(display.label).not.toMatch(/enabled|No action needed/i);
    expect(display.next ?? "").not.toMatch(/will open/);
    expect(display.dueAt).toBeNull();
  });
  it("shows retries only from failure plus stored timing, and drops retry time for suspension", () => {
    expect(automationPresentation(scenarios["Retry scheduled"])).toMatchObject({
      retry: true,
      dueAt: "2026-09-22T12:15:00Z",
    });
    expect(
      automationPresentation({
        ...scenarios.Suspended!,
        next: { ...scenarios.Suspended!.next, dueAt: "2026-09-22T12:15:00Z" },
      }),
    ).toMatchObject({ retry: true, dueAt: null });
  });
  it.each([
    { ...healthy, next: { status: "NOVEL" } },
    { ...healthy, next: { status: "WAITING" } },
    { ...healthy, next: { status: "DUE", operation: "NOVEL", week: 3 } },
    {
      ...healthy,
      next: { status: "DUE", operation: "OPEN", week: 3, dueAt: "invalid" },
    },
    {
      ...healthy,
      next: { status: "WAITING", week: 3, blocker: "UNRECOGNIZED" },
    },
    { ...healthy, approvedAt: null },
    { ...healthy, enrolled: false },
  ])(
    "does not infer health from inconsistent or future status data",
    (status) => {
      expect(automationPresentation(status)).toMatchObject({
        attention: true,
        retry: false,
        dueAt: null,
      });
    },
  );
  it("bounds enrollment to genuine active future scope", () => {
    expect(automationCoversWeek(healthy, 2)).toBe(false);
    expect(automationCoversWeek(healthy, 3)).toBe(true);
    expect(automationCoversWeek(scenarios.Paused, 3)).toBe(false);
    expect(automationCoversWeek(scenarios.Revoked, 3)).toBe(false);
    expect(automationCoversWeek(null, 3)).toBe(false);
  });
  it("keeps paused/revoked/complete meanings distinct", () => {
    expect(automationPresentation(scenarios.Paused).label).toMatch(/paused/);
    expect(automationPresentation(scenarios.Revoked).detail).toMatch(
      /approve.*again/,
    );
    expect(
      automationPresentation({ ...healthy, next: { status: "COMPLETE" } }),
    ).toMatchObject({ attention: false, next: null, retry: false });
  });
});

it("puts one route heading and operating summary before details, with recovery and settings reachable", () => {
  const { state, operations } = makePhase6State("PREGAME");
  state.commissioner.isCommissioner = true;
  const { container } = render(
    <Stage1CommissionerView
      state={state}
      automation={healthy}
      invites={[]}
      leagueManagement={null}
      latestLiveImport={null}
      liveWeekOperations={operations}
      providerConfigured
      week17CorrectionOperations={null}
      playerMenu={<p>Menu fixture</p>}
    />,
  );
  expect(screen.getAllByRole("main")).toHaveLength(1);
  const heading = screen.getByRole("heading", {
    level: 1,
    name: "Commissioner",
  });
  const summary = container.querySelector("#commissioner-operating-summary")!;
  expect(
    heading.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  const recovery = container.querySelector("#commissioner-recovery")!;
  expect(
    summary.compareDocumentPosition(recovery) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(recovery).not.toHaveAttribute("open");
  expect(container.querySelector("#commissioner-settings")).not.toHaveAttribute(
    "open",
  );
  expect(screen.getByRole("link", { name: "Recovery" })).toHaveAttribute(
    "href",
    "#commissioner-recovery",
  );
});

it("does not reveal passed commissioner panels to a member", () => {
  const { state, operations } = makePhase6State("PREGAME");
  state.commissioner.isCommissioner = false;
  render(
    <Stage1CommissionerView
      state={state}
      automation={healthy}
      invites={[]}
      leagueManagement={null}
      latestLiveImport={null}
      liveWeekOperations={operations}
      providerConfigured
      week17CorrectionOperations={null}
      playerMenu={<p>Private operator control</p>}
    />,
  );
  expect(screen.queryByText("Private operator control")).toBeNull();
  expect(screen.queryByRole("link", { name: "Recovery" })).toBeNull();
});

it("keeps a suspended season and disabled game checks visible together", () => {
  const { state, operations } = makePhase6State("PREGAME");
  state.league.mode = "LIVE";
  state.commissioner.isCommissioner = true;
  operations.automationEnabled = false;
  render(
    <Stage1CommissionerView
      state={state}
      automation={scenarios.Suspended}
      invites={[]}
      leagueManagement={null}
      latestLiveImport={null}
      liveWeekOperations={operations}
      providerConfigured
      week17CorrectionOperations={null}
    />,
  );
  expect(
    screen.getByRole("heading", { name: /automation suspended/ }),
  ).toBeVisible();
  expect(
    screen.getByText(/Automatic game checks are off\. Use the bounded/),
  ).toBeVisible();
});

it("a prepared later week does not ask to lock the roster again", () => {
  const { state, operations } = makePhase6State("PREGAME");
  state.league.mode = "LIVE";
  state.league.lifecycle = "REGULAR";
  state.commissioner.isCommissioner = true;
  state.week!.state = "PLANNED";
  state.week!.nflWeek = 3;
  render(
    <Stage1CommissionerView
      state={state}
      automation={scenarios["Manual league"]}
      invites={[]}
      leagueManagement={null}
      latestLiveImport={null}
      liveWeekOperations={operations}
      providerConfigured
      week17CorrectionOperations={null}
    />,
  );
  expect(screen.getByText(/Open Week 3 when ready:/)).toBeVisible();
  expect(screen.queryByText("Not started")).toBeNull();
  expect(screen.queryByText(/You may continue to Week 1 setup/)).toBeNull();
  expect(screen.queryByText("Invite members first")).toBeNull();
  expect(screen.queryByRole("button", { name: /Lock.*roster/ })).toBeNull();
});

it("a deep exception link opens both disclosures and focuses the target", () => {
  Element.prototype.scrollIntoView = vi.fn();
  const { container } = render(
    <CommissionerDisclosure id="outer" title="Recovery">
      <CommissionerDisclosure id="inner" title="Props">
        <button>Refresh</button>
      </CommissionerDisclosure>
    </CommissionerDisclosure>,
  );
  window.history.replaceState(null, "", "/#inner");
  fireEvent(window, new HashChangeEvent("hashchange"));
  expect(container.querySelector("#outer")).toHaveAttribute("open");
  expect(container.querySelector("#inner")).toHaveAttribute("open");
  expect(container.querySelector("#inner > summary")).toHaveFocus();
});

it("renders one player review in Recovery for a prepared Simulation week", () => {
  const { state } = makePhase6State("PREGAME");
  state.league.mode = "SIMULATION";
  state.commissioner.isCommissioner = true;
  state.week!.state = "PLANNED";
  const { container } = render(
    <Stage1CommissionerView
      state={state}
      invites={[]}
      leagueManagement={null}
      latestLiveImport={null}
      liveWeekOperations={null}
      providerConfigured
      week17CorrectionOperations={null}
      playerMenu={<p>One authoritative player review</p>}
    />,
  );
  expect(screen.getAllByText("One authoritative player review")).toHaveLength(
    1,
  );
  expect(container.querySelectorAll("#player-menu")).toHaveLength(1);
  expect(container.querySelectorAll("#commissioner-recovery")).toHaveLength(1);
  expect(
    container.querySelector("#commissioner-recovery #player-menu"),
  ).not.toBeNull();
});

it("an entirely unavailable automatic menu stays collapsed and never asks for consent", () => {
  const slots = Array.from({ length: 54 }, (_, i) => ({
    eventId: `game-${Math.floor(i / 6)}`,
    team: i % 6 < 3 ? "Away" : "Home",
    slot: (["QB_PASS", "RB_RUSH", "RECEIVER"] as const)[i % 3],
    statistic: (["PASSING_YARDS", "RUSHING_YARDS", "RECEIVING_YARDS"] as const)[
      i % 3
    ],
    subjectId: null,
    subjectLabel: null,
    lateFillEligible: true,
    candidates: [],
  }));
  const { container } = render(
    <PlayerPropMenuReview
      leagueSlug="test"
      leagueId="test"
      slots={slots}
      frozen
      automaticValidation
      progressiveAvailability
      progressiveActivated
      prepareAction={noSave}
      confirmAction={noSave}
      refreshAction={noSave}
    />,
  );
  expect(container.querySelectorAll("details")).toHaveLength(9);
  expect(container.querySelectorAll("details[open]")).toHaveLength(0);
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Refresh full-slate player lines" }),
  ).toBeEnabled();
});

it("healthy waiting has no retry button and pause scope stays beside the control", () => {
  const { rerender } = render(
    <SeasonAutomationPanel
      leagueSlug="test"
      status={healthy}
      action={noSave}
      section="recovery"
    />,
  );
  expect(screen.queryByRole("button", { name: /Retry/ })).toBeNull();
  rerender(
    <SeasonAutomationPanel
      leagueSlug="test"
      status={healthy}
      action={noSave}
    />,
  );
  expect(
    screen.getByText(/Current-week quotes, scores, player results/),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Revoke season approval" }),
  ).toBeVisible();
});

it("missed Live formation says blocked and never calls itself Simulation", () => {
  const { state } = makePhase6State("PREGAME");
  state.league.mode = "LIVE";
  state.commissioner.isCommissioner = true;
  state.league.lifecycle = "DRAFT";
  state.week!.state = "PLANNED";
  state.week!.commonLockAt = "2026-09-12T12:00:00Z";
  state.matchup = null;
  state.ownerCard = null;
  render(<Stage1MatchupView state={state} />);
  expect(screen.getByText(/Season not started/)).toBeVisible();
  expect(screen.queryByText(/Practice\/test · Simulation/)).toBeNull();
  expect(
    screen.getByRole("link", { name: "Review setup limitation" }),
  ).toHaveAttribute("href", expect.stringContaining("#commissioner-recovery"));
});

it("postseason guidance respects active scope, unavailable status and member visibility", () => {
  const { state } = makePhase6State("FINAL");
  state.week!.nflWeek = 14;
  state.league.mode = "LIVE";
  state.league.lifecycle = "REGULAR";
  const { rerender } = render(
    <PlayoffPendingView state={state} automation={healthy} />,
  );
  expect(screen.queryByText(/Your commissioner can publish/)).toBeNull();
  rerender(<PlayoffPendingView state={state} automation={null} />);
  expect(
    screen.getByText(/automation status could not be confirmed/),
  ).toBeVisible();
  rerender(<PlayoffPendingView state={state} />);
  expect(
    screen.getByText(/If covered by active season automation/),
  ).toBeVisible();
});

it.each([2, 14, 17, 18])(
  "retains eligible manual recovery without prescribing it for approved Week %s publication",
  (week) => {
    const { state } = makePhase6State("FINAL");
    state.league.mode = "LIVE";
    state.week!.nflWeek = week;
    state.league.lifecycle =
      week === 17 ? "PLAYOFFS" : week === 18 ? "WEEK_18_EXHIBITION" : "REGULAR";
    const props = {
      state: {
        ...state,
        slate: state.slate.map((event) => ({
          ...event,
          latestObservedAt: event.scheduledStartAt,
        })),
      },
      latestLiveImport: null,
      liveWeekOperations: null,
      providerConfigured: true,
      week17CorrectionOperations: null,
    };
    const { rerender } = render(
      <LiveWeekCommissionerControls {...props} automation={scenarios.Paused} />,
    );
    expect(
      screen.getByText(/Saved season approval covers this publication/),
    ).toBeVisible();
    const command =
      week === 2
        ? "Import Week 3 NFL markets for review"
        : week === 14
          ? "Confirm playoff field"
          : week === 17
            ? "Finalize champion & bracket"
            : "Publish complete season archive";
    expect(screen.getByRole("button", { name: command })).toBeEnabled();
    if (week === 17) {
      rerender(
        <LiveWeekCommissionerControls
          {...props}
          automation={{ ...healthy, effectiveWeek: 18 }}
        />,
      );
      expect(
        screen.queryByText(/Saved season approval covers this publication/),
      ).toBeNull();
      expect(
        screen.getByText(/Confirm the champion and final bracket/),
      ).toBeVisible();
    }
    rerender(
      <LiveWeekCommissionerControls
        {...props}
        automation={scenarios["Manual league"]}
      />,
    );
    expect(
      screen.queryByText(/Saved season approval covers this publication/),
    ).toBeNull();
    expect(screen.getByRole("button", { name: command })).toBeEnabled();
    rerender(<LiveWeekCommissionerControls {...props} automation={null} />);
    expect(
      screen.getByText(/Season automation status could not be confirmed/),
    ).toBeVisible();
  },
);
