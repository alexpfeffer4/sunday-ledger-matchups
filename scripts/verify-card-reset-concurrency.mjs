import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

// Lock order must be demonstrated with independent native sessions. Never run
// this destructive fixture setup against a hosted or non-loopback database.
const databaseUrl = process.env.TEST_SUPABASE_DB_URL;
if (
  !databaseUrl ||
  !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname)
)
  throw new Error(
    "Card reset concurrency requires disposable loopback Postgres.",
  );
const prefix = `reset-native-${randomUUID().slice(0, 8)}`;
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fixtureSource = await readFile(
  new URL("../tests/fixtures/card-reset-acceptance.sql", import.meta.url),
  "utf8",
);

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
  assert.ok(line, "Expected a native JSON response.");
  return JSON.parse(line);
}
async function waitBlocked(names) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const result = successful(
      await sql(`select count(*) from pg_stat_activity
        where application_name in (${names.map(quote).join(",")}) and wait_event_type='Lock';`),
      "Observe independently blocked sessions",
    );
    if (Number(result.stdout.trim()) === names.length) return;
    await pause(50);
  }
  throw new Error("Both competing transactions must reach the season lock.");
}
async function holdSeason(fixture) {
  const holder = session(`${prefix}-holder`);
  holder.child.stdin.write(`begin; set local statement_timeout='20s';
    select id from private.seasons where id=${quote(fixture.season)}::uuid for update;
    select 'RESET_SEASON_LOCK_HELD';\n`);
  for (let attempt = 0; attempt < 60; attempt++) {
    if (holder.output().includes("RESET_SEASON_LOCK_HELD"))
      return async () => {
        holder.child.stdin.end("commit;\n");
        successful(await holder.done, "Release native season lock");
      };
    await pause(50);
  }
  holder.child.kill("SIGTERM");
  throw new Error("Fixture season lock was not acquired.");
}
const reset = (f) => `select private.reset_prestart_week2_card(
  ${quote(f.league)}::uuid,${quote(f.season)}::uuid,${quote(f.week)}::uuid,${quote(f.card)}::uuid,
  array[${f.receiptIds.map((id) => `${quote(id)}::uuid`).join(",")}],${quote(f.receiptHash)},
  ${quote(`${f.slug}-reset`)},repeat('b',40),'Explicit owner approval in disposable native acceptance',
  'Before kickoff: reset original picks so member can include props.');`;
const member = (f, statement) => `begin;
  select set_config('request.jwt.claims',${quote(JSON.stringify({ sub: f.owner, role: "authenticated" }))},true);
  set local role authenticated; ${statement}; commit;`;

async function fixture(label) {
  const f = json(
    successful(
      await sql(
        `${fixtureSource}\nselect pg_temp.card_reset_fixture(${quote(`${prefix}-${label}`)},800);`,
      ),
      "Create real LIVE Week 2 fixture and original public acceptance",
    ),
  );
  f.originalReceipts = json(
    successful(
      await sql(`select jsonb_build_object('receipts',jsonb_agg(to_jsonb(r) order by id))
        from private.position_receipts r where card_id=${quote(f.card)}::uuid;`),
      "Capture immutable original receipt evidence",
    ),
  ).receipts;
  return f;
}
async function currentState(f) {
  return json(
    successful(
      await sql(`select jsonb_build_object(
      'generation',(select card_generation from private.weekly_cards where id=${quote(f.card)}::uuid),
      'activeCount',(select count(*) from private.effective_position_receipts where card_id=${quote(f.card)}::uuid),
      'activeCredits',(select coalesce(sum(stake_credits),0) from private.effective_position_receipts where card_id=${quote(f.card)}::uuid),
      'resets',(select count(*) from private.card_reset_events where card_id=${quote(f.card)}::uuid),
      'originalReceipts',(select jsonb_agg(to_jsonb(r) order by id) from private.position_receipts r
        where id in (${f.receiptIds.map(quote).join(",")})),
      'originalSettlements',(select count(*) from private.settlement_versions where receipt_id in (${f.receiptIds.map(quote).join(",")})),
      'results',(select count(*) from private.event_result_versions where week_id=${quote(f.week)}::uuid));`),
      "Inspect authoritative state after competing operations",
    ),
  );
}

// Queue the first transaction and observe its lock wait before starting the
// second. This verifies both arrival orders instead of relying on random races.
async function race(f, first, second, label) {
  const release = await holdSeason(f);
  const names = [`${prefix}-${label}-first`, `${prefix}-${label}-second`];
  const pendingFirst = sql(first, names[0]);
  await waitBlocked([names[0]]);
  const pendingSecond = sql(second, names[1]);
  await waitBlocked(names);
  await release();
  return Promise.all([pendingFirst, pendingSecond]);
}

for (const resetFirst of [false, true]) {
  const label = resetFirst ? "reset-before-accept" : "accept-before-reset";
  const f = await fixture(label);
  const proof = json(
    successful(
      await sql(`with review as(insert into private.live_card_quote_reviews(card_id,actor_user_id,positions,reviewed_at,expires_at,fetched_at)
      values(${quote(f.card)}::uuid,${quote(f.owner)}::uuid,${quote(JSON.stringify(f.sparePositions))}::jsonb,
        clock_timestamp(),clock_timestamp()+interval '30 seconds',clock_timestamp()) returning id)
      select jsonb_build_object('reviewId',id) from review;`),
      "Prepare a genuine unused old-generation quote review",
    ),
  );
  const positions = f.sparePositions.map((position, i) =>
    i === 0 ? { ...position, reviewId: proof.reviewId } : position,
  );
  const accept = member(
    f,
    `select api.accept_stage1_card(${quote(f.slug)},${quote(JSON.stringify(positions))}::jsonb,${quote(`${f.slug}-competing-bet`)})`,
  );
  const operations = resetFirst ? [reset(f), accept] : [accept, reset(f)];
  const results = await race(f, ...operations, label);
  successful(results[0], "First queued operation must commit");
  assert.notEqual(
    results[1].code,
    0,
    "Second operation must fail its recheck.",
  );
  if (resetFirst) assert.match(results[1].stderr, /CARD_RESET_REVIEW_REQUIRED/);
  else assert.match(results[1].stderr, /CARD_RESET_RECEIPTS_CHANGED/);
  const state = await currentState(f);
  assert.equal(state.generation, resetFirst ? 1 : 0);
  assert.equal(state.resets, resetFirst ? 1 : 0);
  assert.equal(state.activeCount, resetFirst ? 0 : 5);
  assert.equal(state.activeCredits, resetFirst ? 0 : 900);
  assert.deepEqual(state.originalReceipts, f.originalReceipts);
  console.log(
    `PASS: ${label}; changed receipts or stale consent fail atomically.`,
  );
}

for (const kind of ["kickoff", "result"]) {
  for (const resetFirst of [false, true]) {
    const label = resetFirst ? `reset-before-${kind}` : `${kind}-before-reset`;
    const f = await fixture(label);
    const eventTransition = `begin;
      select id from private.seasons where id=${quote(f.season)}::uuid for update;
      select id from private.season_weeks where id=${quote(f.week)}::uuid for update;
      update private.sports_events set state='LIVE',actual_started_at=clock_timestamp()-interval '1 minute'
        ${kind === "result" ? ",scheduled_start_at=clock_timestamp()-interval '2 minutes'" : ""}
        where id=${quote(f.event)}::uuid;
      ${
        kind === "result"
          ? `select private.record_stage1_result_as(${quote(f.owner)}::uuid,${quote(f.event)}::uuid,'FINAL',10,20,
        'Disposable authoritative final result','THE_ODDS_API',${quote(`${f.slug}-result`)});`
          : ""
      }
      commit;`;
    const operations = resetFirst
      ? [reset(f), eventTransition]
      : [eventTransition, reset(f)];
    const results = await race(f, ...operations, label);
    successful(results[0], "First queued operation must commit");
    if (resetFirst)
      successful(results[1], "Later authoritative event transition");
    else {
      assert.notEqual(
        results[1].code,
        0,
        "Reset must recheck committed kickoff/result.",
      );
      assert.match(
        results[1].stderr,
        /CARD_RESET_(BEFORE_PLAY_ONLY|SCOPE_INELIGIBLE)/,
      );
    }
    const state = await currentState(f);
    assert.equal(state.generation, resetFirst ? 1 : 0);
    assert.equal(state.resets, resetFirst ? 1 : 0);
    assert.equal(state.activeCount, resetFirst ? 0 : 4);
    assert.deepEqual(state.originalReceipts, f.originalReceipts);
    if (kind === "result") {
      assert.equal(state.results, 1, "Real result engine records the final.");
      assert.equal(
        state.originalSettlements,
        resetFirst ? 0 : 1,
        "Only an effective receipt may settle; canceled picks never affect scoring.",
      );
    }
    console.log(
      `PASS: ${label}; ordered locks preserve cutoff, result, and receipt authority.`,
    );
  }
}
