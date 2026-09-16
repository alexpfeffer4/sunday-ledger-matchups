import { beforeEach, expect, it, vi } from "vitest";
import { initialAppActionState } from "@/application/actions/action-state";
import { confirmPlayerPropMenuAction } from "@/app/l/[leagueSlug]/player-prop-actions";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/adapters/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    schema: () => ({ rpc: mocks.rpc }),
  }),
}));
vi.mock("@/application/queries/get-player-prop-menu", () => ({
  getPlayerPropMenu: vi.fn(),
}));
vi.mock("@/adapters/providers/the-odds-api/refresh-card-quotes", () => ({
  refreshPlayerMenuQuotes: vi.fn(),
}));
vi.mock("@/application/players/catalog-preparation", () => ({
  runPlayerCatalogPreparation: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ error: null });
});
function form() {
  const value = new FormData();
  value.set("leagueSlug", "test-league");
  value.set(
    "choices",
    JSON.stringify([
      {
        eventId: "00000000-0000-4000-8000-000000000001",
        team: "BUF",
        slot: "QB_PASS",
        subjectId: null,
      },
    ]),
  );
  return value;
}
it("sends the explicit checked policy to its distinct confirmation RPC", async () => {
  const input = form();
  input.set("emptySlotPublication", "AUTOMATIC_BEFORE_EVENT_CUTOFF");
  expect(
    (await confirmPlayerPropMenuAction(initialAppActionState, input)).status,
  ).toBe("success");
  expect(mocks.rpc).toHaveBeenCalledWith(
    "confirm_progressive_player_prop_menu",
    expect.objectContaining({
      p_empty_slot_publication: "AUTOMATIC_BEFORE_EVENT_CUTOFF",
    }),
  );
});
it("never upgrades a stale legacy confirmation into automatic-publication consent", async () => {
  const input = form();
  input.set("confirmed", "true");
  mocks.rpc.mockResolvedValue({
    error: { message: "Explicit progressive policy acknowledgement required." },
  });
  expect(
    (await confirmPlayerPropMenuAction(initialAppActionState, input)).status,
  ).toBe("error");
  expect(mocks.rpc).toHaveBeenCalledWith(
    "confirm_player_prop_menu",
    expect.not.objectContaining({
      p_empty_slot_publication: expect.anything(),
    }),
  );
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it.each([null, "true", "AUTOMATIC_AFTER_KICKOFF"])(
  "rejects missing or unrecognized policy %s before an RPC",
  async (policy) => {
    const input = form();
    if (policy !== null) input.set("emptySlotPublication", policy);
    expect(
      (await confirmPlayerPropMenuAction(initialAppActionState, input)).status,
    ).toBe("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  },
);
