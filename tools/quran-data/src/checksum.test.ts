import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "./lib/manifest";
import { webDataDir } from "./paths";

const translationsDir = path.join(webDataDir, "translations");
const dirs = [
  { label: "Quran text", dir: path.join(webDataDir, "text") },
  ...(existsSync(translationsDir) ? readdirSync(translationsDir) : []).map((id) => ({
    label: `translation ${id}`,
    dir: path.join(translationsDir, id),
  })),
];

describe.each(dirs)("$label checksum guard", ({ dir: textDir }) => {
  const manifest = JSON.parse(readFileSync(path.join(textDir, "manifest.json"), "utf8")) as {
    source: string;
    files: Record<string, string>;
  };

  it("lists exactly 114 files", () => {
    expect(Object.keys(manifest.files)).toHaveLength(114);
  });

  it("every listed file matches its sha256", () => {
    const mismatched = Object.entries(manifest.files)
      .filter(([name, hash]) => sha256Hex(readFileSync(path.join(textDir, name))) !== hash)
      .map(([name]) => name);
    expect(mismatched, `checksum mismatch: ${mismatched.join(", ")}`).toEqual([]);
  });

  it("no file in the directory is missing from the manifest", () => {
    const unlisted = readdirSync(textDir).filter((f) => f !== "manifest.json" && !(f in manifest.files));
    expect(unlisted, `not in manifest: ${unlisted.join(", ")}`).toEqual([]);
  });
});
