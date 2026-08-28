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

const emailLinkSchema = z.object({
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
    next: z.string().optional(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "The passwords do not match.",
    path: ["confirmPassword"],
  });

const passwordRecoverySchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
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
            "An email was just requested. Use the newest email or wait before requesting another.",
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
      message:
        intent === "create-account"
          ? "Check your email for a one-time account link. It continues to required username and password setup."
          : "Check your email for a one-time sign-in link. It returns you directly to where you left off.",
    };
  } catch {
    return {
      status: "error",
      message:
        "Email access is temporarily unavailable. No email was sent; try again shortly.",
    };
  }
}

export async function sendCreateAccountLink(
  _state: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  return sendEmailLink(formData, "create-account", true);
}

export async function sendSignInLink(
  _state: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  return sendEmailLink(formData, "sign-in", false);
}

export async function requestPasswordReset(
  _state: PasswordActionState,
  formData: FormData,
): Promise<PasswordActionState> {
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
            "A recovery email was just requested. Use the newest email or wait before requesting another.",
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
      message:
        "Check your email for a password-recovery link. It opens a secure password setup screen, then returns you where you left off.",
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
    const issue = parsed.error.issues[0];
    return {
      status: "error",
      message: issue?.message ?? "Check your sign-in details.",
      field: issue?.path[0] === "email" ? "email" : "password",
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
    const issue = parsed.error.issues[0];
    return {
      status: "error",
      message: issue?.message ?? "Check the new password.",
      field:
        issue?.path[0] === "confirmPassword" ? "confirmPassword" : "password",
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

export async function finishPasswordRecovery(
  _state: PasswordActionState,
  formData: FormData,
): Promise<PasswordActionState> {
  const parsed = passwordUpdateSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      status: "error",
      message: issue?.message ?? "Check the new password.",
      field:
        issue?.path[0] === "confirmPassword" ? "confirmPassword" : "password",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims?.sub) {
      return {
        status: "error",
        message: "Request a new recovery link before setting a password.",
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

  redirect(safeInternalPath(parsed.data.next));
}

export async function signOutAction(): Promise<never> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) {
    await supabase.auth.signOut({ scope: "local" });
  }
  redirect("/");
}
