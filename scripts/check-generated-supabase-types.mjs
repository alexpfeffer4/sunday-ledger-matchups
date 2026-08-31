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
const phase8cFunctions = [
  "advance_simulated_time",
  "apply_simulation_fixture_results",
  "publish_simulation_fixture_week",
];

for (const name of phase8cFunctions) {
  if (!generated.has(name)) {
    differences.push(`missing generated Phase 8C function ${name}`);
  } else if (!checked.has(name)) {
    differences.push(`missing checked-in Phase 8C function ${name}`);
  } else if (checked.get(name) !== generated.get(name)) {
    differences.push(`stale checked-in Phase 8C signature ${name}`);
  }
}

if (differences.length > 0) {
  throw new Error(
    `Generated Supabase types differ:\n- ${differences.join("\n- ")}`,
  );
}

console.log(
  `Verified ${phase8cFunctions.length} generated Phase 8C api function signatures.`,
);
