import "@testing-library/jest-dom/vitest";

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
