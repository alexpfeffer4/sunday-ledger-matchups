/**
 * Prepare/import an adapter-verified full-slate directory manifest.
 *
 * Dry run (default; no network):
 *   node --experimental-strip-types scripts/import-player-catalog.mjs manifest.json
 * Disposable local import:
 *   TEST_SUPABASE_URL=<loopback URL> TEST_SUPABASE_SERVICE_ROLE_KEY=<server secret>
 *   node --experimental-strip-types scripts/import-player-catalog.mjs manifest.json --apply-local
 *
 * This command never calls an odds/statistics provider, accepts no member drafts,
 * never enables offers, and rejects every hosted/Production URL. Input records
 * must come from verified source adapters/crosswalk evidence, not guessed names.
 * Source acquisition uses the shared metadata budget; do not fetch here as a
 * way to bypass its 20/day reserve. Dry-run output contains counts only.
 */
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { buildPlayerCatalogBootstrap } from "../src/application/players/catalog-bootstrap.ts";
import { propQuoteImportSchema } from "../src/application/providers/player-prop-quotes.ts";

const args = process.argv.slice(2);
if (
  args.length < 1 ||
  args.length > 2 ||
  (args[1] && args[1] !== "--apply-local")
) {
  throw new Error(
    "Usage: import-player-catalog.mjs manifest.json [--apply-local]",
  );
}
const source = JSON.parse(await readFile(args[0], "utf8"));
const quotes = (source.quotes ?? []).map((row) =>
  propQuoteImportSchema.parse(row),
);
const result = buildPlayerCatalogBootstrap({ ...source, quotes });
const summary = {
  proposedSlots: result.proposals.length,
  resolvedSlots: result.proposals.filter((row) => row.proposedCanonicalKey)
    .length,
  unavailableSlots: result.proposals.filter((row) => !row.proposedCanonicalKey)
    .length,
  mappingRecords: result.records.length,
  verifiedEvents: result.resultEvents.length,
  exceptionCounts: Object.fromEntries(
    [...new Set(result.exceptions.map((row) => row.code))].map((code) => [
      code,
      result.exceptions.filter((row) => row.code === code).length,
    ]),
  ),
};
if (args[1] !== "--apply-local") {
  process.stdout.write(
    `${JSON.stringify({ mode: "DRY_RUN", ...summary }, null, 2)}\n`,
  );
} else {
  const target = new URL(
    process.env.TEST_SUPABASE_URL ?? "https://invalid.example",
  );
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
    !["http:", "https:"].includes(target.protocol) ||
    target.username ||
    target.password ||
    target.pathname !== "/" ||
    target.search ||
    target.hash
  ) {
    throw new Error("CATALOG_IMPORT_REQUIRES_DISPOSABLE_LOOPBACK_SUPABASE");
  }
  const secret = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("DISPOSABLE_SERVICE_KEY_REQUIRED");
  const admin = createClient(target.origin, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).schema("api");
  for (const mapping of result.resultEvents) {
    const response = await admin.rpc("register_player_result_event", {
      p_mapping: mapping,
    });
    if (response.error)
      throw new Error("LOCAL_RESULT_EVENT_MAPPING_IMPORT_FAILED");
  }
  if (result.records.length) {
    const response = await admin.rpc("import_player_catalog", {
      p_records: result.records,
    });
    if (response.error) throw new Error("LOCAL_PLAYER_CATALOG_IMPORT_FAILED");
  }
  process.stdout.write(
    `${JSON.stringify({ mode: "DISPOSABLE_LOCAL_IMPORT", ...summary }, null, 2)}\n`,
  );
}
