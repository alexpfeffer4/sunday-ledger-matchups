import { beforeEach, expect, it, vi } from "vitest";
import { useOwnerRehearsalSampleCardAction } from "@/app/owner/rehearsal/actions";
import { initialAppActionState } from "@/application/actions/action-state";
import type { OwnerRehearsalSummary } from "@/application/queries/get-owner-rehearsal";

const mocks = vi.hoisted(() => ({
  rehearsal: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/application/queries/get-owner-rehearsal", () => ({
  getOwnerRehearsal: mocks.rehearsal,
  hasOwnerRehearsalEntitlement: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/adapters/supabase/server", () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    schema: () => ({ rpc: mocks.rpc }),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: {}, error: null });
});

function form(rollingSubmissionsEnabled: boolean | undefined) {
  mocks.rehearsal.mockResolvedValue({
    leagueSlug: "owner-rehearsal",
    currentWeek: 2,
    checkpoint: "WEEK_2_OPEN",
    generation: 1,
    quoteReviewPending: false,
    rollingSubmissionsEnabled,
  } satisfies Partial<OwnerRehearsalSummary>);
  const data = new FormData();
  data.set("operationId", "7447d19b-f4fb-44c8-9dce-73b0027c8c5a");
  return data;
}

it.each([false, undefined])(
  "keeps the sealed-card confirmation for legacy rehearsal (%s)",
  async (rolling) => {
    const result = await useOwnerRehearsalSampleCardAction(
      initialAppActionState,
      form(rolling),
    );
    expect(result.status).toBe("success");
    expect(result.message).toContain(
      "1,000-credit Week 2 sample card is sealed",
    );
  },
);

it("confirms rolling sample bets without claiming the full weekly budget was used", async () => {
  const result = await useOwnerRehearsalSampleCardAction(
    initialAppActionState,
    form(true),
  );
  expect(result.status).toBe("success");
  expect(result.message).toContain("Week 2 sample bets are submitted");
  expect(result.message).toContain("remaining credits");
  expect(result.message).not.toMatch(/sealed|1,000/);
});

it.each([
  [false, "original sample card remains sealed once"],
  [true, "original sample bets remain submitted once"],
] as const)(
  "preserves versioned retry confirmation (%s)",
  async (rolling, message) => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "retry" },
    });
    const result = await useOwnerRehearsalSampleCardAction(
      initialAppActionState,
      form(rolling),
    );
    expect(result.status).toBe("success");
    expect(result.message).toContain(message);
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      "get_my_command_receipt",
      expect.objectContaining({
        p_command_name: "USE_OWNER_REHEARSAL_SAMPLE_CARD",
      }),
    );
  },
);
