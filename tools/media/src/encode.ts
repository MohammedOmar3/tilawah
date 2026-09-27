import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export function ffmpegArgs(input: string, output: string): string[] {
  return ["-y", "-i", input, "-vn", "-ac", "1", "-ar", "44100", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", output];
}

export function parseFfprobeDurationMs(stdout: string): number {
  const seconds = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`cannot parse ffprobe duration: ${JSON.stringify(stdout)}`);
  return Math.round(seconds * 1000);
}

export async function encode(input: string, output: string): Promise<void> {
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", ...ffmpegArgs(input, output)]);
}

export async function probeDurationMs(file: string): Promise<number> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return parseFfprobeDurationMs(stdout);
}
