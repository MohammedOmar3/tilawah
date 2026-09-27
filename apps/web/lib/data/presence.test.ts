import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPresencePoller, createPresenceStore, MAX_BACKOFF_MS, type PresenceStoreApi } from "./presence";

const URL_ = "http://api.test/v1/presence.json";
const snapshot = (listeners: number) => ({
  v: 1,
  generatedAt: "2026-09-27T16:00:00Z",
  listeners,
  countries: 2,
  cells: [{ lat: 25.5, lng: 55.5, n: listeners }],
  joins: [],
});

class FakeDocument extends EventTarget {
  visibilityState: "visible" | "hidden" = "visible";
  setVisibility(v: "visible" | "hidden") {
    this.visibilityState = v;
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

type Reply = unknown | Error | { status: number };

describe("presence poller", () => {
  let replies: Reply[];
  let fetchFn: ReturnType<typeof vi.fn>;
  let doc: FakeDocument;
  let store: PresenceStoreApi;
  let random: number;

  const poller = (intervalMs = 1000) =>
    createPresencePoller({
      apiUrl: "http://api.test",
      intervalMs,
      store,
      fetch: fetchFn as unknown as typeof fetch,
      document: doc,
      random: () => random,
    });

  beforeEach(() => {
    vi.useFakeTimers();
    replies = [];
    let last: Reply = snapshot(1);
    fetchFn = vi.fn(async () => {
      const r = replies.length ? replies.shift() : last;
      last = r;
      if (r instanceof Error) throw r;
      if (r && typeof r === "object" && "status" in r) return new Response("", { status: (r as { status: number }).status });
      return new Response(JSON.stringify(r), { status: 200 });
    });
    doc = new FakeDocument();
    store = createPresenceStore();
    random = 0;
  });

  afterEach(() => vi.useRealTimers());

  it("polls immediately, then every interval plus up to 20% jitter", async () => {
    random = 1;
    const p = poller(1000);
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(URL_);
    expect(store.getState().presence?.listeners).toBe(1);

    await vi.advanceTimersByTimeAsync(1199);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    p.stop();
  });

  it("stops while hidden and fetches immediately on becoming visible", async () => {
    const p = poller(1000);
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    doc.setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    replies.push(snapshot(7));
    doc.setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(store.getState().presence?.listeners).toBe(7);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    p.stop();
  });

  it("does not poll when started hidden", async () => {
    doc.visibilityState = "hidden";
    const p = poller();
    p.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchFn).not.toHaveBeenCalled();
    p.stop();
  });

  it("keeps the last good snapshot on failure, backs off and marks stale after 2 failures", async () => {
    replies.push(snapshot(5), { status: 500 }, { nope: true }, new Error("offline"));
    const p = poller(1000);
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState()).toMatchObject({ stale: false });

    await vi.advanceTimersByTimeAsync(1000); // fails: HTTP 500
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(store.getState().presence?.listeners).toBe(5);
    expect(store.getState().stale).toBe(false);

    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1); // fails: invalid shape
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(store.getState().stale).toBe(true);
    expect(store.getState().presence?.listeners).toBe(5);

    await vi.advanceTimersByTimeAsync(4000); // fails: network error
    expect(fetchFn).toHaveBeenCalledTimes(4);

    replies.push(snapshot(9));
    await vi.advanceTimersByTimeAsync(8000); // succeeds
    expect(fetchFn).toHaveBeenCalledTimes(5);
    expect(store.getState()).toMatchObject({ stale: false, presence: { listeners: 9 } });

    await vi.advanceTimersByTimeAsync(1000); // back to the normal interval
    expect(fetchFn).toHaveBeenCalledTimes(6);
    p.stop();
  });

  it("caps the backoff at 60 s", async () => {
    const p = poller(20_000);
    replies.push(new Error("a"), new Error("b"), new Error("c"), new Error("d"));
    p.start();
    await vi.advanceTimersByTimeAsync(0); // fail 1 → 40 s
    await vi.advanceTimersByTimeAsync(40_000); // fail 2 → 60 s (capped from 80 s)
    expect(fetchFn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(MAX_BACKOFF_MS - 1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    p.stop();
  });

  it("stop() cancels polling and listeners", async () => {
    const p = poller();
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    p.stop();
    doc.setVisibility("hidden");
    doc.setVisibility("visible");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
