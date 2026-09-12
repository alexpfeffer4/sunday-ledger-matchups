import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

// Only endpoint names and timings from the disposable app process. Never tokens,
// request bodies, query strings, member identities, or receipt content.
type Query = { endpoint: string; ms: number; status: number };
export function queries(): Query[] {
  const path = process.env.RELEASE_QUERY_LOG;
  return path && existsSync(path)
    ? readFileSync(path, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Query)
    : [];
}

export async function measure(
  info: TestInfo,
  name: string,
  action: () => Promise<void>,
) {
  const before = queries().length;
  const start = performance.now();
  await action();
  const result = {
    name,
    ms: Math.round(performance.now() - start),
    queries: queries().slice(before),
  };
  await info.attach(name, {
    body: JSON.stringify(result, null, 2),
    contentType: "application/json",
  });
  console.log(`RELEASE_MEASUREMENT ${JSON.stringify(result)}`);
  return result;
}

export async function inspectMemberSurface(
  page: Page,
  info: TestInfo,
  name: string,
) {
  const dimensions = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll, `${name} horizontal reflow`).toBeLessThanOrEqual(
    dimensions.client + 1,
  );
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  await info.attach(`${name}-accessibility`, {
    body: JSON.stringify(
      { dimensions, violations: scan.violations, incomplete: scan.incomplete },
      null,
      2,
    ),
    contentType: "application/json",
  });
  expect(scan.violations, name).toEqual([]);
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    fullPage: true,
  });
}
