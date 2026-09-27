import type { AudioLike } from "./sync/runtime";

type Unlockable = Pick<AudioLike, "src" | "play" | "pause">;

function silentWav(samples = 800, rate = 8000): string {
  const dataSize = samples; // 8-bit mono
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  const ascii = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true); // byte rate
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, dataSize, true);
  bytes.fill(128, 44); // 8-bit PCM silence
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

/** 0.1 s of silence. */
export const SILENT_WAV = silentWav();

export interface AudioPool<T extends Unlockable> {
  readonly elements: readonly T[];
  /**
   * Call synchronously inside the Join click handler. iOS Safari only lets an
   * element play programmatically after it has been played in a user gesture,
   * and the real audio starts ~1 s later (after connect + clock sync).
   */
  unlock(): void;
  /** Hands out the pooled elements in turn; pass as the session's `createAudio`. */
  createAudio(): T;
}

export function createAudioPool<T extends Unlockable>(size: number, make: () => T): AudioPool<T> {
  const elements: T[] = [];
  let next = 0;
  const ensure = () => {
    while (elements.length < size) elements.push(make());
  };
  return {
    get elements() {
      return elements;
    },
    unlock() {
      ensure();
      for (const el of elements) {
        el.src = SILENT_WAV;
        const stop = () => {
          if (el.src === SILENT_WAV) el.pause();
        };
        try {
          const p = el.play();
          if (p) p.then(stop, () => undefined);
          else stop();
        } catch {
          /* not unlocked; the engine reports the failure when it plays for real */
        }
      }
    },
    createAudio() {
      ensure();
      const el = elements[next % size]!;
      next++;
      return el;
    },
  };
}
