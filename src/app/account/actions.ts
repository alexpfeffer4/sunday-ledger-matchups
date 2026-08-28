"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeInternalPath } from "@/adapters/supabase/redirect";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import type {
  AccountSetupState,
  UsernameActionState,
} from "@/app/account/state";

const usernameSchema = z
  .string()
  .trim()
  .min(2, "Use at least 2 characters.")
  .max(30, "Use no more than 30 characters.")
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
    "Use letters, numbers, periods, underscores, or hyphens, starting with a letter or number.",
  );

const accountSetupSchema = z
  .object({
    username: usernameSchema,
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

export async function completeAccountSetup(
  _state: AccountSetupState,
  formData: FormData,
): Promise<AccountSetupState> {
  const parsed = accountSetupSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    return {
      status: "error",
      message: "Finish every required account field before continuing.",
      fieldErrors: {
        username: fields.username?.[0],
        password: fields.password?.[0],
        confirmPassword: fields.confirmPassword?.[0],
      },
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims?.sub) {
      return {
        status: "error",
        message: "Request a new account link before finishing setup.",
      };
    }

    const usernameResult = await supabase
      .schema("api")
      .rpc("update_profile_display_name", {
        p_display_name: parsed.data.username,
      });
    if (usernameResult.error) {
      return {
        status: "error",
        message: "The username could not be saved. Try another username.",
        fieldErrors: {
          username: "Choose another username and try again.",
        },
      };
    }

    const passwordResult = await supabase.auth.updateUser({
      password: parsed.data.password,
    });
    if (passwordResult.error) {
      return {
        status: "error",
        message:
          "The username was saved, but the password was not. Re-enter the password to finish setup.",
        fieldErrors: {
          password: "Re-enter a password and try again.",
        },
      };
    }
  } catch {
    return {
      status: "error",
      message: "Account setup is temporarily unavailable. Try again shortly.",
    };
  }

  revalidatePath("/account");
  revalidatePath("/leagues");
  revalidatePath("/l/[leagueSlug]", "layout");
  redirect(safeInternalPath(parsed.data.next));
}

export async function updateUsername(
  _state: UsernameActionState,
  formData: FormData,
): Promise<UsernameActionState> {
  const parsed = usernameSchema.safeParse(formData.get("username"));
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check the username.",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims?.sub) {
      return {
        status: "error",
        message: "Sign in again before changing your username.",
      };
    }

    const { error } = await supabase
      .schema("api")
      .rpc("update_profile_display_name", {
        p_display_name: parsed.data,
      });
    if (error) {
      return {
        status: "error",
        message: "The username could not be saved. Try again shortly.",
      };
    }
  } catch {
    return {
      status: "error",
      message: "The username could not be saved. Try again shortly.",
    };
  }

  revalidatePath("/account");
  revalidatePath("/leagues");
  revalidatePath("/l/[leagueSlug]", "layout");
  return {
    status: "success",
    message: "Username saved. Your leagues now use this name.",
  };
}
