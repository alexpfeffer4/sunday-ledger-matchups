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

  try {
    const supabase = await createSupabaseServerClient();
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
    const accountUrl = new URL("/account", request.url);
    accountUrl.searchParams.set(
      "setup",
      flow === "recovery" || typeValue === "recovery" ? "password" : "1",
    );
    if (next !== "/account") accountUrl.searchParams.set("next", next);
    return NextResponse.redirect(accountUrl);
  } catch {
    const signInUrl = new URL("/auth/sign-in", request.url);
    signInUrl.searchParams.set("error", "invalid_link");
    signInUrl.searchParams.set("next", next);
    return NextResponse.redirect(signInUrl);
  }
}
