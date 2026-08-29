// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
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

beforeAll(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    close: {
      configurable: true,
      value() {
        this.removeAttribute("open");
      },
    },
    showModal: {
      configurable: true,
      value() {
        this.setAttribute("open", "");
      },
    },
  });
});

function openEditor(outcomeName: RegExp) {
  fireEvent.click(screen.getByRole("button", { name: outcomeName }));
  return screen.getByRole("dialog");
}

function addDraft(outcomeName: RegExp, stakeCredits: string) {
  const dialog = openEditor(outcomeName);
  fireEvent.change(within(dialog).getByLabelText("Stake in credits"), {
    target: { value: stakeCredits },
  });
  const form = dialog.querySelector("form");
  if (!form) throw new Error("The pick editor form was not rendered.");
  fireEvent.submit(form);
}

describe("practice week flow", () => {
  it("edits picks, reconciles an updated quote, and seals one complete card", () => {
    render(<InteractiveWeekDemo />);

    const capitalFavorite = screen.getByRole("button", {
      name: /^Capital Club −205$/,
    });
    expect(capitalFavorite).toHaveAttribute("aria-pressed", "false");

    const riverSpread = screen.getByRole("button", {
      name: /^River Club \+4.5 −110$/,
    });
    expect(within(riverSpread).getByText("River Club")).toBeVisible();
    expect(within(riverSpread).getByText("+4.5 · −110")).toBeVisible();

    const underTotal = screen.getByRole("button", {
      name: /^Under 47.5 −112$/,
    });
    expect(within(underTotal).getByText("Under")).toBeVisible();
    expect(within(underTotal).getByText("47.5 · −112")).toBeVisible();

    const cappedDialog = openEditor(/^Capital Club −205$/);
    fireEvent.change(within(cappedDialog).getByLabelText("Stake in credits"), {
      target: { value: "1000" },
    });
    const cappedForm = cappedDialog.querySelector("form");
    if (!cappedForm) throw new Error("The pick editor form was not rendered.");
    fireEvent.submit(cappedForm);
    expect(within(cappedDialog).getByRole("alert")).toHaveTextContent(
      "this pick may use at most 750 credits",
    );
    fireEvent.click(
      within(cappedDialog).getByRole("button", {
        name: "Close pick editor",
      }),
    );

    addDraft(/^Harbor Club −185$/, "500");
    addDraft(/^River Club \+175$/, "250");
    addDraft(/^Under 42.5 −110$/, "250");

    const switchDialog = openEditor(/^Capital Club −205$/);
    expect(
      within(switchDialog).getByRole("button", {
        name: /^Capital Club −205$/,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      within(switchDialog).getByRole("button", { name: /^River Club \+175$/ }),
    );
    const switchForm = switchDialog.querySelector("form");
    if (!switchForm) throw new Error("The pick editor form was not rendered.");
    fireEvent.submit(switchForm);
    expect(
      screen.getByRole("button", { name: /^River Club \+175$/ }),
    ).toHaveAttribute("aria-pressed", "true");

    const tray = screen.getByRole("region", { name: "Working card" });
    expect(tray).toHaveTextContent("3 picks · 1,000 allocated");
    fireEvent.click(within(tray).getByRole("button", { name: "Review card" }));

    expect(
      screen.getByRole("heading", { name: "Review your complete card" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "One example quote changed",
    );
    fireEvent.click(screen.getByRole("button", { name: "Use updated odds" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm and seal card" }),
    );

    expect(
      screen.getByRole("heading", { name: "Your practice card is sealed" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Practice receipt 01/)).toBeInTheDocument();
    expect(screen.getAllByText(/Not saved/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/opponent.*pick 01/i)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Reveal kickoff and see results",
      }),
    );

    expect(
      screen.getByRole("heading", { name: "Practice matchup final" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Opponent’s final card" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Matchup final")).toBeInTheDocument();
  });
});
