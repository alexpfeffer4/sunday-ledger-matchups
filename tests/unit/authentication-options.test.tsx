// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PasswordSignInForm } from "@/components/auth/password-sign-in-form";
import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";
import { SetPasswordForm } from "@/components/auth/set-password-form";
import { AccountSetupForm } from "@/components/auth/account-setup-form";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { RecoveryPasswordForm } from "@/components/auth/recovery-password-form";
import { SignInMethods } from "@/components/auth/sign-in-methods";
import { UsernameForm } from "@/components/auth/username-form";

vi.mock("@/app/(auth)/auth/actions", () => ({
  finishPasswordRecovery: vi.fn(),
  requestPasswordReset: vi.fn(),
  sendCreateAccountLink: vi.fn(),
  sendSignInLink: vi.fn(),
  signInWithPassword: vi.fn(),
  updatePassword: vi.fn(),
}));

vi.mock("@/app/account/actions", () => ({
  completeAccountSetup: vi.fn(),
  updateUsername: vi.fn(),
}));

afterEach(cleanup);

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
    ).toHaveAttribute("href", "/auth/recover?next=%2Fleagues");
  });

  it("offers email recovery for an existing password", () => {
    const recovery = render(<PasswordRecoveryForm next="/join/invite-token" />);
    const form = within(recovery.container);

    expect(form.getByLabelText("Email address")).toHaveAttribute(
      "autocomplete",
      "email",
    );
    expect(
      form.getByRole("button", { name: "Email recovery link" }),
    ).toBeVisible();
    expect(form.getByDisplayValue("/join/invite-token")).toHaveAttribute(
      "name",
      "next",
    );
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

  it("keeps returning-user email sign-in separate from account creation", () => {
    render(<MagicLinkForm next="/leagues" />);

    expect(screen.getByText(/existing accounts/i)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Send sign-in link" }),
    ).toBeVisible();
  });

  it("explains the completion gate during account creation", () => {
    render(<MagicLinkForm intent="create-account" next="/join/invite-token" />);

    expect(
      screen.getByText(/required username and password setup/i),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Email account link" }),
    ).toBeVisible();
  });

  it("shows one sign-in method at a time", () => {
    const switcher = render(<SignInMethods next="/leagues" />);
    const form = within(switcher.container);

    expect(
      form.getByRole("button", { name: "Sign in with password" }),
    ).toBeVisible();
    expect(
      form.queryByRole("button", { name: "Send sign-in link" }),
    ).not.toBeInTheDocument();

    fireEvent.click(form.getByRole("button", { name: "Email link" }));

    expect(
      form.getByRole("button", { name: "Send sign-in link" }),
    ).toBeVisible();
    expect(
      form.queryByRole("button", { name: "Sign in with password" }),
    ).not.toBeInTheDocument();
  });

  it("has no setup continuation outside the authoritative save action", () => {
    render(
      <AccountSetupForm currentUsername="Alex" next="/join/invite-token" />,
    );

    expect(screen.getByLabelText("Username")).toBeRequired();
    expect(screen.getByLabelText("Password")).toHaveAttribute("minlength", "8");
    expect(
      screen.getByRole("button", { name: "Save account and continue" }),
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: /continue/i })).toBeNull();
  });

  it("gates recovery continuation on the password save", () => {
    render(<RecoveryPasswordForm next="/join/invite-token" />);

    expect(
      screen.getByRole("button", { name: "Save password and continue" }),
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: /continue/i })).toBeNull();
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
