import { beforeEach, describe, expect, it } from "vitest";
import { createListeningStore, initialListeningState, useListeningStore } from "./store";

describe("listening store", () => {
  let store: ReturnType<typeof createListeningStore>;
  beforeEach(() => {
    store = createListeningStore();
  });

  it("starts idle, approximate and unsynced", () => {
    expect(store.getState()).toMatchObject({
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
    });
    expect(initialListeningState.status).toBe("idle");
  });

  it("sets status and anon", () => {
    store.getState().setStatus("syncing");
    store.getState().setAnon(true);
    expect(store.getState().status).toBe("syncing");
    expect(store.getState().anon).toBe(true);
  });

  it("merges a tick without touching other fields", () => {
    store.getState().setStatus("playing");
    store.getState().setTick({ trackIndex: 2, posInTrackMs: 1234, ayah: 5 });
    store.getState().setTick({ errMs: 12, rate: 0.99, approximate: false, offsetMs: 5000, rttMs: 80 });
    expect(store.getState()).toMatchObject({
      status: "playing",
      trackIndex: 2,
      posInTrackMs: 1234,
      ayah: 5,
      errMs: 12,
      rate: 0.99,
      approximate: false,
      offsetMs: 5000,
      rttMs: 80,
    });
  });

  it("setError records the message and switches to error; null clears it", () => {
    store.getState().setError("Audio could not start");
    expect(store.getState()).toMatchObject({ status: "error", error: "Audio could not start" });
    store.getState().setError(null);
    expect(store.getState().error).toBeNull();
  });

  it("reset returns to the initial state but keeps the anonymous preference", () => {
    store.getState().setAnon(true);
    store.getState().setStatus("playing");
    store.getState().setTick({ trackIndex: 1, ayah: 3, errMs: 4 });
    store.getState().reset();
    expect(store.getState()).toMatchObject({ ...initialListeningState, anon: true });
  });

  it("exports a shared app store", () => {
    expect(useListeningStore.getState().status).toBe("idle");
  });
});
