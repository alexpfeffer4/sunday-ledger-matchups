"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import type { AppActionState } from "@/application/actions/action-state";
import { stableOperationKey } from "@/application/actions/stable-operation-key";
import { getPlayerPropMenu } from "@/application/queries/get-player-prop-menu";
import { refreshPlayerMenuQuotes } from "@/adapters/providers/the-odds-api/refresh-card-quotes";
import { runPlayerCatalogPreparation } from "@/application/players/catalog-preparation";

const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export async function openPlayerPropWeekAction(
  expectedWeekId: string,
  _: AppActionState,
  form: FormData,
): Promise<AppActionState> {
  const slug = slugSchema.safeParse(form.get("leagueSlug"));
  if (!slug.success || !z.uuid().safeParse(expectedWeekId).success)
    return failure("");
  const menu = await getPlayerPropMenu(slug.data);
  if (!menu || menu.weekId !== expectedWeekId)
    return {
      status: "error",
      message:
        "The current week changed. Refresh the commissioner page before opening a week.",
    };
  const client = await createSupabaseServerClient();
  const result = await client
    .schema("api")
    .rpc("open_reviewed_player_prop_week", {
      p_league_slug: slug.data,
      p_idempotency_key: stableOperationKey({
        command: "OPEN_REVIEWED_PLAYER_PROP_WEEK",
        leagueSlug: slug.data,
        weekId: expectedWeekId,
      }),
    });
  if (result.error) return failure(result.error.message);
  revalidatePath(`/l/${slug.data}`, "layout");
  return {
    status: "success",
    message:
      "The reviewed week is open. Members can submit bets on the published slate.",
  };
}
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
  let preparation;
  try {
    // The authenticated planner authorizes the commissioner before shared
    // acquisition. Already verified fixtures/catalogs need no provider access.
    preparation = await runPlayerCatalogPreparation(slug.data);
  } catch {
    return failure("");
  }
  const client = await createSupabaseServerClient();
  const result = await client
    .schema("api")
    .rpc("prepare_player_prop_menu", { p_league_slug: slug.data });
  if (result.error) return failure(result.error.message);
  revalidatePath(`/l/${slug.data}/commissioner`);
  revalidatePath(`/l/${slug.data}/slate`);
  if (preparation.status === "DISABLED")
    return {
      status: "error",
      message:
        "Automatic player preparation is not connected yet. Existing verified choices remain available; unresolved slots need attention before opening the week.",
    };
  if (preparation.status === "UNAVAILABLE")
    return {
      status: "error",
      message:
        "Some player identities or result sources could not be verified. Review the unavailable slots before confirming this week.",
    };
  if (preparation.status === "PENDING")
    return {
      status: "success",
      message:
        "The remaining player choices are still being prepared automatically. Refresh this page to view progress before confirming the full slate.",
    };
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
  const result = await client.schema("api").rpc("confirm_player_prop_menu", {
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
