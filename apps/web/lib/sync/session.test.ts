import { Programme, Timings } from "@tilawah/contracts";
import vectors from "@tilawah/contracts/fixtures/programme-vectors.json";
import timingsExample from "@tilawah/contracts/fixtures/timings.example.json";
import { describe, expect, it, vi } from "vitest";
import { createListeningSession, type ListeningSessionOptions } from "./session";
import { createListeningStore, type Status } from "./store";
import { FakeAudio, FakeServer, FakeTime, flushMicrotasks } from "./testing/fakes";

const programme = Programme.parse(vectors.programme);
const EPOCH = Date.parse(programme.epoch);
const timings0 = Timings.parse(timingsExample);
const genericTimings = (surah: number) =>
  Timings.parse({
    surah,
    reciter: "dev-tone",
    segments: [
      { ayah: 1, startMs: 0, endMs: 10_000 },
      { ayah: 2, startMs: 10_000, endMs: 60_000 },
    ],
  });

interface SetupOptions {
  /** True (server) programme position when the test starts. */
  startOffsetMs?: number;
  /** Client clock − server clock. */
  skewMs?: number;
  upLatencyMs?: number;
  downLatencyMs?: number;
  extra?: Partial<ListeningSessionOptions>;
}

function setup(o: SetupOptions = {}) {
  const time = new FakeTime(EPOCH + (o.startOffsetMs ?? 1000));
  const server = new FakeServer({ time, upLatencyMs: o.upLatencyMs ?? 20, downLatencyMs: o.downLatencyMs ?? 20 });
  const skew = o.skewMs ?? 0;
  const store = createListeningStore();
  const statuses: Status[] = [];
  store.subscribe((s, prev) => {
    if (s.status !== prev.status) statuses.push(s.status);
  });
  const audios: FakeAudio[] = [];
  let firstPlayingAt: number | null = null;
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const win = new EventTarget();
  const loadTimings = vi.fn((url: string) =>
    Promise.resolve(url.endsWith("/001.json") ? timings0 : genericTimings(Number(url.slice(-8, -5)))),
  );
  const onProgrammeChanged = vi.fn();
  const setMediaMetadata = vi.fn();
  const session = createListeningSession({
    programme,
    wsUrl: "wss://api.example/v1/ws",
    anon: false,
    loadTimings,
    rateMax: 0.02,
    onProgrammeChanged,
    setMediaMetadata,
    surahName: (n) => `Surah ${n}`,
    store,
    deps: {
      WebSocket: server.WebSocket,
      now: () => time.now() + skew,
      setTimeout: time.setTimeout,
      clearTimeout: time.clearTimeout,
      setInterval: time.setInterval,
      clearInterval: time.clearInterval,
      random: () => 1,
      createAudio: () => {
        const a = new FakeAudio({ time, autoReadyMs: 50, autoPlaying: true });
        a.addEventListener("playing", () => (firstPlayingAt ??= time.now()));
        audios.push(a);
        return a;
      },
      document: doc,
      window: win,
    },
    ...o.extra,
  });
  const current = () => audios.find((a) => !a.paused)!;
  return {
    time,
    server,
    store,
    statuses,
    audios,
    doc,
    win,
    loadTimings,
    onProgrammeChanged,
    setMediaMetadata,
    session,
    current,
    playingAt: () => firstPlayingAt,
  };
}

type Ctx = ReturnType<typeof setup>;

async function joined(o: SetupOptions = {}): Promise<Ctx> {
  const c = setup(o);
  c.session.join();
  await flushMicrotasks();
  c.time.advance(2000);
  return c;
}

describe("createListeningSession", () => {
  it("joins: connecting → syncing → playing, with state sent only after audio plays", async () => {
    const c = await joined();
    expect(c.statuses).toEqual(["connecting", "syncing", "playing"]);
    expect(c.store.getState().status).toBe("playing");
    const types = c.server.received.map((r) => r.msg.t);
    expect(types).toEqual(["hello", ...Array(8).fill("ping"), "state"]);
    const state = c.server.received.at(-1)!;
    expect(state.msg).toEqual({ t: "state", playing: true });
    expect(c.playingAt()).not.toBeNull();
    expect(state.at).toBeGreaterThanOrEqual(c.playingAt()!);
    expect(c.store.getState().approximate).toBe(false);
    expect(c.store.getState().rttMs).toBe(40);
  });

  it("follows the ayah from the programme clock within one UI tick of a boundary", async () => {
    const c = await joined({ startOffsetMs: 1000 });
    // Ayah 1 starts at 4200 ms into track 0.
    c.time.advance(EPOCH + 4199 - c.time.now());
    expect(c.store.getState().ayah).toBe(0);
    c.time.advance(250);
    expect(c.store.getState().ayah).toBe(1);
    expect(c.store.getState().trackIndex).toBe(0);
    expect(Math.abs(c.store.getState().posInTrackMs - 4449)).toBeLessThanOrEqual(250);
  });

  it("shows the same position regardless of the local clock's skew", async () => {
    const c = await joined({ startOffsetMs: 1000, skewMs: 7000 });
    c.time.advance(EPOCH + 9500 - c.time.now());
    expect(c.store.getState().ayah).toBe(2);
    expect(Math.abs(c.store.getState().posInTrackMs - 9500)).toBeLessThanOrEqual(250);
  });

  it("resyncs and corrects immediately when the page becomes visible or the network returns", async () => {
    const c = await joined();
    const pings = () => c.server.of("ping").length;
    const a = c.current();
    const seeks = a.seeks.length;
    a.currentTimeValue += 2;
    c.doc.visibilityState = "visible";
    c.doc.dispatchEvent(new Event("visibilitychange"));
    expect(a.seeks.length).toBe(seeks + 1);
    c.time.advance(500);
    expect(pings()).toBe(11);
    a.currentTimeValue += 2;
    c.win.dispatchEvent(new Event("online"));
    expect(a.seeks.length).toBe(seeks + 2);
    c.time.advance(500);
    expect(pings()).toBe(14);
    c.doc.visibilityState = "hidden";
    c.doc.dispatchEvent(new Event("visibilitychange"));
    c.time.advance(500);
    expect(pings()).toBe(14);
  });

  it("reconnects at once, without waiting out the backoff, when the network returns", async () => {
    const c = await joined();
    c.server.refuse(1);
    c.server.drop();
    c.time.advance(20); // attempt 0 → 1000 ms
    c.time.advance(1100); // refused; attempt 1 → 2000 ms
    expect(c.server.connectionCount).toBe(2);
    expect(c.store.getState().status).toBe("reconnecting");
    c.win.dispatchEvent(new Event("online"));
    expect(c.server.connectionCount).toBe(3);
    c.time.advance(500);
    expect(c.store.getState().status).toBe("playing");
    expect(c.server.connectionCount).toBe(3);
  });

  it("keeps audio playing through a reconnect", async () => {
    const c = await joined();
    const a = c.current();
    const pauses = a.pauseCalls;
    c.server.drop();
    c.time.advance(20);
    expect(c.store.getState().status).toBe("reconnecting");
    c.time.advance(1000 + 500);
    expect(c.store.getState().status).toBe("playing");
    expect(a.pauseCalls).toBe(pauses);
    expect(a.paused).toBe(false);
    const second = c.server.received.filter((r) => r.connection === 2).map((r) => r.msg);
    expect(second[0]?.t).toBe("hello");
    expect(second[1]).toEqual({ t: "state", playing: true });
    expect(c.statuses).toEqual(["connecting", "syncing", "playing", "reconnecting", "playing"]);
  });

  it("reports a programme change and fetches nothing itself", async () => {
    const c = await joined();
    const loads = c.loadTimings.mock.calls.length;
    c.server.send({ t: "programme", version: "vectors.2" });
    c.time.advance(100);
    expect(c.onProgrammeChanged).toHaveBeenCalledWith("vectors.2");
    expect(c.loadTimings.mock.calls.length).toBe(loads);
  });

  it("sends one stat a minute with rtt, offset and the mean |err|", async () => {
    const c = await joined({ skewMs: -3000 });
    c.current().currentTimeValue += 0.2;
    c.time.advance(60_000);
    const stats = c.server.of("stat");
    expect(stats).toHaveLength(1);
    expect(stats[0]!.rttMs).toBe(40);
    expect(stats[0]!.offsetMs).toBe(3000);
    expect(stats[0]!.errMs).toBeGreaterThan(20);
    expect(stats[0]!.errMs).toBeLessThan(200);
    c.time.advance(60_000);
    expect(c.server.of("stat")).toHaveLength(2);
    expect(c.server.of("stat")[1]!.errMs).toBeLessThan(40);
  });

  it("leave() sends state false, closes the socket, stops audio and resets the store", async () => {
    const c = await joined();
    c.session.leave();
    c.time.advance(100);
    expect(c.server.of("state").at(-1)).toEqual({ t: "state", playing: false });
    expect(c.server.openConnections).toBe(0);
    expect(c.audios.every((a) => a.paused)).toBe(true);
    expect(c.store.getState().status).toBe("idle");
    const n = c.server.received.length;
    c.time.advance(10 * 60_000);
    expect(c.server.received.length).toBe(n);
    expect(c.server.connectionCount).toBe(1);
    expect(c.time.pending).toBe(0);
  });

  it("sets Media Session metadata on each track change", async () => {
    const c = await joined({ startOffsetMs: 55_000 });
    expect(c.setMediaMetadata).toHaveBeenLastCalledWith({ title: "Surah 1", artist: "Development tone" });
    c.time.advance(5000);
    expect(c.setMediaMetadata).toHaveBeenLastCalledWith({ title: "Surah 2", artist: "Development tone" });
    expect(c.setMediaMetadata).toHaveBeenCalledTimes(2);
  });

  it("loads timings for the current and next track through loadTimings, once each", async () => {
    const c = await joined({ startOffsetMs: 40_000 });
    c.time.advance(25_000);
    const urls = c.loadTimings.mock.calls.map(([u]) => u);
    expect(urls).toEqual(["/data/timings/dev-tone/001.json", "/data/timings/dev-tone/002.json"]);
  });

  it("starts on the local clock, flagged approximate, when the server is unreachable", async () => {
    const c = setup();
    c.server.refuse(1000);
    c.session.join();
    await flushMicrotasks();
    c.time.advance(6000);
    expect(c.current()).toBeDefined();
    expect(c.store.getState()).toMatchObject({ status: "reconnecting", approximate: true });
  });
});
