import { openGameLinesFor } from "./game-lines";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import {
  stage1StateSchema,
  type Stage1StateDto,
} from "../../src/application/queries/stage1-dtos";
import { leagueMatchupCardsSchema } from "../../src/application/queries/league-matchup-dtos";

const url = process.env.TEST_SUPABASE_URL;
const key = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const database = process.env.TEST_SUPABASE_DB_URL;
const enabled = process.env.FULL_STACK_ACCEPTANCE === "1";
if (enabled) {
  if (!url || !key || !secret || !database)
    throw new Error(
      "Rolling acceptance requires complete disposable Auth/database settings.",
    );
  for (const value of [url, database]) {
    if (!["localhost", "127.0.0.1"].includes(new URL(value).hostname))
      throw new Error(
        "Rolling acceptance refuses hosted Auth or database servers.",
      );
  }
}
test.skip(!enabled, "requires the disposable full-stack acceptance lane");

function client(apiKey: string) {
  return createClient(url!, apiKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
function sql(statement: string) {
  return execFileSync(
    "psql",
    [database!, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-q"],
    { input: statement, encoding: "utf8" },
  ).trim();
}
async function rpc(
  connection: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
) {
  const result = await connection.schema("api").rpc(name, args);
  expect(result.error, `${name}: ${result.error?.message ?? "ok"}`).toBeNull();
  return result.data;
}
async function state(connection: SupabaseClient, slug: string) {
  return stage1StateSchema.parse(
    await rpc(connection, "get_stage1_state", { p_league_slug: slug }),
  );
}
async function signIn(
  page: Page,
  identity: { email: string; password: string },
  next: string,
) {
  await page.goto(`/auth/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email address").fill(identity.email);
  await page.getByLabel("Password", { exact: true }).fill(identity.password);
  await page.getByRole("button", { name: "Sign in with password" }).click();
  await page.waitForURL((url) => url.pathname === next);
}
async function submitBet(
  page: Page,
  slug: string,
  event: Stage1StateDto["slate"][number],
  marketType: "MONEYLINE" | "TOTAL",
  credits: number,
) {
  await page.goto(`/l/${slug}/slate`);
  const game = page.getByRole("region", {
    name: `${event.awayTeam} at ${event.homeTeam}`,
    exact: true,
  });
  await openGameLinesFor(game);
  // The first/third market groups are the existing moneyline/total controls.
  const market = game
    .locator(".outcome-selector-group")
    .nth(marketType === "MONEYLINE" ? 0 : 2);
  await market.locator("button:not([disabled])").first().click();
  await page.getByLabel("Stake in credits").fill(String(credits));
  await page.getByRole("button", { name: "Add to card", exact: true }).click();
  await page
    .getByRole("button", { name: /^Review 1 bets?$/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Review your bets", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit bets", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Submit bets", exact: true }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /submitted|saved/ })
      .last(),
  ).toBeVisible();
  await page.goto(`/l/${slug}/card`);
  await expect(
    page.getByRole("link", { name: "View receipt", exact: true }).first(),
  ).toBeVisible();
}

test("rolling batches, distinct game preview, per-game cutoff, later entry and expiration use real Auth/UI/RPC", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const run = `${Date.now().toString(36)}-${testInfo.project.name}`;
  const slug = `rolling-${run}`;
  const admin = client(secret!);
  const identities: Array<{ userId: string; email: string; password: string }> =
    [];
  const connections: SupabaseClient[] = [];
  for (let index = 0; index < 4; index++) {
    const identity = {
      email: `rolling-${run}-${index}@acceptance.test`,
      password: `Rolling-${run}-${index}-48!`,
    };
    const created = await admin.auth.admin.createUser({
      ...identity,
      email_confirm: true,
    });
    expect(created.error).toBeNull();
    expect(created.data.user?.id).toMatch(/^[0-9a-f-]{36}$/);
    const connection = client(key!);
    expect(
      (await connection.auth.signInWithPassword(identity)).error,
    ).toBeNull();
    await rpc(connection, "ensure_profile", {
      p_display_name: `Rolling Member ${index}`,
    });
    identities.push({ ...identity, userId: created.data.user!.id });
    connections.push(connection);
  }
  // Only disposable loopback SQL can activate a prepared package. The catalog
  // change, real league/invite/fixture/open RPCs and catalog restoration happen
  // in ONE transaction: no other test ever observes a global V1.3 activation.
  const catalogBefore = sql(
    "select jsonb_agg(to_jsonb(a) order by mode)::text from private.authoritative_season_rulesets a;",
  );
  const userIds = identities.map((identity) => identity.userId);
  sql(`
begin;
create temporary table rolling_catalog_before on commit drop as select * from private.authoritative_season_rulesets;
update private.authoritative_season_rulesets a set ruleset_version='1.3', product_bible_version='3.2', canonical_json=p.canonical_json, sha256_hash=p.sha256_hash
  from private.prepared_rolling_rulesets p where p.mode=a.mode;
do $setup$
declare league_uuid uuid; season_uuid uuid; token text; member_uuid uuid;
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub','${userIds[0]}','role','authenticated')::text,true);
  select league_id,season_id into league_uuid,season_uuid from api.create_league('Rolling acceptance','${slug}','SIMULATION',2026);
  token := api.create_league_invite(league_uuid,now()+interval '1 day',4);
  foreach member_uuid in array array[${userIds
    .slice(1)
    .map((id) => `'${id}'::uuid`)
    .join(",")}] loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub',member_uuid,'role','authenticated')::text,true);
    perform api.join_league(token);
  end loop;
  perform set_config('request.jwt.claims',jsonb_build_object('sub','${userIds[0]}','role','authenticated')::text,true);
  update private.seasons set simulated_now='2026-09-13 16:00Z' where id=season_uuid and mode='SIMULATION';
  perform api.publish_simulation_fixture_week(league_uuid,1,'sunday-ledger-authoritative-2026-v1','rolling-e2e-publish');
  perform api.lock_live_roster_and_open_week(league_uuid,'rolling-e2e-roster');
end;
$setup$;
update private.authoritative_season_rulesets a set ruleset_version=b.ruleset_version,product_bible_version=b.product_bible_version,canonical_json=b.canonical_json,sha256_hash=b.sha256_hash
  from rolling_catalog_before b where b.mode=a.mode;
commit;
`);
  expect(
    sql(
      "select jsonb_agg(to_jsonb(a) order by mode)::text from private.authoritative_season_rulesets a;",
    ),
  ).toBe(catalogBefore);
  const commissioner = connections[0]!;
  let ownerState = await state(commissioner, slug);
  expect(ownerState.week!.rollingSubmissionsEnabled).toBe(true);
  const events = [...ownerState.slate].sort(
    (a, b) =>
      a.scheduledStartAt.localeCompare(b.scheduledStartAt) ||
      a.id.localeCompare(b.id),
  );
  const early = events[0]!;
  const later = events.at(-1)!;
  expect(later.scheduledStartAt > early.scheduledStartAt).toBe(true);
  const opponentUser = ownerState.members.find(
    (member) => member.entryId === ownerState.matchup!.opponentEntryId,
  )!.userId;
  const opponentIndex = userIds.indexOf(opponentUser);
  expect(opponentIndex).toBeGreaterThan(0);
  const opponent = connections[opponentIndex]!;
  const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } =
    testInfo.project.use;
  const spectatorContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3000",
    viewport,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    userAgent,
  });
  const spectator = await spectatorContext.newPage();
  try {
    await signIn(page, identities[0]!, `/l/${slug}/slate`);
    await signIn(spectator, identities[opponentIndex]!, `/l/${slug}/matchup`);
    expect(
      (await state(opponent, slug)).matchup!.opponentSelectedGames,
    ).toEqual([]);

    await submitBet(page, slug, early, "MONEYLINE", 300);
    ownerState = await state(commissioner, slug);
    const originalReceipt = ownerState.ownerCard!.positions[0]!;
    expect(ownerState.ownerCard!.remainingCredits).toBe(700);
    let opponentState = await state(opponent, slug);
    expect(opponentState.matchup!.opponentSelectedGames).toHaveLength(1);
    expect(opponentState.matchup!.opponentRevealedPositions).toEqual([]);
    expect(opponentState.matchup!.opponentAvailableCredits).toBeNull();
    await spectator.reload();
    const gamePreview = spectator.locator(
      '[data-member-name="Rolling Member 0"][data-game-selected="true"]',
    );
    await expect(gamePreview).toHaveAttribute(
      "aria-label",
      `Rolling Member 0 · ${early.awayTeam} at ${early.homeTeam}`,
    );
    await expect(gamePreview).toHaveCount(1);
    await expect(
      spectator.getByLabel("Rolling Member 0 outstanding picks and credits"),
    ).toHaveCount(0);
    expect(await gamePreview.innerText()).not.toMatch(
      /300|credits|moneyline|spread|total/i,
    );

    await submitBet(page, slug, early, "TOTAL", 150);
    ownerState = await state(commissioner, slug);
    expect(ownerState.ownerCard!.positions).toHaveLength(2);
    expect(
      ownerState.ownerCard!.positions.find(
        (receipt) => receipt.id === originalReceipt.id,
      ),
    ).toEqual(originalReceipt);
    opponentState = await state(opponent, slug);
    expect(opponentState.matchup!.opponentSelectedGames).toHaveLength(1);
    expect(opponentState.matchup!.opponentRevealedPositions).toEqual([]);
    const cards = leagueMatchupCardsSchema.parse(
      await rpc(opponent, "get_league_matchup_cards", {
        p_league_slug: slug,
        p_week_id: ownerState.week!.id,
      }),
    );
    const publicOwner = cards.cards.find(
      (card) => card.entryId === ownerState.viewer.entryId,
    )!;
    expect(publicOwner.selectedGames).toHaveLength(1);
    expect(publicOwner.outstanding).toBeNull();
    expect(publicOwner.availableCredits).toBeNull();
    expect(publicOwner.positions).toEqual([]);
    await spectator.reload();
    await expect(gamePreview).toHaveCount(1);

    // Cross the early cutoff with NO start flag. Entry closes; actual terms do
    // not reveal until separate confirmed-start evidence passes the real RPC.
    await rpc(commissioner, "advance_simulated_time", {
      p_league_id: ownerState.league.id,
      p_target: "2026-09-13T19:00:00Z",
      p_idempotency_key: `rolling-afternoon-${run}`,
    });
    opponentState = await state(opponent, slug);
    expect(opponentState.matchup!.opponentRevealedPositions).toEqual([]);
    expect(opponentState.ownerCard!.compliance).toBe("PENDING");
    expect(opponentState.matchup!.opponentAvailableCredits).toBe(550);
    const tooLate = await commissioner.schema("api").rpc("accept_stage1_card", {
      p_league_slug: slug,
      p_idempotency_key: `rolling-late-${run}`,
      p_positions: [
        {
          marketSnapshotId: early.markets.find(
            (market) => market.marketType === "SPREAD",
          )!.id,
          payloadHash: early.markets.find(
            (market) => market.marketType === "SPREAD",
          )!.payloadHash,
          stakeCredits: 50,
        },
      ],
    });
    expect(tooLate.error).not.toBeNull();
    await rpc(commissioner, "set_stage1_event_live", {
      p_event_id: early.id,
      p_actual_started_at: early.scheduledStartAt,
      p_idempotency_key: `rolling-first-live-${run}`,
    });
    await spectator.reload();
    await expect(
      spectator.locator(
        '[data-member-name="Rolling Member 0"][data-game-selected="true"]',
      ),
    ).toHaveCount(0);
    expect(
      (await state(opponent, slug)).matchup!.opponentRevealedPositions,
    ).toHaveLength(2);

    await page.goto(`/l/${slug}/slate`);
    const closedGame = page.getByRole("region", {
      name: `${early.awayTeam} at ${early.homeTeam}`,
      exact: true,
    });
    await expect(
      closedGame.getByText("Betting closed", { exact: true }),
    ).toBeVisible();
    await submitBet(page, slug, later, "MONEYLINE", 200);
    ownerState = await state(commissioner, slug);
    expect(ownerState.ownerCard!.positions).toHaveLength(3);
    expect(ownerState.ownerCard!.remainingCredits).toBe(350);
    expect(ownerState.matchup!.result).toBeNull();
    await spectator.reload();
    await expect(
      spectator.locator(
        '[data-member-name="Rolling Member 0"][data-game-selected="true"]',
      ),
    ).toHaveAttribute(
      "aria-label",
      `Rolling Member 0 · ${later.awayTeam} at ${later.homeTeam}`,
    );
    await expect(
      spectator.getByLabel("Rolling Member 0 unused credits"),
    ).toHaveCount(0);
    await expect(
      spectator.getByRole("heading", { name: /You won|You lost/ }),
    ).toHaveCount(0);
    await expect(gamePreview).toHaveCount(1);
    expect(await gamePreview.innerText()).not.toMatch(
      /credits|moneyline|spread|total/i,
    );
    await spectator.screenshot({
      path: testInfo.outputPath("rolling-opponent-game-preview.png"),
      fullPage: true,
    });
    await page.goto(`/l/${slug}/matchup`);
    await expect(
      page.getByRole("heading", { name: "Week 1 matchup", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Rolling Member 0 unused credits")).toHaveText(
      "350 credits available to bet",
    );
    await expect(
      page.getByRole("region", { name: "Matchup remains open" }),
    ).toContainText("More bets can still be submitted");
    await expect(
      page.getByRole("heading", { name: /You won|You lost/ }),
    ).toHaveCount(0);
    const dimensions = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
    await page.screenshot({
      path: testInfo.outputPath("rolling-later-batch.png"),
      fullPage: true,
    });

    const finalCutoff = ownerState.week!.entryClosesAt!;
    await rpc(commissioner, "advance_simulated_time", {
      p_league_id: ownerState.league.id,
      p_target: finalCutoff,
      p_idempotency_key: `rolling-final-cutoff-${run}`,
    });
    ownerState = await state(commissioner, slug);
    expect(ownerState.week!.entryClosed).toBe(true);
    expect(ownerState.ownerCard!.compliance).toBe("COMPLIANT");
    expect((await state(opponent, slug)).ownerCard!.compliance).toBe(
      "INCOMPLETE",
    );
    // Use the canonical fixture result adapter after all its finals are due.
    await rpc(commissioner, "advance_simulated_time", {
      p_league_id: ownerState.league.id,
      p_target: new Date(
        Date.parse(finalCutoff) + 4 * 60 * 60_000,
      ).toISOString(),
      p_idempotency_key: `rolling-final-time-${run}`,
    });
    await rpc(commissioner, "apply_simulation_fixture_results", {
      p_league_id: ownerState.league.id,
      p_week: 1,
      p_step: "LIVE",
      p_pack_id: "sunday-ledger-authoritative-2026-v1",
      p_idempotency_key: `rolling-starts-${run}`,
    });
    await rpc(commissioner, "apply_simulation_fixture_results", {
      p_league_id: ownerState.league.id,
      p_week: 1,
      p_step: "FINAL",
      p_pack_id: "sunday-ledger-authoritative-2026-v1",
      p_idempotency_key: `rolling-finals-${run}`,
    });
    ownerState = await state(commissioner, slug);
    expect(ownerState.week!.state).toBe("FINAL");
    expect(ownerState.matchup!.result!.selfDecision).toBe("WIN");
    expect(
      ownerState.ownerCard!.positions.find(
        (receipt) => receipt.id === originalReceipt.id,
      ),
    ).toMatchObject({
      stakeCredits: originalReceipt.stakeCredits,
      americanOdds: originalReceipt.americanOdds,
      receiptHash: originalReceipt.receiptHash,
    });
    const returned = ownerState.ownerCard!.positions.reduce(
      (sum, receipt) => sum + receipt.settlement!.returnedCenticredits,
      0,
    );
    expect(ownerState.matchup!.result!.selfPointsForCenticredits).toBe(
      returned,
    );
    await page.reload();
    await expect(page.getByLabel("Rolling Member 0 unused credits")).toHaveText(
      "350 credits expired",
    );
    await expect(
      page.getByRole("heading", { name: "You won", exact: true }),
    ).toBeVisible();
    const completedGame = page.locator(".lineup-game").first();
    const toggle = completedGame.getByRole("button");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(
      completedGame.locator("[data-position-id]").first(),
    ).toBeHidden();
    await toggle.click();
    await expect(
      completedGame.locator("[data-position-id]").first(),
    ).toBeVisible();
    // Crossing the score boundary must not resize the header or pull bets up.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(page.locator(".matchup-sticky")).toHaveAttribute(
      "data-compact",
      "false",
    );
    const layout = () =>
      page.evaluate(() => ({
        gameTop:
          document.querySelector(".lineup-game")!.getBoundingClientRect().top +
          window.scrollY,
        documentHeight: document.documentElement.scrollHeight,
        scrollY: window.scrollY,
      }));
    const before = await layout();
    const boundary = await page.evaluate(
      () =>
        document.querySelector(".matchup-score")!.getBoundingClientRect()
          .bottom +
        window.scrollY -
        document.querySelector("[data-league-header]")!.getBoundingClientRect()
          .height,
    );
    await page.evaluate(
      (top) => window.scrollTo({ top, behavior: "instant" }),
      boundary + 4,
    );
    await expect(page.locator(".matchup-sticky")).toHaveAttribute(
      "data-compact",
      "true",
    );
    await expect(page.locator(".matchup-compact-card")).toHaveCSS(
      "opacity",
      "1",
    );
    await expect(page.locator(".matchup-compact-card")).toHaveCSS(
      "transform",
      "matrix(1, 0, 0, 1, 0, 0)",
    );
    const after = await layout();
    expect(Math.abs(after.gameTop - before.gameTop)).toBeLessThanOrEqual(1);
    expect(after.documentHeight).toBe(before.documentHeight);
    expect(Math.abs(after.scrollY - (boundary + 4))).toBeLessThanOrEqual(1);
    const pinnedScore = await page
      .locator(".matchup-compact-card")
      .boundingBox();
    const shellHeader = await page
      .locator("[data-league-header]")
      .boundingBox();
    expect(pinnedScore!.y).toBeGreaterThanOrEqual(shellHeader!.height - 1);
    expect(pinnedScore!.y).toBeLessThanOrEqual(shellHeader!.height + 1);
    await page.screenshot({
      path: testInfo.outputPath("compact-score-stable-scroll.png"),
    });
    await page.evaluate(
      (top) => window.scrollTo({ top, behavior: "instant" }),
      boundary - 4,
    );
    await expect(page.locator(".matchup-sticky")).toHaveAttribute(
      "data-compact",
      "false",
    );
    const restored = await layout();
    expect(Math.abs(restored.gameTop - before.gameTop)).toBeLessThanOrEqual(1);
    expect(restored.documentHeight).toBe(before.documentHeight);
    expect(Math.abs(restored.scrollY - (boundary - 4))).toBeLessThanOrEqual(1);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(page.locator(".matchup-sticky")).toHaveAttribute(
      "data-compact",
      "false",
    );
    await page.screenshot({
      path: testInfo.outputPath("rolling-partial-final.png"),
      fullPage: true,
    });
    expect(
      sql(
        "select jsonb_agg(to_jsonb(a) order by mode)::text from private.authoritative_season_rulesets a;",
      ),
    ).toBe(catalogBefore);
  } finally {
    await spectatorContext.close();
  }
});
