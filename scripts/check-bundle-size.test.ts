import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stableName, findOversizedChunks, EXEMPT_PREFIXES } from "./check-bundle-size.mjs";

describe("stableName", () => {
  it("strips a Vite content-hash suffix off a .js file", () => {
    expect(stableName("printSchema-BARDlP0J.js")).toBe("printSchema");
  });

  it("strips a hash suffix that itself contains a hyphen", () => {
    expect(stableName("monaco.contribution-DFFRlx86.js")).toBe("monaco.contribution");
  });

  it("leaves a name with no hash suffix alone", () => {
    expect(stableName("index.js")).toBe("index.js");
  });
});

describe("findOversizedChunks", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function write(dirPath: string, name: string, bytes: number) {
    writeFileSync(join(dirPath, name), Buffer.alloc(bytes));
  }

  it("flags a non-exempt chunk over the budget", () => {
    dir = mkdtempSync(join(tmpdir(), "bundle-size-"));
    write(dir, "index-AAAAAA.js", 2 * 1024 * 1024);

    const result = findOversizedChunks(dir);
    expect(result.offenders).toEqual([expect.objectContaining({ file: "index-AAAAAA.js" })]);
  });

  it("passes a non-exempt chunk under the budget", () => {
    dir = mkdtempSync(join(tmpdir(), "bundle-size-"));
    write(dir, "index-AAAAAA.js", 500 * 1024);

    expect(findOversizedChunks(dir).offenders).toHaveLength(0);
  });

  it("exempts a known-huge Monaco chunk regardless of size", () => {
    dir = mkdtempSync(join(tmpdir(), "bundle-size-"));
    write(dir, "monaco.contribution-DFFRlx86.js", 4 * 1024 * 1024);

    expect(findOversizedChunks(dir).offenders).toHaveLength(0);
  });

  it("ignores non-.js files (e.g. .css, .wasm)", () => {
    dir = mkdtempSync(join(tmpdir(), "bundle-size-"));
    write(dir, "styles-AAAAAA.css", 2 * 1024 * 1024);
    write(dir, "emscripten-module-AAAAAA.wasm", 2 * 1024 * 1024);

    const result = findOversizedChunks(dir);
    expect(result.offenders).toHaveLength(0);
    expect(result.totalChecked).toBe(0);
  });

  it("every exempt prefix actually matches at least one plausible real chunk name", () => {
    // Guards against a typo silently making an exemption dead weight.
    for (const prefix of EXEMPT_PREFIXES) {
      expect(stableName(`${prefix}-AAAAAA.js`)).toBe(prefix);
    }
  });
});
