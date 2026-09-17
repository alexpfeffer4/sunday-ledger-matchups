// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { Stage1CardBuilder } from "@/components/card/stage1-card-builder";
import { OwnerCardProgress } from "@/components/card/owner-card-progress";
import {
  ownerCardContext,
  cardDraftStorageKey,
} from "@/components/card/owner-card-context";
import { ScheduleNavigator } from "@/components/league/schedule-navigator";
import {
  resolveBrowsingChoices,
  clearBrowsingChoices,
} from "@/components/league/use-browsing-choices";
import {
  makeStage3CardState,
  savedStage3Draft,
} from "../fixtures/stage3-card-journey";
import { frozenCardRulesFixture } from "../fixtures/card-rules";
import { simulationSeason14Ruleset } from "@/rulesets/simulation-season-1-4";
vi.mock("@/app/l/[leagueSlug]/player-prop-actions", () => ({
  refreshPlayerPropQuotesAction: vi.fn(),
}));
vi.mock("@/app/l/[leagueSlug]/actions", () => ({
  acceptStage1CardAction: vi.fn(),
}));
vi.mock("@/app/l/[leagueSlug]/card-quote-actions", () => ({
  reviewLiveCardQuotes: vi.fn(),
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
});

function fixture() {
  const state = makeStage3CardState();
  state.season.rulesetSnapshot = frozenCardRulesFixture(
    "SIMULATION",
    simulationSeason14Ruleset,
  );
  state.season.simulatedNow = "2026-09-09T12:00:00Z";
  state.week = {
    ...state.week!,
    propsEnabled: true,
    entryClosed: false,
    entryClosesAt: "2026-09-15T00:15:00Z",
    rollingSubmissionsEnabled: true,
  };
  state.slate[0].scheduledStartAt = "2026-09-11T00:15:00Z";
  state.slate[1].scheduledStartAt = "2026-09-15T00:15:00Z";
  return state;
}

it("restores the saved week before enabling a server-rendered Schedule", async () => {
  window.history.replaceState(null, "", "/l/test/schedule");
  sessionStorage.setItem(
    "sunday-ledger:browsing:v1:schedule:hydration",
    '{"week":"1"}',
  );
  const schedule = (
    <ScheduleNavigator
      initialWeek={2}
      browsingScope="hydration"
      weeks={[1, 2].map((week) => ({
        week,
        label: `Week ${week}`,
        status: "Published",
        matchups: [],
      }))}
    />
  );
  const container = document.createElement("div");
  document.body.append(container);
  container.innerHTML = renderToString(schedule);
  const select = container.querySelector("select")!;
  expect(select).toBeDisabled();
  let root: Root | undefined;
  try {
    await act(async () => {
      root = hydrateRoot(container, schedule);
    });
    expect(select).toBeEnabled();
    expect(select).toHaveValue("1");
    expect(window.location.search).toBe("?week=1");
    fireEvent.change(select, { target: { value: "2" } });
    expect(select).toHaveValue("2");
    expect(window.location.search).toBe("?week=2");
  } finally {
    await act(async () => root?.unmount());
    container.remove();
  }
});

it("keeps both filters through My Card, reload and Back without modifying the owner's draft", () => {
  const state = fixture();
  const context = ownerCardContext(state);
  const key = cardDraftStorageKey(context)!;
  const draft = savedStage3Draft(state, [200]);
  localStorage.setItem(key, draft);
  window.history.replaceState(null, "", "/l/test/slate");
  const view = render(<Stage1CardBuilder state={state} />);
  fireEvent.click(screen.getByRole("button", { name: "Thursday" }));
  fireEvent.click(screen.getByRole("button", { name: "Player props" }));
  const chosen = window.location.search;
  view.unmount();
  window.history.replaceState(null, "", "/l/test/card");
  const card = render(<OwnerCardProgress context={context} onCardPage />);
  expect(
    screen.getByText("Left to allocate").nextElementSibling,
  ).toHaveTextContent("800");
  card.unmount();
  window.history.replaceState(null, "", "/l/test/slate");
  const returned = render(<Stage1CardBuilder state={state} />);
  expect(screen.getByRole("button", { name: "Thursday" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: "Player props" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(localStorage.getItem(key)).toBe(draft);
  returned.unmount();
  render(<Stage1CardBuilder state={state} />);
  expect(window.location.search).toBe(chosen);
  act(() => {
    window.history.replaceState(null, "", "/l/test/slate?day=MON&type=GAME");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(screen.getByRole("button", { name: "Monday" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: "Game lines" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const stored = Object.keys(sessionStorage)
    .map((key) => sessionStorage.getItem(key))
    .join();
  expect(stored).not.toMatch(
    /stake|receipt|marketSnapshot|proposition|subject|token/,
  );
});

it.each(["owner", "league", "week"])(
  "does not restore filters or private drafts across a changed %s",
  (scope) => {
    const state = fixture();
    localStorage.setItem(
      cardDraftStorageKey(ownerCardContext(state))!,
      savedStage3Draft(state, [200]),
    );
    const view = render(<Stage1CardBuilder state={state} />);
    fireEvent.click(screen.getByRole("button", { name: "Thursday" }));
    view.unmount();
    if (scope === "owner") {
      state.viewer.userId += "-other";
      state.ownerCard!.id += "-other";
    }
    if (scope === "league") state.league.id += "-other";
    if (scope === "week") state.week!.id += "-other";
    window.history.replaceState(null, "", "/l/other/slate");
    render(<Stage1CardBuilder state={state} />);
    expect(screen.getByRole("button", { name: "All games" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByRole("button", { name: "Edit pick" })).toBeNull();
  },
);

it("gives explicit valid queries precedence and visibly rejects duplicates or unavailable choices", () => {
  const choices = { day: { options: ["ALL", "THU"], fallback: "ALL" } };
  expect(
    resolveBrowsingChoices(
      new URLSearchParams("day=ALL"),
      '{"day":"THU"}',
      choices,
    ),
  ).toEqual({ values: { day: "ALL" }, invalid: false });
  for (const query of ["day=MON", "day=THU&day=ALL", "day=<script>"])
    expect(
      resolveBrowsingChoices(
        new URLSearchParams(query),
        '{"day":"THU"}',
        choices,
      ),
    ).toEqual({ values: { day: "ALL" }, invalid: true });
  window.history.replaceState(null, "", "/l/test/slate?day=NOPE&type=PLAYER");
  const state = fixture();
  state.week!.propsEnabled = false;
  render(<Stage1CardBuilder state={state} />);
  expect(screen.getByText(/filter is unavailable/)).toBeVisible();
  expect(screen.getByRole("button", { name: "All games" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.queryByRole("button", { name: "Player props" })).toBeNull();
});

it("remembers Schedule within its authorized scope and lets a direct link override it", () => {
  const weeks = [1, 2, 3].map((week) => ({
    week,
    label: `Week ${week}`,
    status: week === 2 ? "Current" : "Published",
    matchups: [],
  }));
  window.history.replaceState(null, "", "/l/test/schedule");
  const view = render(
    <ScheduleNavigator
      initialWeek={2}
      weeks={weeks}
      browsingScope="owner:league:season:current2"
    />,
  );
  const select = screen.getByRole("combobox", { name: "Selected week" });
  select.focus();
  fireEvent.change(select, { target: { value: "1" } });
  expect(select).toHaveFocus();
  view.unmount();
  window.history.replaceState(null, "", "/l/test/schedule");
  const next = render(
    <ScheduleNavigator
      initialWeek={2}
      weeks={weeks}
      browsingScope="owner:league:season:current2"
    />,
  );
  expect(screen.getByRole("combobox")).toHaveValue("1");
  expect(
    screen.getByText("Viewing Week 1 · Current week is Week 2"),
  ).toBeVisible();
  next.unmount();
  window.history.replaceState(null, "", "/l/test/schedule?week=3");
  render(
    <ScheduleNavigator
      initialWeek={2}
      weeks={weeks}
      browsingScope="owner:league:season:current2"
    />,
  );
  expect(screen.getByRole("combobox")).toHaveValue("3");
});

it("keeps browsing usable when session storage is blocked", () => {
  const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  try {
    render(
      <ScheduleNavigator
        initialWeek={2}
        weeks={[1, 2].map((week) => ({
          week,
          label: `Week ${week}`,
          status: "Published",
          matchups: [],
        }))}
        browsingScope="blocked"
      />,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "1" } });
    expect(screen.getByRole("combobox")).toHaveValue("1");
    expect(window.location.search).toBe("?week=1");
  } finally {
    get.mockRestore();
    set.mockRestore();
  }
});

it("sign-out clears browsing choices without deleting the owner's private draft", () => {
  sessionStorage.setItem(
    "sunday-ledger:browsing:v1:picks:owner:league:week",
    '{"day":"THU"}',
  );
  localStorage.setItem("private-draft", "retained");
  clearBrowsingChoices();
  expect(sessionStorage.length).toBe(0);
  expect(localStorage.getItem("private-draft")).toBe("retained");
});
