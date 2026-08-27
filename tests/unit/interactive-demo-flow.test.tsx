// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InteractiveWeekDemo } from "@/components/demo/interactive-week-demo";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function marketCard(outcomeName: RegExp): HTMLElement {
  const outcome = screen.getByRole("button", { name: outcomeName });
  const card = outcome.closest("article");
  if (!card) throw new Error("The market card was not rendered.");
  return card;
}

function acceptPosition(outcomeName: RegExp, stakeCredits: string) {
  const card = marketCard(outcomeName);
  const outcome = within(card).getByRole("button", { name: outcomeName });
  fireEvent.click(outcome);
  fireEvent.change(within(card).getByLabelText("Credits at risk"), {
    target: { value: stakeCredits },
  });
  fireEvent.click(within(card).getByRole("button", { name: "Confirm & seal" }));
}

describe("solo interactive demo flow", () => {
  it("enforces a guardrail and completes card, lock, reveal, and settlement", () => {
    render(<InteractiveWeekDemo />);

    acceptPosition(/^Kansas City −205$/, "1000");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "this position may use at most 750 credits",
    );

    acceptPosition(/^Philadelphia −185$/, "500");
    acceptPosition(/^Buffalo \+175$/, "250");
    acceptPosition(/^Under 42.5 −110$/, "250");

    const lockButton = screen.getByRole("button", {
      name: "Lock completed card",
    });
    expect(lockButton).toBeEnabled();
    fireEvent.click(lockButton);

    expect(
      screen.getByRole("heading", { name: "Your card is compliant" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Opponent card · revealed after kickoff"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Start games, reveal & settle" }),
    );

    expect(
      screen.getByRole("heading", {
        name: "Betting flow completed successfully",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Opponent card · revealed after kickoff",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Matchup final")).toBeInTheDocument();
  });
});
