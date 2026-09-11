"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { pendingAccountSetupCookie } from "@/adapters/supabase/account-setup";
import { safeInternalPath } from "@/adapters/supabase/redirect";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import type { EmailCodeState } from "@/app/(auth)/auth/state";

const codeSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  token: z
    .string()
    .trim()
    .regex(/^\d{6,10}$/),
  flow: z.enum(["create-account", "sign-in", "recovery"]),
  next: z.string().optional(),
});

// A code entered here establishes the session in this browser. It does not
// depend on an email app opening a link in the original PKCE browser context.
export async function verifyEmailCode(
  _state: EmailCodeState,
  formData: FormData,
): Promise<EmailCodeState> {
  const parsed = codeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Enter the complete numeric code from your newest email.",
    };
  }
  const { email, token, flow } = parsed.data;
  const next = safeInternalPath(parsed.data.next);
  let destination = next;
  let verified = false;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: flow === "recovery" ? "recovery" : "email",
    });
    if (error || !data.user || !data.session) {
      return {
        status: "error",
        message:
          error?.status === 429
            ? "Too many attempts. Wait a minute before trying again."
            : error && error.status && error.status >= 500
              ? "Verification is temporarily unavailable. Try again shortly."
              : "That code is invalid, expired, or already used. Use the newest email or request another.",
      };
    }
    verified = true;
    if (flow === "create-account") {
      destination = `/account/setup?next=${encodeURIComponent(next)}`;
      const requestHeaders = await headers();
      (await cookies()).set(pendingAccountSetupCookie, data.user.id, {
        httpOnly: true,
        sameSite: "lax",
        secure: requestHeaders.get("origin")?.startsWith("https://") ?? false,
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
      });
    } else if (flow === "recovery") {
      destination = `/account/recover-password?next=${encodeURIComponent(next)}`;
    }
    const profile = await supabase.schema("api").rpc("ensure_profile");
    if (profile.error) throw profile.error;
  } catch {
    if (!verified) {
      return {
        status: "error",
        message: "Verification is temporarily unavailable. Try again shortly.",
      };
    }
    // The code has been consumed successfully. Keep that session and recover
    // profile setup without asking the member for a second verification email.
    destination = `${flow === "recovery" ? "/account/recover-password" : "/account/setup"}?next=${encodeURIComponent(next)}`;
  }
  redirect(destination);
}
