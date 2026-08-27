"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { safeInternalPath } from "@/adapters/supabase/redirect";
import { createSupabaseServerClient } from "@/adapters/supabase/server";

const magicLinkSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  next: z.string().optional(),
});

export type MagicLinkState = {
  status: "idle" | "error" | "sent";
  message: string;
};

export const initialMagicLinkState: MagicLinkState = {
  status: "idle",
  message: "",
};

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
      return {
        status: "error",
        message: "The sign-in email could not be sent. Try again shortly.",
      };
    }

    return {
      status: "sent",
      message: "Check your email for a one-time Sunday Ledger sign-in link.",
    };
  } catch {
    return {
      status: "error",
      message:
        "Supabase is not connected in this environment yet. No sign-in email was sent.",
    };
  }
}
