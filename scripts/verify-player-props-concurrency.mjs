import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  playerPropsLeagueSql,
  playerPropsQuoteSql,
  quoteSql as quote,
} from "../tests/fixtures/player-props-acceptance.mjs";

const databaseUrl = process.env.TEST_SUPABASE_DB_URL;
if (
  !databaseUrl ||
  !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname)
)
  throw new Error(
    "Player concurrency verification requires disposable native loopback PostgreSQL.",
  );
const prefix = `props-native-${randomUUID().slice(0, 8)}`;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function session(name) {
  const child = spawn(
    "psql",
    [databaseUrl, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
    {
      env: { ...process.env, PGAPPNAME: name, PGCONNECT_TIMEOUT: "5" },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const timeout = setTimeout(() => child.kill("SIGTERM"), 30_000);
  const done = new Promise((resolve, reject) => {
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
  });
  return { child, done, output: () => stdout };
}
async function sql(statement, name = `${prefix}-inspect`) {
  const current = session(name);
  current.child.stdin.end(`SET statement_timeout='20s';\n${statement}\n`);
  return current.done;
}
function successful(result, label) {
  assert.equal(result.code, 0, `${label}: ${result.stderr}`);
  return result;
}
function json(result) {
  const line = result.stdout
    .trim()
    .split("\n")
    .reverse()
    .find((value) => value.startsWith("{"));
  assert.ok(line, "Expected native JSON response");
  return JSON.parse(line);
}
function member(owner, statement) {
  return `BEGIN; SELECT set_config('request.jwt.claims',${quote(JSON.stringify({ sub: owner, role: "authenticated" }))},true); SET LOCAL ROLE authenticated; ${statement}; COMMIT;`;
}
async function hold(table, id) {
  const holder = session(`${prefix}-holder`);
  holder.child.stdin.write(
    `BEGIN; SET LOCAL statement_timeout='20s'; SELECT id FROM private.${table} WHERE id=${quote(id)}::uuid FOR UPDATE; SELECT 'PROPS_LOCK_HELD';\n`,
  );
  for (let i = 0; i < 60; i++) {
    if (holder.output().includes("PROPS_LOCK_HELD"))
      return async () => {
        holder.child.stdin.end("COMMIT;\n");
        successful(await holder.done, "Release held row");
      };
    await delay(50);
  }
  holder.child.kill("SIGTERM");
  throw new Error("Failed to acquire native fixture lock");
}
async function waitForLocks(names) {
  for (let i = 0; i < 60; i++) {
    const result = successful(
      await sql(
        `select count(*) from pg_stat_activity where application_name in(${names.map(quote).join(",")}) and wait_event_type='Lock';`,
      ),
      "Observe native waiting sessions",
    );
    if (Number(result.stdout.trim()) === names.length) return;
    await delay(50);
  }
  throw new Error(
    `${names.length} independent native sessions must reach the intended lock boundary`,
  );
}
async function fixture(scenario) {
  const slug = `${prefix}-${scenario}`;
  const users = Array.from({ length: 4 }, () => randomUUID());
  successful(
    await sql(`insert into auth.users(id,email) values ${users.map((id) => `(${quote(id)}::uuid,${quote(`${id}@props-native.test`)})`).join(",")};
    insert into private.profiles(id,display_name) select id,'Props native member' from auth.users where id in(${users.map(quote).join(",")});
    ${playerPropsLeagueSql({ slug, userIds: users, games: 16 })}`),
    "Build native props league",
  );
  const context = json(
    successful(
      await sql(`select jsonb_build_object('slug',l.slug,'league',l.id,'owner',${quote(users[0])},'season',w.season_id,'week',w.id)
    from private.leagues l join private.season_weeks w on w.league_id=l.id where l.slug=${quote(slug)};`),
      "Read native fixture context",
    ),
  );
  successful(
    await sql(`select api.import_player_catalog(jsonb_agg(jsonb_build_object('provider','SIMULATION_FIXTURE',
   'canonicalKey',e.id::text||':'||t.side||':'||p.position,'displayName','Fixture '||e.id::text||' '||t.side||' '||p.position,
   'position',p.position,'externalEventId',e.fixture_event_key,'externalPlayerId',e.id::text||t.side||p.position,
   'team',t.team,'gameDate','2026-09-13','verifiedAt',clock_timestamp(),'evidenceHash',repeat('a',64),
   'roleRank',0,'roleEvidence','Deterministic native concurrency fixture role','resultPathVerified',true)))
   from private.sports_events e cross join lateral(values(e.away_team,'away'),(e.home_team,'home')) t(team,side)
   cross join(values('QB'),('RB'),('WR')) p(position) where e.week_id=${quote(context.week)}::uuid;
   ${member(users[0], `select api.prepare_player_prop_menu(${quote(slug)}); select api.confirm_player_prop_menu(${quote(slug)},api.get_player_prop_menu(${quote(slug)})->'slots'); select api.open_reviewed_player_prop_week(${quote(slug)},'native-reviewed-open-'||${quote(slug)})`)}
   ${playerPropsQuoteSql({ weekId: context.week })}`),
    "Prepare canonical menu and fixture observations",
  );
  context.card = json(
    successful(
      await sql(
        `select jsonb_build_object('card',id) from private.weekly_cards where week_id=${quote(context.week)}::uuid and owner_user_id=${quote(context.owner)}::uuid;`,
      ),
      "Read opened owner card",
    ),
  ).card;
  return { ...context, ...(await markets(context)) };
}
async function markets(context) {
  return json(
    successful(
      await sql(`select jsonb_build_object('markets',jsonb_agg(jsonb_build_object(
   'marketSnapshotId',m.id,'payloadHash',m.payload_hash,'eventId',e.id,'startsAt',e.scheduled_start_at,
   'subjectId',m.subject_id,'outcomeKey',m.outcome_key,'marketType',m.market_type)
   order by e.scheduled_start_at,e.id,m.subject_id nulls first,m.market_type,m.outcome_key))
   from private.live_quote_heads h join private.market_snapshots m on m.id=h.market_snapshot_id join private.sports_events e on e.id=m.event_id
   where m.week_id=${quote(context.week)}::uuid;`),
      "Read fresh fixture heads",
    ),
  );
}
const positions = (market, stake = 100) => [
  {
    marketSnapshotId: market.marketSnapshotId,
    payloadHash: market.payloadHash,
    stakeCredits: stake,
  },
];
const accept = (context, market, key, stake = 100) =>
  member(
    context.owner,
    `select api.accept_stage1_card(${quote(context.slug)},${quote(JSON.stringify(positions(market, stake)))}::jsonb,${quote(key)})`,
  );
async function card(context) {
  return json(
    successful(
      await sql(
        `select jsonb_build_object('count',count(*),'credits',coalesce(sum(stake_credits),0)) from private.position_receipts where card_id=${quote(context.card)}::uuid;`,
      ),
      "Inspect cumulative allocation",
    ),
  );
}
const offersBefore = successful(
  await sql("select offers_enabled from private.player_prop_controls;"),
  "Read original disposable flag",
).stdout.trim();
try {
  {
    const context = await fixture("duplicate");
    const over = context.markets.find(
      (market) => market.subjectId && market.outcomeKey === "OVER",
    );
    const under = context.markets.find(
      (market) =>
        market.subjectId === over.subjectId &&
        market.eventId === over.eventId &&
        market.outcomeKey === "UNDER",
    );
    const release = await hold("seasons", context.season);
    const names = [`${prefix}-opposing-over`, `${prefix}-opposing-under`];
    const pending = [
      sql(accept(context, over, "native-prop-over"), names[0]),
      sql(accept(context, under, "native-prop-under"), names[1]),
    ];
    await waitForLocks(names);
    await release();
    const responses = await Promise.all(pending);
    assert.equal(responses.filter((response) => response.code === 0).length, 1);
    assert.deepEqual(await card(context), { count: 1, credits: 100 });
    console.log(
      "PASS: native opposite-side player requests serialize one immutable selection.",
    );
  }
  {
    const context = await fixture("retry");
    const selection = context.markets.find((market) => market.subjectId);
    const release = await hold("seasons", context.season);
    const names = [`${prefix}-retry-a`, `${prefix}-retry-b`];
    const pending = names.map((name) =>
      sql(accept(context, selection, "native-prop-same-request"), name),
    );
    await waitForLocks(names);
    await release();
    const responses = (await Promise.all(pending)).map((response) =>
      json(successful(response, "Concurrent exact prop retry")),
    );
    assert.equal(responses.filter((response) => response.replayed).length, 1);
    assert.deepEqual(responses[0].receipts, responses[1].receipts);
    assert.deepEqual(await card(context), { count: 1, credits: 100 });
    console.log(
      "PASS: native concurrent prop retries return the same receipt without duplicate spend.",
    );
  }
  {
    const context = await fixture("freeze");
    const main = context.markets.find(
      (market) => !market.subjectId && market.marketType === "MONEYLINE",
    );
    const release = await hold("seasons", context.season);
    const names = [`${prefix}-menu-confirm`, `${prefix}-menu-freeze`];
    const confirm = member(
      context.owner,
      `select api.confirm_player_prop_menu(${quote(context.slug)},
      (select jsonb_agg(case when ordinality=1 then jsonb_set(value,'{subjectId}','null') else value end order by ordinality)
      from jsonb_array_elements(api.get_player_prop_menu(${quote(context.slug)})->'slots') with ordinality))`,
    );
    const pending = [
      sql(confirm, names[0]),
      sql(accept(context, main, "native-menu-freezing-game"), names[1]),
    ];
    await waitForLocks(names);
    await release();
    const responses = await Promise.all(pending);
    successful(responses[1], "Game-only batch freezes league-wide menu");
    if (responses[0].code !== 0) assert.match(responses[0].stderr, /frozen/);
    const menu = json(
      successful(
        await sql(
          `select jsonb_build_object('slots',count(*),'frozen',count(*) filter(where frozen_at is not null),'unresolved',count(*) filter(where subject_id is null)) from private.week_player_menu where week_id=${quote(context.week)}::uuid;`,
        ),
        "Inspect one frozen full menu",
      ),
    );
    assert.equal(menu.slots, 96);
    assert.equal(menu.frozen, 96);
    assert.equal(menu.unresolved, responses[0].code === 0 ? 1 : 0);
    console.log(
      "PASS: commissioner publication and first game-only acceptance freeze one consistent 96-slot menu.",
    );
  }
  for (const order of ["result-first", "acceptance-first"]) {
    const context = await fixture(`settlement-${order}`);
    const early = context.markets.find((market) => market.subjectId);
    successful(
      await sql(accept(context, early, "native-prop-before-final", 300)),
      "Accept early prop",
    );
    successful(
      await sql(
        member(
          context.owner,
          `select api.advance_simulated_time(${quote(context.league)}::uuid,'2026-09-13 19:00Z','native-prop-afternoon')`,
        ),
      ),
      "Advance fixture time",
    );
    successful(
      await sql(
        member(
          context.owner,
          `select api.set_stage1_event_live(${quote(early.eventId)}::uuid,${quote(early.startsAt)}::timestamptz,'native-prop-start'); select api.prepare_simulation_card_quotes(${quote(context.slug)})`,
        ),
      ),
      "Record kickoff and renew later observations",
    );
    const later = (await markets(context)).markets.find(
      (market) =>
        market.subjectId &&
        new Date(market.startsAt) > new Date("2026-09-13T19:00:00Z"),
    );
    assert.ok(later);
    const release = await hold("season_weeks", context.week);
    const names = [
      `${prefix}-${order}-prop-team-final`,
      `${prefix}-${order}-later-prop`,
    ];
    const operations = [
      () =>
        sql(
          member(
            context.owner,
            `select api.record_stage1_result(${quote(early.eventId)}::uuid,'FINAL',10,20,'Native team final with player evidence pending','SIMULATION_FIXTURE','native-prop-team-final')`,
          ),
          names[0],
        ),
      () => sql(accept(context, later, "native-later-prop", 100), names[1]),
    ];
    // Queue the first actor before starting the second. Simultaneous process
    // launch alone can let an opposite lock order pass by chance.
    const first = order === "result-first" ? 0 : 1;
    const pending = [operations[first]()];
    await waitForLocks([names[first]]);
    pending.push(operations[1 - first]());
    await waitForLocks(names);
    await release();
    for (const response of await Promise.all(pending))
      successful(
        response,
        `Concurrent pending prop final and later acceptance (${order})`,
      );
    assert.deepEqual(await card(context), { count: 2, credits: 400 });
    const state = json(
      successful(
        await sql(
          `select jsonb_build_object('state',w.state,'settlements',(select count(*) from private.settlement_versions v join private.position_receipts r on r.id=v.receipt_id where r.card_id=${quote(context.card)}::uuid)) from private.season_weeks w where w.id=${quote(context.week)}::uuid;`,
        ),
        "Inspect unresolved player obligations",
      ),
    );
    assert.equal(state.settlements, 0);
    assert.notEqual(state.state, "FINAL");
    console.log(
      `PASS: native team-final processing leaves missing props pending while a later prop submits without deadlock (${order}).`,
    );
  }
} finally {
  successful(
    await sql(
      `update private.player_prop_controls set offers_enabled=${offersBefore === "t" ? "true" : "false"};`,
    ),
    "Restore disposable offer flag",
  );
}
console.log(
  "Native player-props concurrency verified: 5 separate-session lock scenarios.",
);
