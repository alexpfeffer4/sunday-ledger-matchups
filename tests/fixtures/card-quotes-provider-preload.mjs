// Disposable full-stack provider boundary only. Production never imports this.
// The real application, Supabase Auth, RSC, RPCs, and receipts remain in use.
import { appendFileSync, readFileSync } from "node:fs";
const originalFetch = globalThis.fetch;
if (
  process.env.FULL_STACK_ACCEPTANCE === "1" &&
  process.env.ODDS_TEST_FIXTURE
) {
  globalThis.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
    );
    if (url.hostname !== "api.the-odds-api.com")
      return originalFetch(input, init);
    if (!url.pathname.endsWith("/odds"))
      throw new Error("Unexpected provider endpoint in quote acceptance");
    const fixture = JSON.parse(
      readFileSync(process.env.ODDS_TEST_FIXTURE, "utf8"),
    );
    appendFileSync(`${process.env.ODDS_TEST_FIXTURE}.calls`, "odds\n");
    return Response.json(fixture.payload, {
      status: fixture.status ?? 200,
      headers: { "x-requests-remaining": "1490" },
    });
  };
}
