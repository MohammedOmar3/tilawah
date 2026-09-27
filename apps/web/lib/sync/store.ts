import { create } from "zustand";

export type Status = "idle" | "connecting" | "syncing" | "playing" | "reconnecting" | "error";

export interface ListeningState {
  status: Status;
  anon: boolean;
  trackIndex: number;
  posInTrackMs: number;
  ayah: number;
  /** True until the first clock sync. */
  approximate: boolean;
  offsetMs: number | null;
  rttMs: number | null;
  errMs: number | null;
  rate: number;
  error: string | null;
}

export type ListeningTick = Partial<
  Pick<ListeningState, "trackIndex" | "posInTrackMs" | "ayah" | "approximate" | "offsetMs" | "rttMs" | "errMs" | "rate">
>;

export interface ListeningActions {
  setStatus(status: Status): void;
  setAnon(anon: boolean): void;
  setTick(tick: ListeningTick): void;
  /** A message sets status "error"; null only clears the message. */
  setError(error: string | null): void;
  /** Back to the initial state; the anonymous preference is kept. */
  reset(): void;
}

export type ListeningStore = ListeningState & ListeningActions;

export const initialListeningState: ListeningState = {
  status: "idle",
  anon: false,
  trackIndex: 0,
  posInTrackMs: 0,
  ayah: 0,
  approximate: true,
  offsetMs: null,
  rttMs: null,
  errMs: null,
  rate: 1,
  error: null,
};

export function createListeningStore() {
  return create<ListeningStore>()((set) => ({
    ...initialListeningState,
    setStatus: (status) => set({ status }),
    setAnon: (anon) => set({ anon }),
    setTick: (tick) => set(tick),
    setError: (error) => set(error === null ? { error } : { error, status: "error" }),
    reset: () => set((s) => ({ ...initialListeningState, anon: s.anon })),
  }));
}

export type ListeningStoreApi = ReturnType<typeof createListeningStore>;

/** The store the UI reads (plan 05). */
export const useListeningStore = createListeningStore();
