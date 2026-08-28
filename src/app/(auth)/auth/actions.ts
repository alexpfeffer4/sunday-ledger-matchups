"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeInternalPath } from "@/adapters/supabase/redirect";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import type {
  MagicLinkState,
  PasswordActionState,
} from "@/app/(auth)/auth/state";

const magicLinkSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  next: z.string().optional(),
});

const passwordSignInSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  password: z.string().min(8, "Enter your password."),
  next: z.string().optional(),
});

const passwordUpdateSchema = z
  .object({
    password: z
      .string()
      .min(8, "Use at least 8 characters.")
      .max(128, "Use no more than 128 characters."),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "The passwords do not match.",
    path: ["confirmPassword"],
  });

const passwordRecoverySchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
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

export async function sendMagicLink(
  _state: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const parsed = magicLinkSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check the email address.",
    };
  }

  try {
    const [supabase, origin] = await Promise.all([
      createSupabaseServerClient(),
      requestOrigin(),
    ]);
    const next = safeInternalPath(parsed.data.next);
    const confirmUrl = new URL("/auth/confirm", origin);
    confirmUrl.searchParams.set("next", next);
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: {
        emailRedirectTo: confirmUrl.toString(),
        shouldCreateUser: true,
      },
    });

    if (error) {
      if (error.code === "over_email_send_rate_limit" || error.status === 429) {
        return {
          status: "error",
          message:
            "A sign-in email was just requested. Use the newest email or wait before requesting another.",
        };
      }
      if (error.code === "email_address_not_authorized") {
        return {
          status: "error",
          message:
            "Email delivery is not connected for that address yet. Ask the commissioner to finish custom email setup.",
        };
      }
      return {
        status: "error",
        message: "The sign-in email could not be sent. Try again shortly.",
      };
    }

    return {
      status: "sent",
      message:
        "Check your email for a one-time sign-in link. It opens Account, where you can choose a username and create a password.",
    };
  } catch {
    return {
      status: "error",
      message:
        "Sign-in email is not connected in this environment yet. No email was sent.",
    };
  }
}

export async function requestPasswordReset(
  _state: PasswordActionState,
  formData: FormData,
): Promise<PasswordActionState> {
  const parsed = passwordRecoverySchema.safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check the email address.",
    };
  }

  try {
    const [supabase, origin] = await Promise.all([
      createSupabaseServerClient(),
      requestOrigin(),
    ]);
    const confirmUrl = new URL("/auth/confirm", origin);
    confirmUrl.searchParams.set("flow", "recovery");
    confirmUrl.searchParams.set("next", "/leagues");
    const { error } = await supabase.auth.resetPasswordForEmail(
      parsed.data.email,
      { redirectTo: confirmUrl.toString() },
    );

    if (error) {
      if (error.code === "over_email_send_rate_limit" || error.status === 429) {
        return {
          status: "error",
          message:
            "A recovery email was just requested. Use the newest email or wait before requesting another.",
        };
      }
      if (error.code === "email_address_not_authorized") {
        return {
          status: "error",
          message:
            "Email delivery is not connected for that address yet. Ask the commissioner to finish custom email setup.",
        };
      }
      return {
        status: "error",
        message: "The recovery email could not be sent. Try again shortly.",
      };
    }

    return {
      status: "success",
      message:
        "Check your email for a password-recovery link. The link opens Account so you can choose a new password.",
    };
  } catch {
    return {
      status: "error",
      message: "Password recovery is temporarily unavailable.",
    };
  }
}

export async function signInWithPassword(
  _state: PasswordActionState,
  formData: FormData,
): Promise<PasswordActionState> {
  const parsed = passwordSignInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check your sign-in details.",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (error) {
      return {
        status: "error",
        message: "The email or password is incorrect.",
      };
    }
  } catch {
    return {
      status: "error",
      message: "Password sign-in is temporarily unavailable.",
    };
  }

  redirect(safeInternalPath(parsed.data.next));
}

export async function updatePassword(
  _state: PasswordActionState,
  formData: FormData,
): Promise<PasswordActionState> {
  const parsed = passwordUpdateSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check the new password.",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims?.sub) {
      return {
        status: "error",
        message: "Sign in again before setting a password.",
      };
    }

    const { error } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });
    if (error) {
      return {
        status: "error",
        message: "The password could not be updated. Try again shortly.",
      };
    }
  } catch {
    return {
      status: "error",
      message: "The password could not be updated. Try again shortly.",
    };
  }

  return {
    status: "success",
    message: "Password saved. You can use it the next time you sign in.",
  };
}

export async function signOutAction(): Promise<never> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) {
    await supabase.auth.signOut({ scope: "local" });
  }
  redirect("/");
}
