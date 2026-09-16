import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  client,
  prerequisites,
  providerData,
  requireDisposable,
  rpc,
  signIn,
  sql,
} from "../fixtures/stage1-baseline";
import { verifyStage2Reads } from "../fixtures/stage2-reads";
import { observe, sample } from "../fixtures/stage1-measurements";
import { quoteSql as q } from "../fixtures/player-props-acceptance.mjs";

test.skip(
  process.env.STAGE1_BASELINE !== "1",
  "requires isolated Stage 1 baseline lane",
);
test.use({ actionTimeout: 20_000 });

for (const pending of [false, true])
  test(`real worker preparation and ${pending ? "pending" : "complete"} representative baseline`, async ({
    browser,
    baseURL,
    request,
  }, info) => {
    test.setTimeout(900_000);
    requireDisposable(baseURL);
    mkdirSync("acceptance-reports", { recursive: true });
    const slug = `stage1-${pending ? "pending" : "complete"}-${Date.now().toString(36)}`;
    const source = providerData(slug, pending);
    const { fixture, identity, owner, admin } = await prerequisites(
      slug,
      source.year,
      source.preset,
    );
    const season = q(fixture.season),
      league = q(fixture.league);
    const headers = { Authorization: `Bearer ${process.env.SCORE_JOB_SECRET}` };
    const worker = () =>
      request.post("/api/operations/season-automation", {
        headers,
        data: {},
        timeout: 60_000,
      });
    const tick = () => {
      // Each successful operation deliberately waits for the next five-minute
      // checkpoint. Advance only this disposable season's stored checkpoint.
      sql(
        `update private.season_automation set next_attempt_at='-infinity' where season_id=${season}::uuid;`,
      );
      return worker();
    };
    const snapshot = () =>
      JSON.parse(
        sql(`select jsonb_build_object(
    'weeks',(select count(*) from private.season_weeks where season_id=${season}::uuid and nfl_week=3),
    'plans',(select count(*) from private.season_automation_week_plans p join private.season_weeks w on w.id=p.week_id where w.season_id=${season}::uuid),
    'runs',(select jsonb_agg(jsonb_build_object('id',id,'operation',operation,'state',state,'failure',response->>'blocker') order by claimed_at) from private.season_automation_runs where season_id=${season}::uuid));`),
      );
    expect(snapshot().weeks).toBe(0);
    const priorReceipt = sql(
      `select private.card_receipt_fingerprint(${q(fixture.card)}::uuid,0);`,
    );
    // Real HTTP entry -> normalization -> service claim -> incomplete acquisition
    // -> failure completion. No resulting week, plan or successful marker is seeded.
    source.writeMain(140, true);
    const synchronized = await worker();
    // A call crossing a five-minute boundary can legitimately perform both
    // actions. Inspect its actual run records before advancing another tick.
    const failed = snapshot().runs.some(
      (r: { operation: string }) => r.operation === "PREPARE",
    )
      ? synchronized
      : await tick();
    expect(failed.status(), await failed.text()).toBe(503);
    let audit = snapshot();
    expect(audit.weeks).toBe(0);
    expect(audit.plans).toBe(0);
    expect(audit.runs).toEqual([
      expect.objectContaining({
        operation: "SYNC_SCHEDULE",
        state: "SUCCEEDED",
      }),
      expect.objectContaining({
        operation: "PREPARE",
        state: "FAILED",
        failure: "MARKETS_UNAVAILABLE",
      }),
    ]);
    expect(
      JSON.parse(
        sql(
          `select schedule from private.season_automation where season_id=${season}::uuid;`,
        ),
      ),
    ).toHaveLength(272);
    // Advance only this fixture's stored retry/cooldown checkpoints. The production
    // functions and all completeness/readiness/lease guards stay unchanged.
    sql(`update private.season_automation set next_attempt_at='-infinity' where season_id=${season}::uuid;
    update private.provider_requests set attempted_at=clock_timestamp()-interval '61 seconds' where league_id=${league}::uuid;
    update private.odds_refresh_policy set next_request_at='-infinity';`);
    source.writeMain();
    const prepared = await tick();
    expect(
      prepared.status(),
      `${await prepared.text()} ${JSON.stringify(snapshot())}`,
    ).toBe(200);
    audit = snapshot();
    expect(audit.weeks).toBe(1);
    expect(audit.plans).toBe(1);
    const prepare = audit.runs.find(
      (r: { operation: string; state: string }) =>
        r.operation === "PREPARE" && r.state === "SUCCEEDED",
    );
    expect(prepare).toBeTruthy();
    const replay = await rpc(admin, "complete_season_automation", {
      p_run: prepare.id,
    });
    expect(replay).toMatchObject({ status: "PREPARED", replayed: true });
    expect(snapshot()).toEqual(audit);
    const week = sql(
      `select id from private.season_weeks where season_id=${season}::uuid and nfl_week=3;`,
    );
    expect(
      sql(
        `select count(*) from private.sports_events where week_id=${q(week)}::uuid;`,
      ),
    ).toBe(String(source.gameCount));
    // Normal catalog worker and acquisition leases. Only raw nflverse/odds HTTP
    // responses are replaced by the preload. No nominations or validations inserted.
    for (let attempt = 0; attempt < 5; attempt++) {
      const catalog = await request.post("/api/operations/player-results", {
        headers,
        data: {},
        // The real catalog route allows 120 seconds and preserves three-second
        // provider pacing. It is not a twenty-second browser interaction.
        timeout: 120_000,
      });
      expect(catalog.status(), await catalog.text()).toBe(200);
      const count = Number(
        sql(
          `select count(*) from private.player_catalog_quote_evidence where week_id=${q(week)}::uuid;`,
        ),
      );
      if (count === source.gameCount * 3) break;
      sql(
        `update private.player_catalog_jobs set next_attempt_at=clock_timestamp() where week_id=${q(week)}::uuid;`,
      );
    }
    expect(
      sql(
        `select count(*) from private.player_catalog_quote_evidence where week_id=${q(week)}::uuid;`,
      ),
    ).toBe(String(source.gameCount * 3));
    const validated = await tick();
    expect(validated.status(), await validated.text()).toBe(200);
    expect(
      sql(
        `select count(*) from private.player_prop_system_validations where week_id=${q(week)}::uuid;`,
      ),
    ).toBe("1");
    const opened = await tick();
    expect(opened.status(), await opened.text()).toBe(200);
    const current = await rpc(owner, "get_stage1_state", {
      p_league_slug: slug,
    });
    expect(current.week).toMatchObject({ id: week, state: "OPEN" });
    expect(current.slate).toHaveLength(source.gameCount);
    expect(current.schedule).toHaveLength(5);
    const menu = await rpc(owner, "get_player_prop_menu", {
      p_league_slug: slug,
    });
    expect(menu.slots).toHaveLength(source.slotCount);
    expect(
      menu.slots.filter((s: { subjectId: string | null }) => s.subjectId),
    ).toHaveLength(pending ? 60 : source.slotCount);
    const counts = () =>
      sql(
        `select jsonb_build_object('cards',(select count(*) from private.weekly_cards where week_id=${q(week)}::uuid),'validations',(select count(*) from private.player_prop_system_validations where week_id=${q(week)}::uuid),'human',(select count(*) from private.player_prop_progressive_reviews where week_id=${q(week)}::uuid),'consents',(select count(*) from private.season_automation_consents where season_id=${season}::uuid));`,
      );
    expect(JSON.parse(counts())).toEqual({
      cards: 10,
      validations: 1,
      human: 0,
      consents: 1,
    });
    const before = counts();
    expect((await worker()).status()).toBe(200);
    expect(counts()).toBe(before);
    for (const run of snapshot().runs.filter(
      (r: { state: string }) => r.state === "SUCCEEDED",
    ))
      expect(
        (await rpc(admin, "complete_season_automation", { p_run: run.id }))
          .replayed,
      ).toBe(true);
    expect(counts()).toBe(before);
    expect(
      sql(
        `select private.card_receipt_fingerprint(${q(fixture.card)}::uuid,0);`,
      ),
    ).toBe(priorReceipt);
    await info.attach("preparation-proof", {
      body: JSON.stringify({
        audit: snapshot(),
        counts: JSON.parse(counts()),
        games: source.gameCount,
        slots: source.slotCount,
        pending: pending ? source.slotCount - 60 : 0,
        calendarProfile: source.calendarProfile,
        slatePreset: source.preset,
        priorReceiptUnchanged: true,
      }),
      contentType: "application/json",
    });
    // Pause future worker preparation through the real owner action; keep standing
    // consent/pending publication intact, as in the existing pause contract.
    await rpc(owner, "configure_season_automation", {
      p_league_slug: slug,
      p_command: "PAUSE",
    });
    sql("update private.background_quote_settings set polling_enabled=true;");

    // Query plans and execution time are obtained within Postgres, with the member
    // JWT/role. The first execution and five repeats are retained independently.
    const plans: unknown[] = [];
    for (const name of [
      "get_player_prop_menu",
      "get_stage1_state",
      "get_live_quote_heads",
    ]) {
      const args = q(slug);
      for (let run = 0; run <= 5; run++) {
        const output =
          sql(`begin read only; select set_config('request.jwt.claims',${q(JSON.stringify({ sub: fixture.owner, role: "authenticated" }))},true);set local role authenticated;
        explain (analyze,buffers,verbose,format json) select api.${name}(${args}); rollback;`);
        plans.push({
          name,
          run,
          cache: run === 0 ? "first-observed" : "repeat",
          plan: JSON.parse(output.slice(output.indexOf("["))),
        });
      }
    }
    writeFileSync(
      `acceptance-reports/stage1-query-plans-${pending ? "pending" : "complete"}.json`,
      JSON.stringify(plans, null, 2),
    );

    verifyStage2Reads(slug, pending);

    const authContext = await browser.newContext();
    const authPage = await authContext.newPage();
    await signIn(authPage, identity, `/l/${slug}/matchup`);
    const storageState = await authContext.storageState();
    await authContext.close();
    let submitted = 0;
    for (const mobile of [false, true])
      for (let run = 1; run <= 5; run++) {
        const condition = `${source.gameCount}g-${source.slotCount}s-${source.calendar}-${pending ? "pending" : "complete"}-${mobile ? "mobile-4x-150ms" : "desktop"}`;
        const context = await browser.newContext({
          storageState,
          viewport: mobile
            ? { width: 390, height: 844 }
            : { width: 1440, height: 900 },
          isMobile: mobile,
          deviceScaleFactor: mobile ? 3 : 1,
          hasTouch: mobile,
        });
        const page = await context.newPage();
        await observe(page);
        if (mobile) {
          const cdp = await context.newCDPSession(page);
          await cdp.send("Network.enable");
          await cdp.send("Network.emulateNetworkConditions", {
            offline: false,
            latency: 150,
            downloadThroughput: 1_600_000 / 8,
            uploadThroughput: 750_000 / 8,
          });
          await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        }
        const timed = (name: string, action: () => Promise<void>) =>
          sample(page, info, condition, run, name, action);
        const usable = () =>
          expect(
            page.getByRole("region", { name: "Your weekly card", exact: true }),
          ).toBeVisible();
        await timed("cold-browser-matchup", async () => {
          await page.goto(`/l/${slug}/matchup`);
          await usable();
        });
        await timed("repeat-matchup", async () => {
          await page.reload();
          await usable();
        });
        for (const [label, path] of [
          ["Make picks", "slate"],
          ["My Card", "card"],
          [mobile ? "League" : "Overview", "league"],
          ["Matchup", "matchup"],
        ]) {
          await timed(`nav-${path}`, async () => {
            await page
              .getByRole("link", { name: label, exact: true })
              .last()
              .click();
            await expect(page).toHaveURL(new RegExp(`/l/${slug}/${path}$`));
            await expect(page.locator("main h1").first()).toBeVisible();
          });
        }
        await page.goto(`/l/${slug}/slate`);
        const propGames = page.locator("details").filter({
          has: page.locator("summary").filter({ hasText: "View players" }),
        });
        await timed("props-filter", async () => {
          await page
            .getByRole("button", { name: "Player props", exact: true })
            .click();
          await expect(propGames).toHaveCount(source.gameCount);
        });
        await timed("game-filter", async () => {
          const filters = page.getByRole("navigation", {
            name: "Filter games by kickoff",
          });
          const day = filters.getByRole("button").nth(1);
          await day.click();
          await expect(day).toHaveAttribute("aria-pressed", "true");
          await expect(propGames).toHaveCount(source.firstFilterCount);
          await filters
            .getByRole("button", { name: "All games", exact: true })
            .click();
          await expect(propGames).toHaveCount(source.gameCount);
        });
        // Use the default game-market tab again; only enabled, unused markets enter
        // real drafts. Every repetition submits a new 50-credit batch, at most 500.
        await page.reload();
        const outcome = page
          .locator(".outcome-selector-group button:not([disabled])")
          .first();
        await timed("selection-and-stake", async () => {
          await outcome.click();
          await page.getByLabel("Stake in credits").fill("50");
          await page
            .getByRole("button", { name: "Add to card", exact: true })
            .click();
          await expect(page.getByRole("dialog")).toHaveCount(0);
        });
        await timed("stake-edit", async () => {
          await page
            .getByRole("button", { name: "Edit pick", exact: true })
            .first()
            .click();
          await page.getByLabel("Stake in credits").fill("75");
          await page
            .getByRole("button", { name: "Update pick", exact: true })
            .click();
        });
        await page
          .getByRole("button", { name: "Edit pick", exact: true })
          .first()
          .click();
        await page.getByLabel("Stake in credits").fill("50");
        // While editing, focus must not start stored quote polling or overwrite input.
        let polled = 0;
        const onRequest = (r: import("@playwright/test").Request) => {
          if (new URL(r.url()).pathname === `/api/l/${slug}/quotes`) polled++;
        };
        page.on("request", onRequest);
        await timed("paused-edit-focus", async () => {
          await page.evaluate(() => window.dispatchEvent(new Event("focus")));
          await page.waitForTimeout(1100);
          await expect(page.getByLabel("Stake in credits")).toHaveValue("50");
        });
        page.off("request", onRequest);
        expect(polled).toBe(0);
        await page
          .getByRole("button", { name: "Update pick", exact: true })
          .click();
        const expireCache = () =>
          sql(
            `update private.shared_quote_requests set fetched_at=clock_timestamp()-interval '2 minutes' where kind='MAIN' and event_ids && array(select fixture_event_key from private.sports_events where week_id=${q(week)}::uuid);update private.odds_refresh_policy set next_request_at='-infinity';`,
          );
        const review = async () => {
          await page
            .getByRole("button", { name: /^Review 1 (bets|updated quote)/ })
            .first()
            .click();
          await expect(
            page.getByRole("heading", {
              name: "Review your bets",
              exact: true,
            }),
          ).toBeVisible();
        };
        const acknowledge = async () => {
          const use = page.getByRole("button", { name: "Use updated odds" });
          if (await use.count()) await use.first().click();
          await expect(
            page.getByRole("button", { name: "Submit bets", exact: true }),
          ).toBeEnabled();
        };
        const changeAllPrices = (price: number) => {
          source.writeMain(price, false, 500);
          const wire = JSON.parse(
            readFileSync(process.env.ODDS_TEST_FIXTURE!, "utf8"),
          );
          for (const event of wire.payload)
            for (const market of event.bookmakers[0].markets)
              for (const item of market.outcomes) item.price = price;
          writeFileSync(process.env.ODDS_TEST_FIXTURE!, JSON.stringify(wire));
        };
        source.writeMain(140, false, 500);
        expireCache();
        const miss = await timed(
          "review-cache-miss-synthetic-500ms",
          async () => {
            await review();
            await acknowledge();
          },
        );
        expect(miss.providerCalls).toContain("odds");
        await page
          .getByRole("button", { name: "Back to edit", exact: true })
          .click();
        const hit = await timed("review-cache-hit", async () => {
          await review();
          await acknowledge();
        });
        expect(hit.providerCalls).toEqual([]);
        await page
          .getByRole("button", { name: "Back to edit", exact: true })
          .click();
        // Both sides change so whichever unused outcome was selected requires consent.
        changeAllPrices(155);
        expireCache();
        await timed("review-changed-terms", async () => {
          await review();
          await expect(
            page.getByRole("button", { name: "Use updated odds" }).first(),
          ).toBeVisible();
          await acknowledge();
        });
        if (run === 1) {
          // Reviews are append-only. Wait for this real proof's stored expiry;
          // the deliberate wait is outside the measured recovery span.
          const reviewId = await page
            .locator('input[name="reviewId"]')
            .inputValue();
          expect(reviewId).toMatch(/^[0-9a-f-]{36}$/i);
          const expiryWait =
            Number(
              sql(
                `select greatest(0,ceil(extract(epoch from expires_at-clock_timestamp())*1000)) from private.live_card_quote_reviews where id=${q(reviewId)}::uuid and actor_user_id=${q(fixture.owner)}::uuid;`,
              ),
            ) + 100;
          expect(expiryWait).toBeLessThan(31_000);
          await page.waitForTimeout(expiryWait);
          // Same-economics renewal may accept under the existing submit intent.
          // Changed economics must instead return to explicit confirmation.
          changeAllPrices(170);
          expireCache();
          await timed("expired-review-recovery", async () => {
            const response = page.waitForResponse(
              (r) =>
                r.request().method() === "POST" &&
                new URL(r.url()).pathname === `/l/${slug}/slate`,
            );
            await page
              .getByRole("button", { name: "Submit bets", exact: true })
              .click();
            await response;
            await expect(
              page.getByRole("button", { name: "Use updated odds" }).first(),
            ).toBeVisible();
            await acknowledge();
          });
          expect(
            Number(
              sql(
                `select count(*) from private.effective_position_receipts where week_id=${q(week)}::uuid;`,
              ),
            ),
          ).toBe(submitted);
        }
        await timed("confirm-to-receipt", async () => {
          await page
            .getByRole("button", { name: "Submit bets", exact: true })
            .click();
          await expect(
            page.getByRole("heading", {
              name: "Review your bets",
              exact: true,
            }),
          ).toHaveCount(0);
          await expect(
            page.getByRole("region", { name: "Your weekly card", exact: true }),
          ).toContainText(`${submitted + 1} submitted bet`);
        });
        submitted++;
        const preflight = await rpc(owner, "get_card_review_context", {
          p_league_slug: slug,
        });
        expect(preflight.ownerCard).toEqual({
          positionCount: submitted,
          allocatedCredits: submitted * 50,
          remainingCredits: 1000 - submitted * 50,
        });
        expect(
          Number(
            sql(
              `select count(*) from private.effective_position_receipts where week_id=${q(week)}::uuid;`,
            ),
          ),
        ).toBe(submitted);
        await timed("standings", async () => {
          await page.goto(`/l/${slug}/standings`);
          await expect(
            page.getByRole("heading", { name: "Standings", exact: true }),
          ).toBeVisible();
        });
        await timed("historical-matchup", async () => {
          await page.goto(`/l/${slug}/matchup?week=2`);
          await expect(
            page.getByRole("heading", { name: "Week 2 matchup", exact: true }),
          ).toBeVisible();
        });
        await page.goto(`/l/${slug}/matchup`);
        await usable();
        await page.evaluate(() => {
          document.documentElement.style.scrollBehavior = "auto";
        });
        await page.evaluate(() => window.scrollTo(0, 300));
        const scroll = await page.evaluate(() => window.scrollY);
        await timed("refresh-while-reading", async () => {
          const response = page.waitForResponse(
            (r) =>
              r.request().headers()["rsc"] === "1" &&
              new URL(r.url()).pathname === `/l/${slug}/matchup`,
          );
          await page
            .getByRole("button", { name: "Refresh matchup", exact: true })
            // Activate the real React control without Playwright scrolling an
            // offscreen button into view and confounding the RSC scroll check.
            .evaluate((button: HTMLButtonElement) => button.click());
          await response;
          await expect(
            page.getByRole("button", { name: "Refresh matchup", exact: true }),
          ).toHaveAttribute("aria-disabled", "false");
        });
        await info.attach(`${condition}-${run}-scroll`, {
          body: JSON.stringify({
            activation: "DOM click on actual refresh control; no auto-scroll",
            before: scroll,
            after: await page.evaluate(() => window.scrollY),
          }),
          contentType: "application/json",
        });
        if (run === 1)
          await page.screenshot({ path: info.outputPath(`${condition}.png`) });
        await context.close();
      }
    expect(
      sql(
        `select private.card_receipt_fingerprint(${q(fixture.card)}::uuid,0);`,
      ),
    ).toBe(priorReceipt);
    await rpc(owner, "get_player_prop_menu", { p_league_slug: slug });
    expect(
      (
        await client()
          .schema("api")
          .rpc("get_player_prop_menu", { p_league_slug: slug })
      ).error,
    ).not.toBeNull();
  });
