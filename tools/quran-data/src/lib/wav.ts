/** Encode mono 16-bit PCM samples as a standard 44-byte-header RIFF/WAVE file. */
export function encodeWav(samples: Int16Array, sampleRate: number): Buffer {
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // channels
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(samples[i]!, 44 + i * 2);
  return buf;
}

export interface SynthOptions {
  durationMs: number;
  sampleRate: number;
  beepAtMs: readonly number[];
}

const HUM_HZ = 220;
const HUM_AMP = 0.05;
const TICK_HZ = 1000;
const TICK_MS = 10;
const TICK_AMP = 0.2;
const BEEP_HZ = 880;
const BEEP_MS = 150;
const BEEP_AMP = 0.5;
const FADE_MS = 5;

/**
 * Development test tone: a quiet hum, a short tick on every whole second (so two
 * devices drifting apart can be heard), and a beep at each `beepAtMs`.
 */
export function synthTrack({ durationMs, sampleRate, beepAtMs }: SynthOptions): Int16Array {
  const n = Math.round((durationMs * sampleRate) / 1000);
  const out = new Float64Array(n);
  const tau = 2 * Math.PI;

  for (let i = 0; i < n; i++) out[i] = HUM_AMP * Math.sin((tau * HUM_HZ * i) / sampleRate);

  const tickLen = Math.round((TICK_MS * sampleRate) / 1000);
  for (let sec = 0; sec * sampleRate < n; sec++) {
    const start = sec * sampleRate;
    for (let j = 0; j < tickLen && start + j < n; j++) {
      out[start + j]! += TICK_AMP * Math.sin((tau * TICK_HZ * j) / sampleRate);
    }
  }

  const beepLen = Math.round((BEEP_MS * sampleRate) / 1000);
  const fadeLen = Math.round((FADE_MS * sampleRate) / 1000);
  for (const at of beepAtMs) {
    const start = Math.round((at * sampleRate) / 1000);
    for (let j = 0; j < beepLen && start + j < n; j++) {
      if (start + j < 0) continue;
      const env = Math.min(1, j / fadeLen, (beepLen - 1 - j) / fadeLen);
      out[start + j]! += BEEP_AMP * env * Math.sin((tau * BEEP_HZ * j) / sampleRate);
    }
  }

  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, out[i]!));
    pcm[i] = Math.round(v * 32767);
  }
  return pcm;
}
