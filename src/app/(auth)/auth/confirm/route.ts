import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeInternalPath } from "@/adapters/supabase/redirect";
import { createSupabaseServerClient } from "@/adapters/supabase/server";

const allowedOtpTypes = new Set<EmailOtpType>([
  "email",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
]);

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const typeValue = request.nextUrl.searchParams.get("type");
  const code = request.nextUrl.searchParams.get("code");
  const flow = request.nextUrl.searchParams.get("flow");
  const next = safeInternalPath(request.nextUrl.searchParams.get("next"));
  const applyCookieWrites: Array<(response: NextResponse) => void> = [];
  const authResponseHeaders: Record<string, string> = {};

  function authRedirect(url: URL) {
    const response = NextResponse.redirect(url, { status: 303 });
    applyCookieWrites.forEach((applyCookies) => applyCookies(response));
    Object.entries(authResponseHeaders).forEach(([key, value]) =>
      response.headers.set(key, value),
    );
    response.headers.set("Cache-Control", "private, no-store");
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
      const result = await supabase.auth.exchangeCodeForSession(code);
      error = result.error;
    } else {
      error = new Error("No confirmation credential was provided.");
    }

    if (error) throw error;
    const profileResult = await supabase.schema("api").rpc("ensure_profile");
    if (profileResult.error) throw profileResult.error;
    if (flow === "create-account") {
      const setupUrl = new URL("/account/setup", request.url);
      setupUrl.searchParams.set("next", next);
      return authRedirect(setupUrl);
    }
    if (flow === "recovery" || typeValue === "recovery") {
      const recoveryUrl = new URL("/account/recover-password", request.url);
      recoveryUrl.searchParams.set("next", next);
      return authRedirect(recoveryUrl);
    }
    return authRedirect(new URL(next, request.url));
  } catch {
    const signInUrl = new URL("/auth/sign-in", request.url);
    signInUrl.searchParams.set("error", "invalid_link");
    signInUrl.searchParams.set("next", next);
    return authRedirect(signInUrl);
  }
}
