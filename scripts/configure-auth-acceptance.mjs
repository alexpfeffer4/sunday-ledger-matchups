// Configure only the generated disposable Supabase stack. Never calls a hosted API.
import { readFileSync, writeFileSync } from "node:fs";
if (process.env.CI !== "true" && process.env.AUTH_ACCEPTANCE_LOCAL !== "1") {
  throw new Error(
    "Run only in CI or an explicitly disposable local Auth stack.",
  );
}
const path = "supabase/config.toml";
let config = readFileSync(path, "utf8");
function replaceSetting(section, key, value) {
  const start = config.indexOf(`[${section}]`);
  if (start < 0) throw new Error(`Missing ${section} configuration`);
  const end = config.indexOf("\n[", start + 1);
  const chunk = config.slice(start, end < 0 ? undefined : end);
  const expression = new RegExp(`^${key} = .+$`, "m");
  if (!expression.test(chunk)) throw new Error(`Missing ${section}.${key}`);
  config =
    config.slice(0, start) +
    chunk.replace(expression, `${key} = ${value}`) +
    (end < 0 ? "" : config.slice(end));
}
replaceSetting("auth", "site_url", '"http://127.0.0.1:3000"');
replaceSetting(
  "auth",
  "additional_redirect_urls",
  '["http://127.0.0.1:3000/**", "http://localhost:3000/**"]',
);
replaceSetting("auth.email", "enable_confirmations", "true");
for (const name of ["confirmation", "magic_link", "recovery"]) {
  // supabase init may contain commented template examples, but no active ones.
  if (new RegExp(`^\\[auth\\.email\\.template\\.${name}\\]`, "m").test(config))
    throw new Error(`Template ${name} already configured`);
  config += `\n[auth.email.template.${name}]\nsubject = "Sunday Ledger ${name}"\ncontent_path = "./supabase/templates/${name}.html"\n`;
}
writeFileSync(path, config);
