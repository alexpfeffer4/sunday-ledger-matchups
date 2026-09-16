import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

function loopback(value) {
  const url = new URL(value);
  if (!["localhost", "127.0.0.1"].includes(url.hostname))
    throw new Error(
      "API readiness checks require a disposable loopback stack.",
    );
  return url;
}

// A database reset can finish before PostgREST reloads its configuration/schema.
// Inspect its service-role OpenAPI document; never invoke a mutation to probe it.
export async function waitForDisposableApi(url, key) {
  const target = new URL("/rest/v1/", loopback(url));
  if (!key) throw new Error("Missing disposable API key.");
  const deadline = Date.now() + 30_000;
  let last = "not observed";
  while (Date.now() < deadline) {
    let response;
    try {
      response = await fetch(target, {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Accept-Profile": "api",
          Accept: "application/openapi+json",
        },
        signal: AbortSignal.timeout(2_000),
      });
    } catch {
      last = "connection unavailable";
    }
    if (response) {
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.paths?.["/rpc/claim_season_automation_odds"])
        return;
      if (!response.ok && !["PGRST002", "PGRST106"].includes(body.code))
        throw new Error(
          `Disposable API readiness failed: HTTP ${response.status}`,
        );
      last = response.ok ? "required RPC absent from schema cache" : body.code;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `Disposable API did not become ready within 30 seconds: ${last}`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const url = loopback(process.env.TEST_SUPABASE_URL).href;
  loopback(process.env.TEST_SUPABASE_DB_URL);
  execFileSync(
    "psql",
    [process.env.TEST_SUPABASE_DB_URL, "-X", "-v", "ON_ERROR_STOP=1", "-q"],
    { input: "notify pgrst, 'reload config'; notify pgrst, 'reload schema';" },
  );
  await waitForDisposableApi(url, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY);
  console.log("Disposable API configuration and schema are ready.");
}
