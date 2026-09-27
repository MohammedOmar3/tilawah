import path from "node:path";

export function objectParams(file: string, reciterId: string, keyVersion: string) {
  return {
    Key: `${reciterId}/${keyVersion}/${path.basename(file)}`,
    ContentType: "audio/mp4",
    CacheControl: "public, max-age=31536000, immutable",
  };
}
