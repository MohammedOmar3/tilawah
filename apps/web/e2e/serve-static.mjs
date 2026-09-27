// Zero-dependency static server for the exported site (apps/web/out), used by
// Playwright. Supports Range requests (audio seeking needs 206 responses) and
// resolves /path to /path.html or /path/index.html like a static host would.
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../out", import.meta.url)));
const PORT = Number(process.env.PORT ?? 3000);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".webmanifest": "application/manifest+json",
};

async function fileAt(path) {
  try {
    const s = await stat(path);
    return s.isFile() ? { path, size: s.size } : null;
  } catch {
    return null;
  }
}

async function resolveFile(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const base = normalize(join(ROOT, decoded));
  if (base !== ROOT && !base.startsWith(ROOT + sep)) return null; // path traversal
  const candidates = decoded.endsWith("/")
    ? [join(base, "index.html")]
    : [base, `${base}.html`, join(base, "index.html")];
  for (const c of candidates) {
    const f = await fileAt(c);
    if (f) return f;
  }
  return null;
}

/** Parses a single-range `bytes=` header; returns null when absent, "invalid" when unsatisfiable. */
function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return "invalid";
  let start;
  let end;
  if (m[1] === "") {
    const suffix = Number(m[2]);
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start > end || start >= size) return "invalid";
  return { start, end };
}

const server = createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  const url = new URL(req.url ?? "/", "http://localhost");
  let file = await resolveFile(url.pathname);
  let status = 200;
  if (!file) {
    file = await fileAt(join(ROOT, "404.html"));
    status = 404;
    if (!file) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
      return;
    }
  }
  const headers = {
    "Content-Type": MIME[extname(file.path).toLowerCase()] ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  };
  const range = status === 200 ? parseRange(req.headers.range, file.size) : null;
  if (range === "invalid") {
    res.writeHead(416, { ...headers, "Content-Range": `bytes */${file.size}` }).end();
    return;
  }
  if (range) {
    res.writeHead(206, {
      ...headers,
      "Content-Range": `bytes ${range.start}-${range.end}/${file.size}`,
      "Content-Length": range.end - range.start + 1,
    });
    if (req.method === "HEAD") return void res.end();
    createReadStream(file.path, { start: range.start, end: range.end }).pipe(res);
    return;
  }
  res.writeHead(status, { ...headers, "Content-Length": file.size });
  if (req.method === "HEAD") return void res.end();
  createReadStream(file.path).pipe(res);
});

server.listen(PORT, () => {
  console.log(`serving ${ROOT} on http://localhost:${PORT}`);
});
