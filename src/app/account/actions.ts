"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import type { UsernameActionState } from "@/app/account/state";

const usernameSchema = z
  .string()
  .trim()
  .min(2, "Use at least 2 characters.")
  .max(30, "Use no more than 30 characters.")
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
    "Use letters, numbers, periods, underscores, or hyphens, starting with a letter or number.",
  );

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
