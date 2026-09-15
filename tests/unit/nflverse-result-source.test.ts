import { afterEach, expect, it, vi } from "vitest";
import { fetchNflverseSeasonEvidence } from "@/adapters/providers/nflverse/client";
vi.mock("server-only", () => ({}));
afterEach(() => vi.unstubAllGlobals());
const headers = { "last-modified": "Mon, 14 Sep 2026 06:00:00 GMT" };

it("rejects oversized advertised results before consuming their bodies", async () => {
  const cancel = vi.fn();
  const pull = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(
        async () =>
          new Response(
            new ReadableStream({ pull, cancel }, { highWaterMark: 0 }),
            { headers: { ...headers, "content-length": "25000001" } },
          ),
      ),
  );
  await expect(fetchNflverseSeasonEvidence(2026)).rejects.toThrow(
    "SOURCE_TOO_LARGE",
  );
  expect(pull).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalledTimes(2);
});

it("counts streamed bytes and cancels a chunked source before decoding its oversized body", async () => {
  const cancel = vi.fn();
  let pulls = 0;
  const chunk = new Uint8Array(9_000_000).fill(65);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(
      async () =>
        new Response(
          new ReadableStream(
            {
              pull(controller) {
                pulls++;
                controller.enqueue(chunk);
              },
              cancel,
            },
            { highWaterMark: 0 },
          ),
          { headers },
        ),
    ),
  );
  await expect(fetchNflverseSeasonEvidence(2026)).rejects.toThrow(
    "SOURCE_TOO_LARGE",
  );
  expect(pulls).toBe(6);
  expect(cancel).toHaveBeenCalledTimes(2);
});

it("rejects invalid UTF-8 instead of silently changing evidence identifiers", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(
        async () => new Response(new Uint8Array([0xff]), { headers }),
      ),
  );
  await expect(fetchNflverseSeasonEvidence(2026)).rejects.toThrow();
});
