"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import type { AppActionState } from "@/application/actions/action-state";
import { refreshPlayerMenuQuotes } from "@/adapters/providers/the-odds-api/refresh-card-quotes";

const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const choicesSchema = z
  .array(
    z.object({
      eventId: z.uuid(),
      team: z.string().min(1),
      slot: z.enum(["QB_PASS", "RB_RUSH", "RECEIVER"]),
      subjectId: z.uuid().nullable(),
    }),
  )
  .max(192);

function failure(message: string): AppActionState {
  return {
    status: "error",
    message: /frozen/i.test(message)
      ? "A member has already submitted bets. This week’s player menu is fixed."
      : "The player menu could not be updated. Refresh the page and review the unresolved choices.",
  };
}

export async function preparePlayerPropMenuAction(
  _: AppActionState,
  form: FormData,
): Promise<AppActionState> {
  const slug = slugSchema.safeParse(form.get("leagueSlug"));
  if (!slug.success) return failure("");
  const client = await createSupabaseServerClient();
  const result = await client
    .schema("api")
    .rpc("prepare_player_prop_menu", { p_league_slug: slug.data });
  if (result.error) return failure(result.error.message);
  revalidatePath(`/l/${slug.data}/commissioner`);
  revalidatePath(`/l/${slug.data}/slate`);
  return {
    status: "success",
    message:
      "The proposed players are ready to review. Check any unresolved choices, then confirm the slate.",
  };
}

export async function confirmPlayerPropMenuAction(
  _: AppActionState,
  form: FormData,
): Promise<AppActionState> {
  const slug = slugSchema.safeParse(form.get("leagueSlug"));
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("choices")));
  } catch {
    return failure("");
  }
  const choices = choicesSchema.safeParse(raw);
  if (!slug.success || !choices.success || form.get("confirmed") !== "true")
    return failure("");
  const client = await createSupabaseServerClient();
  const result = await client
    .schema("api")
    .rpc("confirm_player_prop_menu", {
      p_league_slug: slug.data,
      p_choices: choices.data,
    });
  if (result.error) return failure(result.error.message);
  revalidatePath(`/l/${slug.data}/commissioner`);
  revalidatePath(`/l/${slug.data}/slate`);
  return {
    status: "success",
    message:
      "Player choices confirmed. The first submitted bet fixes this menu for the week.",
  };
}

export async function refreshPlayerPropQuotesAction(
  _: AppActionState,
  form: FormData,
): Promise<AppActionState> {
  const context = z
    .object({
      leagueSlug: slugSchema,
      leagueId: z.uuid(),
      eventId: z.uuid().optional(),
    })
    .safeParse({
      leagueSlug: form.get("leagueSlug"),
      leagueId: form.get("leagueId"),
      eventId: form.get("eventId") || undefined,
    });
  if (!context.success) return failure("");
  try {
    // The planning RPC validates membership and the exact published event/menu.
    await refreshPlayerMenuQuotes(context.data.leagueId, context.data.eventId);
    revalidatePath(`/l/${context.data.leagueSlug}/slate`);
    revalidatePath(`/l/${context.data.leagueSlug}/commissioner`);
    return {
      status: "success",
      message:
        "Available player lines updated. Players without a current line remain unavailable.",
    };
  } catch {
    return {
      status: "error",
      message:
        "Player lines could not be updated yet. Your drafts and submitted bets are unchanged.",
    };
  }
}
