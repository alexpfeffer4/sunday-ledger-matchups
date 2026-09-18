import { afterEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// Shared UI also renders outside Next in unit/static-markup fixtures. Real
// browser journeys verify routing; those fixtures need a mounted-router stand-in.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// JSDOM does not perform layout. Geometry and ResizeObserver behavior are
// verified by the real Chromium/WebKit member journey, not these unit tests.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal ??= function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function close() {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
}

// Browser preferences/history belong to one test's tab, like private drafts.
afterEach(() => {
  if (typeof window !== "undefined") {
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/");
  }
});
