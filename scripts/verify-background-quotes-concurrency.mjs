import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
const database = process.env.TEST_SUPABASE_DB_URL;
if (
  !database ||
  !["127.0.0.1", "localhost"].includes(new URL(database).hostname)
)
  throw new Error(
    "Background quote races require disposable loopback PostgreSQL.",
  );
const args = [database, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"];
const sql = (input) =>
  execFileSync("psql", args, {
    input,
    encoding: "utf8",
    timeout: 30_000,
  }).trim();
const parallel = async (statement) =>
  (
    await promisify(execFile)("psql", [...args, "-c", statement], {
      encoding: "utf8",
      timeout: 30_000,
    })
  ).stdout.trim();
const fixture = readFileSync(
  "supabase/tests/z_background_quote_refresh.test.sql",
  "utf8",
);
const setup = fixture.slice(
  0,
  fixture.indexOf("-- BACKGROUND ACCEPTANCE START"),
);
sql(
  setup +
    `
update private.odds_refresh_policy set enabled=true,requests_remaining=19840,provider_entitlement_credits=20000,next_quota_reset_at=clock_timestamp()+interval '16 days',daily_credit_limit=2000,monthly_credit_limit=18000,protected_core_daily_credits=350,protected_core_monthly_credits=2000,next_request_at='-infinity';
insert into private.odds_entitlement_probes(state,completed_at,remaining,used) values('SUCCEEDED',clock_timestamp(),19840,160);
update private.background_quote_settings set enabled=true,release_sha=repeat('a',40);
commit;`,
);
const runs = await Promise.all([
  parallel("select api.claim_background_quote_run();"),
  parallel("select api.claim_background_quote_run();"),
]);
const claimed = runs.map(JSON.parse).filter((r) => r.status === "CLAIMED");
assert.equal(claimed.length, 1, "Duplicate dispatch issues exactly one claim");
const runId = claimed[0].runId;
const plan = JSON.parse(
  sql(
    `begin;select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);select api.plan_live_quote_refresh((select id from private.leagues where slug='rolling-quotes'),null);commit;`,
  )
    .split("\n")
    .at(-1),
);
const before = Number(
  sql("select daily_credits from private.odds_refresh_policy;"),
);
const outcomes = await Promise.all([
  parallel(`select api.claim_background_quote_request('${runId}');`),
  parallel(
    `select api.claim_shared_quote_request('${plan.planId}','${plan.requestIds[0]}');`,
  ),
]);
assert.equal(
  outcomes.map(JSON.parse).filter((x) => x.status === "CLAIMED").length,
  1,
  "Member and scheduled acquisition share one request",
);
assert.equal(
  Number(sql("select daily_credits from private.odds_refresh_policy;")),
  before + 3,
  "Concurrent acquisition charges once",
);
assert.equal(
  Number(
    sql(
      "select count(*) from private.shared_quote_requests where kind='MAIN' and state='RUNNING';",
    ),
  ),
  1,
);
// Expired unknown calls cannot get a second charge by reclaiming the same ID.
const requestId = outcomes
  .map(JSON.parse)
  .find((x) => x.status === "CLAIMED").requestId;
sql(
  `update private.shared_quote_requests set expires_at=clock_timestamp()-interval '1 second' where id='${requestId}';update private.background_quote_runs set expires_at=clock_timestamp()-interval '1 second' where id='${runId}';`,
);
const after = Number(
  sql("select daily_credits from private.odds_refresh_policy;"),
);
sql(`select api.complete_shared_quote_request('${requestId}',null,'{}');`);
assert.equal(
  Number(sql("select daily_credits from private.odds_refresh_policy;")),
  after,
  "Unknown failure retains one conservative reservation",
);
// Native atomic reservation at the background ceiling: one succeeds, one fails.
sql(
  "update private.background_quote_settings set forecast=jsonb_build_object('backgroundAllowance',1000,'essentialHeadroom',2000),daily_limit=1;update private.odds_refresh_policy set background_daily_credits=0,next_request_at='-infinity';",
);
const reservation = `do $$begin perform private.reserve_background_quote_credits(1);exception when raise_exception then if sqlerrm not in ('QUOTE_REFRESH_BUDGET','QUOTE_REFRESH_COOLDOWN') then raise;end if;end$$;`;
await Promise.all([parallel(reservation), parallel(reservation)]);
assert.equal(
  Number(
    sql("select background_daily_credits from private.odds_refresh_policy;"),
  ),
  1,
  "Concurrent optional reservations cannot cross daily cap",
);
console.log(
  "Background native races passed: duplicate dispatch, member/worker sharing, expiry accounting, and atomic purpose budget.",
);
