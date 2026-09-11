// Disposable full-stack provider boundary only. Production never imports this.
// The real application, Supabase Auth, RSC, RPCs, and receipts remain in use.
import {
  appendFileSync,
  readFileSync,
  existsSync,
  writeFileSync,
} from "node:fs";
const originalFetch = globalThis.fetch;
if (
  process.env.FULL_STACK_ACCEPTANCE === "1" &&
  process.env.ODDS_TEST_FIXTURE
) {
  globalThis.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
    );
    const failureFile = process.env.AUTH_TEST_FAILURE_FILE;
    if (
      failureFile &&
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
      existsSync(failureFile)
    ) {
      const failure = JSON.parse(readFileSync(failureFile, "utf8"));
      if (
        failure.remaining > 0 &&
        url.pathname === `/rest/v1/rpc/${failure.endpoint}`
      ) {
        writeFileSync(
          failureFile,
          JSON.stringify({ ...failure, remaining: failure.remaining - 1 }),
        );
        return Response.json(
          {
            message: "Disposable profile service outage",
            code: "temporary_failure",
          },
          { status: 503 },
        );
      }
    }
    if (url.hostname !== "api.the-odds-api.com")
      return originalFetch(input, init);
    if (url.pathname.endsWith("/scores")) {
      const fixture = JSON.parse(
        readFileSync(`${process.env.ODDS_TEST_FIXTURE}.scores`, "utf8"),
      );
      appendFileSync(`${process.env.ODDS_TEST_FIXTURE}.calls`, "scores\n");
      return Response.json(fixture.payload, {
        status: fixture.status ?? 200,
        headers: { "x-requests-remaining": "1400" },
      });
    }
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
