// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { OutcomeSelector } from "@/components/card/outcome-selector";
it("preserves focused control while selecting the new executable snapshot", () => {
  const select = vi.fn();
  const props = { label: "Game winner", selectedId: null, onSelect: select };
  const option = {
    id: "old-snapshot",
    renderKey: "HOME",
    accessibleLabel: "Home +140",
    primary: "Home",
    secondary: "+140",
  };
  const { rerender } = render(
    <OutcomeSelector {...props} options={[option]} />,
  );
  const button = screen.getByRole("button", { name: "Home +140" });
  button.focus();
  rerender(
    <OutcomeSelector
      {...props}
      options={[
        {
          ...option,
          id: "new-snapshot",
          accessibleLabel: "Home +155",
          secondary: "+155",
        },
      ]}
    />,
  );
  expect(screen.getByRole("button", { name: "Home +155" })).toBe(button);
  expect(button).toHaveFocus();
  button.click();
  expect(select).toHaveBeenCalledWith("new-snapshot");
});
