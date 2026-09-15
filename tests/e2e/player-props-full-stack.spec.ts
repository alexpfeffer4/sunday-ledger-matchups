import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  stage1StateSchema,
  type Stage1StateDto,
} from "../../src/application/queries/stage1-dtos";
import { playerPropMenuSchema } from "../../src/application/queries/player-prop-dtos";
import { leagueMatchupCardsSchema } from "../../src/application/queries/league-matchup-dtos";
import {
  playerPropsLeagueSql,
  playerPropsQuoteSql,
  quoteSql,
} from "../fixtures/player-props-acceptance.mjs";

const url = process.env.TEST_SUPABASE_URL;
const key = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const database = process.env.TEST_SUPABASE_DB_URL;
const enabled = process.env.FULL_STACK_ACCEPTANCE === "1";
if (enabled) {
  if (!url || !key || !secret || !database)
    throw new Error(
      "Player-props acceptance needs disposable Auth and PostgreSQL.",
    );
  for (const endpoint of [url, database]) {
    if (!["localhost", "127.0.0.1"].includes(new URL(endpoint).hostname))
      throw new Error(
        "Player-props acceptance refuses hosted database/Auth endpoints.",
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
    {
      input: statement,
      encoding: "utf8",
    },
  ).trim();
}
async function rpc(
  connection: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
) {
  const response = await connection.schema("api").rpc(name, args);
  expect(
    response.error,
    `${name}: ${response.error?.message ?? "ok"}`,
  ).toBeNull();
  return response.data;
}
async function state(connection: SupabaseClient, slug: string) {
  return stage1StateSchema.parse(
    await rpc(connection, "get_stage1_state", { p_league_slug: slug }),
  );
}
async function signIn(
  page: Page,
  identity: { email: string; password: string },
  path: string,
) {
  await page.goto(`/auth/sign-in?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email address").fill(identity.email);
  await page.getByLabel("Password", { exact: true }).fill(identity.password);
  await page.getByRole("button", { name: "Sign in with password" }).click();
  await page.waitForURL(`**${path}`);
}
async function addGameDraft(
  page: Page,
  event: Stage1StateDto["slate"][number],
  credits: number,
) {
  await page.getByRole("button", { name: "Game lines", exact: true }).click();
  const group = page.getByRole("region", {
    name: `${event.awayTeam} at ${event.homeTeam}`,
    exact: true,
  });
  await group
    .locator(".outcome-selector-group")
    .first()
    .locator("button:not([disabled])")
    .first()
    .click();
  await page.getByLabel("Stake in credits").fill(String(credits));
  await page.getByRole("button", { name: "Add to card", exact: true }).click();
}
async function addPlayerDraft(
  page: Page,
  event: Stage1StateDto["slate"][number],
  subjectLabel: string,
  credits: number,
) {
  await page.getByRole("button", { name: "Player props", exact: true }).click();
  const game = page.locator("details").filter({
    has: page
      .locator("summary")
      .filter({ hasText: `${event.awayTeam} at ${event.homeTeam}` }),
  });
  if (!(await game.evaluate((element) => (element as HTMLDetailsElement).open)))
    await game.locator("summary").click();
  const player = game.locator("article").filter({
    has: page.getByRole("heading", { name: subjectLabel, exact: true }),
  });
  await player.locator("button:not([disabled])").first().click();
  await page.getByLabel("Stake in credits").fill(String(credits));
  await page.getByRole("button", { name: "Add to card", exact: true }).click();
}
async function submitDraft(page: Page, count: number) {
  await page
    .getByRole("button", { name: new RegExp(`^Review ${count} bets?$`) })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Review your bets", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Submit bets", exact: true }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /submitted|saved/ })
      .last(),
  ).toBeVisible();
}

async function atNarrowEnlargedText(page: Page, check: () => Promise<void>) {
  const viewport = page.viewportSize();
  const fontSize = await page.evaluate(
    () => document.documentElement.style.fontSize,
  );
  try {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await check();
  } finally {
    await page.evaluate((previous) => {
      document.documentElement.style.fontSize = previous;
    }, fontSize);
    if (viewport) await page.setViewportSize(viewport);
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.client + 1);
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.client + 1);
}

async function expectReachableAt320(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
  await expect(locator).toBeInViewport();
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(-1);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(321);
  const textWidth = await locator.evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }));
  expect(textWidth.scroll).toBeLessThanOrEqual(textWidth.client + 1);
}

for (const games of [14, 16]) {
  test(`${games}-game player menu, mixed batches, late lines and hidden-game privacy use real Auth/UI/RPC`, async ({
    page,
    browser,
  }, info) => {
    test.setTimeout(240_000);
    const run = `${Date.now().toString(36)}-${info.project.name}-${games}`;
    const slug = `props-${run}`;
    const admin = client(secret!);
    const identities: Array<{
      email: string;
      password: string;
      userId: string;
    }> = [];
    const members: SupabaseClient[] = [];
    const catalogBefore = sql(
      "select jsonb_agg(to_jsonb(a) order by mode)::text from private.authoritative_season_rulesets a;",
    );
    const offersBefore = sql(
      "select offers_enabled from private.player_prop_controls;",
    );
    for (let index = 0; index < 5; index++) {
      const identity = {
        email: `props-${run}-${index}@acceptance.test`,
        password: `Props-${run}-${index}-48!`,
      };
      const created = await admin.auth.admin.createUser({
        ...identity,
        email_confirm: true,
      });
      expect(created.error).toBeNull();
      const connection = client(key!);
      expect(
        (await connection.auth.signInWithPassword(identity)).error,
      ).toBeNull();
      await rpc(connection, "ensure_profile", {
        p_display_name: `Props Member ${index}`,
      });
      identities.push({ ...identity, userId: created.data.user!.id });
      members.push(connection);
    }
    sql(
      playerPropsLeagueSql({
        slug,
        games,
        preserveCanonicalEventKeys: true,
        userIds: identities.slice(0, 4).map((identity) => identity.userId),
      }),
    );
    expect(
      sql(
        "select jsonb_agg(to_jsonb(a) order by mode)::text from private.authoritative_season_rulesets a;",
      ),
    ).toBe(catalogBefore);
    const commissioner = members[0]!;
    let owner = await state(commissioner, slug);
    expect(owner.week?.state).toBe("PLANNED");
    expect(owner.slate).toHaveLength(games);
    const events = [...owner.slate].sort(
      (a, b) =>
        a.scheduledStartAt.localeCompare(b.scheduledStartAt) ||
        Number(a.key.startsWith("props-acceptance-")) -
          Number(b.key.startsWith("props-acceptance-")) ||
        a.key.localeCompare(b.key) ||
        a.id.localeCompare(b.id),
    );
    const early = events[0]!;
    const records = events.flatMap((event, eventIndex) =>
      [event.awayTeam, event.homeTeam].flatMap((team, teamIndex) =>
        ["QB", "RB", "WR"].flatMap((position) => {
          const canonicalKey = event.key.startsWith("props-acceptance-")
            ? `props:${run}:${eventIndex}:${teamIndex}:${position}`
            : `props-auth:${event.key}:${teamIndex}:${position}`;
          const displayName =
            eventIndex === 0 && teamIndex === 0 && position === "QB"
              ? "Alexanderson Montgomery-Smith Jr."
              : `Fixture ${event.key} ${teamIndex + 1} ${position}`;
          return ["THE_ODDS_API", "API_SPORTS"].map((provider) => ({
            provider,
            canonicalKey,
            displayName,
            position,
            team,
            externalEventId: event.key,
            externalPlayerId:
              provider === "THE_ODDS_API" ? displayName : canonicalKey,
            gameDate: "2026-09-13",
            verifiedAt: new Date().toISOString(),
            evidenceHash: createHash("sha256")
              .update(`${canonicalKey}:${provider}`)
              .digest("hex"),
            roleRank: 0,
            roleEvidence:
              "Deterministic disposable role and participation fixture",
            resultPathVerified: true,
          }));
        }),
      ),
    );
    await rpc(admin, "import_player_catalog", { p_records: records });
    let opponentIndex = 1;
    let opponent = members[opponentIndex]!;
    const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } =
      info.project.use;
    const spectatorContext = await browser.newContext({
      viewport,
      deviceScaleFactor,
      isMobile,
      hasTouch,
      userAgent,
      baseURL: "http://127.0.0.1:3000",
    });
    const spectator = await spectatorContext.newPage();
    try {
      await signIn(page, identities[0]!, `/l/${slug}/commissioner`);
      await expect(
        page.getByRole("heading", {
          name: "Review the proposed player menu",
          exact: true,
        }),
      ).toBeVisible();
      const prepareMenu = page.getByRole("button", {
        name: /^(Prepare player menu|Update proposed choices)$/,
      });
      await expect(prepareMenu).toBeVisible();
      await prepareMenu.click({ timeout: 10_000 });
      await expect
        .poll(async () => {
          const menu = playerPropMenuSchema.parse(
            await rpc(commissioner, "get_player_prop_menu", {
              p_league_slug: slug,
            }),
          );
          return menu.slots.filter((slot) => slot.subjectId !== null).length;
        })
        .toBe(games * 6);
      const proposed = playerPropMenuSchema.parse(
        await rpc(commissioner, "get_player_prop_menu", {
          p_league_slug: slug,
        }),
      );
      expect(proposed.frozen).toBe(false);
      await expect(
        page.getByText(
          `${games} games · ${games * 6} of ${games * 6} player slots selected`,
          { exact: true },
        ),
      ).toBeVisible();
      await page
        .getByLabel("I reviewed the full slate and any unavailable slots.")
        .check();
      await page
        .getByRole("button", {
          name: "Confirm full-slate player menu",
          exact: true,
        })
        .click();
      await expect
        .poll(async () => {
          const menu = playerPropMenuSchema.parse(
            await rpc(commissioner, "get_player_prop_menu", {
              p_league_slug: slug,
            }),
          );
          return menu.slots.every((slot) => slot.confirmed);
        })
        .toBe(true);
      await page.reload();
      await page
        .getByRole("button", { name: "Open week for bets", exact: true })
        .click();
      await expect
        .poll(async () => (await state(commissioner, slug)).week?.state)
        .toBe("OPEN");
      owner = await state(commissioner, slug);
      expect(owner.week?.state).toBe("OPEN");
      expect(owner.week?.propsEnabled).toBe(true);
      expect(owner.week?.rollingSubmissionsEnabled).toBe(true);
      const opponentUser = owner.members.find(
        (member) => member.entryId === owner.matchup!.opponentEntryId,
      )!.userId;
      opponentIndex = identities.findIndex(
        (identity) => identity.userId === opponentUser,
      );
      opponent = members[opponentIndex]!;
      const confirmed = playerPropMenuSchema.parse(
        await rpc(commissioner, "get_player_prop_menu", {
          p_league_slug: slug,
        }),
      );
      const lateLine = confirmed.slots.find(
        (slot) =>
          slot.eventId === early.id &&
          slot.subjectLabel === "Alexanderson Montgomery-Smith Jr.",
      )!;
      const existingLine = confirmed.slots.find(
        (slot) => slot.eventId === early.id && slot.slot === "RB_RUSH",
      )!;
      sql(
        playerPropsQuoteSql({
          weekId: owner.week!.id,
          omitSubjectId: lateLine.subjectId,
        }),
      );
      await signIn(spectator, identities[opponentIndex]!, `/l/${slug}/matchup`);
      await page.goto(`/l/${slug}/slate`);
      await page
        .getByRole("button", { name: "Player props", exact: true })
        .click();
      await expect(
        page.getByText("5 of 6 props available · View players", {
          exact: true,
        }),
      ).toHaveCount(1);
      // First game-only submission freezes every known identity despite the
      // absent QB line. No quote absence can freeze an empty catalog.
      await addGameDraft(page, early, 100);
      await submitDraft(page, 1);
      const frozen = playerPropMenuSchema.parse(
        await rpc(commissioner, "get_player_prop_menu", {
          p_league_slug: slug,
        }),
      );
      expect(frozen.frozen).toBe(true);
      expect(frozen.slots).toHaveLength(games * 6);
      expect(frozen.slots.map((slot) => slot.subjectId)).toEqual(
        confirmed.slots.map((slot) => slot.subjectId),
      );
      expect(frozen.slots.every((slot) => slot.frozen)).toBe(true);
      const rejected = await commissioner
        .schema("api")
        .rpc("confirm_player_prop_menu", {
          p_league_slug: slug,
          p_choices: frozen.slots.map(({ eventId, team, slot, subjectId }) => ({
            eventId,
            team,
            slot,
            subjectId,
          })),
        });
      expect(rejected.error).not.toBeNull();
      expect(rejected.error!.message).toMatch(/frozen/i);
      sql(playerPropsQuoteSql({ weekId: owner.week!.id }));
      await page.goto(`/l/${slug}/slate`);
      // 320 CSS pixels and doubled root text exercise long names and actual
      // authenticated quote/editor controls beyond the default phone profile.
      await atNarrowEnlargedText(page, async () => {
        await page
          .getByRole("button", { name: "Player props", exact: true })
          .click();
        const game = page.locator("details").filter({
          has: page.locator("summary").filter({
            hasText: `${early.awayTeam} at ${early.homeTeam}`,
          }),
        });
        await game.locator("summary").click();
        const player = game.locator("article").filter({
          has: page.getByRole("heading", {
            name: lateLine.subjectLabel!,
            exact: true,
          }),
        });
        await expectReachableAt320(player.getByRole("heading"));
        await expectNoHorizontalOverflow(page);
        const choice = player.locator("button:not([disabled])").first();
        await expectReachableAt320(choice);
        await choice.click();
        const dialog = page.getByRole("dialog");
        await expectReachableAt320(dialog.getByRole("heading"));
        await expectReachableAt320(page.getByLabel("Stake in credits"));
        await expectReachableAt320(
          dialog.getByRole("button", { name: "Add to card", exact: true }),
        );
        await expectNoHorizontalOverflow(page);
        await page.screenshot({
          path: info.outputPath(`props-${games}-320px-200pct-editor.png`),
        });
        await dialog
          .getByRole("button", { name: "Close pick editor", exact: true })
          .click();
      });
      await addPlayerDraft(page, early, lateLine.subjectLabel!, 150);
      await addPlayerDraft(page, early, existingLine.subjectLabel!, 200);
      await submitDraft(page, 2);
      owner = await state(commissioner, slug);
      expect(owner.ownerCard!.positions).toHaveLength(3);
      expect(owner.ownerCard!.remainingCredits).toBe(550);
      const props = owner.ownerCard!.positions.filter(
        (position) => position.subjectId,
      );
      expect(props).toHaveLength(2);
      expect(new Set(props.map((position) => position.subjectId)).size).toBe(2);
      expect(
        props.every(
          (position) => position.period === "FULL_GAME" && position.receiptHash,
        ),
      ).toBe(true);
      const immutable = props.map((position) => ({
        id: position.id,
        hash: position.receiptHash,
        odds: position.americanOdds,
        stake: position.stakeCredits,
      }));
      const hidden = await state(opponent, slug);
      expect(hidden.matchup!.opponentSelectedGames).toHaveLength(1);
      expect(hidden.matchup!.opponentRevealedPositions).toEqual([]);
      const cards = leagueMatchupCardsSchema.parse(
        await rpc(opponent, "get_league_matchup_cards", {
          p_league_slug: slug,
          p_week_id: owner.week!.id,
        }),
      );
      const publicOwner = cards.cards.find(
        (card) => card.entryId === owner.viewer.entryId,
      )!;
      expect(publicOwner.selectedGames).toHaveLength(1);
      expect(publicOwner.positions).toEqual([]);
      expect(publicOwner.outstanding).toBeNull();
      expect(publicOwner.availableCredits).toBeNull();
      expect(JSON.stringify(publicOwner.selectedGames)).not.toMatch(
        /subject|stake|odds|receipt|batch|positionCount/i,
      );
      await spectator.reload();
      const gamePreview = spectator.locator(
        '[data-member-name="Props Member 0"][data-game-selected="true"]',
      );
      await expect(gamePreview).toHaveCount(1);
      expect(await gamePreview.innerText()).not.toContain(
        lateLine.subjectLabel!,
      );
      expect(await gamePreview.innerText()).not.toMatch(
        /150|200|credits|passing|rushing/i,
      );
      const outsider = await members[4]!
        .schema("api")
        .rpc("get_player_prop_menu", { p_league_slug: slug });
      expect(outsider.error).not.toBeNull();
      const direct = await opponent
        .schema("private")
        .from("position_receipts")
        .select("*")
        .eq("card_id", owner.ownerCard!.id);
      expect(direct.error).not.toBeNull();
      // Deadline closes entries but cannot disclose details without reliable start.
      await rpc(commissioner, "advance_simulated_time", {
        p_league_id: owner.league.id,
        p_target: early.scheduledStartAt,
        p_idempotency_key: `props-cutoff-${run}`,
      });
      expect(
        (await state(opponent, slug)).matchup!.opponentRevealedPositions,
      ).toEqual([]);
      await rpc(commissioner, "set_stage1_event_live", {
        p_event_id: early.id,
        p_actual_started_at: early.scheduledStartAt,
        p_idempotency_key: `props-start-${run}`,
      });
      const revealed = await state(opponent, slug);
      expect(revealed.matchup!.opponentRevealedPositions).toHaveLength(3);
      expect(
        revealed.matchup!.opponentRevealedPositions.filter(
          (position) => position.subjectId,
        ),
      ).toHaveLength(2);
      await spectator.reload();
      await expect(
        spectator.getByText(lateLine.subjectLabel!, { exact: false }).first(),
      ).toBeVisible();
      await atNarrowEnlargedText(spectator, async () => {
        const longName = spectator
          .getByText(lateLine.subjectLabel!, { exact: false })
          .first();
        await expectReachableAt320(longName);
        await expectNoHorizontalOverflow(spectator);
        await spectator.screenshot({
          path: info.outputPath(`props-${games}-320px-200pct-revealed.png`),
        });
      });
      const finalResult = JSON.parse(
        sql(`
        select result.value::text
        from private.simulation_fixture_manifests manifest
        cross join lateral jsonb_array_elements(manifest.manifest_json->'weeks') week
        cross join lateral jsonb_array_elements(week->'events') event
        cross join lateral jsonb_array_elements(event->'resultVersions') result(value)
        where manifest.pack_id='sunday-ledger-authoritative-2026-v1'
          and (week->>'week')::integer=1
          and event->>'externalEventId'=${quoteSql(early.key)}
          and (result.value->>'version')::integer=2;
      `),
      );
      expect(finalResult.status).toBe("FINAL");
      await rpc(commissioner, "advance_simulated_time", {
        p_league_id: owner.league.id,
        p_target: finalResult.availableAt,
        p_idempotency_key: `props-finished-${run}`,
      });
      await rpc(commissioner, "record_stage1_result", {
        p_event_id: early.id,
        p_status: "FINAL",
        p_away_score: finalResult.awayScore,
        p_home_score: finalResult.homeScore,
        p_reason: finalResult.reason,
        p_source: "SIMULATION_FIXTURE",
        p_idempotency_key: `props-team-final-${run}`,
      });
      owner = await state(commissioner, slug);
      expect(
        owner
          .ownerCard!.positions.filter((position) => position.subjectId)
          .every((position) => position.settlement === null),
      ).toBe(true);
      expect(owner.week!.state).not.toBe("FINAL");
      expect(owner.ownerCard!.remainingCredits).toBe(550);
      await spectator.reload();
      await expect(
        spectator.getByText("Awaiting player results", { exact: true }).first(),
      ).toBeVisible();

      const dimensions = await spectator.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
      await spectator.screenshot({
        path: info.outputPath(`props-${games}-revealed.png`),
        fullPage: true,
      });
      // Safe disable stops new props while own/revealed historical terms survive.
      sql("update private.player_prop_controls set offers_enabled=false;");
      owner = await state(commissioner, slug);
      expect(
        owner
          .ownerCard!.positions.filter((position) => position.subjectId)
          .map((position) => ({
            id: position.id,
            hash: position.receiptHash,
            odds: position.americanOdds,
            stake: position.stakeCredits,
          })),
      ).toEqual(immutable);
      expect(
        (await state(opponent, slug)).matchup!.opponentRevealedPositions,
      ).toHaveLength(3);
    } finally {
      sql(
        `update private.player_prop_controls set offers_enabled=${offersBefore === "t" ? "true" : "false"};`,
      );
      await spectatorContext.close();
      for (const member of members) await member.auth.signOut();
    }
  });
}
