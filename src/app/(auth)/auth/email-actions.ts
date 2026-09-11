import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { pendingAccountSetupCookie } from "@/adapters/supabase/account-setup";
import { safeInternalPath } from "@/adapters/supabase/redirect";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import type {
  EmailCodeAction,
  EmailCodeState,
  MagicLinkState,
  PasswordActionState,
} from "@/app/(auth)/auth/state";

// Imported by Server Components and passed to forms as action props so Next
// registers both request endpoints and the encrypted verification closures.
const emailLinkSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address.")),
  next: z.string().optional(),
});

const passwordRecoverySchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address.")),
  next: z.string().optional(),
});

async function requestOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (origin) {
    const parsed = new URL(origin);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.origin;
    }
  }

  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  if (!host || (protocol !== "http" && protocol !== "https")) {
    throw new Error("The request origin could not be verified.");
  }
  return `${protocol}://${host}`;
}

async function sendEmailLink(
  formData: FormData,
  intent: "create-account" | "sign-in",
  shouldCreateUser: boolean,
): Promise<MagicLinkState> {
  const parsed = emailLinkSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check the email address.",
      field: "email",
    };
  }

  try {
    const [supabase, origin] = await Promise.all([
      createSupabaseServerClient(),
      requestOrigin(),
    ]);
    const next = safeInternalPath(parsed.data.next);
    const confirmUrl = new URL("/auth/confirm", origin);
    confirmUrl.searchParams.set("flow", intent);
    confirmUrl.searchParams.set("next", next);
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: {
        emailRedirectTo: confirmUrl.toString(),
        shouldCreateUser,
      },
    });

    if (error) {
      if (error.code === "over_email_send_rate_limit" || error.status === 429) {
        return {
          status: "error",
          message:
            "Email requests are temporarily limited. Wait a minute, then try again. If you received an email, use the newest one in the same browser.",
          retryAfterSeconds: 60,
        };
      }
      if (error.code === "email_address_not_authorized") {
        return {
          status: "error",
          message:
            "Email delivery is not available for that address yet. Ask the commissioner for help.",
        };
      }
      return {
        status: "error",
        message:
          intent === "create-account"
            ? "The account email could not be sent. Try again shortly."
            : "The sign-in email could not be sent. Check that the account already exists, then try again.",
      };
    }

    return {
      status: "sent",
      email: parsed.data.email,
      verifyCode: createEmailCodeVerifier({
        email: parsed.data.email,
        flow: intent,
        next,
      }),
      retryAfterSeconds: 60,
      message:
        intent === "create-account"
          ? "Check your email. Enter its verification code here, if included, or open the newest link in this same browser to continue to username and password setup."
          : "Check your email. Enter its verification code here, if included, or open the newest link in this same browser to continue.",
    };
  } catch {
    return {
      status: "error",
      message:
        "We could not confirm email delivery. Check your inbox before trying again shortly.",
    };
  }
}

export async function sendCreateAccountLink(
  _state: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  "use server";
  return sendEmailLink(formData, "create-account", true);
}

export async function sendSignInLink(
  _state: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  "use server";
  return sendEmailLink(formData, "sign-in", false);
}

export async function requestPasswordReset(
  _state: PasswordActionState,
  formData: FormData,
): Promise<PasswordActionState> {
  "use server";
  const parsed = passwordRecoverySchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check the email address.",
      field: "email",
    };
  }

  try {
    const [supabase, origin] = await Promise.all([
      createSupabaseServerClient(),
      requestOrigin(),
    ]);
    const confirmUrl = new URL("/auth/confirm", origin);
    confirmUrl.searchParams.set("flow", "recovery");
    confirmUrl.searchParams.set("next", safeInternalPath(parsed.data.next));
    const { error } = await supabase.auth.resetPasswordForEmail(
      parsed.data.email,
      { redirectTo: confirmUrl.toString() },
    );

    if (error) {
      if (error.code === "over_email_send_rate_limit" || error.status === 429) {
        return {
          status: "error",
          message:
            "Email requests are temporarily limited. Wait a minute, then try again. If you received an email, use the newest one in the same browser.",
          retryAfterSeconds: 60,
        };
      }
      if (error.code === "email_address_not_authorized") {
        return {
          status: "error",
          message:
            "Email delivery is not available for that address yet. Ask the commissioner for help.",
        };
      }
      return {
        status: "error",
        message: "The recovery email could not be sent. Try again shortly.",
      };
    }

    return {
      status: "success",
      email: parsed.data.email,
      verifyCode: createEmailCodeVerifier({
        email: parsed.data.email,
        flow: "recovery",
        next: safeInternalPath(parsed.data.next),
      }),
      retryAfterSeconds: 60,
      message:
        "If an account exists for this email, check for the newest recovery link. Open it in this same browser to save a new password, then return where you left off.",
    };
  } catch {
    return {
      status: "error",
      message: "Password recovery is temporarily unavailable.",
    };
  }
}

type EmailCodeRequest = {
  email: string;
  flow: "create-account" | "sign-in" | "recovery";
  next: string;
};

// Next encrypts this closure's request context when sending the Server Action
// reference to the client. Only the numeric credential comes from the form.
// This factory is called on the server after issuing the requested email.
function createEmailCodeVerifier(request: EmailCodeRequest): EmailCodeAction {
  return async function verifyRequestedEmailCode(_state, formData) {
    "use server";
    return verifyEmailCode(request, formData);
  };
}

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
async function verifyEmailCode(
  request: EmailCodeRequest,
  formData: FormData,
): Promise<EmailCodeState> {
  const parsed = codeSchema.safeParse({
    ...request,
    token: formData.get("token"),
  });
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
