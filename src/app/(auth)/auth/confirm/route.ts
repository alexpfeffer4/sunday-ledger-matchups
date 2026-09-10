import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeInternalPath } from "@/adapters/supabase/redirect";
import { createSupabaseServerClient } from "@/adapters/supabase/server";

const allowedOtpTypes = new Set<EmailOtpType>([
  "email",
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
]);

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const typeValue = request.nextUrl.searchParams.get("type");
  const code = request.nextUrl.searchParams.get("code");
  const flowId = request.nextUrl.searchParams.get("sb_flow_id");
  const flow = request.nextUrl.searchParams.get("flow");
  const next = safeInternalPath(request.nextUrl.searchParams.get("next"));
  const creatingAccount = flow === "create-account" || typeValue === "signup";
  const recoveringPassword = flow === "recovery" || typeValue === "recovery";
  let emailVerified = false;
  const applyCookieWrites: Array<(response: NextResponse) => void> = [];
  const authResponseHeaders: Record<string, string> = {};
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  const forwardedProtocol = request.headers.get("x-forwarded-proto");
  const protocol = forwardedProtocol ?? request.nextUrl.protocol.slice(0, -1);
  const requestOrigin =
    host && (protocol === "http" || protocol === "https")
      ? `${protocol}://${host}`
      : request.nextUrl.origin;

  function authRedirect(url: URL) {
    const response = NextResponse.redirect(url, { status: 303 });
    applyCookieWrites.forEach((applyCookies) => applyCookies(response));
    Object.entries(authResponseHeaders).forEach(([key, value]) =>
      response.headers.set(key, value),
    );
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }

  try {
    const supabase = await createSupabaseServerClient(
      (cookiesToSet, headers) => {
        applyCookieWrites.push((response) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        });
        Object.assign(authResponseHeaders, headers);
      },
    );
    let error: Error | null = null;

    if (
      tokenHash &&
      typeValue &&
      allowedOtpTypes.has(typeValue as EmailOtpType)
    ) {
      const result = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: typeValue as EmailOtpType,
      });
      error = result.error;
    } else if (code) {
      const result = await supabase.auth.exchangeCodeForSession(
        code,
        flowId ? { flowId } : undefined,
      );
      error = result.error;
    } else {
      error = new Error("No confirmation credential was provided.");
    }

    if (error) throw error;
    emailVerified = true;
    const profileResult = await supabase.schema("api").rpc("ensure_profile");
    if (profileResult.error) throw profileResult.error;
    if (creatingAccount) {
      const setupUrl = new URL("/account/setup", requestOrigin);
      setupUrl.searchParams.set("next", next);
      return authRedirect(setupUrl);
    }
    if (recoveringPassword) {
      const recoveryUrl = new URL("/account/recover-password", requestOrigin);
      recoveryUrl.searchParams.set("next", next);
      return authRedirect(recoveryUrl);
    }
    return authRedirect(new URL(next, requestOrigin));
  } catch (error) {
    // Verification and profile setup are different failures. Keep the verified
    // session and let account setup retry instead of consuming another email.
    if (emailVerified) {
      const setupUrl = new URL(
        recoveringPassword ? "/account/recover-password" : "/account/setup",
        requestOrigin,
      );
      setupUrl.searchParams.set("next", next);
      return authRedirect(setupUrl);
    }
    const errorCode =
      typeof error === "object" && error && "code" in error
        ? error.code
        : request.nextUrl.searchParams.get("error_code");
    const browserMismatch =
      errorCode === "pkce_code_verifier_not_found" ||
      errorCode === "bad_code_verifier";
    const retryUrl = new URL(
      creatingAccount
        ? "/auth/create-account"
        : recoveringPassword
          ? "/auth/recover"
          : "/auth/sign-in",
      requestOrigin,
    );
    retryUrl.searchParams.set(
      "error",
      browserMismatch ? "browser_mismatch" : "invalid_link",
    );
    retryUrl.searchParams.set("next", next);
    return authRedirect(retryUrl);
  }
}
