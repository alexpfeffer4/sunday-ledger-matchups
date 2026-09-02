import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import appManifest from "@/app/manifest";

const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (
    source: string,
    options: { contentType: string },
  ) => { window: { document: Document } };
};

type IdentityManifest = {
  canonicalSources: Array<[string, string, string]>;
  exports: Array<{
    path: string;
    purpose?: string;
    sha256: string;
    sizes?: number[] | string;
  }>;
  opticalMasters: Record<
    "micro" | "compact" | "standard",
    { maxPx: number | null; minPx: number; path: string }
  >;
};

const identityManifest = JSON.parse(
  readFileSync(resolve("src/design/identity/identity-manifest.json"), "utf8"),
) as IdentityManifest;

function hash(path: string) {
  return createHash("sha256")
    .update(readFileSync(resolve(path)))
    .digest("hex");
}

describe("Phase 11 approved identity assets", () => {
  it("parses every canonical SVG with an intentional viewBox", () => {
    for (const [path] of identityManifest.canonicalSources) {
      const source = readFileSync(resolve(path), "utf8");
      const document = new JSDOM(source, { contentType: "image/svg+xml" })
        .window.document;
      const svg = document.documentElement;
      const viewBox = svg.getAttribute("viewBox")?.split(/\s+/).map(Number);
      expect(svg.localName, path).toBe("svg");
      expect(viewBox, path).toHaveLength(4);
      expect(viewBox?.every(Number.isFinite), path).toBe(true);
      expect(viewBox?.[2], path).toBeGreaterThan(0);
      expect(viewBox?.[3], path).toBeGreaterThan(0);
      expect(
        document.querySelector(
          "image, mask, filter, linearGradient, radialGradient",
        ),
        path,
      ).toBeNull();
    }
  });

  it("keeps the three optical masters distinct and explicitly ranged", () => {
    const { compact, micro, standard } = identityManifest.opticalMasters;
    expect([micro.minPx, micro.maxPx]).toEqual([16, 20]);
    expect([compact.minPx, compact.maxPx]).toEqual([24, 32]);
    expect([standard.minPx, standard.maxPx]).toEqual([48, null]);
    expect(
      new Set([hash(micro.path), hash(compact.path), hash(standard.path)]).size,
    ).toBe(3);
  });

  it("keeps the wordmark outlined and the social preview privacy-reviewed", () => {
    const wordmark = readFileSync(
      resolve("src/design/identity/masters/sunday-ledger-wordmark.svg"),
      "utf8",
    );
    expect(wordmark).not.toMatch(/<text\b|font-family|@font-face/i);
    expect(wordmark.match(/<path\b/g)?.length).toBeGreaterThanOrEqual(10);

    const socialSource = readFileSync(
      resolve("src/design/identity/root-social-preview.svg"),
      "utf8",
    );
    expect(socialSource).not.toMatch(
      /<image\b|(?:href|src)\s*=\s*["']https?:/i,
    );
    expect(hash("src/app/opengraph-image.png")).toBe(
      "1f0b388cad8821e9d5276e782bf1c55ffe1e787df077d158db7def1895221435",
    );
  });

  it("exposes exact any, maskable, and monochrome platform metadata", () => {
    const icons = appManifest().icons ?? [];
    expect(icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: "/icon.svg",
          sizes: "any",
          purpose: "any",
        }),
        expect.objectContaining({
          src: "/identity/launcher-192.png",
          sizes: "192x192",
          purpose: "any",
        }),
        expect.objectContaining({
          src: "/identity/launcher-512.png",
          sizes: "512x512",
          purpose: "any",
        }),
        expect.objectContaining({
          src: "/identity/maskable-192.png",
          sizes: "192x192",
          purpose: "maskable",
        }),
        expect.objectContaining({
          src: "/identity/maskable-512.png",
          sizes: "512x512",
          purpose: "maskable",
        }),
        expect.objectContaining({
          src: "/identity/monochrome-512.png",
          sizes: "512x512",
          purpose: "monochrome",
        }),
      ]),
    );
  });
});
