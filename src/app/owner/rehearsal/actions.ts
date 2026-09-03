"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/adapters/supabase/server";
import type { AppActionState } from "@/application/actions/action-state";
import { stableOperationKey } from "@/application/actions/stable-operation-key";
import {
  getOwnerRehearsal,
  hasOwnerRehearsalEntitlement,
} from "@/application/queries/get-owner-rehearsal";
import {
  ownerRehearsalCheckpoints,
  ownerRehearsalGuide,
} from "@/domain/rehearsal/owner-rehearsal";

const operationSchema = z.object({ operationId: z.uuid() });
const advanceSchema = operationSchema.extend({
  confirmed: z.literal("on").optional(),
  expectedCheckpoint: z.enum(ownerRehearsalCheckpoints),
});
const resetSchema = operationSchema.extend({
  confirmationName: z.string().min(1).max(80),
});

type RehearsalCommand =
  | "ADVANCE_OWNER_REHEARSAL"
  | "FILL_OWNER_REHEARSAL_BOTS"
  | "RESET_OWNER_REHEARSAL"
  | "START_OWNER_REHEARSAL"
  | "USE_OWNER_REHEARSAL_SAMPLE_CARD";

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

function safeError(message: string): AppActionState {
  if (
    message.includes("Not found") ||
    message.includes("permission") ||
    message.includes("Authentication")
  ) {
    return {
      status: "error",
      message: "This private owner tool is not available to this account.",
    };
  }
  if (message.includes("already moved")) {
    return {
      status: "success",
      message:
        "Already completed. The rehearsal moved to its next checkpoint; the latest state is shown now.",
    };
  }
  if (message.includes("Seal your card")) {
    return {
      status: "error",
      message:
        "Seal your complete 1,000-credit card or confirm the sample card before advancing.",
    };
  }
  if (message.includes("confirmation does not match")) {
    return {
      status: "error",
      message: "Type the full rehearsal name exactly before resetting it.",
    };
  }
  if (message.includes("Idempotency key was reused")) {
    return {
      status: "error",
      message:
        "The reviewed inputs changed after this attempt began. Review the current checkpoint and try again.",
    };
  }
  return {
    status: "error",
    message:
      "The rehearsal did not move. Review the current task and try again.",
  };
}

async function commandAlreadyCompleted(
  supabase: SupabaseServerClient,
  commandName: RehearsalCommand,
  operationKey: string,
) {
  const receipt = await supabase.schema("api").rpc("get_my_command_receipt", {
    p_command_name: commandName,
    p_idempotency_key: operationKey,
  });
  return !receipt.error && receipt.data !== null;
}

function refreshRehearsal(leagueSlug?: string) {
  revalidatePath("/owner/rehearsal");
  if (!leagueSlug) return;
  revalidatePath(`/l/${leagueSlug}`);
  revalidatePath(`/l/${leagueSlug}/card`);
  revalidatePath(`/l/${leagueSlug}/commissioner`);
  revalidatePath(`/l/${leagueSlug}/history`);
  revalidatePath(`/l/${leagueSlug}/league`);
  revalidatePath(`/l/${leagueSlug}/matchup`);
  revalidatePath(`/l/${leagueSlug}/playoffs`);
  revalidatePath(`/l/${leagueSlug}/standings`);
}

async function ensureEntitled(): Promise<AppActionState | null> {
  return (await hasOwnerRehearsalEntitlement())
    ? null
    : {
        status: "error",
        message: "This private owner tool is not available to this account.",
      };
}

export async function startOwnerRehearsalAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = operationSchema.safeParse({
    operationId: formData.get("operationId"),
  });
  if (!context.success) return safeError("Invalid operation");
  const denied = await ensureEntitled();
  if (denied) return denied;

  const operationKey = stableOperationKey({
    command: "START_OWNER_REHEARSAL",
    operationId: context.data.operationId,
  });
  const supabase = await createSupabaseServerClient();
  const result = await supabase.schema("api").rpc("start_owner_rehearsal", {
    p_idempotency_key: operationKey,
  });
  if (result.error) {
    if (
      await commandAlreadyCompleted(
        supabase,
        "START_OWNER_REHEARSAL",
        operationKey,
      )
    ) {
      refreshRehearsal();
      return {
        status: "success",
        message: "Already completed. Your personal rehearsal is ready.",
      };
    }
    return safeError(result.error.message);
  }
  refreshRehearsal();
  return {
    status: "success",
    message: "Your private rehearsal is ready at formation.",
  };
}

export async function fillOwnerRehearsalBotsAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = operationSchema.safeParse({
    operationId: formData.get("operationId"),
  });
  if (!context.success) return safeError("Invalid operation");
  const denied = await ensureEntitled();
  if (denied) return denied;
  const rehearsal = await getOwnerRehearsal();
  if (!rehearsal) return safeError("Not found");

  const operationKey = stableOperationKey({
    command: "FILL_OWNER_REHEARSAL_BOTS",
    generation: rehearsal.generation,
    operationId: context.data.operationId,
  });
  const supabase = await createSupabaseServerClient();
  const result = await supabase
    .schema("api")
    .rpc("fill_owner_rehearsal_bots", { p_idempotency_key: operationKey });
  if (result.error) {
    if (
      await commandAlreadyCompleted(
        supabase,
        "FILL_OWNER_REHEARSAL_BOTS",
        operationKey,
      )
    ) {
      refreshRehearsal(rehearsal.leagueSlug);
      return {
        status: "success",
        message:
          "Already completed. Nine rehearsal teams fill the roster; no invitation was sent.",
      };
    }
    return safeError(result.error.message);
  }
  refreshRehearsal(rehearsal.leagueSlug);
  return {
    status: "success",
    message:
      "Nine neutral rehearsal teams joined. No email, invitation, password, or sign-in was created.",
    href: `/l/${rehearsal.leagueSlug}/league`,
    hrefLabel: "Review the 10-member league",
  };
}

export async function useOwnerRehearsalSampleCardAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = operationSchema.safeParse({
    operationId: formData.get("operationId"),
  });
  if (!context.success) return safeError("Invalid operation");
  const denied = await ensureEntitled();
  if (denied) return denied;
  const rehearsal = await getOwnerRehearsal();
  if (!rehearsal) return safeError("Not found");

  const operationKey = stableOperationKey({
    command: "USE_OWNER_REHEARSAL_SAMPLE_CARD",
    checkpoint: rehearsal.checkpoint,
    generation: rehearsal.generation,
    operationId: context.data.operationId,
  });
  const supabase = await createSupabaseServerClient();
  if (rehearsal.quoteReviewPending) {
    const quoteReviewKey = stableOperationKey({
      command: "OWNER_REHEARSAL_QUOTE_REVIEW",
      generation: rehearsal.generation,
      operationId: context.data.operationId,
    });
    const quoteReview = await supabase
      .schema("api")
      .rpc("prepare_owner_rehearsal_quote_review", {
        p_idempotency_key: quoteReviewKey,
        p_league_slug: rehearsal.leagueSlug,
      });
    if (quoteReview.error) return safeError(quoteReview.error.message);
    refreshRehearsal(rehearsal.leagueSlug);
    return {
      status: "error",
      message:
        "The Week 2 quote changed. Review the updated terms, then confirm this same sample-card action again.",
      href: `/l/${rehearsal.leagueSlug}/slate`,
      hrefLabel: "Review updated quote",
    };
  }

  const result = await supabase
    .schema("api")
    .rpc("use_owner_rehearsal_sample_card", {
      p_idempotency_key: operationKey,
    });
  if (result.error) {
    if (
      await commandAlreadyCompleted(
        supabase,
        "USE_OWNER_REHEARSAL_SAMPLE_CARD",
        operationKey,
      )
    ) {
      refreshRehearsal(rehearsal.leagueSlug);
      return {
        status: "success",
        message:
          "Already completed. The original sample card remains sealed once.",
      };
    }
    return safeError(result.error.message);
  }
  refreshRehearsal(rehearsal.leagueSlug);
  return {
    status: "success",
    message: `A Ruleset-valid 1,000-credit Week ${rehearsal.currentWeek ?? ""} sample card is sealed through the ordinary receipt path.`,
    href: `/l/${rehearsal.leagueSlug}/card`,
    hrefLabel: "Open accepted card",
  };
}

export async function advanceOwnerRehearsalAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = advanceSchema.safeParse({
    confirmed: formData.get("confirmed") ?? undefined,
    expectedCheckpoint: formData.get("expectedCheckpoint"),
    operationId: formData.get("operationId"),
  });
  if (!context.success) return safeError("Invalid operation");
  if (
    ownerRehearsalGuide[context.data.expectedCheckpoint].confirmation &&
    context.data.confirmed !== "on"
  ) {
    return {
      status: "error",
      message: "Confirm the named boundary before advancing the rehearsal.",
    };
  }
  const denied = await ensureEntitled();
  if (denied) return denied;
  const rehearsal = await getOwnerRehearsal();
  if (!rehearsal) return safeError("Not found");

  const operationKey = stableOperationKey({
    command: "ADVANCE_OWNER_REHEARSAL",
    expectedCheckpoint: context.data.expectedCheckpoint,
    generation: rehearsal.generation,
    operationId: context.data.operationId,
  });
  const supabase = await createSupabaseServerClient();
  const result = await supabase.schema("api").rpc("advance_owner_rehearsal", {
    p_expected_checkpoint: context.data.expectedCheckpoint,
    p_idempotency_key: operationKey,
  });
  if (result.error) {
    if (
      await commandAlreadyCompleted(
        supabase,
        "ADVANCE_OWNER_REHEARSAL",
        operationKey,
      )
    ) {
      refreshRehearsal(rehearsal.leagueSlug);
      return {
        status: "success",
        message:
          "Already completed. The original advance succeeded and the recovered checkpoint is shown now.",
      };
    }
    refreshRehearsal(rehearsal.leagueSlug);
    return safeError(result.error.message);
  }
  refreshRehearsal(rehearsal.leagueSlug);
  return {
    status: "success",
    message: "Checkpoint completed once. The next real product state is ready.",
  };
}

export async function resetOwnerRehearsalAction(
  _state: AppActionState,
  formData: FormData,
): Promise<AppActionState> {
  const context = resetSchema.safeParse({
    confirmationName: formData.get("confirmationName"),
    operationId: formData.get("operationId"),
  });
  if (!context.success) return safeError("Invalid operation");
  const denied = await ensureEntitled();
  if (denied) return denied;
  const rehearsal = await getOwnerRehearsal();
  if (!rehearsal) return safeError("Not found");

  const operationKey = stableOperationKey({
    command: "RESET_OWNER_REHEARSAL",
    confirmationName: context.data.confirmationName,
    generation: rehearsal.generation,
    operationId: context.data.operationId,
  });
  const supabase = await createSupabaseServerClient();
  const result = await supabase.schema("api").rpc("reset_owner_rehearsal", {
    p_confirmation_name: context.data.confirmationName,
    p_idempotency_key: operationKey,
  });
  if (result.error) {
    if (
      await commandAlreadyCompleted(
        supabase,
        "RESET_OWNER_REHEARSAL",
        operationKey,
      )
    ) {
      refreshRehearsal(rehearsal.leagueSlug);
      return {
        status: "success",
        message:
          "Already completed. Only the prior simulated rehearsal was retired.",
      };
    }
    return safeError(result.error.message);
  }
  refreshRehearsal(rehearsal.leagueSlug);
  return {
    status: "success",
    message:
      "Only this simulated rehearsal was retired. Live leagues and their records were untouched.",
  };
}
