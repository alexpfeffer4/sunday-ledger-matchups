import { expect, type Browser } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { sql } from "./stage1-baseline";
import { quoteSql as q } from "./player-props-acceptance.mjs";

// Runs only after the existing real-worker/submission baseline on its isolated
// loopback stack. No hosted project, provider response or production actor.
export async function verifyCurrentStatePerformance({
  slug,
  week,
  owner,
  pending,
  browser,
  storageState,
}: {
  slug: string;
  week: string;
  owner: string;
  pending: boolean;
  browser: Browser;
  storageState: Awaited<
    ReturnType<import("@playwright/test").BrowserContext["storageState"]>
  >;
}) {
  const candidate = sql(
    "select pg_get_functiondef('api.get_stage1_state(text)'::regprocedure);",
  );
  const legacy = readFileSync(
    "supabase/tests/fixtures/performance_legacy_state.sql.inc",
    "utf8",
  );
  const claims = (id: string) =>
    `select set_config('request.jwt.claims',${q(JSON.stringify({ sub: id, role: "authenticated" }))},true);`;
  const measurements: unknown[] = [];
  const plans: unknown[] = [];
  const volumes: unknown[] = [];
  const members = JSON.parse(
    sql(`select jsonb_agg(jsonb_build_object('id',m.user_id,'role',m.role))
      from private.league_memberships m join private.leagues l on l.id=m.league_id
      where l.slug=${q(slug)};`),
  ) as { id: string; role: string }[];
  const member = members.find((m) => m.role === "MEMBER")!;
  const seedHistory = (target: number) => {
    // Copy valid market identities into old immutable observations; never move
    // current heads or alter accepted receipts. All writes are disposable.
    sql(`begin;
      create temporary table historical_quotes as
      with seeds as (
        select snapshot.*, item.slate_id,
          row_number() over(order by snapshot.id) as ordinal,
          count(*) over() as seed_count
        from private.live_quote_heads head
        join private.market_snapshots snapshot on snapshot.id=head.market_snapshot_id
        join lateral (select i.slate_id from private.slate_items i
          where i.market_snapshot_id=snapshot.id and private.is_effective_slate_item(i.id)
          order by i.id limit 1) item on true
        where head.week_id=${q(week)}::uuid
      )
      select gen_random_uuid() as new_id, seeds.slate_id,
        jsonb_populate_record(null::private.market_snapshots,
          to_jsonb(seeds) || jsonb_build_object('id',gen_random_uuid(),
            'observed_at',clock_timestamp()-interval '1 hour',
            'payload_hash',encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex'))) as snapshot
      from generate_series(1,greatest(0,${target}-(select count(*)::int from private.slate_items where week_id=${q(week)}::uuid))) n
      join seeds on seeds.ordinal=1+mod(n-1,seeds.seed_count);
      insert into private.market_snapshots select (snapshot).* from historical_quotes;
      insert into private.slate_items(slate_id,event_id,market_snapshot_id,week_id,league_id)
        select slate_id,(snapshot).event_id,(snapshot).id,(snapshot).week_id,(snapshot).league_id
        from historical_quotes;
      commit;`);
  };
  const parity = () => {
    sql(`begin;${legacy}
      do $check$ declare actor uuid; before_state jsonb; after_state jsonb; e jsonb; prior_event jsonb; expected jsonb; actual jsonb; begin
      foreach actor in array array[${q(owner)}::uuid,${q(member.id)}::uuid] loop
        perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
        before_state:=pg_temp.performance_legacy_state(${q(slug)});
        after_state:=api.get_stage1_state(${q(slug)});
        if before_state-'slate' is distinct from after_state-'slate' then raise exception 'Non-market authorized state changed';end if;
        if jsonb_array_length(before_state->'slate')<>jsonb_array_length(after_state->'slate') then raise exception 'Event set changed';end if;
        for e in select value from jsonb_array_elements(after_state->'slate') loop
          select value into strict prior_event from jsonb_array_elements(before_state->'slate') where value->>'id'=e->>'id';
          if e-'markets' is distinct from prior_event-'markets' then raise exception 'Event status or cutoff changed';end if;
          select coalesce(jsonb_agg(m order by m->>'id'),'[]'::jsonb) into expected
            from jsonb_array_elements(api.get_live_quote_heads(${q(slug)})) h,
              jsonb_array_elements(h->'markets') m where h->>'eventId'=e->>'id';
          select coalesce(jsonb_agg(m order by m->>'id'),'[]'::jsonb) into actual from jsonb_array_elements(e->'markets') m;
          if actual is distinct from expected then raise exception 'Current prices differ from authoritative heads';end if;
        end loop;
      end loop;
      perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
      begin perform api.get_stage1_state(${q(slug)});raise exception 'Outsider allowed';exception when insufficient_privilege then null;end;
      if not has_function_privilege('authenticated','api.get_stage1_state(text)','execute')
        or has_function_privilege('anon','api.get_stage1_state(text)','execute')
        or has_function_privilege('service_role','api.get_stage1_state(text)','execute') then raise exception 'Read privileges changed';end if;
      end $check$; rollback;`);
  };
  try {
    for (const target of [7684, 15368, 38420]) {
      seedHistory(target);
      parity();
      const size = JSON.parse(
        sql(`begin;${legacy}${claims(owner)}
          select jsonb_build_object('target',${target},
            'historyRows',(select count(*) from private.slate_items where week_id=${q(week)}::uuid),
            'currentHeads',(select count(*) from private.live_quote_heads where week_id=${q(week)}::uuid),
            'legacyBytes',octet_length(pg_temp.performance_legacy_state(${q(slug)})::text),
            'candidateBytes',octet_length(api.get_stage1_state(${q(slug)})::text));rollback;`)
          .split("\n")
          .at(-1)!,
      );
      expect(size.historyRows).toBe(target);
      expect(size.candidateBytes).toBeLessThan(size.legacyBytes / 5);
      volumes.push(size);
      for (let run = 0; run <= 5; run++) {
        for (const version of ["legacy", "candidate"]) {
          const fn =
            version === "legacy"
              ? "pg_temp.performance_legacy_state"
              : "api.get_stage1_state";
          const output = sql(`begin;${legacy}${claims(owner)}
            explain(analyze,buffers,verbose,format json) select ${fn}(${q(slug)});rollback;`);
          plans.push({
            target,
            version,
            run,
            cache: run === 0 ? "first-observed" : "repeat",
            plan: JSON.parse(output.slice(output.indexOf("["))),
          });
        }
      }
      if (target !== 7684) continue;
      // Same app, same data, same session. Only the database read changes, so
      // this A/B isolates the main fix; navigation changes are common to both.
      for (const version of ["legacy", "candidate"]) {
        sql(
          version === "legacy"
            ? legacy.replace(
                "pg_temp.performance_legacy_state(",
                "api.get_stage1_state(",
              )
            : candidate,
        );
        for (const mobile of [false, true]) {
          const context = await browser.newContext({
            storageState,
            viewport: mobile
              ? { width: 390, height: 844 }
              : { width: 1440, height: 900 },
            isMobile: mobile,
            deviceScaleFactor: mobile ? 3 : 1,
            hasTouch: mobile,
          });
          try {
            const page = await context.newPage();
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
            await page.goto(`/l/${slug}/matchup`);
            await expect(
              page.getByRole("region", {
                name: "Your weekly card",
                exact: true,
              }),
            ).toBeVisible();
            for (let run = 1; run <= 5; run++) {
              for (const [label, path, heading] of [
                ["Make picks", "slate", "Make picks"],
                ["My Card", "card", "My Week 3 card"],
                ["League", "league", "League overview"],
                ["Matchup", "matchup", "Week 3 matchup"],
              ]) {
                const started = Date.now();
                await page
                  .getByRole("link", { name: label, exact: true })
                  .last()
                  .click();
                await expect(page).toHaveURL(
                  new RegExp(`/l/${slug}/${path}(?:\\?|$)`),
                );
                await expect(
                  page.getByRole("heading", { name: heading, exact: true }),
                ).toBeVisible();
                if (path === "league")
                  await expect(
                    page.getByRole("heading", {
                      name: "Week 3 scoreboard",
                      exact: true,
                    }),
                  ).toBeVisible();
                else
                  await expect(
                    page.getByRole("region", {
                      name: "Your weekly card",
                      exact: true,
                    }),
                  ).toBeVisible();
                await page.evaluate(
                  () =>
                    new Promise<void>((resolve) =>
                      requestAnimationFrame(() =>
                        requestAnimationFrame(() => resolve()),
                      ),
                    ),
                );
                measurements.push({
                  version,
                  mobile,
                  run,
                  path,
                  ms: Date.now() - started,
                  target,
                  endpoint:
                    "specific final heading + domain content + two frames; not field INP",
                });
              }
            }
            // A hydrated dropdown must navigate without replacing the document.
            const origin = await page.evaluate(() => performance.timeOrigin);
            const matchup = page.getByRole("combobox", {
              name: "Matchup",
              exact: true,
            });
            const choices = await matchup
              .locator("option")
              .evaluateAll((options) =>
                options.map((o) => (o as HTMLOptionElement).value),
              );
            const own = await matchup.inputValue();
            await matchup.selectOption(choices.find((v) => v !== own)!);
            await expect(page).toHaveURL(/matchup\?matchup=/);
            await expect(matchup).not.toHaveValue(own);
            expect(await page.evaluate(() => performance.timeOrigin)).toBe(
              origin,
            );
            await page.goBack();
            await expect(matchup).toHaveValue(own);
            const weeks = page.getByRole("combobox", {
              name: "Week",
              exact: true,
            });
            await weeks.selectOption({ label: "Week 2 · Final" });
            await expect(
              page.getByRole("heading", {
                name: "Week 2 matchup",
                exact: true,
              }),
            ).toBeVisible();
            expect(await page.evaluate(() => performance.timeOrigin)).toBe(
              origin,
            );
            await page.goBack();
            await expect(
              page.getByRole("heading", {
                name: "Week 3 matchup",
                exact: true,
              }),
            ).toBeVisible();
          } finally {
            await context.close();
          }
        }
      }
    }
  } finally {
    sql(candidate);
    writeFileSync(
      `acceptance-reports/current-state-performance-${pending ? "pending" : "complete"}.json`,
      JSON.stringify(
        {
          baseline: "843ecda3",
          conditions:
            "same candidate app; only SQL changed; loopback Auth/Postgres; mobile Chromium 4xCPU 150ms 1.6Mbps; warm app/database; five repeat samples",
          volumes,
          plans,
          measurements,
        },
        null,
        2,
      ),
    );
  }
}
