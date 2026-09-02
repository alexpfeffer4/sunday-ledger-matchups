import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";

const baseURL = "http://127.0.0.1:3000";
const supabaseUrl = process.env.TEST_SUPABASE_URL;
const publishableKey = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const enabled =
  process.env.FULL_STACK_ACCEPTANCE === "1" &&
  Boolean(supabaseUrl && publishableKey && serviceRoleKey);

type Identity = {
  displayName: string;
  email: string;
  password: string;
  userId: string;
};

type StageState = {
  league: { id: string; name: string; slug: string };
  matchup: { opponentEntryId: string } | null;
  members: Array<{ entryId: string | null; userId: string }>;
  slate: Array<{
    markets: Array<{
      americanOdds: number;
      id: string;
      payloadHash: string;
      proposition: string;
      qualityStatus: string;
    }>;
  }>;
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
  const actionLink = generated.data.properties?.action_link;
  expect(actionLink).toBeTruthy();
  await page.goto(actionLink!);
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
    page.getByText("Practice/test · Simulation").first(),
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

  await page.goto(`/l/${slug}/card`);
  const positiveOutcome = page
    .locator(".outcome-selector-group button:not([disabled])")
    .filter({ hasText: /\+\d/ })
    .first();
  await expect(positiveOutcome).toBeVisible();
  await positiveOutcome.click();
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
  await expect(page.getByText("Updated quote").first()).toBeVisible();
  await page.getByRole("button", { name: "Review 1 updated quote" }).click();
  await page.getByRole("button", { name: "Use updated odds" }).click();

  let droppedSealResponse = false;
  await page.route(`**/l/${slug}/card`, async (route) => {
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
  await page.unroute(`**/l/${slug}/card`);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "All 1,000 credits are sealed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /receipt/i }).first(),
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

  await commissionerBrowser.page.reload();
  await commissionerBrowser.page
    .getByRole("button", { name: "Advance past common lock" })
    .click();
  await commissionerBrowser.page
    .getByRole("button", { name: "Lock all cards" })
    .click();

  await page.goto(`/l/${slug}/matchup`);
  await expect(page.getByText("Future picks sealed")).toBeVisible();
  expect(await page.locator("body").innerText()).not.toContain(
    opponentMarket.proposition,
  );

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
    expect(body).not.toContain(opponentMarket.proposition);
    if (identity !== sameLeagueNonOpponent)
      expect(response?.status()).toBe(404);
    await isolated.context.close();
  }
  const anonymous = await newPage(browser);
  const anonymousResponse = await anonymous.page.goto(`/l/${slug}/matchup`);
  expect(anonymousResponse?.status()).toBe(404);
  expect(await anonymous.page.locator("body").innerText()).not.toContain(
    opponentMarket.proposition,
  );
  await anonymous.context.close();

  await commissionerBrowser.page
    .getByRole("button", { name: "Advance through kickoff" })
    .click();
  await commissionerBrowser.page
    .getByRole("button", { name: "Mark fixture events live" })
    .click();
  await page.reload();
  await expect(page.getByText(opponentMarket.proposition)).toBeVisible();

  await commissionerBrowser.page
    .getByRole("button", { name: "Advance to scripted finals" })
    .click();
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

  const operations = await expectRpc<{
    events: Array<{
      correctionCount: number;
      id: string;
      result: { awayScore: number; homeScore: number } | null;
    }>;
  }>(commissionerClient, "get_live_week_operations", {
    p_league_slug: slug,
  });
  const correctedEvent = operations.events.find((event) => event.result);
  expect(correctedEvent?.result).toBeTruthy();
  await expectRpc(commissionerClient, "correct_live_event_result", {
    p_away_score: correctedEvent!.result!.awayScore + 1,
    p_event_id: correctedEvent!.id,
    p_home_score: correctedEvent!.result!.homeScore,
    p_idempotency_key: `op:${"3".repeat(64)}`,
    p_reason: "Controlled acceptance official-score correction.",
    p_status: "FINAL",
  });
  const corrected = await expectRpc<typeof operations>(
    commissionerClient,
    "get_live_week_operations",
    { p_league_slug: slug },
  );
  expect(
    corrected.events.find((event) => event.id === correctedEvent!.id)
      ?.correctionCount,
  ).toBe(1);

  await commissionerBrowser.page.reload();
  await commissionerBrowser.page
    .getByRole("button", { name: "Advance past correction window" })
    .click();
  await commissionerBrowser.page
    .getByRole("button", { name: "Finalize Week 1" })
    .click();
  await expect(
    commissionerBrowser.page.getByRole("heading", {
      name: "Make practice Week 2 available",
    }),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByText("Final").first()).toBeVisible();
  await commissionerBrowser.context.close();
});
