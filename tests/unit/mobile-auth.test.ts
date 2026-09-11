import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmailCodeVerifier } from "@/app/(auth)/auth/verify-code";
import { updatePassword } from "@/app/(auth)/auth/actions";
import {
  initialEmailCodeState,
  initialPasswordActionState,
  type EmailCodeState,
} from "@/app/(auth)/auth/state";
import { invitationToken } from "@/domain/leagues/invitation-token";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  rpc: vi.fn(),
  cookie: vi.fn(),
  redirect: vi.fn(),
  claims: vi.fn(),
  update: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.cookie }),
  headers: async () => new Headers({ origin: "https://ledgerleagues.com" }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/adapters/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      verifyOtp: mocks.verify,
      getClaims: mocks.claims,
      updateUser: mocks.update,
    },
    schema: () => ({ rpc: mocks.rpc }),
  }),
}));

function data(flow = "sign-in", next = "/join/private-invite-token") {
  const form = new FormData();
  Object.entries({
    email: " MEMBER@example.test ",
    token: "012345",
    flow,
    next,
  }).forEach(([key, value]) => form.set(key, value));
  return form;
}
// Existing cases construct the request context that the server protects.
function verifyEmailCode(state: EmailCodeState, form: FormData) {
  return createEmailCodeVerifier({
    email: String(form.get("email")),
    flow: form.get("flow") as "sign-in",
    next: String(form.get("next")),
  })(state, form);
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.verify.mockResolvedValue({
    data: { user: { id: "verified-user" }, session: {} },
    error: null,
  });
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.claims.mockResolvedValue({
    data: { claims: { sub: "verified-user" } },
  });
  mocks.update.mockResolvedValue({ error: null });
});

describe("first-password recovery", () => {
  function passwordData(next = "/join/private-invite-token") {
    const form = new FormData();
    form.set("password", "Disposable-Password-48!");
    form.set("confirmPassword", "Disposable-Password-48!");
    form.set("next", next);
    return form;
  }
  it("requires a verified session before changing any password", async () => {
    mocks.claims.mockResolvedValue({ data: null });
    const result = await updatePassword(
      initialPasswordActionState,
      passwordData(),
    );
    expect(result.status).toBe("error");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("preserves the invitation after an idempotent same-password retry", async () => {
    mocks.update.mockResolvedValue({ error: { code: "same_password" } });
    await updatePassword(initialPasswordActionState, passwordData());
    expect(mocks.redirect).toHaveBeenCalledWith("/join/private-invite-token");
  });
  it("does not navigate after an Auth rejection", async () => {
    mocks.update.mockResolvedValue({ error: { code: "weak_password" } });
    const result = await updatePassword(
      initialPasswordActionState,
      passwordData(),
    );
    expect(result.status).toBe("error");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("constrains successful password setup to an internal destination", async () => {
    await updatePassword(
      initialPasswordActionState,
      passwordData("//external.example"),
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/leagues");
  });
});

describe("same-browser email verification", () => {
  it("ignores tampered email, signup flow and destination fields", async () => {
    const verify = createEmailCodeVerifier({
      email: "member@example.test",
      flow: "create-account",
      next: "/join/private-invite-token",
    });
    const form = data("sign-in", "//external.example");
    form.set("email", "another@example.test");
    await verify(initialEmailCodeState, form);
    expect(mocks.verify).toHaveBeenCalledWith({
      email: "member@example.test",
      token: "012345",
      type: "email",
    });
    expect(mocks.cookie).toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/account/setup?next=%2Fjoin%2Fprivate-invite-token",
    );
  });
  it("uses provider-verified identity and normalized email for signup", async () => {
    await verifyEmailCode(initialEmailCodeState, data("create-account"));
    expect(mocks.verify).toHaveBeenCalledWith({
      email: "member@example.test",
      token: "012345",
      type: "email",
    });
    expect(mocks.cookie).toHaveBeenCalledWith(
      "sunday-ledger-setup-pending",
      "verified-user",
      expect.objectContaining({ httpOnly: true, secure: true }),
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/account/setup?next=%2Fjoin%2Fprivate-invite-token",
    );
  });
  it("rejects invalid codes before any profile or navigation change", async () => {
    mocks.verify.mockResolvedValue({ data: {}, error: { status: 403 } });
    expect(
      (await verifyEmailCode(initialEmailCodeState, data())).message,
    ).toContain("invalid");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.cookie).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("keeps a verified session after a profile failure", async () => {
    mocks.rpc.mockRejectedValue(new Error("profile unavailable"));
    await verifyEmailCode(initialEmailCodeState, data());
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/account/setup?next=%2Fjoin%2Fprivate-invite-token",
    );
  });
  it("does not accept arbitrary flows or nonnumeric tokens", async () => {
    await verifyEmailCode(initialEmailCodeState, data("admin"));
    const form = data();
    form.set("token", "letters");
    await verifyEmailCode(initialEmailCodeState, form);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("prevents external redirects and keeps returning members out of signup", async () => {
    await verifyEmailCode(
      initialEmailCodeState,
      data("sign-in", "//external.example"),
    );
    expect(mocks.cookie).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith("/leagues");
  });
  it("keeps recovery verification and its password destination distinct", async () => {
    await verifyEmailCode(initialEmailCodeState, data("recovery"));
    expect(mocks.verify).toHaveBeenCalledWith(
      expect.objectContaining({ type: "recovery" }),
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/account/recover-password?next=%2Fjoin%2Fprivate-invite-token",
    );
  });
  it("reports provider throttling without treating it as an expired code", async () => {
    mocks.verify.mockResolvedValue({ data: {}, error: { status: 429 } });
    expect(
      (await verifyEmailCode(initialEmailCodeState, data())).message,
    ).toContain("Too many attempts");
  });
});

describe("pasted invitations", () => {
  const token = "abcdef0123456789".repeat(3);
  it.each([
    token,
    token.toUpperCase(),
    ` https://ledgerleagues.com/join/${token}?source=text `,
    `/join/${token}`,
  ])("extracts the same guarded token from %s", (value) => {
    expect(invitationToken(value)).toBe(token);
  });
  it.each([
    "javascript:alert(1)",
    "//evil.example/join/token",
    "https://ledgerleagues.com/auth/confirm?code=secret",
    "https://user:pass@example.com/join/" + token,
    "https://example.com/join/" + token + "/other",
    "short",
    "a".repeat(2049),
  ])("rejects malformed input", (value) => {
    expect(invitationToken(value)).toBeNull();
  });
});
