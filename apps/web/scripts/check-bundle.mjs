// S4 guard: the home page's own scripts must not contain the globe (three.js,
// three-globe), which has to stay a lazy chunk, and must stay small.
// Runs after `next build` (postbuild).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
const LIMIT_BYTES = 250 * 1024;
const FORBIDDEN = ["WebGLRenderer", "three-globe"];

const indexPath = join(OUT, "index.html");
if (!existsSync(indexPath)) {
  console.error(`check-bundle: ${indexPath} not found; run next build first`);
  process.exit(1);
}
const html = readFileSync(indexPath, "utf8");
// noModule scripts (legacy polyfills) are skipped by every browser that runs the app.
const srcs = [
  ...new Set(
    [...html.matchAll(/<script\b([^>]*)>/g)]
      .map((m) => m[1])
      .filter((attrs) => !/\bnomodule\b/i.test(attrs))
      .map((attrs) => /\bsrc="([^"]+)"/.exec(attrs)?.[1])
      .filter(Boolean),
  ),
];

let total = 0;
const problems = [];
for (const src of srcs) {
  const path = join(OUT, decodeURIComponent(new URL(src, "http://x/").pathname));
  if (!existsSync(path)) {
    problems.push(`${src}: referenced by index.html but missing from out/`);
    continue;
  }
  const code = readFileSync(path);
  const gz = gzipSync(code).length;
  total += gz;
  const text = code.toString("utf8");
  for (const needle of FORBIDDEN) {
    if (text.includes(needle)) problems.push(`${src} contains "${needle}": the globe must load as a lazy chunk`);
  }
}
if (total > LIMIT_BYTES) {
  problems.push(`initial scripts are ${(total / 1024).toFixed(1)} KB gzipped (limit ${LIMIT_BYTES / 1024} KB)`);
}

if (problems.length) {
  console.error(`check-bundle failed:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`check-bundle: ${srcs.length} initial scripts, ${(total / 1024).toFixed(1)} KB gzipped, no globe code`);
