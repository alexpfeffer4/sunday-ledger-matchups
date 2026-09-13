// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { PositionEditorSheet } from "@/components/card/position-editor-sheet";

function Editor() {
  const [stake, setStake] = useState("250");
  return (
    <PositionEditorSheet
      open
      americanOdds={-110}
      confirmLabel="Add to card"
      context="Memphis at Nashville"
      error={null}
      helper="Minimum 50 credits"
      maximumStakeCredits={1000}
      minimumStakeCredits={50}
      onClose={() => {}}
      onSelectOutcome={() => {}}
      onStakeChange={setStake}
      onSubmit={() => {}}
      outcomes={[
        {
          id: "away",
          primary: "Memphis",
          secondary: "−7.5 · −110",
          accessibleLabel: "Memphis −7.5 −110",
        },
      ]}
      remainingCredits={750}
      selectedOutcomeId="away"
      stakeCredits={stake}
      title="Spread"
    />
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("editor visual viewport events", () => {
  it("tracks keyboard resize and browser panning without losing focus or typed stake, then detaches listeners", async () => {
    const viewport = Object.assign(new EventTarget(), {
      height: 844,
      offsetTop: 0,
    });
    vi.stubGlobal("visualViewport", viewport);
    vi.stubGlobal("innerHeight", 844);
    const remove = vi.spyOn(viewport, "removeEventListener");
    const view = render(<Editor />);
    const field = screen.getByLabelText("Stake in credits");
    const dialog = screen.getByRole("dialog");
    field.focus();
    fireEvent.change(field, { target: { value: "375" } });
    act(() => {
      viewport.height = 380;
      viewport.offsetTop = 64;
      viewport.dispatchEvent(new Event("resize"));
      viewport.dispatchEvent(new Event("scroll"));
    });
    await waitFor(() =>
      expect(dialog.style.getPropertyValue("--editor-viewport-height")).toBe(
        "380px",
      ),
    );
    expect(dialog.style.getPropertyValue("--editor-viewport-top")).toBe("64px");
    expect(dialog.style.getPropertyValue("--editor-viewport-bottom")).toBe(
      "400px",
    );
    expect(field).toHaveFocus();
    expect(field).toHaveValue(375);
    act(() => {
      viewport.height = 844;
      viewport.offsetTop = 0;
      viewport.dispatchEvent(new Event("resize"));
    });
    await waitFor(() => expect(dialog.dataset.compactViewport).toBe("false"));
    expect(field).toHaveValue(375);
    view.unmount();
    expect(remove.mock.calls.map(([event]) => event)).toEqual([
      "resize",
      "scroll",
    ]);
  });

  it("uses window height when VisualViewport is unavailable", () => {
    vi.stubGlobal("visualViewport", undefined);
    vi.stubGlobal("innerHeight", 540);
    render(<Editor />);
    expect(
      screen
        .getByRole("dialog")
        .style.getPropertyValue("--editor-viewport-height"),
    ).toBe("540px");
    expect(
      screen.getByRole("button", { name: "Close pick editor" }),
    ).toBeVisible();
  });
});
