import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

// This is derived navigation, never migration input or editable SQL authority.
const url = process.env.TEST_SUPABASE_DB_URL;
if (
  !url ||
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)
)
  throw new Error(
    "Effective authority export requires a disposable loopback database.",
  );
const roots = [
  "api.get_stage1_state",
  "api.get_player_prop_menu",
  "api.get_card_review_context",
  "api.get_league_matchup_cards",
  "api.get_weekly_close_state",
  "api.review_live_card_quotes",
  "api.bind_card_submission_intent",
  "api.revalidate_card_submission_intent",
  "api.accept_stage1_card",
  "api.plan_live_quote_refresh",
  "api.apply_live_quote_plan",
  "api.claim_live_quote_refresh",
  "api.complete_live_quote_refresh",
  "api.refresh_live_week_quotes",
  "api.claim_background_quote_run",
  "api.apply_background_quote_event",
  "api.complete_season_automation",
].sort();
const sql = `begin read only;
select coalesce(jsonb_agg(row_to_json(f) order by f.signature),'[]') from (
 select n.nspname||'.'||p.proname as name,
 n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as signature,
 pg_get_functiondef(p.oid) as definition, p.prosecdef as security_definer,
 p.provolatile as volatility, p.proconfig as configuration,
 has_function_privilege('anon',p.oid,'execute') as anon,
 has_function_privilege('authenticated',p.oid,'execute') as authenticated,
 has_function_privilege('service_role',p.oid,'execute') as service_role
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('api','private') and p.prokind='f'
) f; rollback;`;
const all = JSON.parse(
  execFileSync(
    "psql",
    [url, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  ).trim(),
);
const byName = new Map();
for (const row of all)
  byName.set(row.name, [...(byName.get(row.name) ?? []), row]);
for (const root of roots)
  if (!byName.has(root)) throw new Error(`Missing authority root: ${root}`);
const selected = new Map();
const pending = [...roots];
while (pending.length) {
  for (const row of byName.get(pending.shift()) ?? []) {
    if (selected.has(row.signature)) continue;
    // Includes literal regprocedure references as well as ordinary calls.
    // Dynamic name assembly is explicitly outside this navigation aid's proof.
    const references = [
      ...new Set(
        [
          ...row.definition.matchAll(
            /\b(api|private)\.([a-z_][a-z_0-9]*)\s*\(/g,
          ),
        ].map((m) => `${m[1]}.${m[2]}`),
      ),
    ]
      .filter((name) => name !== row.name && byName.has(name))
      .sort();
    selected.set(row.signature, {
      ...row,
      sha256: createHash("sha256").update(row.definition).digest("hex"),
      references,
    });
    pending.push(...references);
  }
}
const migrations = readdirSync("supabase/migrations")
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((file) => ({
    file,
    sha256: createHash("sha256")
      .update(readFileSync(`supabase/migrations/${file}`))
      .digest("hex"),
  }));
const functions = [...selected.values()].sort((a, b) =>
  a.signature < b.signature ? -1 : a.signature > b.signature ? 1 : 0,
);
mkdirSync("acceptance-reports", { recursive: true });
const description =
  "DERIVED from clean migrations; never apply or edit this output. Literal SQL references are navigation hints, not a complete dynamic call graph. Existing body/privilege parity and tests remain the verification authority.";
writeFileSync(
  "acceptance-reports/effective-authorities.json",
  JSON.stringify({ description, roots, migrations, functions }, null, 2) + "\n",
);
writeFileSync(
  "acceptance-reports/effective-authorities.md",
  `# Effective authorities\n\n${description}\n\nFull definitions and migration hashes: effective-authorities.json.\n\n| Signature | Definer | Volatility | Execute roles | Definition SHA-256 |\n| --- | --- | --- | --- | --- |\n` +
    functions
      .map(
        (f) =>
          `| \`${f.signature}\` | ${f.security_definer} | ${f.volatility} | ${["anon", "authenticated", "service_role"].filter((role) => f[role]).join(", ") || "private"} | \`${f.sha256}\` |`,
      )
      .join("\n") +
    "\n",
);
console.log(
  `Derived ${functions.length} effective functions from ${roots.length} entry points.`,
);
