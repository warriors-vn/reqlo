// Imported explicitly by each jsdom-environment component test file (never
// globally) — keeps the fast node-environment suite untouched and makes the
// jsdom-only cost visible at each call site, matching this repo's existing
// "no hidden global setup" style. Provides the jest-dom matchers plus the
// browser APIs Radix UI's interactive primitives (Popover, Select, ...)
// reach for that jsdom doesn't implement.
import "@testing-library/jest-dom/vitest";

if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom deliberately doesn't implement blob URLs — stub rather than gate on
// existence, since jsdom does define the method (it just throws when called).
URL.createObjectURL = () => "blob:mock-url";
URL.revokeObjectURL = () => {};
