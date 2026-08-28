// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PasswordSignInForm } from "@/components/auth/password-sign-in-form";
import { SetPasswordForm } from "@/components/auth/set-password-form";

vi.mock("@/app/(auth)/auth/actions", () => ({
  signInWithPassword: vi.fn(),
  updatePassword: vi.fn(),
}));

describe("password authentication options", () => {
  it("offers password sign-in without replacing the email identity", () => {
    render(<PasswordSignInForm next="/leagues" />);

    expect(screen.getByLabelText("Email address")).toHaveAttribute(
      "autocomplete",
      "email",
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    expect(
      screen.getByRole("button", { name: "Sign in with password" }),
    ).toBeVisible();
  });

  it("requires a twelve-character confirmed password for setup", () => {
    render(<SetPasswordForm />);

    expect(screen.getByLabelText("New password")).toHaveAttribute(
      "minlength",
      "12",
    );
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
  });
});
