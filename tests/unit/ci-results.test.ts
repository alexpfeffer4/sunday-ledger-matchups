import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const jobs = ["quality", "database", "native", "full-stack", "browser"];
const passed = () =>
  Object.fromEntries(jobs.map((name) => [name, { result: "success" }]));
function check(results: unknown, expected = jobs) {
  return spawnSync(
    process.execPath,
    ["scripts/check-ci-results.mjs", ...expected],
    {
      encoding: "utf8",
      env: { ...process.env, CI_JOB_RESULTS: JSON.stringify(results) },
    },
  );
}

describe("acceptance summary cannot hide incomplete verification", () => {
  it("passes only when every required job group succeeded", () => {
    expect(check(passed()).status).toBe(0);
  });

  it.each(["failure", "cancelled", "skipped", "", "neutral"])(
    "rejects a %s result even when all other groups passed",
    (result) => {
      const results = passed();
      results["full-stack"] = { result };
      expect(check(results).status).not.toBe(0);
    },
  );

  it("rejects a missing dependency", () => {
    const results = passed();
    delete results.database;
    expect(check(results).status).not.toBe(0);
  });

  it.each([null, {}, [], { unrelated: { result: "success" } }])(
    "rejects absent or malformed job evidence: %j",
    (results) => {
      expect(check(results).status).not.toBe(0);
    },
  );

  it("rejects an omitted list of required groups", () => {
    expect(check({}, []).status).not.toBe(0);
  });
});
