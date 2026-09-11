// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { EmailCodeForm } from "@/components/auth/email-code-form";
import { emailCodeRequestError } from "@/components/auth/email-code-request-error";

afterEach(cleanup);

describe("email-code request recovery", () => {
  it("retains an autofilled code after a rejected request and allows an explicit retry", async () => {
    const verify = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockResolvedValueOnce({ status: "error", message: "Code expired." });
    render(
      <EmailCodeForm email="member@example.test" verifyCodeAction={verify} />,
    );
    const input = screen.getByLabelText(
      "Email verification code",
    ) as HTMLInputElement;
    input.value = "012345";
    await act(async () => fireEvent.submit(input.closest("form")!));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "couldn’t complete code verification",
    );
    expect(input).toHaveValue("012345");
    expect(verify).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Verify code and continue" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Reload to request a new email" }),
    ).toBeVisible();
    await act(async () => fireEvent.submit(input.closest("form")!));
    expect(verify).toHaveBeenCalledTimes(2);
    expect(verify.mock.calls[1][1].get("token")).toBe("012345");
    expect(screen.getByRole("alert")).toHaveTextContent("Code expired.");
    expect(
      screen.queryByRole("button", { name: "Reload to request a new email" }),
    ).not.toBeInTheDocument();
  });

  it("offers a fresh page for an action from an old deployment without exposing the action ID", () => {
    const error = new Error(
      'Server Action "private-action-id" was not found on the server.',
    );
    error.name = "UnrecognizedActionError";
    const state = emailCodeRequestError(error);
    expect(state.message).toContain("page is out of date");
    expect(state.message).not.toContain("private-action-id");
  });

  it("does not swallow the successful-authentication redirect", () => {
    let controlFlow: unknown;
    try {
      redirect("/account/recover-password?next=%2Fleagues");
    } catch (error) {
      controlFlow = error;
    }
    expect(() => emailCodeRequestError(controlFlow)).toThrow(
      controlFlow as Error,
    );
  });
});
