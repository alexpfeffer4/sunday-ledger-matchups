import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";

const baseURL = "http://127.0.0.1:3000";
const supabaseUrl = process.env.TEST_SUPABASE_URL;
const publishableKey = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.TEST_SUPABASE_DB_URL;
const acceptanceRequested = process.env.FULL_STACK_ACCEPTANCE === "1";
const missingSettings = [
  ["TEST_SUPABASE_URL", supabaseUrl],
  ["TEST_SUPABASE_PUBLISHABLE_KEY", publishableKey],
  ["TEST_SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey],
  ["TEST_SUPABASE_DB_URL", databaseUrl],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (acceptanceRequested && missingSettings.length > 0) {
  throw new Error(
    `Full-stack acceptance was requested without ${missingSettings.join(", ")}.`,
  );
}

const enabled = acceptanceRequested && missingSettings.length === 0;
if (enabled) {
  for (const value of [supabaseUrl!, databaseUrl!]) {
    if (!["localhost", "127.0.0.1"].includes(new URL(value).hostname)) {
      throw new Error(
        "Controlled acceptance refuses hosted Auth or database servers.",
      );
    }
  }
}

type Identity = {
  displayName: string;
  email: string;
  password: string;
  userId: string;
};

type StageState = {
  league: { id: string; name: string; slug: string };
  matchup: {
    opponentEntryId: string;
    opponentRevealedPositions: Array<{ proposition: string }>;
    result: { status: string } | null;
  } | null;
  members: Array<{ entryId: string | null; userId: string }>;
  season: { simulatedNow: string };
  ownerCard: { positions: Array<{ id: string; receiptHash: string }> } | null;
  slate: Array<{
    scheduledStartAt: string;
    markets: Array<{
      americanOdds: number;
      id: string;
      payloadHash: string;
      proposition: string;
      qualityStatus: string;
    }>;
  }>;
  week: {
    nflWeek: number;
    commonLockAt: string;
    correctionWindowClosesAt: string | null;
    state: string;
  } | null;
};

function apiClient(key: string): SupabaseClient {
  return createClient(supabaseUrl!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function expectRpc<T>(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const result = await client.schema("api").rpc(name, args);
  expect(result.error, `${name}: ${result.error?.message ?? "ok"}`).toBeNull();
  return result.data as T;
}

async function createIdentity(
  admin: SupabaseClient,
  suffix: string,
  displayName: string,
): Promise<Identity> {
  const identity = {
    displayName,
    email: `${suffix}@controlled.test`,
    password: `Controlled-${suffix}-48!`,
  };
  const created = await admin.auth.admin.createUser({
    email: identity.email,
    email_confirm: true,
    password: identity.password,
  });
  expect(created.error).toBeNull();
  const userId = created.data.user?.id;
  expect(userId).toBeTruthy();

  const client = apiClient(publishableKey!);
  const signedIn = await client.auth.signInWithPassword(identity);
  expect(signedIn.error).toBeNull();
  await expectRpc(client, "ensure_profile", { p_display_name: displayName });
  return { ...identity, userId: userId! };
}

async function signedInClient(identity: Pick<Identity, "email" | "password">) {
  const client = apiClient(publishableKey!);
  const signedIn = await client.auth.signInWithPassword(identity);
  expect(signedIn.error).toBeNull();
  return client;
}

async function browserSignIn(page: Page, identity: Identity, next: string) {
  await page.goto(`/auth/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email address").fill(identity.email);
  await page.getByLabel("Password", { exact: true }).fill(identity.password);
  await page.getByRole("button", { name: "Sign in with password" }).click();
  await page.waitForURL(`**${next}`);
}

async function newPage(browser: Browser) {
  const context = await browser.newContext({ baseURL });
  return { context, page: await context.newPage() };
}

function chooseMarket(state: StageState, excludedProposition?: string) {
  const market = state.slate
    .flatMap((event) => event.markets)
    .find(
      (candidate) =>
        candidate.qualityStatus === "HEALTHY" &&
        candidate.americanOdds >= -200 &&
        candidate.proposition !== excludedProposition,
    );
  expect(market).toBeTruthy();
  return market!;
}

async function getState(client: SupabaseClient, leagueSlug: string) {
  return expectRpc<StageState>(client, "get_stage1_state", {
    p_league_slug: leagueSlug,
  });
}

test.skip(!enabled, "requires the disposable local Supabase acceptance job");

test("real invite, Auth, RSC, retry, privacy, settlement, and finalization path", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const run = Date.now().toString(36);
  const admin = apiClient(serviceRoleKey!);
  const commissioner = await createIdentity(
    admin,
    `commissioner-${run}`,
    "Casey Commissioner",
  );
  const memberOne = await createIdentity(
    admin,
    `member-one-${run}`,
    "Morgan Member",
  );
  const memberTwo = await createIdentity(
    admin,
    `member-two-${run}`,
    "Riley Member",
  );
  const outsider = await createIdentity(
    admin,
    `outsider-${run}`,
    "Outside Observer",
  );
  const otherLeagueMember = await createIdentity(
    admin,
    `other-league-${run}`,
    "Other League Member",
  );

  const commissionerClient = await signedInClient(commissioner);
  const slug = `controlled-${run}`;
  const created = await expectRpc<
    Array<{ league_id: string; league_slug: string }>
  >(commissionerClient, "create_league", {
    p_mode: "SIMULATION",
    p_name: "Controlled Acceptance League",
    p_nfl_year: 2026,
    p_slug: slug,
  });
  const leagueId = created[0]?.league_id;
  expect(leagueId).toBeTruthy();

  // The frozen fixture opens on September 13, 2026. New simulation leagues
  // start at wall-clock now(), which eventually passes that fixture date.
  // Seed only this newly created disposable season before testing monotonic
  // advancement through the real commissioner action. Production stays untouched.
  execFileSync(
    "psql",
    [
      databaseUrl!,
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      `league_id=${leagueId}`,
    ],
    {
      input:
        "update private.seasons set simulated_now = '2026-09-01 00:00:00+00' where league_id = :'league_id'::uuid and mode = 'SIMULATION';",
      encoding: "utf8",
    },
  );
  expect(
    new Date(
      (await getState(commissionerClient, slug)).season.simulatedNow,
    ).toISOString(),
  ).toBe("2026-09-01T00:00:00.000Z");

  const invitation = await expectRpc<{ token: string }>(
    commissionerClient,
    "create_league_invite_retry_safe",
    {
      p_expires_in_days: 7,
      p_idempotency_key: `op:${"1".repeat(64)}`,
      p_league_id: leagueId,
      p_max_uses: 5,
    },
  );
  const invitePath = `/join/${invitation.token}`;

  for (const identity of [memberOne, memberTwo]) {
    const memberClient = await signedInClient(identity);
    await expectRpc(memberClient, "join_league", {
      p_token: invitation.token,
    });
  }

  const otherClient = await signedInClient(otherLeagueMember);
  await expectRpc(otherClient, "create_league", {
    p_mode: "SIMULATION",
    p_name: "Separate Private League",
    p_nfl_year: 2026,
    p_slug: `separate-${run}`,
  });

  await page.goto("/");
  await page.getByRole("link", { name: "Rules", exact: true }).last().click();
  await expect(
    page.getByRole("heading", { name: "Season 1 rules" }),
  ).toBeFocused();
  await page.goto("/trust");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.goto(invitePath);
  await expect(
    page.getByRole("heading", { name: "Controlled Acceptance League" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Create account" }).click();
  await expect(page).toHaveURL(
    new RegExp(`create-account\\?next=${encodeURIComponent(invitePath)}`),
  );

  const invitedEmail = `invited-${run}@controlled.test`;
  const invitedPassword = `Controlled-invited-${run}-48!`;
  await page.getByLabel("Email address").fill(invitedEmail);
  await page.getByRole("button", { name: "Email account link" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");

  const generated = await admin.auth.admin.generateLink({
    email: invitedEmail,
    options: {
      redirectTo: `${baseURL}/auth/confirm?flow=create-account&next=${encodeURIComponent(invitePath)}`,
    },
    type: "magiclink",
  });
  expect(generated.error).toBeNull();
  const tokenHash = generated.data.properties?.hashed_token;
  const verificationType = generated.data.properties?.verification_type;
  expect(tokenHash).toBeTruthy();
  expect(verificationType).toBe("magiclink");
  const confirmationUrl = new URL("/auth/confirm", baseURL);
  confirmationUrl.searchParams.set("token_hash", tokenHash!);
  confirmationUrl.searchParams.set("type", verificationType!);
  confirmationUrl.searchParams.set("flow", "create-account");
  confirmationUrl.searchParams.set("next", invitePath);
  await page.goto(confirmationUrl.toString());
  expect(
    (await page.context().cookies(baseURL)).filter((cookie) =>
      /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name),
    ),
  ).toEqual([]);
  const confirmationResponsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${baseURL}/auth/confirm` &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Confirm and continue" }).click();
  await confirmationResponsePromise;
  await page.waitForURL(/\/account\/setup/);
  // WebKit omits Set-Cookie from the browser response headers. Verify the
  // session the browser actually stored, then use it through setup and joining.
  const browserSessionCookies = (await page.context().cookies(baseURL))
    .filter(
      (cookie) =>
        /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name) &&
        cookie.value.length > 0,
    )
    .map(({ domain, httpOnly, name, path, sameSite, secure }) => ({
      domain,
      httpOnly,
      name,
      path,
      sameSite,
      secure,
    }));
  const confirmationDestination = new URL(page.url());
  expect({
    browserSessionCookies,
    error: confirmationDestination.searchParams.get("error"),
    hasTokenHash: confirmationDestination.searchParams.has("token_hash"),
    pathname: confirmationDestination.pathname,
  }).toEqual({
    browserSessionCookies: expect.arrayContaining([
      expect.objectContaining({
        domain: "127.0.0.1",
        path: "/",
        sameSite: "Lax",
        secure: false,
      }),
    ]),
    error: null,
    hasTokenHash: false,
    pathname: "/account/setup",
  });
  await expect(
    page.getByRole("heading", { name: "Finish account setup" }),
  ).toBeVisible();
  await page.getByLabel("Username").fill("InvitedMember");
  await page.getByLabel("Password", { exact: true }).fill(invitedPassword);
  await page.getByLabel("Confirm password").fill(invitedPassword);
  await page.getByRole("button", { name: "Save account and continue" }).click();
  await expect(page).toHaveURL(new RegExp(`/join/${invitation.token}$`));
  await page.getByRole("button", { name: "Join league" }).click();
  await page.waitForURL(`**/l/${slug}/matchup`);
  await expect(
    page
      .locator("[data-league-header]")
      .getByText("Practice/test · Simulation")
      .filter({ visible: true }),
  ).toBeVisible();

  const invitedUsers = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 100,
  });
  expect(invitedUsers.error).toBeNull();
  const invitedUser = invitedUsers.data.users.find(
    (user) => user.email === invitedEmail,
  );
  expect(invitedUser).toBeTruthy();
  const invited: Identity = {
    displayName: "InvitedMember",
    email: invitedEmail,
    password: invitedPassword,
    userId: invitedUser!.id,
  };

  const commissionerBrowser = await newPage(browser);
  await browserSignIn(
    commissionerBrowser.page,
    commissioner,
    `/l/${slug}/commissioner`,
  );
  await commissionerBrowser.page
    .getByRole("button", { name: "Advance to Week 1 publication time" })
    .click();
  await expect(
    commissionerBrowser.page.getByRole("status").last(),
  ).toContainText("clock advanced");
  await commissionerBrowser.page
    .getByRole("button", { name: "Make reviewed Week 1 available" })
    .click();
  await expect(
    commissionerBrowser.page.getByRole("heading", {
      name: "Freeze roster and open cards",
    }),
  ).toBeVisible();
  await commissionerBrowser.page
    .getByRole("button", { name: /Lock 4-member roster & open cards/ })
    .click();
  await expect(
    commissionerBrowser.page.getByText("Practice/test Week 1 · open"),
  ).toBeVisible();

  await page.goto(`/l/${slug}/slate`);
  const availableOutcomes = page.locator(
    ".outcome-selector-group button:not([disabled])",
  );
  await expect.poll(() => availableOutcomes.count()).toBeGreaterThan(0);
  const outcomeLabels = await availableOutcomes.evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute("aria-label")),
  );
  const standardOutcomeIndex = outcomeLabels.findIndex((label) => {
    const odds = label?.match(/([+−])(\d+)$/);
    return Boolean(
      odds && (odds[1] === "+" || Number.parseInt(odds[2]!, 10) <= 200),
    );
  });
  expect(
    standardOutcomeIndex,
    `Rendered enabled card outcomes: ${JSON.stringify(outcomeLabels)}`,
  ).toBeGreaterThanOrEqual(0);
  const standardOutcome = availableOutcomes.nth(standardOutcomeIndex);
  await expect(standardOutcome).toBeVisible();
  await standardOutcome.click();
  await page.getByLabel("Stake in credits").fill("1000");
  await page.getByRole("button", { name: "Add to card" }).click();

  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("sunday-ledger:card-draft:v1:"),
    );
    if (!key) throw new Error("card draft was not stored");
    const stored = JSON.parse(localStorage.getItem(key) ?? "null") as {
      drafts: Array<{ reviewedPayloadHash: string }>;
    };
    stored.drafts[0]!.reviewedPayloadHash = "f".repeat(64);
    localStorage.setItem(key, JSON.stringify(stored));
  });
  await page.reload();
  // A hash/timestamp-only revision preserves economic consent. Exercise the
  // acknowledgment gate with an actual economic difference instead.
  await expect(page.getByText("Updated quote")).toHaveCount(0);
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith("sunday-ledger:card-draft:v1:"),
    );
    if (!key) throw new Error("card draft was not stored");
    const stored = JSON.parse(localStorage.getItem(key) ?? "null") as {
      drafts: Array<{ reviewedAmericanOdds: number }>;
    };
    stored.drafts[0]!.reviewedAmericanOdds += 5;
    localStorage.setItem(key, JSON.stringify(stored));
  });
  await page.reload();
  await expect(page.getByText("Updated quote").first()).toBeVisible();
  await page.getByRole("button", { name: "Review 1 updated quote" }).click();
  await page.getByRole("button", { name: "Use updated odds" }).click();

  let droppedSealResponse = false;
  const slateRoute = (url: URL) => url.pathname === `/l/${slug}/slate`;
  await page.route(slateRoute, async (route) => {
    if (
      !droppedSealResponse &&
      route.request().method() === "POST" &&
      route.request().headers()["next-action"]
    ) {
      await route.fetch();
      droppedSealResponse = true;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Confirm and seal card" }).click();
  await expect.poll(() => droppedSealResponse).toBe(true);
  await page.unroute(slateRoute);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "All 1,000 credits are sealed" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "View card", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "View receipt", exact: true }).first(),
  ).toBeVisible();

  const invitedClient = await signedInClient(invited);
  const invitedState = await getState(invitedClient, slug);
  const ownProposition = chooseMarket(invitedState).proposition;
  const opponentEntryId = invitedState.matchup?.opponentEntryId;
  const opponentUserId = invitedState.members.find(
    (member) => member.entryId === opponentEntryId,
  )?.userId;
  const knownIdentities = [commissioner, memberOne, memberTwo];
  const opponent = knownIdentities.find(
    (identity) => identity.userId === opponentUserId,
  );
  expect(opponent).toBeTruthy();
  const opponentClient = await signedInClient(opponent!);
  const opponentState = await getState(opponentClient, slug);
  const opponentMarket = chooseMarket(opponentState, ownProposition);
  await expectRpc(opponentClient, "accept_stage1_card", {
    p_idempotency_key: `op:${"2".repeat(64)}`,
    p_league_slug: slug,
    p_positions: [
      {
        marketSnapshotId: opponentMarket.id,
        payloadHash: opponentMarket.payloadHash,
        stakeCredits: 1000,
      },
    ],
  });
  const acceptedOpponent = await getState(opponentClient, slug);
  const opponentReceipt = acceptedOpponent.ownerCard!.positions[0]!;
  expect(opponentReceipt.id).toBeTruthy();

  await commissionerBrowser.page.reload();
  await commissionerBrowser.page
    .getByRole("button", { name: "Advance past common lock" })
    .click();
  await expect
    .poll(async () => {
      const state = await getState(invitedClient, slug);
      return new Date(state.season.simulatedNow).getTime();
    })
    .toBeGreaterThan(new Date(invitedState.week!.commonLockAt).getTime());
  await commissionerBrowser.page
    .getByRole("button", { name: "Lock all cards" })
    .click();
  await expect
    .poll(async () => (await getState(invitedClient, slug)).week?.state)
    .toBe("LOCKED");

  await page.goto(`/l/${slug}/matchup`);
  const selectedOpponentGames = page.locator(
    `[data-member-name="${opponent!.displayName}"][data-game-selected="true"]`,
  );
  await expect(selectedOpponentGames).toHaveCount(1);
  expect(await selectedOpponentGames.innerText()).not.toMatch(
    /credits|odds|moneyline|spread|total/i,
  );
  expect(
    (await getState(invitedClient, slug)).matchup!.opponentRevealedPositions,
  ).toEqual([]);
  expect(await page.content()).not.toContain(opponentReceipt.id);
  expect(await page.content()).not.toContain(opponentReceipt.receiptHash);

  const sameLeagueNonOpponent = knownIdentities.find(
    (identity) =>
      identity.userId !== opponentUserId &&
      identity.userId !== commissioner.userId,
  )!;
  for (const identity of [sameLeagueNonOpponent, outsider, otherLeagueMember]) {
    const isolated = await newPage(browser);
    await browserSignIn(isolated.page, identity, "/leagues");
    const response = await isolated.page.goto(`/l/${slug}/matchup`);
    const body = await isolated.page.locator("body").innerText();
    expect(await isolated.page.content()).not.toContain(opponentReceipt.id);
    expect(await isolated.page.content()).not.toContain(
      opponentReceipt.receiptHash,
    );
    if (identity !== sameLeagueNonOpponent) {
      expect(body).not.toContain(opponentMarket.proposition);
      expect([200, 404]).toContain(response?.status());
      await expect(
        isolated.page.getByRole("heading", {
          name: /This league is not available|There is no Ledger page here/,
        }),
      ).toBeVisible();
    }
    await isolated.context.close();
  }
  const anonymous = await newPage(browser);
  const anonymousResponse = await anonymous.page.goto(`/l/${slug}/matchup`);
  expect(anonymousResponse?.status()).toBe(200);
  await expect(anonymous.page).toHaveURL(
    `/auth/sign-in?next=${encodeURIComponent(`/l/${slug}/matchup`)}`,
  );
  await expect(
    anonymous.page.getByRole("heading", { name: "Sign in" }),
  ).toBeVisible();
  expect(await anonymous.page.locator("body").innerText()).not.toContain(
    opponentMarket.proposition,
  );
  await anonymous.context.close();

  await commissionerBrowser.page
    .getByRole("button", { name: "Advance through kickoff" })
    .click();
  const latestKickoff = Math.max(
    ...invitedState.slate.map((event) =>
      new Date(event.scheduledStartAt).getTime(),
    ),
  );
  await expect
    .poll(async () => {
      const state = await getState(invitedClient, slug);
      return new Date(state.season.simulatedNow).getTime();
    })
    .toBeGreaterThanOrEqual(latestKickoff + 6 * 60_000);
  await commissionerBrowser.page
    .getByRole("button", { name: "Mark fixture events live" })
    .click();
  await expect
    .poll(async () => {
      const state = await getState(invitedClient, slug);
      return state.matchup?.opponentRevealedPositions.some(
        (position) => position.proposition === opponentMarket.proposition,
      );
    })
    .toBe(true);
  await page.reload();
  await expect(page.getByText(opponentMarket.proposition)).toBeVisible();

  await commissionerBrowser.page
    .getByRole("button", { name: "Advance to scripted finals" })
    .click();
  await expect
    .poll(async () => {
      const state = await getState(invitedClient, slug);
      return new Date(state.season.simulatedNow).getTime();
    })
    .toBeGreaterThanOrEqual(latestKickoff + 4 * 60 * 60_000);
  let droppedCommissionerResponse = false;
  await commissionerBrowser.page.route(
    `**/l/${slug}/commissioner`,
    async (route) => {
      if (
        !droppedCommissionerResponse &&
        route.request().method() === "POST" &&
        route.request().headers()["next-action"]
      ) {
        await route.fetch();
        droppedCommissionerResponse = true;
        await route.abort("failed");
        return;
      }
      await route.continue();
    },
  );
  await commissionerBrowser.page
    .getByRole("button", { name: "Import scripted results" })
    .click();
  await expect.poll(() => droppedCommissionerResponse).toBe(true);
  await commissionerBrowser.page.unroute(`**/l/${slug}/commissioner`);
  await commissionerBrowser.page.reload();
  await commissionerBrowser.page
    .getByRole("button", { name: "Import scripted results" })
    .click();
  await expect(
    commissionerBrowser.page.getByText(/Already completed.*final results/i),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const state = await getState(invitedClient, slug);
      return {
        matchup: state.matchup?.result?.status,
        week: state.week?.state,
      };
    })
    .toEqual({ matchup: "FINAL", week: "FINAL" });

  await commissionerBrowser.page.reload();
  await expect(
    commissionerBrowser.page.getByRole("button", { name: "Finalize Week 1" }),
  ).toHaveCount(0);
  await expect(
    commissionerBrowser.page.getByRole("heading", {
      name: "Make practice Week 2 available",
    }),
  ).toBeVisible();

  await page.reload();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(
    page
      .locator(".paired-matchup-card .status-badge")
      .filter({ hasText: "Final" }),
  ).toBeVisible();
  // Historical navigation must read the selected week's authorized receipts
  // after the current-week query has moved on to a new, empty card.
  await commissionerBrowser.page
    .getByRole("button", { name: "Advance to Week 2 publication time" })
    .click();
  await expect(
    commissionerBrowser.page.getByRole("button", {
      name: "Advance to Week 2 publication time",
    }),
  ).toBeEnabled();
  await commissionerBrowser.page
    .getByRole("button", { name: "Make reviewed Week 2 available" })
    .click();
  await expect
    .poll(async () => (await getState(invitedClient, slug)).week?.nflWeek)
    .toBe(2);
  await page.goto(`/l/${slug}/matchup`);
  await expect(
    page.getByRole("heading", { name: "Week 2 matchup", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Week", exact: true })
    .selectOption({ label: "Week 1 · Final" });
  await expect(page).toHaveURL(`/l/${slug}/matchup?week=1`);
  await expect(
    page.getByRole("heading", { name: "Week 1 matchup", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(opponentMarket.proposition, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Completed week · Read-only/)).toBeVisible();
  expect(await page.content()).not.toContain(opponentReceipt.receiptHash);
  await expect(
    page.getByRole("link", { name: "My Card · Current Week 2", exact: true }),
  ).toHaveAttribute("href", `/l/${slug}/card`);
  await expect(
    page.getByRole("link", {
      name: "Make picks · Current Week 2",
      exact: true,
    }),
  ).toHaveAttribute("href", `/l/${slug}/slate`);
  const ownHistoricalUrl = page.url();
  const otherMatchup = await page
    .getByRole("combobox", { name: "Matchup", exact: true })
    .locator("option")
    .evaluateAll((options) =>
      options
        .filter((option) => !option.textContent?.includes(" · You"))
        .map((option) => (option as HTMLOptionElement).value),
    );
  expect(otherMatchup).toHaveLength(1);
  await page
    .getByRole("combobox", { name: "Matchup", exact: true })
    .selectOption(otherMatchup[0]!);
  await expect(page).toHaveURL(new RegExp(`week=1&matchup=${otherMatchup[0]}`));
  await expect(page.getByText(/Completed week · Read-only/)).toBeVisible();
  await page.getByRole("link", { name: "Back to your matchup" }).click();
  await expect(page).toHaveURL(ownHistoricalUrl);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: test.info().outputPath("historical-matchup-320.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: /Back to current week/ }).click();
  await expect(
    page.getByRole("heading", { name: "Week 2 matchup", exact: true }),
  ).toBeVisible();
  await page.goto(`/l/${slug}/history`);
  await page.getByRole("link", { name: "View matchup and bets" }).click();
  await expect(
    page.getByText(opponentMarket.proposition, { exact: true }),
  ).toBeVisible();
  await page.goto(`/l/${slug}/schedule`);
  await page
    .getByRole("combobox", { name: "Selected week", exact: true })
    .selectOption("1");
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Selected week", exact: true }),
  ).toHaveValue("1");
  await expect(
    page.getByText("Viewing Week 1 · Current week is Week 2"),
  ).toBeVisible();
  await page
    .getByRole("link", { name: /View .* matchup and bets/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Week 1 matchup", exact: true }),
  ).toBeVisible();
  const denied = await newPage(browser);
  await browserSignIn(denied.page, outsider, "/leagues");
  await denied.page.goto(ownHistoricalUrl);
  expect(await denied.page.content()).not.toContain(opponentMarket.proposition);
  await expect(
    denied.page.getByRole("heading", {
      name: /This league is not available|There is no Ledger page here/,
    }),
  ).toBeVisible();
  // UI-2 forced list failure is confined to this disposable loopback stack.
  // Restore the existing grant before using the boundary's real retry action.
  execFileSync(
    "psql",
    [
      databaseUrl!,
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "REVOKE SELECT ON api.my_leagues FROM authenticated",
    ],
    { stdio: "pipe" },
  );
  try {
    await page.goto("/leagues");
    await expect(
      page.getByRole("heading", { name: "We could not open Your leagues" }),
    ).toBeVisible();
    await expect(page.getByText("No active leagues yet")).toHaveCount(0);
    await expect(
      page.getByText(/No membership, archive, or league record was changed/),
    ).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("ui2-league-load-error.png"),
      fullPage: true,
    });
  } finally {
    execFileSync(
      "psql",
      [
        databaseUrl!,
        "-X",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        "GRANT SELECT ON api.my_leagues TO authenticated",
      ],
      { stdio: "pipe" },
    );
  }
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your leagues", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open league", exact: true }).first(),
  ).toBeVisible();
  await denied.context.close();
  await commissionerBrowser.context.close();
});
