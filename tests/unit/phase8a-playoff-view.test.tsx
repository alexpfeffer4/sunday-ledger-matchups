// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LivePlayoffView } from "@/components/playoffs/live-playoff-view";
import { phase8aPlayoffState } from "../fixtures/phase8a-playoff-state";

afterEach(cleanup);

describe("Phase 8A playoff presentation", () => {
  it("renders reinstatement, vacancies, automatic advancement, every-member cards, and correction evidence", () => {
    const { container } = render(
      <LivePlayoffView state={phase8aPlayoffState} />,
    );
    expect(
      screen.getByText(
        "Reinstated to complete the four-member championship field",
      ),
    ).toBeVisible();
    expect(screen.getAllByText("Vacant")).toHaveLength(2);
    expect(screen.getByText("Automatic advancement")).toBeVisible();
    expect(screen.getAllByText(/Bye exhibition/).length).toBeGreaterThan(0);
    expect(screen.getByText("Exhibition miss · 0")).toBeVisible();
    expect(screen.getAllByText("Version 2").length).toBeGreaterThan(0);
    expect(container).toHaveTextContent("5 matchups");
    expect(container).not.toHaveTextContent(/proposition|stake|returned/i);
  });
});
