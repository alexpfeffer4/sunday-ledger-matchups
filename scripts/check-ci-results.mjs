// The summary must fail closed: missing, skipped, cancelled and failed jobs
// cannot turn into a successful merge signal through GitHub's needs handling.
const expectedJobs = process.argv.slice(2);
const results = JSON.parse(process.env.CI_JOB_RESULTS ?? "null");
if (
  !expectedJobs.length ||
  !results ||
  typeof results !== "object" ||
  Array.isArray(results) ||
  Object.keys(results).length !== expectedJobs.length ||
  expectedJobs.some((name) => results[name]?.result !== "success")
) {
  throw new Error("Every acceptance job must finish successfully.");
}
console.log(
  `Acceptance complete: all ${expectedJobs.length} job groups passed.`,
);
