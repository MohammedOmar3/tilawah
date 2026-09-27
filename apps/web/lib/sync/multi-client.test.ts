import { Programme, Timings } from "@tilawah/contracts";
import vectors from "@tilawah/contracts/fixtures/programme-vectors.json";
import timingsExample from "@tilawah/contracts/fixtures/timings.example.json";
import { describe, expect, it } from "vitest";
import { createListeningSession } from "./session";
import { createListeningStore } from "./store";
import { FakeAudio, FakeServer, FakeTime, flushMicrotasks } from "./testing/fakes";

const programme = Programme.parse(vectors.programme);
const EPOCH = Date.parse(programme.epoch);
const timings = Timings.parse(timingsExample);

/** Unit-level "Dubai, London, Jakarta": skewed clocks, asymmetric latencies, staggered joins. */
const clients = [
  { name: "A", skewMs: -3000, upLatencyMs: 20, downLatencyMs: 20, joinAtMs: 0 },
  { name: "B", skewMs: 0, upLatencyMs: 30, downLatencyMs: 120, joinAtMs: 10_000 },
  { name: "C", skewMs: 7000, upLatencyMs: 150, downLatencyMs: 60, joinAtMs: 25_000 },
];

describe("multi-client sync", () => {
  it("keeps three listeners within 100 ms of each other", async () => {
    const time = new FakeTime(EPOCH);
    const server = new FakeServer({ time });
    const sessions = clients.map((c) => {
      const audios: FakeAudio[] = [];
      const store = createListeningStore();
      const session = createListeningSession({
        programme,
        wsUrl: "wss://api.example/v1/ws",
        anon: c.name === "B",
        loadTimings: () => Promise.resolve(timings),
        store,
        setMediaMetadata: () => undefined,
        deps: {
          WebSocket: server.socketClass({ upLatencyMs: c.upLatencyMs, downLatencyMs: c.downLatencyMs }),
          now: () => time.now() + c.skewMs,
          setTimeout: time.setTimeout,
          clearTimeout: time.clearTimeout,
          setInterval: time.setInterval,
          clearInterval: time.clearInterval,
          random: () => 0.5,
          createAudio: () => {
            const a = new FakeAudio({ time, autoReadyMs: 80, autoPlaying: true });
            audios.push(a);
            return a;
          },
          document: null,
          window: null,
        },
      });
      return { ...c, session, store, audios, current: () => audios.find((a) => !a.paused) };
    });

    const spreads: number[] = [];
    for (let t = 0; t <= 90_000; t += 500) {
      for (const s of sessions) {
        if (s.joinAtMs === t) {
          s.session.join();
          await flushMicrotasks();
        }
      }
      if (t >= 30_000 && t % 5000 === 0) {
        const tracks = sessions.map((s) => s.store.getState().trackIndex);
        if (new Set(tracks).size === 1) {
          const times = sessions.map((s) => s.current()!.currentTime * 1000);
          spreads.push(Math.max(...times) - Math.min(...times));
        }
      }
      time.advance(500);
    }

    for (const s of sessions) expect(s.store.getState().status).toBe("playing");
    const times = sessions.map((s) => s.current()!.currentTime * 1000);
    const trackIndex = sessions.map((s) => s.store.getState().trackIndex);
    expect(new Set(trackIndex).size).toBe(1);
    for (let i = 0; i < times.length; i++) {
      for (let j = i + 1; j < times.length; j++) {
        expect(Math.abs(times[i]! - times[j]!)).toBeLessThan(100);
      }
    }
    expect(spreads.length).toBeGreaterThan(5);
    expect(Math.max(...spreads)).toBeLessThan(100);
  });
});
