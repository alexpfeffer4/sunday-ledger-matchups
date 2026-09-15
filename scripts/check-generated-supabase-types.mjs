import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function objectBody(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Missing ${marker.trim()} block.`);
  const start = source.indexOf("{", markerIndex);
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start + 1, index);
  }
  throw new Error(`Unclosed ${marker.trim()} block.`);
}

function topLevelEntries(body) {
  const entries = new Map();
  let index = 0;
  while (index < body.length) {
    const match = /^\s*([A-Za-z0-9_]+):\s*\{/m.exec(body.slice(index));
    if (!match) break;
    const name = match[1];
    const opening = index + match.index + match[0].lastIndexOf("{");
    let depth = 0;
    let end = opening;
    for (; end < body.length; end += 1) {
      if (body[end] === "{") depth += 1;
      if (body[end] === "}") depth -= 1;
      if (depth === 0) break;
    }
    entries.set(
      name,
      body
        .slice(opening, end + 1)
        .replace(/\s+/g, "")
        .replace(/;/g, ""),
    );
    index = end + 1;
  }
  return entries;
}

function apiFunctions(source) {
  const api = objectBody(source, "api: {");
  return topLevelEntries(objectBody(api, "Functions: {"));
}

const checkedPath = resolve("src/adapters/supabase/database.types.ts");
const generatedPath = resolve(
  process.argv[2] ?? "/tmp/sunday-ledger-database.types.ts",
);
const checked = apiFunctions(readFileSync(checkedPath, "utf8"));
const generated = apiFunctions(readFileSync(generatedPath, "utf8"));
const differences = [];
const checkedFunctions = [
  "apply_live_quote_plan",
  "bind_card_submission_intent",
  "claim_nflverse_reconciliation",
  "claim_odds_account_probe",
  "claim_odds_entitlement_probe",
  "claim_player_catalog_job",
  "claim_player_catalog_quote",
  "claim_player_catalog_source",
  "claim_player_result_jobs",
  "claim_player_source_smoke",
  "claim_player_statistics_status",
  "claim_shared_quote_request",
  "complete_nflverse_reconciliation",
  "complete_odds_account_probe",
  "complete_odds_entitlement_probe",
  "complete_player_catalog_job",
  "complete_player_catalog_source",
  "complete_player_result_request",
  "complete_player_source_smoke",
  "complete_player_statistics_status",
  "complete_shared_quote_request",
  "configure_player_prop_odds_budget",
  "confirm_player_prop_menu",
  "enqueue_player_catalog",
  "get_player_catalog_quotes",
  "get_player_prop_menu",
  "import_player_catalog",
  "import_player_result_observations",
  "open_reviewed_player_prop_week",
  "plan_live_quote_refresh",
  "plan_player_menu_quotes",
  "prepare_player_prop_menu",
  "record_player_catalog_nominations",
  "register_player_result_event",
  "reserve_player_metadata_request",
  "reserve_player_source_smoke_request",
  "resolve_finalized_week17_player_candidate",
  "resolve_player_result_candidate",
  "resolve_verified_player_result_exception",
  "revalidate_card_submission_intent",
  "get_league_matchup_cards",
  "get_commissioner_card_status",
  "claim_provider_odds_request",
  "claim_scheduled_score_refresh",
  "claim_live_score_refresh",
  "complete_provider_request",
  "claim_live_quote_refresh",
  "complete_live_quote_refresh",
  "review_live_card_quotes",
  "advance_simulated_time",
  "apply_simulation_fixture_results",
  "publish_simulation_fixture_week",
  "advance_owner_rehearsal",
  "fill_owner_rehearsal_bots",
  "get_owner_rehearsal",
  "has_owner_rehearsal_entitlement",
  "prepare_owner_rehearsal_quote_review",
  "prepare_simulation_card_quotes",
  "reset_owner_rehearsal",
  "start_owner_rehearsal",
  "use_owner_rehearsal_sample_card",
];

for (const name of checkedFunctions) {
  if (!generated.has(name)) {
    differences.push(`missing generated authoritative function ${name}`);
  } else if (!checked.has(name)) {
    differences.push(`missing checked-in authoritative function ${name}`);
  } else if (checked.get(name) !== generated.get(name)) {
    differences.push(`stale checked-in authoritative signature ${name}`);
  }
}

if (differences.length > 0) {
  throw new Error(
    `Generated Supabase types differ:\n- ${differences.join("\n- ")}`,
  );
}

console.log(
  `Verified ${checkedFunctions.length} generated authoritative api function signatures.`,
);
