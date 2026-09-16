"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AppActionState } from "@/application/actions/action-state";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
const schema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  command: z.enum(["ENABLE", "PAUSE", "RESUME", "RETRY", "REVOKE"]),
});
export async function configureSeasonAutomationAction(
  _: AppActionState,
  form: FormData,
): Promise<AppActionState> {
  const input = schema.safeParse({
    slug: form.get("leagueSlug"),
    command: form.get("command"),
  });
  if (
    !input.success ||
    (input.data.command === "ENABLE" &&
      form.get("policyConsent") !== "approved")
  )
    return {
      status: "error",
      message:
        "Choose the season settings and acknowledge the automatic props policy.",
    };
  const week = z.coerce
    .number()
    .int()
    .min(2)
    .max(18)
    .safeParse(form.get("effectiveWeek"));
  const preset = z
    .enum(["ALL_NFL_GAMES", "SUNDAY_AFTERNOON_AND_MONDAY"])
    .safeParse(form.get("preset"));
  const policy = z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .safeParse(form.get("policyHash"));
  if (
    input.data.command === "ENABLE" &&
    (!week.success || !preset.success || !policy.success)
  )
    return {
      status: "error",
      message: "The season settings changed. Refresh the page and try again.",
    };
  const client = await createSupabaseServerClient();
  const result = await client.schema("api").rpc("configure_season_automation", {
    p_league_slug: input.data.slug,
    p_command: input.data.command,
    ...(input.data.command === "ENABLE" &&
    week.success &&
    preset.success &&
    policy.success
      ? {
          p_effective_week: week.data,
          p_slate_preset: preset.data,
          p_policy_hash: policy.data,
        }
      : {}),
  });
  if (result.error)
    return {
      status: "error",
      message:
        result.error.code === "42501"
          ? "Only the current commissioner can change season automation."
          : result.error.message.includes("five minutes")
            ? "Wait five minutes before retrying automation."
            : "Automation could not be changed. Refresh the page and check the current week and policy.",
    };
  revalidatePath(`/l/${input.data.slug}/commissioner`);
  return {
    status: "success",
    message:
      input.data.command === "ENABLE"
        ? "Season automation approved. Enrolled future weeks need no weekly player confirmation."
        : input.data.command === "PAUSE"
          ? "Future preparation and publication paused. Current bets, results and authorized pending props continue."
          : input.data.command === "RETRY"
            ? "A guarded retry is queued. Existing provider cooldowns and budgets still apply."
            : input.data.command === "REVOKE"
              ? "Season approval revoked. Already-open weeks continue normally."
              : "Season automation resumed.",
  };
}
