// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Stage1StateDto } from "@/application/queries/stage1-dtos";
import { Stage1CardBuilder } from "@/components/card/stage1-card-builder";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/app/l/[leagueSlug]/actions", () => ({
  acceptStage1CardAction: vi.fn(),
}));

beforeAll(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    close: {
      configurable: true,
      value() {
        this.removeAttribute("open");
      },
    },
    showModal: {
      configurable: true,
      value() {
        this.setAttribute("open", "");
      },
    },
  });
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

const leagueId = "10000000-0000-4000-8000-000000000001";
const weekId = "10000000-0000-4000-8000-000000000002";
const cardId = "10000000-0000-4000-8000-000000000003";
const eventId = "10000000-0000-4000-8000-000000000004";
const staleMarketId = "10000000-0000-4000-8000-000000000005";
const healthyMarketId = "10000000-0000-4000-8000-000000000006";

const state = {
  league: {
    id: leagueId,
    name: "Test League",
    slug: "test-league",
    role: "MEMBER",
    mode: "LIVE",
    nflYear: 2026,
    lifecycle: "REGULAR",
    memberCount: 2,
  },
  week: {
    id: weekId,
    nflWeek: 1,
    scope: "REGULAR",
    state: "OPEN",
    opensAt: "2026-09-08T10:00:00.000Z",
    commonLockAt: "2026-09-13T16:55:00.000Z",
    lockedAt: null,
    correctionWindowClosesAt: null,
  },
  slate: [
    {
      id: eventId,
      key: "harbor-lake",
      awayTeam: "Harbor Club",
      homeTeam: "Lake Club",
      scheduledStartAt: "2026-09-13T17:00:00.000Z",
      actualStartedAt: null,
      state: "SCHEDULED",
      providerHealth: "HEALTHY",
      markets: [
        {
          id: staleMarketId,
          marketType: "MONEYLINE",
          outcomeKey: "AWAY",
          proposition: "Harbor Club",
          lineMilli: null,
          americanOdds: -190,
          qualityStatus: "STALE",
          observedAt: "2026-09-13T16:40:00.000Z",
          payloadHash: "b".repeat(64),
          maximumStakeCredits: 1_000,
        },
        {
          id: healthyMarketId,
          marketType: "MONEYLINE",
          outcomeKey: "HOME",
          proposition: "Lake Club",
          lineMilli: null,
          americanOdds: 165,
          qualityStatus: "HEALTHY",
          observedAt: "2026-09-13T16:42:00.000Z",
          payloadHash: "c".repeat(64),
          maximumStakeCredits: 1_000,
        },
      ],
    },
  ],
  ownerCard: {
    id: cardId,
    entryId: "10000000-0000-4000-8000-000000000007",
    grantedCredits: 1_000,
    grantedAt: "2026-09-08T10:00:00.000Z",
    compliance: "PENDING",
    lockedAt: null,
    allocatedCredits: 0,
    remainingCredits: 1_000,
    positions: [],
  },
} as unknown as Stage1StateDto;

describe("authenticated card editor", () => {
  it("reconciles a mounted draft when refreshed server state replaces its quote", async () => {
    const originalState = {
      ...state,
      slate: [
        {
          ...state.slate[0],
          markets: [
            {
              ...state.slate[0].markets[0],
              americanOdds: -185,
              payloadHash: "a".repeat(64),
              qualityStatus: "HEALTHY",
            },
            state.slate[0].markets[1],
          ],
        },
      ],
    } as Stage1StateDto;
    localStorage.setItem(
      `sunday-ledger:card-draft:v1:${leagueId}:${weekId}:${cardId}`,
      JSON.stringify({
        version: 1,
        drafts: [
          {
            eventId,
            marketType: "MONEYLINE",
            outcomeKey: "AWAY",
            reviewedAmericanOdds: -185,
            reviewedPayloadHash: "a".repeat(64),
            reviewedProposition: "Harbor Club",
            stakeCredits: 1_000,
          },
        ],
      }),
    );

    const view = render(<Stage1CardBuilder state={originalState} />);
    expect(screen.queryByText("Updated quote")).not.toBeInTheDocument();

    const refreshedState = {
      ...originalState,
      slate: [
        {
          ...originalState.slate[0],
          markets: [
            {
              ...originalState.slate[0].markets[0],
              id: "10000000-0000-4000-8000-000000000008",
              americanOdds: -190,
              payloadHash: "d".repeat(64),
            },
            originalState.slate[0].markets[1],
          ],
        },
      ],
    } as Stage1StateDto;
    view.rerender(<Stage1CardBuilder state={refreshedState} />);

    expect(await screen.findByText("Updated quote")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Review 1 updated quote" }),
    );
    expect(
      screen.getByRole("button", { name: "Use updated odds" }),
    ).toBeEnabled();
  });

  it("keeps an unavailable restored quote under review until a healthy outcome is selected", async () => {
    localStorage.setItem(
      `sunday-ledger:card-draft:v1:${leagueId}:${weekId}:${cardId}`,
      JSON.stringify({
        version: 1,
        drafts: [
          {
            eventId,
            marketType: "MONEYLINE",
            outcomeKey: "AWAY",
            reviewedAmericanOdds: -185,
            reviewedPayloadHash: "a".repeat(64),
            reviewedProposition: "Harbor Club",
            stakeCredits: 1_000,
          },
        ],
      }),
    );

    render(<Stage1CardBuilder state={state} />);

    expect(await screen.findByText("Updated quote")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit pick" }));

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: /^Harbor Club.*190$/ }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: "Update pick" }),
    ).toBeDisabled();

    const form = dialog.querySelector("form");
    if (!form) throw new Error("The pick editor form was not rendered.");
    fireEvent.submit(form);
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Choose an available outcome before saving this pick.",
    );
    expect(screen.getByText("Updated quote")).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("button", { name: /^Lake Club.*165$/ }),
    );
    expect(
      within(dialog).getByRole("button", { name: "Update pick" }),
    ).toBeEnabled();
    fireEvent.submit(form);

    const eventRegion = screen.getByRole("region", {
      name: "Harbor Club at Lake Club",
    });
    await waitFor(() =>
      expect(
        within(eventRegion).getByRole("button", { name: /^Lake Club.*165$/ }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
    await waitFor(() =>
      expect(screen.queryByText("Updated quote")).not.toBeInTheDocument(),
    );
  });
});
