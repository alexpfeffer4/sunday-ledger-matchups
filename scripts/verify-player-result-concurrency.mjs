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
const prefix = `player-jobs-native-${randomUUID().slice(0, 8)}`;
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
    `BEGIN; SET LOCAL statement_timeout='20s'; SELECT ${table === "player_result_policy" ? "singleton" : "id"} FROM private.${table} WHERE ${table === "player_result_policy" ? "singleton" : "id=" + quote(id) + "::uuid"} FOR UPDATE; SELECT 'PROPS_LOCK_HELD';\n`,
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
async function waitForBoth(names) {
  for (let i = 0; i < 60; i++) {
    const result = successful(
      await sql(
        `select count(*) from pg_stat_activity where application_name in(${names.map(quote).join(",")}) and wait_event_type='Lock';`,
      ),
      "Observe native waiting sessions",
    );
    if (result.stdout.trim() === "2") return;
    await delay(50);
  }
  throw new Error(
    "Both independent native sessions must reach the intended lock boundary",
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
const original = json(
  successful(
    await sql(
      `select jsonb_build_object('offers',(select offers_enabled from private.player_prop_controls),'policy',(select to_jsonb(p) from private.player_result_policy p));`,
    ),
    "Read disposable result policy",
  ),
);
let context;
try {
  context = await fixture("shared-events");
  const selected = [
    ...new Map(
      context.markets
        .filter((market) => market.subjectId && market.outcomeKey === "OVER")
        .map((market) => [market.eventId, market]),
    ).values(),
  ];
  assert.equal(selected.length, 16);
  successful(
    await sql(
      member(
        context.owner,
        `select api.accept_stage1_card(${quote(context.slug)},${quote(JSON.stringify(selected.flatMap((market) => positions(market, 50))))}::jsonb,'native-sixteen-result-obligations')`,
      ),
    ),
    "Accept one real prop in each of sixteen games",
  );
  assert.deepEqual(await card(context), { count: 16, credits: 800 });
  successful(
    await sql(`begin;
    select set_config('request.jwt.claims',${quote(JSON.stringify({ sub: context.owner, role: "authenticated" }))},true);
    update private.seasons set simulated_now=(select max(scheduled_start_at)+interval '4 hours' from private.sports_events where week_id=${quote(context.week)}::uuid) where id=${quote(context.season)}::uuid;
    update private.sports_events set state='LIVE',actual_started_at=scheduled_start_at where week_id=${quote(context.week)}::uuid;
    do $results$ declare e record;begin for e in select id from private.sports_events where week_id=${quote(context.week)}::uuid order by id loop
      perform private.record_stage1_result_as(${quote(context.owner)}::uuid,e.id,'FINAL',24,21,'Native result queue final fixture.','SIMULATION_FIXTURE','native-result-'||e.id::text);
    end loop;end;$results$;
    -- External workers deliberately never discover Simulation. Seed only their
    -- queue after authentic acceptance + the authoritative final-result path;
    -- this fixture verifies native queue/lease/rate mechanics, not live delivery.
    insert into private.player_result_event_mappings(external_event_id,api_sports_event_id,nflverse_event_id,game_date,away_team,home_team,verified_at,evidence_hash)
      select fixture_event_key,'native-'||id::text,'2026_native_'||id::text,(scheduled_start_at at time zone 'America/New_York')::date,away_team,home_team,clock_timestamp(),repeat('a',64) from private.sports_events where week_id=${quote(context.week)}::uuid;
    insert into private.player_result_jobs(external_event_id,final_observed_at,next_attempt_at)
      select fixture_event_key,clock_timestamp(),clock_timestamp() from private.sports_events where week_id=${quote(context.week)}::uuid;
    update private.player_result_policy set processing_enabled=true,api_sports_contract_validated=true,provider_remaining=100,provider_window_date=(clock_timestamp() at time zone 'UTC')::date,requests_per_minute=8,blocked_until=null;
    commit;`),
    "Seed sixteen accepted, final, unresolved shared result jobs",
  );
  const release = await hold("player_result_policy", null);
  const names = [`${prefix}-claim-a`, `${prefix}-claim-b`];
  const pending = names.map((name) =>
    sql("select api.claim_player_result_jobs();", name),
  );
  await waitForBoth(names);
  await release();
  const claims = (await Promise.all(pending)).map((value) =>
    json(successful(value, "Concurrent native player job claim")),
  );
  const leases = claims.flatMap((value) => value.jobs);
  assert.equal(leases.length, 8);
  assert.equal(
    new Set(leases.map((job) => job.context.externalEventId)).size,
    8,
  );
  assert.equal(new Set(leases.map((job) => job.leaseId)).size, 8);
  assert.ok(claims.some((value) => value.status === "BUDGET"));
  console.log(
    "PASS: two native scheduler sessions claim sixteen finishes once, bounded to eight requests per minute.",
  );
  const before = json(
    successful(
      await sql(
        `select jsonb_build_object('count',count(*),'attempts',sum(attempts)) from private.player_result_jobs where external_event_id in(select fixture_event_key from private.sports_events where week_id=${quote(context.week)}::uuid);`,
      ),
      "Inspect shared queue",
    ),
  );
  assert.deepEqual(before, { count: 16, attempts: 8 });
  const lease = leases[0].leaseId;
  const completion = await Promise.all([
    sql(
      `select api.complete_player_result_request(${quote(lease)}::uuid,null,null,null,null);`,
    ),
    sql(
      `select api.complete_player_result_request(${quote(lease)}::uuid,null,null,null,null);`,
    ),
  ]);
  const completed = completion.map((value) =>
    json(successful(value, "Concurrent same-lease completion")),
  );
  assert.equal(
    completed.filter((value) => value.status === "REPLAYED").length,
    1,
  );
  const state = json(
    successful(
      await sql(
        `select jsonb_build_object('attempts',j.attempts,'state',j.state,'charged',count(r.id)) from private.player_result_jobs j join private.player_result_requests r on r.external_event_id=j.external_event_id where j.external_event_id=${quote(leases[0].context.externalEventId)} group by j.attempts,j.state;`,
      ),
      "Inspect failed request accounting",
    ),
  );
  assert.deepEqual(state, { attempts: 1, state: "WAITING", charged: 1 });
  console.log(
    "PASS: duplicate completion is idempotent and unknown failures retain one charged attempt.",
  );
  successful(
    await sql(
      `update private.player_result_requests set reserved_at=clock_timestamp()-interval '2 minutes' where external_event_id in(select fixture_event_key from private.sports_events where week_id=${quote(context.week)}::uuid);`,
    ),
    "Move fixture request minute boundary",
  );
  const second = json(
    successful(
      await sql("select api.claim_player_result_jobs();"),
      "Claim second eight-game group",
    ),
  );
  assert.equal(second.jobs.length, 8);
  assert.equal(
    new Set(
      [...leases, ...second.jobs].map((job) => job.context.externalEventId),
    ).size,
    16,
  );
  console.log(
    "PASS: subsequent cadence services all sixteen distinct games without duplicate in-flight jobs.",
  );
} finally {
  successful(
    await sql(`update private.player_prop_controls set offers_enabled=${original.offers};
    update private.player_result_policy p set processing_enabled=x.processing_enabled,api_sports_contract_validated=x.api_sports_contract_validated,nflverse_contract_validated=x.nflverse_contract_validated,provider_remaining=x.provider_remaining,provider_window_date=x.provider_window_date,requests_per_minute=x.requests_per_minute,blocked_until=x.blocked_until from jsonb_populate_record(null::private.player_result_policy,${quote(JSON.stringify(original.policy))}::jsonb) x where p.singleton;`),
    "Restore disposable result policy",
  );
}
console.log(
  "Native player result queue verified: 16-game bounded claims, duplicate lease completion, and conservative failures.",
);
