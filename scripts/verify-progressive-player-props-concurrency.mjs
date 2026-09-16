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
    "Progressive publication races require a fresh disposable native loopback PostgreSQL database.",
  );

const prefix = `progressive-native-${randomUUID().slice(0, 8)}`;
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

const publicationCall = (f) => `SELECT api.record_player_catalog_nominations(
  ${quote(f.leaseId)}::uuid,${literal(f.proposals)});`;
const publish = (f) =>
  `BEGIN; SET LOCAL ROLE service_role; ${publicationCall(f)} COMMIT;`;
const slotWhere = (f, kind = "pending") =>
  `event_id=${quote(f[`${kind}Event`])}::uuid AND team=${quote(f[`${kind}Team`])} AND slot=${quote(f[`${kind}Slot`])}`;
async function state(f) {
  return json(
    successful(
      await sql(`SELECT jsonb_build_object(
        'rulesetVersion',(SELECT r.ruleset_version FROM private.season_weeks w JOIN private.season_ruleset_snapshots r ON r.id=w.ruleset_snapshot_id WHERE w.id=${quote(f.week)}::uuid),
        'cutoverCount',(SELECT count(*) FROM private.week2_props_cutovers WHERE week_id=${quote(f.week)}::uuid),
        'emptySlotReview',(SELECT review_id FROM private.player_prop_empty_slots WHERE ${slotWhere(f)}),
        'publicationCount',(SELECT count(*) FROM private.player_prop_slot_publications WHERE ${slotWhere(f)}),
        'publication',(SELECT to_jsonb(a) FROM private.player_prop_slot_publications a WHERE ${slotWhere(f)}),
        'pendingMenu',(SELECT to_jsonb(m) FROM private.week_player_menu m WHERE ${slotWhere(f)}),
        'frozenMenu',(SELECT to_jsonb(m) FROM private.week_player_menu m WHERE ${slotWhere(f, "frozen")}),
        'receipts',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]') FROM private.position_receipts r WHERE card_id=${quote(f.card)}::uuid),
        'activeReceiptCount',(SELECT count(*) FROM private.effective_position_receipts WHERE card_id=${quote(f.card)}::uuid),
        'activeCredits',(SELECT coalesce(sum(stake_credits),0) FROM private.effective_position_receipts WHERE card_id=${quote(f.card)}::uuid),
        'resetCount',(SELECT count(*) FROM private.card_reset_events WHERE card_id=${quote(f.card)}::uuid),
        'resetAudits',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]') FROM private.card_reset_events r WHERE card_id=${quote(f.card)}::uuid),
        'noPublicationAfterStart',NOT EXISTS(SELECT 1 FROM private.player_prop_slot_publications a JOIN private.sports_events e ON e.id=a.event_id
          WHERE a.week_id=${quote(f.week)}::uuid AND e.actual_started_at IS NOT NULL AND a.published_at>=e.actual_started_at));`),
      "Inspect immutable publication, menu, receipts and reset",
    ),
  );
}
async function fixture(label) {
  const f = json(
    successful(
      await sql(
        `${fixtureHelpers}\nSELECT pg_temp.progressive_fixture(${quote(`${prefix}-${label}`)});`,
      ),
      "Prepare authorized LIVE 1.5 fixture through the real review and cutover",
    ),
  );
  for (const key of [
    "league",
    "season",
    "week",
    "card",
    "owner",
    "slug",
    "leaseId",
    "proposals",
    "pendingEvent",
    "pendingTeam",
    "pendingSlot",
    "pendingSubject",
    "frozenEvent",
    "frozenTeam",
    "frozenSlot",
    "frozenSubject",
    "frozenReplacementSubject",
  ])
    assert.ok(f[key], `Native progressive fixture requires ${key}.`);
  const available = f.proposals.filter(
    (proposal) => proposal.proposedCanonicalKey,
  );
  assert.equal(
    available.length,
    1,
    "Fixture exposes one new eligible identity.",
  );
  f.expectedNomination = available[0];
  f.before = await state(f);
  assert.equal(f.before.rulesetVersion, "1.5");
  assert.equal(f.before.cutoverCount, 1);
  assert.ok(f.before.emptySlotReview);
  assert.equal(f.before.publicationCount, 0);
  assert.equal(f.before.pendingMenu.subject_id, null);
  assert.equal(f.before.frozenMenu.subject_id, f.frozenSubject);
  assert.ok(f.before.frozenMenu.frozen_at);
  assert.equal(f.before.activeReceiptCount, 0);
  return f;
}
function preserved(f, after) {
  assert.deepEqual(after.frozenMenu, f.before.frozenMenu);
  assert.equal(after.resetCount, f.before.resetCount);
  assert.deepEqual(after.resetAudits, f.before.resetAudits);
  assert.deepEqual(
    after.receipts.filter((r) =>
      f.before.receipts.some((before) => before.id === r.id),
    ),
    f.before.receipts,
    "Previously accepted immutable receipt rows must remain byte-identical.",
  );
}
function published(f, after) {
  assert.equal(after.publicationCount, 1);
  assert.equal(after.publication.subject_id, f.pendingSubject);
  assert.deepEqual(after.publication.nomination, f.expectedNomination);
  assert.equal(
    after.publication.evidence_hash,
    f.expectedNomination.nominationEvidenceHash,
  );
  assert.equal(after.pendingMenu.subject_id, f.pendingSubject);
  assert.ok(after.pendingMenu.frozen_at);
  assert.equal(after.noPublicationAfterStart, true);
  preserved(f, after);
}
async function acceptance(f, key) {
  const proof = json(
    successful(
      await sql(`WITH review AS (
        INSERT INTO private.live_card_quote_reviews(card_id,actor_user_id,positions,reviewed_at,expires_at,fetched_at)
        VALUES(${quote(f.card)}::uuid,${quote(f.owner)}::uuid,${literal(f.sparePositions)},clock_timestamp(),clock_timestamp()+interval '30 seconds',clock_timestamp()) RETURNING id)
        SELECT jsonb_build_object('reviewId',id) FROM review;`),
      "Prepare actual post-cutover member quote consent",
    ),
  );
  const positions = f.sparePositions.map((p, index) =>
    index === 0 ? { ...p, reviewId: proof.reviewId } : p,
  );
  return member(
    f,
    `SELECT api.accept_stage1_card(${quote(f.slug)},${literal(positions)},${quote(key)})`,
  );
}

successful(
  await sql(`DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM private.week_player_menu) OR EXISTS(SELECT 1 FROM private.player_catalog_jobs)
      OR EXISTS(SELECT 1 FROM private.player_result_event_mappings) THEN
      RAISE EXCEPTION 'Progressive native races require a fresh disposable database reset';
    END IF;
  END $$;`),
  "Require the separately reset native database",
);

{
  const f = await fixture("duplicate");
  const responses = await race(f, publish(f), publish(f), "duplicate");
  for (const response of responses)
    successful(response, "Concurrent exact publication replay");
  const after = await state(f);
  published(f, after);
  assert.deepEqual(after.receipts, f.before.receipts);
  console.log(
    "PASS: duplicate native publication creates one audit and one frozen identity.",
  );
}

for (const publicationFirst of [true, false]) {
  const label = publicationFirst ? "publish-before-bet" : "bet-before-publish";
  const f = await fixture(label);
  const accept = await acceptance(f, `${f.slug}-fresh-bet`);
  const operations = publicationFirst
    ? [publish(f), accept]
    : [accept, publish(f)];
  const responses = await race(f, ...operations, label);
  for (const response of responses)
    successful(
      response,
      "Publication and genuine member acceptance both commit",
    );
  const after = await state(f);
  published(f, after);
  assert.equal(after.activeReceiptCount, f.sparePositions.length);
  assert.equal(
    after.activeCredits,
    f.sparePositions.reduce((sum, p) => sum + p.stakeCredits, 0),
  );
  assert.equal(
    after.receipts.length,
    f.before.receipts.length + f.sparePositions.length,
  );
  console.log(
    `PASS: ${label}; publication preserves accepted bets and the original reset.`,
  );
}

for (const publicationFirst of [true, false]) {
  const label = publicationFirst
    ? "publish-before-kickoff"
    : "kickoff-before-publish";
  const f = await fixture(label);
  const kickoff = `BEGIN;
    SELECT id FROM private.seasons WHERE id=${quote(f.season)}::uuid FOR UPDATE;
    SELECT id FROM private.season_weeks WHERE id=${quote(f.week)}::uuid FOR UPDATE;
    UPDATE private.sports_events SET state='LIVE',actual_started_at=clock_timestamp()
      WHERE id=${quote(f.pendingEvent)}::uuid;
    COMMIT;`;
  const operations = publicationFirst
    ? [publish(f), kickoff]
    : [kickoff, publish(f)];
  const responses = await race(f, ...operations, label);
  successful(
    responses[publicationFirst ? 1 : 0],
    "Authoritative kickoff transition",
  );
  successful(
    responses[publicationFirst ? 0 : 1],
    "Publication commits before kickoff or safely skips the closed slot",
  );
  const after = await state(f);
  if (publicationFirst) {
    successful(responses[0], "Publication before the later cutoff commits");
    published(f, after);
  } else {
    assert.equal(after.publicationCount, 0);
    assert.equal(after.pendingMenu.subject_id, null);
    assert.equal(after.noPublicationAfterStart, true);
    preserved(f, after);
  }
  assert.deepEqual(after.receipts, f.before.receipts);
  console.log(
    `PASS: ${label}; no identity can publish after confirmed kickoff.`,
  );
}

{
  const f = await fixture("cutoff-while-waiting");
  const holder = await holdSeason(f);
  const name = `${prefix}-cutoff-waiting-publisher`;
  const pending = sql(publish(f), name);
  try {
    await waitBlocked([name]);
    holder.child.stdin.write(`UPDATE private.sports_events
      SET scheduled_start_at=clock_timestamp()+interval '300 milliseconds'
      WHERE id=${quote(f.pendingEvent)}::uuid;
      SELECT 'PROGRESSIVE_FUTURE_CUTOFF_SET';\n`);
    for (let attempt = 0; attempt < 60; attempt++) {
      if (holder.output().includes("PROGRESSIVE_FUTURE_CUTOFF_SET")) break;
      await pause(50);
    }
    assert.ok(holder.output().includes("PROGRESSIVE_FUTURE_CUTOFF_SET"));
    await pause(500);
  } finally {
    await holder.release();
  }
  successful(
    await pending,
    "Blocked publication safely skips the elapsed cutoff",
  );
  const after = await state(f);
  assert.equal(after.publicationCount, 0);
  assert.equal(after.pendingMenu.subject_id, null);
  preserved(f, after);
  console.log(
    "PASS: publication rechecks real time after waiting beyond the scheduled cutoff.",
  );
}

for (const attackFirst of [true, false]) {
  const label = attackFirst
    ? "replacement-before-publish"
    : "publish-before-replacement";
  const f = await fixture(label);
  const attack = `BEGIN; ${publicationCall(f)}
    UPDATE private.week_player_menu SET subject_id=${quote(f.frozenReplacementSubject)}::uuid
      WHERE ${slotWhere(f, "frozen")}; COMMIT;`;
  const operations = attackFirst ? [attack, publish(f)] : [publish(f), attack];
  const responses = await race(f, ...operations, label);
  successful(
    responses[attackFirst ? 1 : 0],
    "Legitimate late publication commits",
  );
  const rejected = responses[attackFirst ? 0 : 1];
  assert.notEqual(
    rejected.code,
    0,
    "Publishing one slot must not authorize changing another frozen identity.",
  );
  assert.match(rejected.stderr, /frozen|immutable|publication/i);
  const after = await state(f);
  published(f, after);
  assert.deepEqual(after.receipts, f.before.receipts);
  console.log(
    `PASS: ${label}; same-transaction publication authority cannot replace another frozen identity.`,
  );
}

console.log(
  "Native progressive player publication verified: 8 committed separate-session lock scenarios.",
);
