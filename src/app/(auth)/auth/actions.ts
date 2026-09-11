"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { safeInternalPath } from "@/adapters/supabase/redirect";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import type { PasswordActionState } from "@/app/(auth)/auth/state";

const passwordSignInSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address.")),
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
        message: "Sign in again before setting a password.",
      };
    }

    const { error } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });
    if (error && error.code !== "same_password") {
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

  if (parsed.data.next) redirect(safeInternalPath(parsed.data.next));

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
