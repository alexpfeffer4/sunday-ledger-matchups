import { readFileSync } from "node:fs";

const report = JSON.parse(readFileSync(process.argv[2], "utf8"));
const tests = [];
function collect(suite) {
  for (const spec of suite.specs ?? []) tests.push(...spec.tests);
  for (const child of suite.suites ?? []) collect(child);
}
for (const suite of report.suites ?? []) collect(suite);
if (
  !tests.length ||
  tests.some((test) => test.status === "skipped" || !test.results?.length)
) {
  throw new Error(
    "The real full-stack lane must execute every selected test with zero skips.",
  );
}
if (
  report.errors?.length ||
  tests.some((test) => !["expected", "flaky"].includes(test.status))
) {
  throw new Error(
    "The real full-stack lane contains a failed or interrupted test.",
  );
}
console.log(
  `Full-stack execution verified: ${tests.length} executed, zero skipped, ${tests.filter((test) => test.status === "flaky").length} passed on retry.`,
);
