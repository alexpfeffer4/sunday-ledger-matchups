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

function requestOrigin(request: NextRequest) {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.slice(0, -1);
  return host && (protocol === "http" || protocol === "https")
    ? `${protocol}://${host}`
    : request.nextUrl.origin;
}

function privateResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

// Email scanners and GET/HEAD prefetch must never consume the credential.
export async function GET(request: NextRequest) {
  const destination = new URL("/auth/verify", requestOrigin(request));
  for (const key of [
    "token_hash",
    "type",
    "code",
    "sb_flow_id",
    "flow",
    "error_code",
  ]) {
    const value = request.nextUrl.searchParams.get(key);
    if (value && value.length <= 2048) destination.searchParams.set(key, value);
  }
  destination.searchParams.set(
    "next",
    safeInternalPath(request.nextUrl.searchParams.get("next")),
  );
  return privateResponse(NextResponse.redirect(destination, { status: 303 }));
}

export async function POST(request: NextRequest) {
  const origin = requestOrigin(request);
  if (
    request.headers.get("origin") !== origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    return privateResponse(
      new NextResponse("Open the email link and confirm in this browser.", {
        status: 403,
      }),
    );
  }
  const body = await request.text();
  if (
    body.length > 16384 ||
    !request.headers
      .get("content-type")
      ?.startsWith("application/x-www-form-urlencoded")
  ) {
    return privateResponse(
      new NextResponse("Invalid confirmation request.", { status: 400 }),
    );
  }
  const parameters = new URLSearchParams(body);
  const tokenHash = parameters.get("token_hash");
  const typeValue = parameters.get("type");
  const code = parameters.get("code");
  const flowId = parameters.get("sb_flow_id");
  const flow = parameters.get("flow");
  const next = safeInternalPath(parameters.get("next"));
  const creatingAccount = flow === "create-account" || typeValue === "signup";
  const recoveringPassword = flow === "recovery" || typeValue === "recovery";
  let emailVerified = false;
  const applyCookieWrites: Array<(response: NextResponse) => void> = [];
  const authResponseHeaders: Record<string, string> = {};

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
      const setupUrl = new URL("/account/setup", origin);
      setupUrl.searchParams.set("next", next);
      return authRedirect(setupUrl);
    }
    if (recoveringPassword) {
      const recoveryUrl = new URL("/account/recover-password", origin);
      recoveryUrl.searchParams.set("next", next);
      return authRedirect(recoveryUrl);
    }
    return authRedirect(new URL(next, origin));
  } catch (error) {
    // Verification and profile setup are different failures. Keep the verified
    // session and let account setup retry instead of consuming another email.
    if (emailVerified) {
      const setupUrl = new URL(
        recoveringPassword ? "/account/recover-password" : "/account/setup",
        origin,
      );
      setupUrl.searchParams.set("next", next);
      return authRedirect(setupUrl);
    }
    const errorCode =
      typeof error === "object" && error && "code" in error
        ? error.code
        : parameters.get("error_code");
    const browserMismatch =
      errorCode === "pkce_code_verifier_not_found" ||
      errorCode === "bad_code_verifier";
    const retryUrl = new URL(
      creatingAccount
        ? "/auth/create-account"
        : recoveringPassword
          ? "/auth/recover"
          : "/auth/sign-in",
      origin,
    );
    retryUrl.searchParams.set(
      "error",
      browserMismatch
        ? "browser_mismatch"
        : (typeof error === "object" &&
              error &&
              "status" in error &&
              (Number(error.status) >= 500 || Number(error.status) === 429)) ||
            errorCode === "unexpected_failure" ||
            errorCode === "request_timeout" ||
            errorCode === "over_request_rate_limit" ||
            error instanceof TypeError ||
            (error instanceof Error && error.name === "AuthRetryableFetchError")
          ? "temporarily_unavailable"
          : "invalid_link",
    );
    retryUrl.searchParams.set("next", next);
    return authRedirect(retryUrl);
  }
}
