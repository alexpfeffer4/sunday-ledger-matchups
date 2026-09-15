import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

// These disposable, independent native sessions prove shared quota serialization.
// No provider request is made. Refuse hosted databases and nonempty fixture ledgers.
const databaseUrl = process.env.TEST_SUPABASE_DB_URL;
if (
  !databaseUrl ||
  !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname)
)
  throw new Error(
    "Source smoke concurrency requires disposable loopback Postgres.",
  );
const prefix = `smoke-native-${randomUUID().slice(0, 8)}`;
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function session(name) {
  const child = spawn(
    "psql",
    [databaseUrl, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
    {
      env: { ...process.env, PGAPPNAME: name, PGCONNECT_TIMEOUT: "5" },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let stdout = "",
    stderr = "";
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
  current.child.stdin.end(`set statement_timeout='20s';\n${statement}\n`);
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
    .find((line) => line.startsWith("{"));
  assert.ok(line, "Expected a native JSON response.");
  return JSON.parse(line);
}
async function waitBlocked(names) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const result = successful(
      await sql(`select count(*) from pg_stat_activity
      where application_name in (${names.map(quote).join(",")}) and wait_event_type='Lock';`),
      "Observe blocked quota sessions",
    );
    if (Number(result.stdout.trim()) === names.length) return;
    await pause(50);
  }
  throw new Error(
    "Competing native transactions did not reach the policy lock.",
  );
}
async function holdPolicy() {
  const holder = session(`${prefix}-holder`);
  holder.child.stdin.write(`begin; set local statement_timeout='20s';
    select singleton from private.player_result_policy for update;
    select 'SMOKE_POLICY_LOCK_HELD';\n`);
  for (let attempt = 0; attempt < 60; attempt++) {
    if (holder.output().includes("SMOKE_POLICY_LOCK_HELD"))
      return async () => {
        holder.child.stdin.end("commit;\n");
        successful(await holder.done, "Release native policy lock");
      };
    await pause(50);
  }
  holder.child.kill("SIGTERM");
  throw new Error("Native policy holder did not acquire its row.");
}
async function race(first, second, label) {
  const release = await holdPolicy();
  const names = [`${prefix}-${label}-a`, `${prefix}-${label}-b`];
  const pending = [];
  let failure;
  try {
    pending.push(sql(first, names[0]));
    await waitBlocked([names[0]]);
    pending.push(sql(second, names[1]));
    await waitBlocked(names);
  } catch (error) {
    failure = error;
  } finally {
    await release();
  }
  const results = await Promise.all(pending);
  if (failure) throw failure;
  return results;
}

const original = json(
  successful(
    await sql(`select jsonb_build_object(
  'requests',(select count(*) from private.player_result_requests),
  'runs',(select count(*) from private.player_source_smoke_runs),
  'policy',(select to_jsonb(p) from private.player_result_policy p));`),
    "Inspect empty disposable fixture ledgers",
  ),
);
assert.equal(
  original.requests,
  0,
  "Run this gate immediately after rollback-only pgTAP.",
);
assert.equal(original.runs, 0, "Diagnostic fixture ledger must start empty.");
const policyColumns = Object.keys(original.policy);
assert.ok(policyColumns.every((name) => /^[a-z_]+$/.test(name)));

async function clearFixture() {
  successful(
    await sql(`begin;
    delete from private.player_result_requests where external_event_id is null;
    delete from private.player_source_smoke_runs where operation_key like ${quote(`${prefix}%`)};
    update private.player_result_policy set processing_enabled=false,metadata_enabled=true,
      api_sports_contract_validated=false,nflverse_contract_validated=false,
      metadata_daily_limit=20,requests_per_minute=8,provider_remaining=100,
      provider_window_date=(clock_timestamp() at time zone 'UTC')::date,
      provider_observed_at=clock_timestamp(),blocked_until=null,status_probe_id=null,status_probe_until=null;
    commit;`),
    "Reset only disposable quota fixture state",
  );
}
async function readySmoke(label) {
  const claim = json(
    successful(
      await sql(
        `select api.claim_player_source_smoke(${quote(`${prefix}-${label}`)});`,
      ),
      "Claim diagnostic fixture",
    ),
  );
  assert.equal(claim.status, "CLAIMED");
  successful(
    await sql(
      `select api.complete_player_statistics_status(${quote(claim.smokeRunId)}::uuid,true,100,0,clock_timestamp());`,
    ),
    "Verify fixture account status",
  );
  return claim.smokeRunId;
}
async function counts() {
  return json(
    successful(
      await sql(`select jsonb_build_object(
    'requests',(select count(*) from private.player_result_requests),
    'diagnostic',(select count(*) from private.player_result_requests where source_smoke_run_id is not null),
    'remaining',(select provider_remaining from private.player_result_policy),
    'today',(select count(*) from private.player_result_requests where request_class='METADATA'
      and reserved_at>=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC'),
    'minute',(select count(*) from private.player_result_requests where reserved_at>clock_timestamp()-interval '1 minute'));`),
      "Inspect committed shared quota",
    ),
  );
}
const diagnostic = (runId) =>
  `select jsonb_build_object('requestId',api.reserve_player_source_smoke_request(${quote(runId)}::uuid));`;
const ordinary =
  "select jsonb_build_object('requestId',api.reserve_player_metadata_request());";

try {
  for (const boundary of ["day", "minute"]) {
    for (const diagnosticFirst of [false, true]) {
      // At UTC midnight there cannot yet be nineteen requests outside the last
      // minute in today's ledger. Let that first UTC minute pass before seeding.
      if (boundary === "day") {
        const utcElapsed = Date.now() % 86_400_000;
        if (utcElapsed < 61_000) await pause(61_000 - utcElapsed);
      }
      await clearFixture();
      const label = `${boundary}-${diagnosticFirst ? "diagnostic" : "ordinary"}-first`;
      const runId = await readySmoke(label);
      const seedCount = boundary === "day" ? 19 : 7;
      successful(
        await sql(`insert into private.player_result_requests(request_class,reserved_at,completed_at,succeeded)
        select 'METADATA',clock_timestamp()${boundary === "day" ? "-interval '61 seconds'" : ""},clock_timestamp(),true from generate_series(1,${seedCount});`),
        "Seed one remaining shared quota slot",
      );
      const operations = diagnosticFirst
        ? [diagnostic(runId), ordinary]
        : [ordinary, diagnostic(runId)];
      const results = await race(...operations, label);
      successful(results[0], "First queued quota reservation");
      assert.notEqual(
        results[1].code,
        0,
        "Second reservation must recheck committed quota.",
      );
      assert.match(results[1].stderr, /Statistics metadata budget exhausted/);
      const state = await counts();
      assert.equal(state.requests, seedCount + 1);
      assert.equal(state.diagnostic, diagnosticFirst ? 1 : 0);
      assert.equal(
        state.remaining,
        99,
        "Only one conservative provider credit is reserved.",
      );
      assert.equal(
        state[boundary === "day" ? "today" : "minute"],
        boundary === "day" ? 20 : 8,
      );
      console.log(
        `PASS: ${label}; one winner, shared quota rechecked after the native lock.`,
      );
    }
  }

  await clearFixture();
  const operation = `${prefix}-duplicate-operation`;
  const claimSql = `select api.claim_player_source_smoke(${quote(operation)});`;
  const claims = (await race(claimSql, claimSql, "duplicate-claim")).map(
    (result) => json(successful(result, "Concurrent diagnostic claim")),
  );
  assert.deepEqual(
    claims.map((claim) => claim.status),
    ["CLAIMED", "BUSY"],
  );
  const leaseState = json(
    successful(
      await sql(`select jsonb_build_object('runs',count(*),
    'matching',count(*) filter(where operation_key=${quote(operation)})) from private.player_source_smoke_runs;`),
      "Inspect one claimed operation",
    ),
  );
  assert.deepEqual(leaseState, { runs: 1, matching: 1 });
  assert.equal((await counts()).requests, 0);
  console.log(
    "PASS: duplicate native claims create one lease and reserve no paid requests.",
  );

  await clearFixture();
  const runId = await readySmoke("aggregate");
  successful(
    await sql(`insert into private.player_source_smoke_runs(operation_key,state,completed_at)
    select ${quote(`${prefix}-historical-`)}||n,'UNAVAILABLE',clock_timestamp()-interval '1 day' from generate_series(1,4)n;
    insert into private.player_result_requests(request_class,source_smoke_run_id,reserved_at,completed_at,succeeded)
    select 'METADATA',r.id,clock_timestamp()-interval '1 day',clock_timestamp()-interval '1 day',false
    from private.player_source_smoke_runs r cross join generate_series(1,5)n
    where r.operation_key like ${quote(`${prefix}-historical-%`)}
      and (r.operation_key<>${quote(`${prefix}-historical-4`)} or n<5);`),
    "Seed nineteen prior diagnostic charges without daily or minute contention",
  );
  const results = await race(diagnostic(runId), diagnostic(runId), "aggregate");
  successful(results[0], "Twentieth diagnostic reservation");
  assert.notEqual(results[1].code, 0);
  assert.match(results[1].stderr, /SMOKE_REQUEST_LIMIT/);
  const state = await counts();
  assert.deepEqual(state, {
    requests: 20,
    diagnostic: 20,
    remaining: 99,
    today: 1,
    minute: 1,
  });
  console.log(
    "PASS: concurrent diagnostics cannot exceed the twenty-request rollout ceiling across UTC days.",
  );
} finally {
  successful(
    await sql(`begin;
    delete from private.player_result_requests where external_event_id is null;
    delete from private.player_source_smoke_runs where operation_key like ${quote(`${prefix}%`)};
    update private.player_result_policy p set (${policyColumns.join(",")})=(select ${policyColumns.join(",")}
      from jsonb_populate_record(null::private.player_result_policy,${quote(JSON.stringify(original.policy))}::jsonb)) where p.singleton;
    commit;`),
    "Remove disposable fixture requests and restore the entire original policy",
  );
}
console.log(
  "Native source diagnostics verified: shared quota races, duplicate claims, and the aggregate ceiling.",
);
