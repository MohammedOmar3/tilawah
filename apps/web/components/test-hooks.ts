import { usePresenceStore } from "@/lib/data/presence";
import { useListeningStore } from "@/lib/sync";
import type { Listening } from "@/lib/use-listening";

export interface TilawahTestHooks {
  store: typeof useListeningStore;
  presence: typeof usePresenceStore;
  /** The player's audio elements (the one not paused is being heard). */
  audio: () => readonly HTMLAudioElement[];
  outputLatencyMs: () => number;
}

declare global {
  interface Window {
    __tilawah?: TilawahTestHooks;
  }
}

/** Only when built with NEXT_PUBLIC_E2E=1: lets Playwright read the stores. */
export function exposeForTests({ listening }: { listening: Listening }): void {
  window.__tilawah = {
    store: useListeningStore,
    presence: usePresenceStore,
    audio: () => listening.audioElements(),
    outputLatencyMs: () => listening.outputLatencyMs(),
  };
}
