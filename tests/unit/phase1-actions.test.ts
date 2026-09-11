import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  sendCreateAccountLink,
  sendSignInLink,
} from "@/app/(auth)/auth/actions";
import { completeAccountSetup } from "@/app/account/actions";
import { joinLeagueAction } from "@/app/leagues/actions";
import {
  GET as previewEmailLink,
  POST as submitEmailLink,
} from "@/app/(auth)/auth/confirm/route";
import { initialMagicLinkState } from "@/app/(auth)/auth/state";
import { initialAccountSetupState } from "@/app/account/state";
import { initialAppActionState } from "@/application/actions/action-state";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(
    async () => new Headers({ origin: "https://sunday-ledger.example" }),
  ),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/adapters/supabase/server", () => ({
  createSupabaseServerClient: mocks.createClient,
}));

// Exercise the real POST with the same fields formerly supplied in email URLs.
function confirmEmailLink(request: NextRequest) {
  const origin = request.headers.get("host")
    ? `${request.headers.get("x-forwarded-proto") ?? "http"}://${request.headers.get("host")}`
    : request.nextUrl.origin;
  return submitEmailLink(
    new NextRequest(new URL("/auth/confirm", request.url), {
      method: "POST",
      headers: {
        ...Object.fromEntries(request.headers),
        origin,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: request.nextUrl.searchParams.toString(),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Phase 1 auth and join actions", () => {
  it("does not consume credentials on email GET or HEAD prefetch", async () => {
    for (const method of ["GET", "HEAD"]) {
      const response = await previewEmailLink(
        new NextRequest(
          "https://sunday-ledger.example/auth/confirm?token_hash=private&type=signup&next=%2Fjoin%2Fprivate-invite-token",
          { method },
        ),
      );
      expect(response.headers.get("location")).toContain("/auth/verify?");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    }
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("rejects cross-origin confirmation without contacting Auth", async () => {
    const response = await submitEmailLink(
      new NextRequest("https://sunday-ledger.example/auth/confirm", {
        method: "POST",
        headers: {
          origin: "https://unrelated.example",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "token_hash=private&type=signup",
      }),
    );
    expect(response.status).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("distinguishes Auth outages from expired links without leaking credentials", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        verifyOtp: vi.fn(async () => ({
          error: { code: "unexpected_failure", status: 503 },
        })),
      },
    });
    const response = await confirmEmailLink(
      new NextRequest(
        "https://sunday-ledger.example/auth/confirm?token_hash=private&type=signup&next=%2Fjoin%2Fprivate-invite-token",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "https://sunday-ledger.example/auth/create-account?error=temporarily_unavailable&next=%2Fjoin%2Fprivate-invite-token",
    );
  });
  it("rejects an unsupported verification type", async () => {
    const verifyOtp = vi.fn();
    mocks.createClient.mockResolvedValue({ auth: { verifyOtp } });
    const response = await confirmEmailLink(
      new NextRequest(
        "https://sunday-ledger.example/auth/confirm?token_hash=private&type=admin",
      ),
    );
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("error=invalid_link");
  });

  it("uses provider account creation only for explicit Create account intent", async () => {
    const signInWithOtp = vi.fn(
      async (request: {
        email: string;
        options: { emailRedirectTo: string; shouldCreateUser: boolean };
      }) => {
        void request;
        return { error: null };
      },
    );
    mocks.createClient.mockResolvedValue({ auth: { signInWithOtp } });
    const formData = new FormData();
    formData.set("email", "new@example.com");
    formData.set("next", "/join/private-invite-token?from=email");

    await sendCreateAccountLink(initialMagicLinkState, formData);

    const request = signInWithOtp.mock.calls[0]?.[0];
    expect(request.options.shouldCreateUser).toBe(true);
    const confirmation = new URL(request.options.emailRedirectTo);
    expect(confirmation.searchParams.get("flow")).toBe("create-account");
    expect(confirmation.searchParams.get("next")).toBe(
      "/join/private-invite-token?from=email",
    );
  });

  it("prevents returning-user email sign-in from silently creating an account", async () => {
    const signInWithOtp = vi.fn(
      async (request: {
        email: string;
        options: { emailRedirectTo: string; shouldCreateUser: boolean };
      }) => {
        void request;
        return { error: null };
      },
    );
    mocks.createClient.mockResolvedValue({ auth: { signInWithOtp } });
    const formData = new FormData();
    formData.set("email", "member@example.com");
    formData.set("next", "/join/private-invite-token");

    await sendSignInLink(initialMagicLinkState, formData);

    const request = signInWithOtp.mock.calls[0]?.[0];
    expect(request.options.shouldCreateUser).toBe(false);
    const confirmation = new URL(request.options.emailRedirectTo);
    expect(confirmation.searchParams.get("flow")).toBe("sign-in");
    expect(confirmation.searchParams.get("next")).toBe(
      "/join/private-invite-token",
    );
  });

  it("sends a returning email-link sign-in to its safe destination", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn(async () => ({ error: null })),
      },
      schema: vi.fn(() => ({
        rpc: vi.fn(async () => ({ error: null })),
      })),
    });
    const request = new NextRequest(
      "https://sunday-ledger.example/auth/confirm?code=abc&flow=sign-in&next=%2Fjoin%2Fprivate-invite-token",
    );

    const response = await confirmEmailLink(request);

    expect(response.headers.get("location")).toBe(
      "https://sunday-ledger.example/join/private-invite-token",
    );
  });

  it("routes account-creation links through required setup", async () => {
    mocks.createClient.mockImplementation(
      async (
        onCookiesToSet?: (
          cookies: Array<{
            name: string;
            options: { path: string; sameSite: "lax" };
            value: string;
          }>,
          headers: Record<string, string>,
        ) => void,
      ) => {
        onCookiesToSet?.(
          [
            {
              name: "sb-test-auth-token",
              options: { path: "/", sameSite: "lax" },
              value: "session-cookie",
            },
          ],
          { "Cache-Control": "private, no-store" },
        );
        return {
          auth: {
            exchangeCodeForSession: vi.fn(async () => ({ error: null })),
          },
          schema: vi.fn(() => ({
            rpc: vi.fn(async () => ({ error: null })),
          })),
        };
      },
    );
    const request = new NextRequest(
      "http://localhost:3000/auth/confirm?code=abc&flow=create-account&next=%2Fjoin%2Fprivate-invite-token",
      {
        headers: {
          host: "127.0.0.1:3000",
          "x-forwarded-proto": "http",
        },
      },
    );

    const response = await confirmEmailLink(request);

    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:3000/account/setup?next=%2Fjoin%2Fprivate-invite-token",
    );
    expect(response.status).toBe(303);
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe(
      "session-cookie",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("requires both authoritative profile and password saves before setup redirects", async () => {
    const updateUser = vi.fn(async () => ({ error: null }));
    const updateProfile = vi.fn(async () => ({ error: null }));
    mocks.createClient.mockResolvedValue({
      auth: {
        getClaims: vi.fn(async () => ({
          data: { claims: { sub: "11111111-1111-4111-8111-111111111111" } },
        })),
        updateUser,
      },
      schema: vi.fn(() => ({ rpc: updateProfile })),
    });
    const formData = new FormData();
    formData.set("username", "Alex");
    formData.set("password", "correct-horse");
    formData.set("confirmPassword", "correct-horse");
    formData.set("next", "/join/private-invite-token");

    await completeAccountSetup(initialAccountSetupState, formData);

    expect(updateProfile).toHaveBeenCalledWith("update_profile_display_name", {
      p_display_name: "Alex",
    });
    expect(updateUser).toHaveBeenCalledWith({ password: "correct-horse" });
    expect(mocks.redirect).toHaveBeenCalledWith("/join/private-invite-token");
  });

  it("verifies signup token hashes without needing a browser verifier", async () => {
    const verifyOtp = vi.fn(async () => ({ error: null }));
    const exchangeCodeForSession = vi.fn();
    mocks.createClient.mockResolvedValue({
      auth: { verifyOtp, exchangeCodeForSession },
      schema: vi.fn(() => ({ rpc: vi.fn(async () => ({ error: null })) })),
    });
    const response = await confirmEmailLink(
      new NextRequest(
        "https://sunday-ledger.example/auth/confirm?token_hash=test-only-hash&type=signup&next=%2Fjoin%2Fprivate-invite-token",
      ),
    );
    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: "test-only-hash",
      type: "signup",
    });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://sunday-ledger.example/account/setup?next=%2Fjoin%2Fprivate-invite-token",
    );
  });

  it.each([
    ["create-account", "create-account"],
    ["sign-in", "sign-in"],
    ["recovery", "recover"],
  ])("keeps failed %s links in their original flow", async (flow, path) => {
    mocks.createClient.mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn(async () => ({
          error: { code: "otp_expired" },
        })),
      },
    });
    const response = await confirmEmailLink(
      new NextRequest(
        `https://sunday-ledger.example/auth/confirm?code=invalid&flow=${flow}&next=%2Fjoin%2Fprivate-invite-token`,
      ),
    );
    expect(response.headers.get("location")).toBe(
      `https://sunday-ledger.example/auth/${path}?error=invalid_link&next=%2Fjoin%2Fprivate-invite-token`,
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it.each(["pkce_code_verifier_not_found", "bad_code_verifier"])(
    "distinguishes %s from an expired email and preserves the flow id",
    async (code) => {
      const exchangeCodeForSession = vi.fn(async () => ({ error: { code } }));
      mocks.createClient.mockResolvedValue({
        auth: { exchangeCodeForSession },
      });
      const response = await confirmEmailLink(
        new NextRequest(
          "https://sunday-ledger.example/auth/confirm?code=abc&sb_flow_id=test-flow-id&flow=create-account&next=%2Fjoin%2Fprivate-invite-token",
        ),
      );
      expect(exchangeCodeForSession).toHaveBeenCalledWith("abc", {
        flowId: "test-flow-id",
      });
      expect(response.headers.get("location")).toBe(
        "https://sunday-ledger.example/auth/create-account?error=browser_mismatch&next=%2Fjoin%2Fprivate-invite-token",
      );
    },
  );

  it("does not report a verified email as expired when profile setup fails", async () => {
    mocks.createClient.mockResolvedValue({
      auth: { exchangeCodeForSession: vi.fn(async () => ({ error: null })) },
      schema: vi.fn(() => ({
        rpc: vi.fn(async () => ({ error: { message: "Temporary failure" } })),
      })),
    });
    const response = await confirmEmailLink(
      new NextRequest(
        "https://sunday-ledger.example/auth/confirm?code=abc&flow=create-account&next=%2Fjoin%2Fprivate-invite-token",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "https://sunday-ledger.example/account/setup?next=%2Fjoin%2Fprivate-invite-token",
    );
  });

  it("returns a cooldown after an email rate limit", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        signInWithOtp: vi.fn(async () => ({
          error: { code: "over_email_send_rate_limit", status: 429 },
        })),
      },
    });
    const data = new FormData();
    data.set("email", "new@example.com");
    const result = await sendCreateAccountLink(initialMagicLinkState, data);
    expect(result.status).toBe("error");
    expect(result.retryAfterSeconds).toBe(60);
    expect(result.message).toContain("same browser");
  });

  it("guards joining in the action and lands repeated acceptance in the league", async () => {
    const joinLeague = vi.fn(async () => ({
      data: [{ joined: false, league_slug: "sunday-friends" }],
      error: null,
    }));
    mocks.createClient.mockResolvedValue({
      auth: {
        getClaims: vi.fn(async () => ({
          data: { claims: { sub: "11111111-1111-4111-8111-111111111111" } },
        })),
      },
      schema: vi.fn(() => ({ rpc: joinLeague })),
    });
    const formData = new FormData();
    formData.set("token", "private-invite-token");

    await joinLeagueAction(initialAppActionState, formData);

    expect(joinLeague).toHaveBeenCalledWith("join_league", {
      p_token: "private-invite-token",
    });
    expect(mocks.redirect).toHaveBeenCalledWith("/l/sunday-friends/matchup");
  });
});
