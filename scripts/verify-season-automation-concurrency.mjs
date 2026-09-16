import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { quoteSql as quote } from "../tests/fixtures/player-props-acceptance.mjs";

const databaseUrl = process.env.TEST_SUPABASE_DB_URL;
if (
  !databaseUrl ||
  !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname)
)
  throw new Error(
    "Season automation races require a fresh disposable native loopback PostgreSQL database.",
  );

const prefix = `automation-native-${randomUUID().slice(0, 8)}`;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function marked(source, name) {
  const content = source
    .split(`-- BEGIN ${name}`)[1]
    ?.split(`-- END ${name}`)[0];
  assert.ok(content, `Expected reusable ${name} fixture helpers.`);
  return content;
}
const fixtureHelpers = [
  await readFile(
    new URL("../tests/fixtures/card-reset-acceptance.sql", import.meta.url),
    "utf8",
  ),
  marked(
    await readFile(
      new URL(
        "../supabase/tests/open_week2_props_after_reset.test.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    "AFTER RESET CUTOVER HELPERS",
  ),
  marked(
    await readFile(
      new URL(
        "../supabase/tests/progressive_player_props.test.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    "PROGRESSIVE PLAYER PROPS HELPERS",
  ),
  await readFile(
    new URL(
      "../supabase/tests/fixtures/season_automation.sql.inc",
      import.meta.url,
    ),
    "utf8",
  ),
  await readFile(
    new URL(
      "../supabase/tests/fixtures/postseason_close_matrix_week.sql.inc",
      import.meta.url,
    ),
    "utf8",
  ),
  await readFile(
    new URL(
      "../supabase/tests/fixtures/automation_postseason.sql.inc",
      import.meta.url,
    ),
    "utf8",
  ),
].join("\n");

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
const literal = (value) => `${quote(JSON.stringify(value))}::jsonb`;
const member = (f, statement) => `BEGIN;
  SELECT set_config('request.jwt.claims',${literal({ sub: f.owner, role: "authenticated" })}::text,true);
  SET LOCAL ROLE authenticated; ${statement}; COMMIT;`;

async function holdSeason(f) {
  const holder = session(`${prefix}-holder`);
  holder.child.stdin.write(`BEGIN; SET LOCAL statement_timeout='20s';
    SELECT id FROM private.seasons WHERE id=${quote(f.season)}::uuid FOR UPDATE;
    SELECT 'PROGRESSIVE_SEASON_LOCK_HELD';\n`);
  for (let attempt = 0; attempt < 60; attempt++) {
    if (holder.output().includes("PROGRESSIVE_SEASON_LOCK_HELD"))
      return {
        child: holder.child,
        output: holder.output,
        release: async () => {
          holder.child.stdin.end("COMMIT;\n");
          successful(await holder.done, "Release native season lock");
        },
      };
    await pause(50);
  }
  holder.child.kill("SIGTERM");
  throw new Error("Fixture season lock was not acquired.");
}
async function waitBlocked(names) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const observed = successful(
      await sql(`SELECT count(*) FROM pg_stat_activity
        WHERE application_name IN (${names.map(quote).join(",")})
          AND wait_event_type='Lock';`),
      "Observe independent transaction lock waits",
    );
    if (Number(observed.stdout.trim()) === names.length) return;
    await pause(50);
  }
  throw new Error(
    "Competing native transactions did not reach their lock boundary.",
  );
}
async function race(f, first, second, label) {
  const holder = await holdSeason(f);
  const names = [`${prefix}-${label}-first`, `${prefix}-${label}-second`];
  const pending = [];
  try {
    pending.push(sql(first, names[0]));
    await waitBlocked([names[0]]);
    pending.push(sql(second, names[1]));
    await waitBlocked(names);
  } finally {
    await holder.release();
  }
  return Promise.all(pending);
}

async function fixture(label) {
  return json(
    successful(
      await sql(`BEGIN; ${fixtureHelpers}
    CREATE TEMP TABLE fixture AS SELECT pg_temp.automation_context(${quote(`${prefix}-${label}`)}) c;
    CREATE TEMP TABLE staged AS SELECT pg_temp.automation_stage(c,3,true) wk FROM fixture;
    SELECT api.complete_season_automation(pg_temp.automation_run(c,'VALIDATE',3)) FROM fixture;
    SELECT c||jsonb_build_object('week',(SELECT wk FROM staged),'run',pg_temp.automation_run(c,'OPEN',3)) FROM fixture;
    COMMIT;`),
      "Prepare standing-consent fixture with exact SYSTEM validation",
    ),
  );
}
const complete = (f) =>
  `BEGIN; SET LOCAL ROLE service_role; SELECT api.complete_season_automation(${quote(f.run)}::uuid); COMMIT;`;
const manual = (f) =>
  member(
    f,
    `SELECT api.open_reviewed_player_prop_week(${quote(f.slug)},'native-manual-open')`,
  );
async function state(f) {
  return json(
    successful(
      await sql(`SELECT jsonb_build_object(
    'state',(SELECT state FROM private.season_weeks WHERE id=${quote(f.week)}::uuid),
    'cards',(SELECT count(*) FROM private.weekly_cards WHERE week_id=${quote(f.week)}::uuid),
    'credits',(SELECT coalesce(sum(granted_credits),0) FROM private.weekly_cards WHERE week_id=${quote(f.week)}::uuid),
    'activations',(SELECT count(*) FROM private.player_prop_progressive_activations WHERE week_id=${quote(f.week)}::uuid),
    'humans',(SELECT count(*) FROM private.player_prop_progressive_reviews WHERE week_id=${quote(f.week)}::uuid),
    'validations',(SELECT count(*) FROM private.player_prop_system_validations WHERE week_id=${quote(f.week)}::uuid));`),
      "Inspect opening and exact credit allocation",
    ),
  );
}
for (const scheduledFirst of [true, false]) {
  const f = await fixture(`open-${scheduledFirst}`);
  const results = await race(
    f,
    scheduledFirst ? complete(f) : manual(f),
    scheduledFirst ? manual(f) : complete(f),
    `open-${scheduledFirst}`,
  );
  successful(results[0], "First guarded opening");
  if (scheduledFirst)
    assert.notEqual(
      results[1].code,
      0,
      "Later manual attempt cannot reopen the week",
    );
  else
    assert.equal(
      json(successful(results[1], "Scheduled loser records containment"))
        .status,
      "FAILED",
    );
  assert.deepEqual(await state(f), {
    state: "OPEN",
    cards: 4,
    credits: 4000,
    activations: 1,
    humans: 0,
    validations: 1,
  });
  if (scheduledFirst)
    assert.equal(
      json(
        successful(await sql(complete(f)), "Replay committed worker response"),
      ).replayed,
      true,
    );
}
for (const command of ["PAUSE", "REVOKE"]) {
  const f = await fixture(command.toLowerCase());
  const results = await race(
    f,
    member(
      f,
      `SELECT api.configure_season_automation(${quote(f.slug)},'${command}')`,
    ),
    complete(f),
    command.toLowerCase(),
  );
  successful(results[0], "Current commissioner fences claimed work");
  assert.notEqual(
    results[1].code,
    0,
    "Claim predating control change cannot commit",
  );
  assert.deepEqual(await state(f), {
    state: "PLANNED",
    cards: 0,
    credits: 0,
    activations: 0,
    humans: 0,
    validations: 1,
  });
}
{
  const f = await fixture("evidence-race");
  const results = await race(
    f,
    `BEGIN; SELECT id FROM private.seasons WHERE id=${quote(f.season)}::uuid FOR UPDATE;
    UPDATE private.week_player_menu SET unavailable_reason='Changed unoffered source' WHERE week_id=${quote(f.week)}::uuid AND subject_id IS NULL; COMMIT;`,
    complete(f),
    "evidence",
  );
  successful(results[0], "Commit changed unoffered proposal");
  assert.equal(
    json(successful(results[1], "Stale content validation fails atomically"))
      .status,
    "FAILED",
  );
  assert.equal((await state(f)).cards, 0);
  successful(
    await sql(`BEGIN; ${fixtureHelpers}
    SELECT api.complete_season_automation(pg_temp.automation_run(${literal(f)},'VALIDATE',3));
    SELECT api.complete_season_automation(pg_temp.automation_run(${literal(f)},'OPEN',3)); COMMIT;`),
    "Automatic evidence revalidation recovers without human review",
  );
  assert.equal((await state(f)).cards, 4);
}
{
  const f = await fixture("crash");
  successful(
    await sql(
      `BEGIN; SET LOCAL ROLE service_role; SELECT api.complete_season_automation(${quote(f.run)}::uuid); ROLLBACK;`,
    ),
    "Crash before commit rolls back publication and credits",
  );
  assert.equal((await state(f)).cards, 0);
  assert.equal(
    json(successful(await sql(complete(f)), "Retry rolled-back completion"))
      .status,
    "OPENED",
  );
  assert.equal((await state(f)).credits, 4000);
}
{
  const f = await fixture("transfer");
  for (const subject of [f.member, randomUUID()]) {
    const unauthorized = await sql(
      member(
        { ...f, owner: subject },
        `SELECT api.configure_season_automation(${quote(f.slug)},'PAUSE')`,
      ),
    );
    assert.notEqual(
      unauthorized.code,
      0,
      "Members and outsiders cannot change standing authorization",
    );
  }
  successful(
    await sql(
      member(
        f,
        `SELECT api.transfer_league_commissioner(${quote(f.slug)},${quote(f.member)}::uuid)`,
      ),
    ),
    "Transfer commissioner through its public authority",
  );
  const stale = await sql(
    member(
      f,
      `SELECT api.configure_season_automation(${quote(f.slug)},'PAUSE')`,
    ),
  );
  assert.notEqual(
    stale.code,
    0,
    "Former commissioner loses automation control",
  );
  successful(
    await sql(
      member(
        { ...f, owner: f.member },
        `SELECT api.configure_season_automation(${quote(f.slug)},'PAUSE')`,
      ),
    ),
    "New commissioner controls the existing scoped policy",
  );
}
// A protected Week 18 is already open/final. Race real objective Week 17
// correction with automatic archive publication in both lock arrival orders.
for (const [size, correctionFirst] of [
  [4, true],
  [10, false],
]) {
  const f = json(
    successful(
      await sql(`BEGIN; ${fixtureHelpers}
    CREATE TEMP TABLE post_fixture AS SELECT pg_temp.automation_postseason_fixture(${size},true) c;
    INSERT INTO private.event_result_versions(event_id,week_id,league_id,version,status,away_score,home_score,source,reason,recorded_by,input_hash)
    SELECT e.id,e.week_id,e.league_id,1,'FINAL',14,21,'MANUAL_OBJECTIVE','Immutable postseason result fixture',(c->>'owner')::uuid,
    encode(extensions.digest(e.id::text||':fixture-final','sha256'),'hex') FROM post_fixture f JOIN private.sports_events e ON e.week_id=(c->>'week')::uuid;
    UPDATE private.sports_events SET state='FINAL' WHERE week_id=(SELECT (c->>'week')::uuid FROM post_fixture);
    SELECT pg_temp.phase8_close_matrix_week((c->>'season')::uuid,18) FROM post_fixture;
    SELECT c||jsonb_build_object('run',pg_temp.automation_run(c,'ARCHIVE',18)) FROM post_fixture; COMMIT;`),
      "Prepare automatic postseason with protected Week 18",
    ),
  );
  const correction = member(
    f,
    `SELECT api.correct_finalized_week17_result(${quote(f.event17)}::uuid,'FINAL',17,24,'Verified objective score correction for the native race','native-week17-correction')`,
  );
  const results = await race(
    f,
    correctionFirst ? correction : complete(f),
    correctionFirst ? complete(f) : correction,
    `archive-${size}`,
  );
  results.forEach((result) =>
    successful(
      result,
      "Serialized archive/correction retains canonical lineage",
    ),
  );
  const proof = json(
    successful(
      await sql(`SELECT jsonb_build_object(
    'lifecycle',(SELECT lifecycle FROM private.seasons WHERE id=${quote(f.season)}::uuid),
    'rounds',(SELECT count(*) FROM private.playoff_round_publications WHERE week_id=${quote(f.week)}::uuid),
    'cards',(SELECT count(*) FROM private.weekly_cards WHERE week_id=${quote(f.week)}::uuid),
    'terminalArchives',(SELECT count(*) FROM private.season_archive_versions a WHERE season_id=${quote(f.season)}::uuid AND NOT EXISTS(SELECT 1 FROM private.season_archive_versions child WHERE child.supersedes_id=a.id)),
    'corrections',(SELECT count(*) FROM private.corrections WHERE event_id=${quote(f.event17)}::uuid),
    'finalResultVersion',(SELECT max(version) FROM private.event_result_versions WHERE event_id=${quote(f.event17)}::uuid));`),
      "Inspect protected correction lineage",
    ),
  );
  assert.deepEqual(proof, {
    lifecycle: "FINAL",
    rounds: 1,
    cards: size,
    terminalArchives: 1,
    corrections: 1,
    finalResultVersion: 2,
  });
}
console.log(
  "PASS: season automation native races, exact credits, pause/revocation, content revalidation, crash/replay and commissioner transfer",
);
