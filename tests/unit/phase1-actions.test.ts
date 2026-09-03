import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  sendCreateAccountLink,
  sendSignInLink,
} from "@/app/(auth)/auth/actions";
import { completeAccountSetup } from "@/app/account/actions";
import { joinLeagueAction } from "@/app/leagues/actions";
import { GET as confirmEmailLink } from "@/app/(auth)/auth/confirm/route";
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Phase 1 auth and join actions", () => {
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
