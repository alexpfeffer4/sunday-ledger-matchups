import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

// This gate requires separate native PostgreSQL sessions. Embedded/single-session
// tests cannot establish lock ordering or concurrent idempotency guarantees.
const databaseUrl = process.env.TEST_SUPABASE_DB_URL;
if (
  !databaseUrl ||
  !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname)
) {
  throw new Error(
    "Quote-sharing concurrency verification requires the disposable loopback database.",
  );
}
const prefix = `quote-sharing-${randomUUID().slice(0, 8)}`;
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function session(applicationName) {
  const child = spawn(
    "psql",
    [databaseUrl, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
    {
      env: {
        ...process.env,
        PGAPPNAME: applicationName,
        PGCONNECT_TIMEOUT: "5",
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (data) => {
    stdout += data;
  });
  child.stderr.on("data", (data) => {
    stderr += data;
  });
  const timeout = setTimeout(() => child.kill("SIGTERM"), 20_000);
  const done = new Promise((resolve, reject) => {
    child.on("error", () => {
      clearTimeout(timeout);
      reject(new Error("Native PostgreSQL client could not start."));
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
  });
  return { child, done, output: () => stdout };
}

async function sql(statement, applicationName = `${prefix}-inspect`) {
  const current = session(applicationName);
  current.child.stdin.end(`SET statement_timeout='12s';\n${statement}\n`);
  return current.done;
}

function successful(result, label) {
  assert.equal(result.code, 0, `${label}: ${result.stderr}`);
  assert.ok(
    !/^not ok/m.test(result.stdout),
    `${label}: fixture assertion failed`,
  );
  return result;
}

function jsonResult(result) {
  const line = result.stdout
    .trim()
    .split("\n")
    .reverse()
    .find((item) => item.startsWith("{"));
  assert.ok(line, "Expected a JSON database result.");
  return JSON.parse(line);
}

function memberSql(ownerId, statement) {
  return `BEGIN;
    SELECT set_config('request.jwt.claims',${quote(JSON.stringify({ sub: ownerId, role: "authenticated" }))},true);
    SET LOCAL ROLE authenticated;
    ${statement};
    COMMIT;`;
}

async function holdPolicy() {
  const current = session(`${prefix}-holder`);
  current.child.stdin.write(`BEGIN; SET LOCAL statement_timeout='12s';
    SELECT singleton FROM private.odds_refresh_policy FOR UPDATE;
    SELECT 'QUOTE_POLICY_HELD';\n`);
  for (let attempt = 0; attempt < 50; attempt++) {
    if (current.output().includes("QUOTE_POLICY_HELD"))
      return {
        release: async () => {
          current.child.stdin.end("COMMIT;\n");
          successful(await current.done, "Release quote policy lock");
        },
      };
    await delay(50);
  }
  current.child.kill("SIGTERM");
  throw new Error("Timed out acquiring provider policy lock.");
}

async function waitForBothBlocked(names) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = successful(
      await sql(`SELECT count(*) FROM pg_stat_activity
      WHERE application_name IN (${names.map(quote).join(",")}) AND wait_event_type='Lock';`),
      "Inspect waiting sessions",
    );
    if (result.stdout.trim() === "2") return;
    await delay(50);
  }
  throw new Error(
    "Both native sessions did not reach the intended lock boundary.",
  );
}

// Reuse the actual two-league provider/menu/quote fixture, then expire only its
// cache eligibility before committing. Every identity is namespaced, and global
// catalog and policy changes are restored. No HTTP/provider calls occur.
const actorPrefix = randomUUID().slice(0, 8);
const subjectPrefix = randomUUID().slice(0, 8);
const source = await readFile(
  new URL("../supabase/tests/selective_prop_quotes.test.sql", import.meta.url),
  "utf8",
);
const marker = "-- Main quote fetch cannot refresh prop evidence.";
assert.ok(source.includes(marker), "Quote fixture boundary changed.");
let fixtureSql = source.slice(0, source.indexOf(marker));
fixtureSql = fixtureSql
  .replaceAll("a1000000", actorPrefix)
  .replaceAll("fa000000", subjectPrefix)
  .replaceAll("shared-prop-quotes", `${prefix}-b`)
  .replaceAll("rolling-quotes", `${prefix}-a`)
  .replaceAll("rolling-game-", `${prefix}-game-`);
fixtureSql = fixtureSql.replace(
  "begin;",
  `begin;
CREATE TEMP TABLE native_saved_catalog AS SELECT * FROM private.authoritative_season_rulesets;
CREATE TEMP TABLE native_saved_policy AS SELECT to_jsonb(p) value FROM private.odds_refresh_policy p;
CREATE TEMP TABLE native_saved_controls AS SELECT to_jsonb(p) value FROM private.player_prop_controls p;`,
);
const fixture = jsonResult(
  successful(
    await sql(`${fixtureSql}
UPDATE private.authoritative_season_rulesets active SET ruleset_version=prior.ruleset_version,
 product_bible_version=prior.product_bible_version,canonical_json=prior.canonical_json,sha256_hash=prior.sha256_hash
 FROM native_saved_catalog prior WHERE active.mode=prior.mode;
UPDATE private.shared_quote_requests SET fetched_at=clock_timestamp()-interval '70 seconds'
 WHERE id=(SELECT request_id FROM prop_quote_context);
UPDATE private.odds_refresh_policy SET next_request_at='-infinity';
SELECT jsonb_build_object('actor',${quote(`${actorPrefix}-0000-4000-8000-000000000001`)},
 'leagueA',q.league_id,'leagueB',p.second_league,'oldRequestId',p.request_id,
 'policy',(SELECT value FROM native_saved_policy),'controls',(SELECT value FROM native_saved_controls))
 FROM rolling_quote_context q CROSS JOIN prop_quote_context p;
COMMIT;`),
    "Prepare independent shared-quote fixtures",
  ),
);

try {
  const planNames = [`${prefix}-plan-a`, `${prefix}-plan-b`];
  const holder = await holdPolicy();
  const pendingA = sql(
    memberSql(
      fixture.actor,
      `SELECT api.plan_player_menu_quotes(${quote(fixture.leagueA)}::uuid)`,
    ),
    planNames[0],
  );
  const pendingB = sql(
    memberSql(
      fixture.actor,
      `SELECT api.plan_player_menu_quotes(${quote(fixture.leagueB)}::uuid)`,
    ),
    planNames[1],
  );
  try {
    await waitForBothBlocked(planNames);
  } finally {
    await holder.release();
  }
  const [resultA, resultB] = await Promise.all([pendingA, pendingB]);
  const planA = jsonResult(successful(resultA, "League A quote plan"));
  const planB = jsonResult(successful(resultB, "League B quote plan"));
  assert.equal(planA.status, "PLANNED");
  assert.equal(planB.status, "PLANNED");
  assert.deepEqual(
    planA.requestIds,
    planB.requestIds,
    "Competing leagues must share exact public coverage",
  );
  assert.equal(planA.requestIds.length, 1);
  const requestId = planA.requestIds[0];
  assert.notEqual(
    requestId,
    fixture.oldRequestId,
    "Expired coverage must receive one fresh request",
  );
  const before = jsonResult(
    successful(
      await sql(
        "SELECT jsonb_build_object('credits',daily_credits) FROM private.odds_refresh_policy;",
      ),
      "Read pre-request usage",
    ),
  );
  const claimNames = [`${prefix}-claim-a`, `${prefix}-claim-b`];
  const claimHolder = await holdPolicy();
  const serviceSql = (planId) => `BEGIN; SET LOCAL ROLE service_role;
    SELECT api.claim_shared_quote_request(${quote(planId)}::uuid,${quote(requestId)}::uuid); COMMIT;`;
  const claimingA = sql(serviceSql(planA.planId), claimNames[0]);
  const claimingB = sql(serviceSql(planB.planId), claimNames[1]);
  try {
    await waitForBothBlocked(claimNames);
  } finally {
    await claimHolder.release();
  }
  const claims = await Promise.all([claimingA, claimingB]);
  const statuses = claims
    .map(
      (result) => jsonResult(successful(result, "Shared request claim")).status,
    )
    .sort();
  assert.deepEqual(
    statuses,
    ["CLAIMED", "WAIT"],
    "Exactly one worker may issue the provider request",
  );
  const after = jsonResult(
    successful(
      await sql(`SELECT jsonb_build_object('credits',p.daily_credits,'reserved',r.reserved_cost,'state',r.state)
    FROM private.odds_refresh_policy p CROSS JOIN private.shared_quote_requests r WHERE r.id=${quote(requestId)}::uuid;`),
      "Inspect single reservation",
    ),
  );
  assert.equal(after.credits, before.credits + 1);
  assert.equal(after.reserved, 1);
  assert.equal(after.state, "RUNNING");
  successful(
    await sql(`BEGIN; SET LOCAL ROLE service_role;
    SELECT api.complete_shared_quote_request(${quote(requestId)}::uuid,NULL,'{}'::jsonb); COMMIT;`),
    "Conservatively finish fixture request without HTTP",
  );
  console.log(
    "Native quote sharing: cross-league plan convergence, competing provider claim and one conservative quota reservation passed.",
  );
} finally {
  successful(
    await sql(`DO $restore$ DECLARE cols text; BEGIN
    SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO cols FROM pg_attribute
      WHERE attrelid='private.odds_refresh_policy'::regclass AND attnum>0 AND NOT attisdropped;
    EXECUTE format('UPDATE private.odds_refresh_policy SET (%1$s)=(SELECT %1$s FROM jsonb_populate_record(NULL::private.odds_refresh_policy,$1))',cols)
      USING ${quote(JSON.stringify(fixture.policy))}::jsonb;
    UPDATE private.player_prop_controls SET offers_enabled=(${quote(JSON.stringify(fixture.controls))}::jsonb->>'offers_enabled')::boolean,
      updated_at=(${quote(JSON.stringify(fixture.controls))}::jsonb->>'updated_at')::timestamptz;
  END $restore$;`),
    "Restore isolated provider policy",
  );
}
