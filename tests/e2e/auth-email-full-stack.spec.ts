import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  expect,
  test,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const enabled = process.env.FULL_STACK_ACCEPTANCE === "1";
const baseURL = "http://127.0.0.1:3000";
const url = process.env.TEST_SUPABASE_URL;
const key = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const database = process.env.TEST_SUPABASE_DB_URL;
const mailURL = process.env.TEST_MAIL_URL;
const failureFile = process.env.AUTH_TEST_FAILURE_FILE;
if (enabled) {
  for (const value of [url, database, mailURL]) {
    if (
      !value ||
      !["localhost", "127.0.0.1"].includes(new URL(value).hostname)
    ) {
      throw new Error(
        "Email acceptance requires a disposable loopback-only Auth/database/mail stack.",
      );
    }
  }
  if (!key || !secret || !failureFile)
    throw new Error("Missing disposable Auth acceptance configuration.");
}
test.skip(!enabled, "requires the disposable local Auth and mail capture lane");
// Credentials in synthetic email URLs must not be retained in browser traces.
test.setTimeout(120_000);
test.use({ trace: "off", screenshot: "off", video: "off" });

function client(apiKey: string) {
  return createClient(url!, apiKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
async function rpc(
  c: SupabaseClient,
  name: string,
  args: Record<string, unknown> = {},
) {
  const result = await c.schema("api").rpc(name, args);
  expect(result.error, name).toBeNull();
  return result.data;
}
function sql(statement: string) {
  return execFileSync(
    "psql",
    [database!, "-X", "-v", "ON_ERROR_STOP=1", "-At"],
    { input: statement, encoding: "utf8" },
  ).trim();
}
function freshEmail(label: string) {
  return `auth-${label}-${Date.now().toString(36)}@acceptance.test`;
}
async function capturedEmail(
  request: APIRequestContext,
  email: string,
  subject: string,
) {
  let id = "";
  await expect
    .poll(
      async () => {
        const result = await request.get(`${mailURL}/api/v1/messages`);
        expect(result.ok()).toBeTruthy();
        const body = await result.json();
        const match = body.messages?.find(
          (message: {
            ID: string;
            Subject: string;
            To: Array<{ Address: string }>;
          }) =>
            message.Subject.includes(subject) &&
            message.To.some((recipient) => recipient.Address === email),
        );
        id = match?.ID ?? "";
        return Boolean(id);
      },
      { timeout: 15_000, message: "A local captured email must arrive" },
    )
    .toBeTruthy();
  const message = await (
    await request.get(`${mailURL}/api/v1/message/${id}`)
  ).json();
  const href = String(message.HTML).match(/href="([^"]+)"/)?.[1];
  if (!href) throw new Error("Local email is missing its confirmation link");
  const link = new URL(href.replaceAll("&amp;", "&"));
  expect(link.origin).toBe(baseURL);
  expect(link.pathname).toBe("/auth/confirm");
  expect(Boolean(link.searchParams.get("token_hash"))).toBeTruthy();
  const code = String(message.HTML).match(
    /data-email-code[^>]*>\s*(\d{6,10})\s*</,
  )?.[1];
  if (!code) throw new Error("Local email is missing its verification code");
  return { link, code };
}
async function capturedLink(
  request: APIRequestContext,
  email: string,
  subject: string,
) {
  return (await capturedEmail(request, email, subject)).link;
}
async function requestSignup(page: Page, email: string, next: string) {
  await page.goto(`/auth/create-account?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email account link" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  await expect(
    page.getByRole("button", { name: /Resend available in/ }),
  ).toBeDisabled();
  await expect(page.getByLabel("Email address")).toHaveValue(email);
}
async function confirm(page: Page, link: URL) {
  await page.goto(link.toString());
  await expect(
    page.getByRole("heading", { name: "Confirm your email link" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm and continue" }).click();
}
// A failed navigation assertion must not print an email credential URL.
async function expectLocation(page: Page, pattern: RegExp) {
  await expect
    .poll(() => {
      const location = new URL(page.url());
      for (const key of ["token_hash", "code", "sb_flow_id"])
        location.searchParams.delete(key);
      return `${location.pathname}${location.search}`;
    })
    .toMatch(pattern);
}
async function setup(page: Page, username: string, password: string) {
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Save account and continue" }).click();
}
async function fixtureInvite() {
  const email = freshEmail("commissioner");
  const password = "Disposable-Commissioner-48!";
  const created = await client(secret!).auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(created.error).toBeNull();
  const commissioner = client(key!);
  expect(
    (await commissioner.auth.signInWithPassword({ email, password })).error,
  ).toBeNull();
  await rpc(commissioner, "ensure_profile", {
    p_display_name: "Email Test Commissioner",
  });
  const slug = `auth-league-${Date.now().toString(36)}`;
  const league = await rpc(commissioner, "create_league", {
    p_mode: "LIVE",
    p_name: "Private Email Journey",
    p_nfl_year: 2026,
    p_slug: slug,
  });
  const invitation = await rpc(
    commissioner,
    "create_league_invite_retry_safe",
    {
      p_league_id: league[0].league_id,
      p_expires_in_days: 7,
      p_max_uses: 5,
      p_idempotency_key: `auth-${slug}`,
    },
  );
  return {
    commissioner,
    leagueId: league[0].league_id as string,
    slug,
    token: invitation.token as string,
  };
}

test("captured signup email preserves invite, session, profile retry and interrupted setup", async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(150_000);
  const fixture = await fixtureInvite();
  const next = `/join/${fixture.token}`;
  const initial = await request.get(next, {
    headers: { "user-agent": "facebookexternalhit/1.1" },
  });
  const html = await initial.text();
  const head = html.split("</head>")[0]!;
  expect(head).toContain(
    'property="og:title" content="Join Private Email Journey"',
  );
  expect(head).toContain('property="og:image"');
  expect(html).not.toContain("@acceptance.test");
  const imageURL = head.match(/property="og:image" content="([^"]+)"/)?.[1];
  if (!imageURL) throw new Error("Missing invite image");
  const imageResponse = await request.get(
    new URL(imageURL.replaceAll("&amp;", "&")).pathname,
  );
  expect(imageResponse.status()).toBe(200);
  expect(imageResponse.headers()["content-type"]).toContain("image/png");

  const email = freshEmail("signup");
  await requestSignup(page, email, next);
  const link = await capturedLink(request, email, "confirmation");
  expect(link.searchParams.get("next")).toBe(next);
  const throttled = await client(key!).auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  expect(throttled.error?.code).toBe("over_email_send_rate_limit");
  // Plain scanner traffic sees a confirmation page, never consumes the hash.
  expect((await request.get(link.toString())).status()).toBe(200);
  expect((await request.head(link.toString())).status()).toBe(200);
  writeFileSync(
    failureFile!,
    JSON.stringify({ endpoint: "ensure_profile", remaining: 2 }),
  );
  await confirm(page, link);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Your email is confirmed and you are signed in",
  );
  expect(
    (await page.context().cookies()).some(
      (cookie) => cookie.name.includes("auth-token") && cookie.value.length > 0,
    ),
  ).toBeTruthy();
  expect(new URL(page.url()).searchParams.get("next")).toBe(next);
  await page.getByRole("link", { name: "Retry account setup" }).click();
  await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
  // Leave and resume setup without consuming another email.
  await page.goto(`/auth/create-account?next=${encodeURIComponent(next)}`);
  await expectLocation(page, /\/account\/setup/);
  await page.reload();
  writeFileSync(
    failureFile!,
    JSON.stringify({ endpoint: "update_profile_display_name", remaining: 1 }),
  );
  await setup(page, "ChosenMember", "Disposable-Member-48!");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "username could not be saved",
  );
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue(
    "ChosenMember",
  );
  await setup(page, "ChosenMember", "Disposable-Member-48!");
  await expectLocation(page, new RegExp(`/join/${fixture.token}$`));
  await page.getByRole("button", { name: /Join/ }).click();
  await expectLocation(page, new RegExp(`/l/${fixture.slug}/matchup$`));
  const member = client(key!);
  expect(
    (
      await member.auth.signInWithPassword({
        email,
        password: "Disposable-Member-48!",
      })
    ).error,
  ).toBeNull();
  const joined = await rpc(member, "join_league", { p_token: fixture.token });
  expect(joined[0].joined).toBe(false);
  // Another unauthenticated browser cannot replay the consumed hash.
  const replayContext = await browser.newContext();
  const replay = await replayContext.newPage();
  await confirm(replay, link);
  await expect(replay.getByRole("main").getByRole("alert")).toContainText(
    "expired or already been used",
  );
  expect(new URL(replay.url()).searchParams.get("next")).toBe(next);
  await replayContext.close();
  // Same-browser repeat keeps the successful session and a usable setup path.
  await confirm(page, link);
  await expectLocation(page, new RegExp(`/join/${fixture.token}$`));
  // A manual retry of an already-saved setup may keep the same password.
  await page.goto(`/account/setup?next=${encodeURIComponent(next)}`);
  await setup(page, "ChosenMember", "Disposable-Member-48!");
  await expectLocation(page, new RegExp(`/join/${fixture.token}$`));
});

test("captured token-hash emails work in another browser and existing-account re-entry", async ({
  page,
  browser,
  request,
}) => {
  const email = freshEmail("cross-browser");
  const next = "/leagues?from=email";
  await requestSignup(page, email, next);
  const link = await capturedLink(request, email, "confirmation");
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await confirm(otherPage, link);
  await expectLocation(otherPage, /\/account\/setup/);
  await setup(otherPage, "CrossBrowser", "Disposable-CrossBrowser-48!");
  await expectLocation(otherPage, /\/leagues\?from=email$/);
  // The practice CTA must not force a completed account through setup again.
  await otherPage.goto(`/auth/create-account?next=${encodeURIComponent(next)}`);
  await expectLocation(otherPage, /\/leagues\?from=email$/);
  await other.close();
  // A returning email link must skip setup and never create another identity.
  await page.goto(`/auth/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByRole("button", { name: "Email link", exact: true }).click();
  await page.getByLabel("Email address").fill(email);
  // Expire only this disposable account's email throttle; UI cooldown was tested above.
  sql(
    `update auth.users set last_sign_in_at=now()-interval '2 minutes', confirmation_sent_at=now()-interval '2 minutes' where email='${email}';`,
  );
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  const returning = await capturedLink(request, email, "magic_link");
  await confirm(page, returning);
  await expectLocation(page, /\/leagues\?from=email$/);
});

test("legacy PKCE distinguishes a missing browser verifier and still works in requesting browser", async ({
  page,
  request,
  browser,
}) => {
  const email = freshEmail("pkce");
  await requestSignup(page, email, "/leagues");
  const link = await capturedLink(request, email, "confirmation");
  const provider = new URL("/auth/v1/verify", url);
  provider.searchParams.set("token", link.searchParams.get("token_hash")!);
  provider.searchParams.set("type", "signup");
  const redirectTo = new URL(link);
  redirectTo.searchParams.delete("token_hash");
  redirectTo.searchParams.delete("type");
  provider.searchParams.set("redirect_to", redirectTo.toString());
  const response = await request.get(provider.toString(), { maxRedirects: 0 });
  const callback = response.headers()["location"];
  if (!callback)
    throw new Error("Legacy local email verification did not redirect");
  const callbackURL = new URL(callback);
  expect(Boolean(callbackURL.searchParams.get("code"))).toBeTruthy();
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await confirm(otherPage, callbackURL);
  await expectLocation(otherPage, /error=browser_mismatch/);
  await expect(otherPage.getByRole("main").getByRole("alert")).toContainText(
    "browser session",
  );
  await other.close();
  await confirm(page, callbackURL);
  await expectLocation(page, /\/account\/setup/);
});

test("expired email fails validation and recovery email retains its destination", async ({
  page,
  request,
}) => {
  const email = freshEmail("expired");
  const next = "/join/expired-email-destination";
  await requestSignup(page, email, next);
  const link = await capturedLink(request, email, "confirmation");
  sql(
    `update auth.users set confirmation_sent_at=now()-interval '2 days' where email='${email}';`,
  );
  await confirm(page, link);
  await expectLocation(page, /\/auth\/create-account\?error=invalid_link/);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "expired or already been used",
  );
  expect(new URL(page.url()).searchParams.get("next")).toBe(next);

  const recoveryEmail = freshEmail("recovery");
  expect(
    (
      await client(secret!).auth.admin.createUser({
        email: recoveryEmail,
        password: "Disposable-Old-48!",
        email_confirm: true,
      })
    ).error,
  ).toBeNull();
  await page.goto(
    `/auth/recover?error=invalid_link&next=${encodeURIComponent(next)}`,
  );
  await page.getByLabel("Email address").fill(recoveryEmail);
  await page.getByRole("button", { name: "Email recovery link" }).click();
  await expect(page.getByRole("status")).toContainText("newest recovery link");
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Resend available in/ }),
  ).toBeDisabled();
  const recoveryLink = await capturedLink(request, recoveryEmail, "recovery");
  await confirm(page, recoveryLink);
  await expectLocation(page, /\/account\/recover-password/);
  await page
    .getByLabel("New password", { exact: true })
    .fill("Disposable-New-48!");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("Disposable-New-48!");
  await page
    .getByRole("button", { name: "Save password and continue" })
    .click();
  await expectLocation(page, new RegExp(`${next}$`));
  expect(
    (
      await client(key!).auth.signInWithPassword({
        email: recoveryEmail,
        password: "Disposable-New-48!",
      })
    ).error,
  ).toBeNull();
});

test("revoked and expired invitations have generic initial metadata and no private league data", async ({
  request,
}) => {
  const fixture = await fixtureInvite();
  expect(fixture.leagueId).toMatch(/^[0-9a-f-]{36}$/);
  const second = await rpc(
    fixture.commissioner,
    "create_league_invite_retry_safe",
    {
      p_league_id: fixture.leagueId,
      p_expires_in_days: 1,
      p_max_uses: 2,
      p_idempotency_key: `expired-${fixture.slug}`,
    },
  );
  sql(
    `update private.league_invites set expires_at=now()-interval '1 minute' where league_id='${fixture.leagueId}'; update private.league_invites set revoked_at=now(), expires_at=now()+interval '1 day' where league_id='${fixture.leagueId}' and id=(select id from private.league_invites where league_id='${fixture.leagueId}' order by created_at limit 1);`,
  );
  for (const token of [fixture.token, second.token]) {
    const response = await request.get(`/join/${token}`, {
      headers: { "user-agent": "facebookexternalhit/1.1" },
    });
    const html = await response.text();
    expect(html.split("</head>")[0]).toContain(
      'property="og:title" content="League invitation unavailable"',
    );
    expect(html).not.toContain("Private Email Journey");
    expect(html).not.toContain("Email Test Commissioner");
    expect(html).toContain("This league link is no longer active");
  }
});

test("email code completes signup in the requesting browser and cannot be reused", async ({
  page,
  request,
  browser,
}) => {
  const email = freshEmail("code-signup");
  const next = "/leagues?from=code";
  await requestSignup(page, email, next);
  const { code } = await capturedEmail(request, email, "confirmation");
  await page.getByLabel("Email verification code").fill("1234567890");
  await page.getByRole("button", { name: "Verify code and continue" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "invalid",
  );
  await page.getByLabel("Email verification code").fill(code);
  // Inject attacker-controlled fields. The server-issued encrypted action
  // context must keep this signup on its original email/setup/destination.
  await page.getByLabel("Email verification code").evaluate((input) => {
    const form = input.closest("form")!;
    for (const [name, value] of Object.entries({
      flow: "sign-in",
      email: "someone-else@acceptance.test",
      next: "//external.example",
    })) {
      const field = document.createElement("input");
      field.type = "hidden";
      field.name = name;
      field.value = value;
      form.appendChild(field);
    }
  });
  await page.getByRole("button", { name: "Verify code and continue" }).click();
  await expectLocation(page, /\/account\/setup/);
  await setup(page, "CodeSignup", "Disposable-CodeSignup-48!");
  await expectLocation(page, /\/leagues\?from=code$/);
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto("/leagues");
  await expectLocation(otherPage, /\/auth\/sign-in/);
  const replay = await client(key!).auth.verifyOtp({
    email,
    token: code,
    type: "email",
  });
  expect(Boolean(replay.error)).toBeTruthy();
  expect(replay.data.session).toBeNull();
  await other.close();
});

test("passwordless member verifies a code, sets a password and pastes an invite without leaving the browser", async ({
  page,
  request,
}) => {
  const fixture = await fixtureInvite();
  const email = freshEmail("passwordless");
  const password = "Disposable-FirstPassword-48!";
  const created = await client(secret!).auth.admin.createUser({
    email,
    email_confirm: true,
  });
  expect(created.error).toBeNull();
  // Exercise the discoverable password-first escape on the same sign-in route.
  await page.goto("/auth/sign-in?next=/leagues");
  await page
    .getByRole("link", { name: "Never made a password? Set one by email" })
    .click();
  await expect(
    page.getByRole("button", { name: "Send sign-in link" }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  const { code } = await capturedEmail(request, email, "magic_link");
  await page.getByLabel("Email verification code").fill(code);
  await page.getByRole("button", { name: "Verify code and continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Set a password", exact: true }),
  ).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Save password and continue" })
    .click();
  await expectLocation(page, /\/leagues$/);
  await page
    .getByRole("button", { name: "Join a league", exact: true })
    .click();
  await page
    .getByLabel("Invitation link or code")
    .fill(`${baseURL}/join/${fixture.token}`);
  await page.getByRole("button", { name: "Join league", exact: true }).click();
  await expectLocation(page, new RegExp(`/l/${fixture.slug}/matchup$`));
  // Repeated acceptance by code returns to the same membership.
  await page.goto("/leagues");
  await page
    .getByRole("button", { name: "Join a league", exact: true })
    .click();
  await page
    .getByLabel("Invitation link or code")
    .fill(fixture.token.toUpperCase());
  await page.getByRole("button", { name: "Join league", exact: true }).click();
  await expectLocation(page, new RegExp(`/l/${fixture.slug}/matchup$`));
  const member = client(key!);
  expect(
    (await member.auth.signInWithPassword({ email, password })).error,
  ).toBeNull();
  expect(
    (
      await member
        .schema("api")
        .from("my_leagues")
        .select("id")
        .eq("id", fixture.leagueId)
    ).data,
  ).toHaveLength(1);

  // Recovery also accepts a code in the browser that requested the email.
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out" }).click();
  const next = `/l/${fixture.slug}/matchup`;
  await page.goto(`/auth/recover?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email recovery link" }).click();
  await expect(page.getByRole("status")).toContainText("newest recovery link");
  const recovery = await capturedEmail(request, email, "recovery");
  await page.getByLabel("Email verification code").fill(recovery.code);
  await page.getByRole("button", { name: "Verify code and continue" }).click();
  await expectLocation(page, /\/account\/recover-password/);
  await page
    .getByLabel("New password", { exact: true })
    .fill(`${password}-New`);
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill(`${password}-New`);
  await page
    .getByRole("button", { name: "Save password and continue" })
    .click();
  await expectLocation(page, new RegExp(`${next}$`));
  expect(
    (
      await client(key!).auth.signInWithPassword({
        email,
        password: `${password}-New`,
      })
    ).error,
  ).toBeNull();

  // A later mobile visit can sign in with the newly saved password, retain
  // the session on reload, and join without opening a second browser.
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto(`/auth/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(`${password}-New`);
  await page.getByRole("button", { name: "Sign in with password" }).click();
  await expectLocation(page, new RegExp(`${next}$`));
  await page.reload();
  await expectLocation(page, new RegExp(`${next}$`));
  await expect(page.getByRole("main")).toContainText("Private Email Journey");

  // Pasting an expired invitation must still obey the authoritative join RPC.
  const expired = await fixtureInvite();
  expect(expired.leagueId).toMatch(/^[0-9a-f-]{36}$/);
  sql(
    `update private.league_invites set expires_at=now()-interval '1 minute' where league_id='${expired.leagueId}';`,
  );
  await page.goto("/leagues");
  await page
    .getByRole("button", { name: "Join a league", exact: true })
    .click();
  await page
    .getByLabel("Invitation link or code")
    .fill(`${baseURL}/join/${expired.token}`);
  await page.getByRole("button", { name: "Join league", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "invalid, expired",
  );
  expect(
    (
      await member.auth.signInWithPassword({
        email,
        password: `${password}-New`,
      })
    ).error,
  ).toBeNull();
  const blockedMembership = await member
    .schema("api")
    .from("my_leagues")
    .select("id")
    .eq("id", expired.leagueId);
  expect(blockedMembership.error).toBeNull();
  expect(blockedMembership.data).toHaveLength(0);
});
