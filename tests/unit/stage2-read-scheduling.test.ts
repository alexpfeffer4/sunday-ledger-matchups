import { beforeEach, expect, it, vi } from "vitest";
import { makePhase6State } from "../fixtures/phase6-paired-matchup";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  menu: vi.fn(),
  claims: vi.fn(),
  rehearsal: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/adapters/supabase/config", () => ({
  isSupabaseConfigured: () => true,
}));
vi.mock("@/adapters/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: mocks.claims },
    schema: () => ({ rpc: mocks.rpc }),
  }),
}));
vi.mock("@/application/queries/get-player-prop-menu", () => ({
  getPlayerPropMenu: mocks.menu,
}));
vi.mock("@/application/queries/get-owner-rehearsal", () => ({
  getOwnerRehearsalForLeague: mocks.rehearsal,
}));
import {
  getAuthoritativeLeagueState,
  getLeagueState,
} from "@/application/queries/get-live-stage1-league";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.claims.mockResolvedValue({ data: { claims: { sub: "member" } } });
});
function fixture() {
  const { state } = makePhase6State("PREGAME");
  state.league.mode = "LIVE";
  state.week!.propsEnabled = true;
  return state;
}
it("starts quote heads while the independent menu is still unresolved", async () => {
  const state = fixture();
  let completeMenu!: (value: unknown) => void;
  const menu = new Promise((resolve) => {
    completeMenu = resolve;
  });
  mocks.menu.mockReturnValue(menu);
  mocks.rpc.mockImplementation(async (name) => ({
    data: name === "get_stage1_state" ? state : [],
    error: null,
  }));
  const pending = getAuthoritativeLeagueState("sunday-ledger");
  await vi.waitFor(() =>
    expect(mocks.rpc).toHaveBeenCalledWith("get_live_quote_heads", {
      p_league_slug: "sunday-ledger",
    }),
  );
  completeMenu({ weekId: state.week!.id, slots: [] });
  const result = await pending;
  expect(result!.slate.every((event) => event.playerProps?.length === 0)).toBe(
    true,
  );
  expect(state.slate.every((event) => event.playerProps === undefined)).toBe(
    true,
  );
});
it("base page reads retain event/receipt context without requesting prices or props", async () => {
  const state = fixture();
  mocks.rpc.mockResolvedValue({ data: state, error: null });
  const result = await getLeagueState("sunday-ledger");
  expect(result?.ownerCard).toEqual(state.ownerCard);
  expect(result?.slate).toEqual(state.slate);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.menu).not.toHaveBeenCalled();
});
it.each(["42501", "P0002"])(
  "denied base scope %s never starts enrichment",
  async (code) => {
    mocks.rpc.mockResolvedValue({ error: { code } });
    expect(await getAuthoritativeLeagueState("other-league")).toBeNull();
    expect(mocks.menu).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  },
);
it("unauthenticated requests perform no league reads", async () => {
  mocks.claims.mockResolvedValue({ data: null });
  expect(await getAuthoritativeLeagueState("other-league")).toBeNull();
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it.each([false, true])(
  "legacy Simulation only reads quote heads for an owner rehearsal (%s)",
  async (rehearsal) => {
    const state = fixture();
    state.league.mode = "SIMULATION";
    state.week!.propsEnabled = false;
    state.week!.rollingSubmissionsEnabled = false;
    mocks.rehearsal.mockResolvedValue(rehearsal ? { id: "fixture" } : null);
    mocks.rpc.mockImplementation(async (name) => ({
      data: name === "get_stage1_state" ? state : [],
      error: null,
    }));
    const result = await getAuthoritativeLeagueState("sunday-ledger");
    expect(result?.slate).toEqual(state.slate);
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(
      rehearsal
        ? ["get_stage1_state", "get_live_quote_heads"]
        : ["get_stage1_state"],
    );
  },
);
