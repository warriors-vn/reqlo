#!/usr/bin/env node
// Fails CI if a client JS chunk that isn't one of Monaco's already-known-huge
// pieces crosses BUDGET_BYTES — the regression this guards against is Monaco
// (or the snippet code editors that pull it in) getting imported eagerly
// somewhere and dragged back into a chunk that isn't already exempt for
// being lazy-loaded on demand. Run after `npm run build`.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const ASSETS_DIR = "dist/client/assets";
export const BUDGET_BYTES = 1024 * 1024; // 1 MB raw, per non-exempt chunk

// Matched against the chunk's *stable* name (see stableName below) — Monaco's
// own core bundle, the workers it spins up, and the language-mode chunks it
// lazy-loads on demand are all legitimately this size; nothing else should be.
export const EXEMPT_PREFIXES = [
  "monaco.contribution",
  "monaco-setup",
  "json.worker",
  "tsMode",
  "jsonMode",
  "cssMode",
  "htmlMode",
  "graphqlMode",
  "printSchema",
  "emscripten-module",
];

/** Strips Vite's content-hash suffix, e.g. "printSchema-BARDlP0J.js" ->
 * "printSchema" — so the allowlist above survives every build's new hashes.
 * The hash character class deliberately excludes "-": a name like
 * "monaco-setup" already contains a hyphen of its own, and an earlier
 * version of this pattern allowed the hash match to swallow it too, silently
 * truncating the exemption to "monaco" instead. */
export function stableName(fileName) {
  return fileName.replace(/-[A-Za-z0-9]{6,10}\.(js|mjs|css)$/, "");
}

export function findOversizedChunks(assetsDir) {
  const files = readdirSync(assetsDir).filter((f) => f.endsWith(".js"));
  const offenders = [];
  for (const file of files) {
    const name = stableName(file);
    if (EXEMPT_PREFIXES.some((prefix) => name.startsWith(prefix))) continue;
    const size = statSync(join(assetsDir, file)).size;
    if (size > BUDGET_BYTES) offenders.push({ file, size });
  }
  return { totalChecked: files.length, offenders };
}

function main() {
  const { totalChecked, offenders } = findOversizedChunks(ASSETS_DIR);

  if (offenders.length > 0) {
    console.error("Bundle size budget exceeded:\n");
    for (const { file, size } of offenders) {
      console.error(
        `  ${file}: ${(size / 1024).toFixed(1)} KB (budget: ${BUDGET_BYTES / 1024} KB)`,
      );
    }
    console.error(
      "\nIf this growth is expected (e.g. a genuinely large new dependency)," +
        " either code-split it behind a lazy import, or add its chunk name" +
        " prefix to EXEMPT_PREFIXES in scripts/check-bundle-size.mjs with a" +
        " comment explaining why.",
    );
    process.exit(1);
  }

  console.log(
    `Bundle size check passed — ${totalChecked} client JS chunks, all under ${BUDGET_BYTES / 1024} KB (or exempted).`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
