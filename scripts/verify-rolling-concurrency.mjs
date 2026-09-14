import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

// This gate requires separate native PostgreSQL sessions. Embedded/single-session
// tests cannot establish lock ordering or concurrent idempotency guarantees.
const databaseUrl = process.env.TEST_SUPABASE_DB_URL;
if (
  !databaseUrl ||
  !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname)
) {
  throw new Error(
    "Rolling concurrency verification requires the disposable loopback database.",
  );
}
const prefix = `rolling-concurrency-${randomUUID().slice(0, 8)}`;
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

async function holdRow(table, id) {
  const current = session(`${prefix}-holder`);
  current.child.stdin.write(`BEGIN; SET LOCAL statement_timeout='12s';
    SELECT id FROM private.${table} WHERE id=${quote(id)}::uuid FOR UPDATE;
    SELECT 'ROLLING_LOCK_HELD';\n`);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (current.output().includes("ROLLING_LOCK_HELD")) {
      return {
        release: async (beforeCommit = "") => {
          current.child.stdin.end(`${beforeCommit}\nCOMMIT;\n`);
          successful(await current.done, "Release held database row");
        },
      };
    }
    await delay(50);
  }
  current.child.kill("SIGTERM");
  throw new Error("Timed out acquiring the concurrency fixture lock.");
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

// Fixtures use the shared public acceptance path: three owner rehearsals and
// one ordinary Simulation with separated Sunday/Monday windows for settlement.
// Catalog activation is restored before COMMIT; only these isolated weeks bind
// V1.3. No provider, email, production URL or caller odds is used.
const fixtures = jsonResult(
  successful(
    await sql(`BEGIN;
  CREATE TEMP TABLE previous_catalog AS SELECT * FROM private.authoritative_season_rulesets;
  UPDATE private.authoritative_season_rulesets active SET ruleset_version='1.3',product_bible_version='3.2',
    canonical_json=prepared.canonical_json,sha256_hash=prepared.sha256_hash
    FROM private.prepared_rolling_rulesets prepared WHERE prepared.mode=active.mode;
  CREATE TEMP TABLE concurrency_context(scenario text,owner_id uuid,slug text,season_id uuid,week_id uuid,card_id uuid);
  DO $fixture$
  DECLARE scenario text; owner_id uuid;
  BEGIN
    FOREACH scenario IN ARRAY ARRAY['budget','retry','cutoff'] LOOP
      owner_id:=gen_random_uuid();
      INSERT INTO auth.users(id,email) VALUES(owner_id,owner_id::text||'@rolling-concurrency.test');
      INSERT INTO private.profiles(id,display_name) VALUES(owner_id,'Concurrency '||scenario);
      INSERT INTO private.owner_rehearsal_entitlements(user_id,note) VALUES(owner_id,'Disposable native concurrency acceptance');
      PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
      PERFORM api.start_owner_rehearsal('native-start-'||scenario);
      PERFORM api.fill_owner_rehearsal_bots('native-fill-'||scenario);
      PERFORM api.advance_owner_rehearsal('FORMATION_READY','native-open-'||scenario);
      INSERT INTO concurrency_context
        SELECT scenario,owner_id,league.slug,rehearsal.season_id,week.id,card.id
        FROM private.owner_rehearsals rehearsal JOIN private.leagues league ON league.id=rehearsal.league_id
        JOIN private.season_weeks week ON week.season_id=rehearsal.season_id AND week.nfl_week=1
        JOIN private.weekly_cards card ON card.week_id=week.id AND card.owner_user_id=owner_id
        WHERE rehearsal.owner_user_id=owner_id AND rehearsal.status='ACTIVE';
    END LOOP;
  END;
  $fixture$;
  CREATE TEMP TABLE native_fixture_namespace AS SELECT gen_random_uuid()::text AS namespace;
create function pg_temp.native_id(n integer) returns uuid language sql stable as $$
  select md5((select namespace from native_fixture_namespace)||':'||n::text)::uuid;
$$;
create function pg_temp.native_actor(n integer) returns void language sql volatile as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.native_id(n),'role','authenticated')::text,true)::text::void;
$$;
-- Real ordinary Simulation receipts, with deliberately separated Sunday/Monday
-- windows, independent of the owner guide's accelerated all-Sunday fixture pack.
insert into auth.users(id,email) select pg_temp.native_id(n),pg_temp.native_id(n)::text||'@rolling-concurrency.test' from generate_series(1,4) n;
insert into private.profiles(id,display_name) select pg_temp.native_id(n),'Rolling member '||n from generate_series(1,4) n on conflict(id) do update set display_name=excluded.display_name;
insert into private.leagues(id,name,slug,created_by) values(pg_temp.native_id(10),'Rolling lifecycle','rolling-native-'||pg_temp.native_id(10)::text,pg_temp.native_id(1));
insert into private.league_memberships(league_id,user_id,role)
  select pg_temp.native_id(10),pg_temp.native_id(n),case when n=1 then 'COMMISSIONER' else 'MEMBER' end from generate_series(1,4) n;
insert into private.season_ruleset_snapshots(id,ruleset_id,ruleset_version,product_bible_id,product_bible_version,mode,canonical_json,sha256_hash,frozen_at)
  select pg_temp.native_id(20),ruleset_id,ruleset_version,product_bible_id,product_bible_version,mode,canonical_json,sha256_hash,'2026-09-12 12:00Z'
  from private.authoritative_season_rulesets where mode='SIMULATION';
insert into private.seasons(id,league_id,ruleset_snapshot_id,mode,nfl_year,lifecycle,roster_seed,schedule_seed,roster_locked_at,simulated_now)
 values(pg_temp.native_id(30),pg_temp.native_id(10),pg_temp.native_id(20),'SIMULATION',2026,'REGULAR',repeat('a',64),repeat('b',64),'2026-09-12 12:00Z','2026-09-13 16:00Z');
insert into private.season_entries(id,season_id,league_id,user_id,standing_tiebreak)
 select pg_temp.native_id(40+n),pg_temp.native_id(30),pg_temp.native_id(10),pg_temp.native_id(n),lpad(n::text,64,'0') from generate_series(1,4) n;
insert into private.season_weeks(id,season_id,league_id,nfl_week,state,opens_at,common_lock_at)
 values(pg_temp.native_id(50),pg_temp.native_id(30),pg_temp.native_id(10),1,'OPEN','2026-09-13 16:00Z','2026-09-13 16:55Z');
insert into private.schedule_publications(id,season_id,league_id,version,algorithm_version,seed,ordered_entry_ids,output_hash,created_by)
 values(pg_temp.native_id(60),pg_temp.native_id(30),pg_temp.native_id(10),1,'rolling-test','rolling',array[pg_temp.native_id(41),pg_temp.native_id(42),pg_temp.native_id(43),pg_temp.native_id(44)],repeat('c',64),pg_temp.native_id(1));
insert into private.matchups(id,week_id,season_id,league_id,schedule_publication_id,side_a_entry_id,side_b_entry_id,display_order)
 select pg_temp.native_id(70+n),pg_temp.native_id(50),pg_temp.native_id(30),pg_temp.native_id(10),pg_temp.native_id(60),pg_temp.native_id(39+n*2),pg_temp.native_id(40+n*2),n from generate_series(1,2) n;
insert into private.weekly_cards(id,week_id,season_id,league_id,entry_id,owner_user_id,granted_at)
 select pg_temp.native_id(80+n),pg_temp.native_id(50),pg_temp.native_id(30),pg_temp.native_id(10),pg_temp.native_id(40+n),pg_temp.native_id(n),'2026-09-13 16:00Z' from generate_series(1,4) n;
insert into private.sports_events(id,week_id,season_id,league_id,fixture_event_key,away_team,home_team,scheduled_start_at)
 select pg_temp.native_id(90+n),pg_temp.native_id(50),pg_temp.native_id(30),pg_temp.native_id(10),'rolling-event-'||n,'Away '||n,'Home '||n,
   case n when 1 then '2026-09-13 17:00Z'::timestamptz when 2 then '2026-09-13 20:00Z'::timestamptz else '2026-09-15 00:20Z'::timestamptz end from generate_series(1,3) n;
insert into private.slates(id,week_id,season_id,league_id,version,fixture_id,common_lock_at)
 values(pg_temp.native_id(100),pg_temp.native_id(50),pg_temp.native_id(30),pg_temp.native_id(10),1,'rolling-native-'||pg_temp.native_id(10)::text,'2026-09-13 16:55Z');

-- Fixture adapter creates immutable fresh observation rows, just like the source
-- adapter. Every submission still passes the real membership/acceptance engine.
create function pg_temp.native_offer(event_number integer, p_outcome text default 'HOME') returns jsonb language plpgsql as $$
declare snapshot_id uuid:=gen_random_uuid(); h text:=encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex'); t timestamptz;
begin
 t:=private.card_confirmation_time(pg_temp.native_id(30));
 insert into private.market_snapshots(id,event_id,week_id,league_id,book_key,market_type,outcome_key,proposition,american_odds,quality_status,observed_at,payload_hash)
 values(snapshot_id,pg_temp.native_id(90+event_number),pg_temp.native_id(50),pg_temp.native_id(10),'draftkings','MONEYLINE',p_outcome,'Fixture result',100,'HEALTHY',t,h);
 insert into private.slate_items(slate_id,event_id,market_snapshot_id,week_id,league_id)
 values(pg_temp.native_id(100),pg_temp.native_id(90+event_number),snapshot_id,pg_temp.native_id(50),pg_temp.native_id(10));
 insert into private.live_quote_heads(event_id,week_id,league_id,market_type,outcome_key,market_snapshot_id)
 values(pg_temp.native_id(90+event_number),pg_temp.native_id(50),pg_temp.native_id(10),'MONEYLINE',p_outcome,snapshot_id)
 on conflict(event_id,market_type,outcome_key) do update set market_snapshot_id=excluded.market_snapshot_id;
 return jsonb_build_object('marketSnapshotId',snapshot_id,'payloadHash',h);
end; $$;
select pg_temp.native_offer(1),pg_temp.native_offer(2),pg_temp.native_offer(3);
INSERT INTO concurrency_context
SELECT 'settlement',pg_temp.native_id(1),league.slug,pg_temp.native_id(30),pg_temp.native_id(50),pg_temp.native_id(81)
FROM private.leagues league WHERE id=pg_temp.native_id(10);
  UPDATE private.authoritative_season_rulesets active SET ruleset_version=previous.ruleset_version,
    product_bible_version=previous.product_bible_version,canonical_json=previous.canonical_json,sha256_hash=previous.sha256_hash
    FROM previous_catalog previous WHERE previous.mode=active.mode;
  SELECT jsonb_object_agg(context.scenario,to_jsonb(context)||jsonb_build_object('markets',(
    SELECT jsonb_agg(jsonb_build_object('marketSnapshotId',snapshot.id,'payloadHash',snapshot.payload_hash,
      'eventId',event.id,'eventKey',event.fixture_event_key,'startsAt',event.scheduled_start_at)
      ORDER BY event.scheduled_start_at,event.fixture_event_key,snapshot.market_type)
    FROM private.live_quote_heads head JOIN private.market_snapshots snapshot ON snapshot.id=head.market_snapshot_id
    JOIN private.sports_events event ON event.id=snapshot.event_id
    WHERE head.week_id=context.week_id AND head.outcome_key IN ('HOME','OVER')
  ))) FROM concurrency_context context;
  COMMIT;`),
    "Prepare native concurrency fixtures",
  ),
);

const batch = (market, stake) => [
  {
    marketSnapshotId: market.marketSnapshotId,
    payloadHash: market.payloadHash,
    stakeCredits: stake,
  },
];
const accept = (fixture, positions, key) =>
  memberSql(
    fixture.owner_id,
    `SELECT api.accept_stage1_card(${quote(fixture.slug)},${quote(JSON.stringify(positions))}::jsonb,${quote(key)})`,
  );
const cardTotals = async (fixture) =>
  jsonResult(
    successful(
      await sql(`SELECT jsonb_build_object(
  'count',count(*),'credits',coalesce(sum(stake_credits),0)) FROM private.position_receipts WHERE card_id=${quote(fixture.card_id)}::uuid;`),
      "Inspect original accepted allocation",
    ),
  );

{
  const fixture = fixtures.budget;
  const holder = await holdRow("seasons", fixture.season_id);
  const names = [`${prefix}-budget-a`, `${prefix}-budget-b`];
  const pending = [
    sql(
      accept(fixture, batch(fixture.markets[0], 600), "native-budget-a"),
      names[0],
    ),
    sql(
      accept(fixture, batch(fixture.markets[1], 600), "native-budget-b"),
      names[1],
    ),
  ];
  await waitForBothBlocked(names);
  await holder.release();
  const results = await Promise.all(pending);
  assert.equal(
    results.filter((result) => result.code === 0).length,
    1,
    "Exactly one competing 600-credit batch must succeed.",
  );
  assert.match(
    results.find((result) => result.code !== 0).stderr,
    /remaining weekly credits/,
  );
  assert.deepEqual(await cardTotals(fixture), { count: 1, credits: 600 });
  console.log("PASS: competing batches serialize the cumulative budget.");
}

{
  const fixture = fixtures.retry;
  const positions = batch(fixture.markets[0], 400);
  const holder = await holdRow("seasons", fixture.season_id);
  const names = [`${prefix}-retry-a`, `${prefix}-retry-b`];
  const pending = names.map((name) =>
    sql(accept(fixture, positions, "native-same-request"), name),
  );
  await waitForBothBlocked(names);
  await holder.release();
  const results = (await Promise.all(pending)).map((result) =>
    jsonResult(successful(result, "Concurrent exact retry")),
  );
  assert.equal(results.filter((result) => result.replayed).length, 1);
  assert.deepEqual(results[0].receipts, results[1].receipts);
  assert.deepEqual(await cardTotals(fixture), { count: 1, credits: 400 });
  const changed = await sql(
    accept(fixture, batch(fixture.markets[0], 450), "native-same-request"),
  );
  assert.notEqual(changed.code, 0);
  assert.match(changed.stderr, /Idempotency key was reused/);
  console.log(
    "PASS: concurrent exact retries return one immutable batch; conflicting content is rejected.",
  );
}

{
  const fixture = fixtures.cutoff;
  const firstEvent = fixture.markets[0];
  assert.equal(
    fixture.markets[1].eventId,
    firstEvent.eventId,
    "Both waiting requests must target markets on the first event.",
  );
  assert.ok(
    fixture.markets.some(
      (market) => new Date(market.startsAt) > new Date(firstEvent.startsAt),
    ),
    "The cutoff fixture must retain a later betting window.",
  );
  const holder = await holdRow("seasons", fixture.season_id);
  const names = [`${prefix}-cutoff-a`, `${prefix}-cutoff-b`];
  const pending = [
    sql(
      accept(fixture, batch(fixture.markets[0], 100), "native-cutoff-a"),
      names[0],
    ),
    sql(
      accept(fixture, batch(fixture.markets[1], 100), "native-cutoff-b"),
      names[1],
    ),
  ];
  await waitForBothBlocked(names);
  await holder.release(`UPDATE private.seasons SET simulated_now=${quote(firstEvent.startsAt)}::timestamptz
    WHERE id=${quote(fixture.season_id)}::uuid;`);
  const results = await Promise.all(pending);
  assert.ok(
    results.every(
      (result) =>
        result.code !== 0 &&
        /This game is closed for new bets\./.test(result.stderr),
    ),
    "Requests waiting across the first event cutoff must reject after acquiring the authoritative lock.",
  );
  assert.deepEqual(await cardTotals(fixture), { count: 0, credits: 0 });
  const laterEntry = jsonResult(
    successful(
      await sql(`SELECT jsonb_build_object(
        'weekEntryOpen',private.card_confirmation_time(${quote(fixture.season_id)}::uuid)
          <private.week_entry_closes_at(${quote(fixture.week_id)}::uuid),
        'laterGameOpen',EXISTS(SELECT 1 FROM private.sports_events event
          WHERE event.week_id=${quote(fixture.week_id)}::uuid
            AND event.id<>${quote(firstEvent.eventId)}::uuid
            AND private.event_accepts_entries(event.id)));`),
      "Verify the event cutoff did not close later betting windows",
    ),
  );
  assert.deepEqual(laterEntry, { weekEntryOpen: true, laterGameOpen: true });
  console.log(
    "PASS: waiting requests recheck the first event cutoff while later games remain open.",
  );
}

{
  const fixture = fixtures.settlement;
  successful(
    await sql(
      accept(fixture, batch(fixture.markets[0], 300), "native-early-bet"),
    ),
    "Accept early fixture bet",
  );
  const early = fixture.markets[0];
  const result = {
    status: "FINAL",
    awayScore: 10,
    homeScore: 20,
    reason: "Fixture home team wins.",
  };
  successful(
    await sql(
      `UPDATE private.seasons SET simulated_now='2026-09-13 19:00Z'::timestamptz WHERE id=${quote(fixture.season_id)}::uuid;`,
    ),
    "Move isolated fixture clock",
  );
  successful(
    await sql(
      memberSql(
        fixture.owner_id,
        `SELECT api.set_stage1_event_live(${quote(early.eventId)}::uuid,
          ${quote(early.startsAt)}::timestamptz,'native-first-live')`,
      ),
    ),
    "Record authoritative kickoff before settlement",
  );
  successful(
    await sql(
      memberSql(
        fixture.owner_id,
        `SELECT api.prepare_simulation_card_quotes(${quote(fixture.slug)})`,
      ),
    ),
    "Refresh remaining fixture quotes",
  );
  const later = jsonResult(
    successful(
      await sql(`SELECT jsonb_build_object('marketSnapshotId',snapshot.id,'payloadHash',snapshot.payload_hash)
    FROM private.live_quote_heads head JOIN private.market_snapshots snapshot ON snapshot.id=head.market_snapshot_id
    JOIN private.sports_events event ON event.id=snapshot.event_id WHERE head.week_id=${quote(fixture.week_id)}::uuid
      AND head.market_type='MONEYLINE' AND head.outcome_key='HOME' AND private.event_accepts_entries(event.id)
    ORDER BY event.scheduled_start_at DESC LIMIT 1;`),
      "Select still-open later game",
    ),
  );
  const holder = await holdRow("season_weeks", fixture.week_id);
  const names = [`${prefix}-settle`, `${prefix}-accept`];
  const pending = [
    sql(
      memberSql(
        fixture.owner_id,
        `SELECT api.record_stage1_result(${quote(early.eventId)}::uuid,
      ${quote(result.status)},${result.awayScore ?? "NULL"},${result.homeScore ?? "NULL"},${quote(result.reason)},
      'SIMULATION_FIXTURE','native-settle-early')`,
      ),
      names[0],
    ),
    sql(accept(fixture, batch(later, 100), "native-later-bet"), names[1]),
  ];
  await waitForBothBlocked(names);
  await holder.release();
  for (const response of await Promise.all(pending))
    successful(response, "Concurrent settlement and later acceptance");
  assert.deepEqual(await cardTotals(fixture), { count: 2, credits: 400 });
  const state = jsonResult(
    successful(
      await sql(`SELECT jsonb_build_object('state',week.state,
    'settlements',(SELECT count(*) FROM private.settlement_versions settled JOIN private.position_receipts receipt
      ON receipt.id=settled.receipt_id WHERE receipt.card_id=${quote(fixture.card_id)}::uuid))
    FROM private.season_weeks week WHERE week.id=${quote(fixture.week_id)}::uuid;`),
      "Inspect concurrent lifecycle outcome",
    ),
  );
  assert.equal(state.settlements, 1);
  assert.notEqual(state.state, "FINAL");
  console.log(
    "PASS: early settlement and later acceptance complete without deadlock or premature finalization.",
  );
}

console.log(
  "Native rolling concurrency verification passed (4 scenarios, separate PostgreSQL connections).",
);
