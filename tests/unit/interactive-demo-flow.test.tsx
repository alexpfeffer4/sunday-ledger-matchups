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

function addDraft(outcomeName: RegExp, stakeCredits: string) {
  const card = marketCard(outcomeName);
  const outcome = within(card).getByRole("button", { name: outcomeName });
  fireEvent.click(outcome);
  fireEvent.change(within(card).getByLabelText("Credits at risk"), {
    target: { value: stakeCredits },
  });
  fireEvent.click(within(card).getByRole("button", { name: "Add to card" }));
}

describe("solo interactive demo flow", () => {
  it("edits drafts, enforces a guardrail, and seals the complete card atomically", () => {
    render(<InteractiveWeekDemo />);

    addDraft(/^Kansas City −205$/, "1000");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "this position may use at most 750 credits",
    );

    addDraft(/^Philadelphia −185$/, "500");
    addDraft(/^Buffalo \+175$/, "250");
    addDraft(/^Under 42.5 −110$/, "250");

    const buffaloCard = marketCard(/^Buffalo \+175$/);
    fireEvent.click(
      within(buffaloCard).getByRole("button", { name: /^Kansas City −205$/ }),
    );
    const selectedKansasCity = within(buffaloCard).getByRole("button", {
      name: /^Kansas City −205$/,
    });
    expect(selectedKansasCity).toHaveAttribute("aria-pressed", "true");
    expect(selectedKansasCity).toHaveClass(
      "border-registry",
      "bg-registry",
      "text-white",
    );
    expect(within(selectedKansasCity).getByText("Selected")).toBeVisible();
    fireEvent.click(
      within(buffaloCard).getByRole("button", { name: /^Buffalo \+175$/ }),
    );

    const reviewButton = screen.getByRole("button", {
      name: "Review & seal 3 positions",
    });
    expect(reviewButton).toBeEnabled();
    fireEvent.click(reviewButton);

    expect(
      screen.getByRole("heading", { name: "Review your complete card" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm & seal entire card" }),
    );

    expect(
      screen.getByRole("heading", { name: "Your complete card is sealed" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Opponent card · revealed after kickoff"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Advance to kickoff, reveal & settle",
      }),
    );

    expect(
      screen.getByRole("heading", {
        name: "Position flow completed successfully",
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
