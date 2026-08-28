// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PasswordSignInForm } from "@/components/auth/password-sign-in-form";
import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";
import { SetPasswordForm } from "@/components/auth/set-password-form";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { UsernameForm } from "@/components/auth/username-form";

vi.mock("@/app/(auth)/auth/actions", () => ({
  sendMagicLink: vi.fn(),
  requestPasswordReset: vi.fn(),
  signInWithPassword: vi.fn(),
  updatePassword: vi.fn(),
}));

vi.mock("@/app/account/actions", () => ({
  updateUsername: vi.fn(),
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
    expect(
      screen.getByRole("link", { name: "Forgot password?" }),
    ).toHaveAttribute("href", "/auth/recover");
  });

  it("offers email recovery for an existing password", () => {
    const recovery = render(<PasswordRecoveryForm />);
    const form = within(recovery.container);

    expect(form.getByLabelText("Email address")).toHaveAttribute(
      "autocomplete",
      "email",
    );
    expect(
      form.getByRole("button", { name: "Email recovery link" }),
    ).toBeVisible();
  });

  it("requires an eight-character confirmed password for setup", () => {
    render(<SetPasswordForm />);

    expect(screen.getByLabelText("New password")).toHaveAttribute(
      "minlength",
      "8",
    );
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
  });

  it("explains that a magic link continues into account setup", () => {
    render(<MagicLinkForm next="/leagues" />);

    expect(screen.getByText(/open Account/i)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Email me a sign-in link" }),
    ).toBeVisible();
  });

  it("offers an editable public username", () => {
    render(<UsernameForm currentUsername="alexpfeffer4" />);

    expect(screen.getByLabelText("Username")).toHaveValue("alexpfeffer4");
    expect(screen.getByLabelText("Username")).toHaveAttribute(
      "maxlength",
      "30",
    );
    expect(screen.getByText(/email stays private/i)).toBeVisible();
  });
});
