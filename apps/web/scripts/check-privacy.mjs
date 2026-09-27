// Privacy guard (collective, not social; no cookies; no analytics).
// Fails on cookie access, on localStorage writes under any key but
// "tilawah.settings", and on known analytics packages in package.json.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["app", "components", "lib", "player", "globe"];
const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const ALLOWED_STORAGE_KEY = "tilawah.settings";
const ANALYTICS = [/^@vercel\/analytics$/, /^react-ga\d*$/, /^posthog-js$/, /^@segment\//, /^mixpanel-browser$/, /^@sentry\//];

function* files(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (EXTS.has(extname(name))) yield path;
  }
}

const problems = [];
for (const dir of DIRS) {
  for (const path of files(join(ROOT, dir))) {
    const rel = relative(ROOT, path);
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, i) => {
      const at = `${rel}:${i + 1}`;
      if (line.includes("document.cookie")) problems.push(`${at}: uses document.cookie`);
      for (const m of line.matchAll(/localStorage\.setItem\(\s*(?:(["'`])([^"'`]*)\1)?/g)) {
        if (m[2] !== ALLOWED_STORAGE_KEY) {
          problems.push(`${at}: localStorage.setItem must use the literal key "${ALLOWED_STORAGE_KEY}"`);
        }
      }
    });
  }
}

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
  for (const name of Object.keys(pkg[field] ?? {})) {
    if (ANALYTICS.some((re) => re.test(name))) problems.push(`package.json ${field}: analytics package "${name}"`);
  }
}

if (problems.length) {
  console.error(`check-privacy failed:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log("check-privacy: no cookies, no analytics packages, localStorage limited to tilawah.settings");
