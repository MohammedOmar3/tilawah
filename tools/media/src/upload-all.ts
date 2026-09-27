// Uploads output/<reciterId>/NNN.m4a to R2. Never deletes; skips objects whose size matches.
// Usage: pnpm --filter media upload <reciterId> <keyVersion>
// Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { outputDir, pad3 } from "./paths";
import { objectParams } from "./upload";

const [reciterId, keyVersion] = process.argv.slice(2);
if (!reciterId || !keyVersion) {
  console.error("usage: upload <reciterId> <keyVersion>");
  process.exit(2);
}
const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set`);
  return v;
};
const Bucket = env("R2_BUCKET");
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY") },
});

async function one(surah: number): Promise<void> {
  const file = path.join(outputDir(reciterId!), `${pad3(surah)}.m4a`);
  const size = statSync(file).size;
  const params = objectParams(file, reciterId!, keyVersion!);
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket, Key: params.Key }));
    if (head.ContentLength === size) {
      console.log(`${params.Key}: already uploaded`);
      return;
    }
  } catch (err) {
    if ((err as { name?: string }).name !== "NotFound") throw err;
  }
  await s3.send(new PutObjectCommand({ Bucket, ...params, Body: readFileSync(file), ContentLength: size }));
  console.log(`${params.Key}: uploaded ${size} bytes`);
}

const queue = Array.from({ length: 114 }, (_, i) => i + 1);
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (let s = queue.shift(); s !== undefined; s = queue.shift()) await one(s);
  }),
);
console.log("all 114 files are on R2");
