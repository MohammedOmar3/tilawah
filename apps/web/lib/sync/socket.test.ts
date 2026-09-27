import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClockSync } from "./clock-sync";
import { SyncSocket, type SyncSocketOptions } from "./socket";
import { FakeServer, FakeTime } from "./testing/fakes";

const T0 = 1_788_220_800_000;

function setup(server: Partial<ConstructorParameters<typeof FakeServer>[0]> = {}, extra: Partial<SyncSocketOptions> = {}) {
  const time = new FakeTime(T0);
  const srv = new FakeServer({ time, ...server });
  const clockSync = new ClockSync();
  const onWelcome = vi.fn();
  const onSync = vi.fn();
  const onDisconnect = vi.fn();
  const onProgrammeChanged = vi.fn();
  const sock = new SyncSocket({
    url: "wss://api.example/v1/ws",
    anon: false,
    programmeVersion: "vectors.1",
    clockSync,
    onWelcome,
    onSync,
    onDisconnect,
    onProgrammeChanged,
    deps: {
      WebSocket: srv.WebSocket,
      now: time.now,
      setTimeout: time.setTimeout,
      clearTimeout: time.clearTimeout,
      setInterval: time.setInterval,
      clearInterval: time.clearInterval,
      random: () => 1,
    },
    ...extra,
  });
  return { time, server: srv, clockSync, sock, onWelcome, onSync, onDisconnect, onProgrammeChanged };
}

type Ctx = ReturnType<typeof setup>;
const types = (c: Ctx, from = 0) => c.server.received.slice(from).map((r) => r.msg.t);

describe("SyncSocket", () => {
  let c: Ctx;
  beforeEach(() => {
    c = setup({ upLatencyMs: 30, downLatencyMs: 70, serverOffsetMs: 5000 });
  });

  it("sends hello first and reports the welcome", () => {
    c.sock.connect();
    c.time.advance(500);
    expect(c.server.urls).toEqual(["wss://api.example/v1/ws"]);
    expect(c.server.received[0]?.msg).toEqual({ t: "hello", v: 1, anon: false, programme: "vectors.1" });
    expect(c.onWelcome).toHaveBeenCalledWith("vectors.1");
    expect(c.sock.connected).toBe(true);
  });

  it("runs an 8-ping burst 100 ms apart after welcome and estimates the offset", () => {
    c.sock.connect();
    c.time.advance(3000);
    const pings = c.server.received.filter((r) => r.msg.t === "ping");
    expect(pings).toHaveLength(8);
    expect(pings.map((p) => p.at - pings[0]!.at)).toEqual([0, 100, 200, 300, 400, 500, 600, 700]);
    expect(new Set(pings.map((p) => (p.msg.t === "ping" ? p.msg.id : -1))).size).toBe(8);
    expect(c.clockSync.synced).toBe(true);
    expect(Math.abs(c.clockSync.offsetMs - 5000)).toBeLessThanOrEqual(20);
    expect(c.clockSync.rttMs).toBe(100);
    expect(c.onSync).toHaveBeenCalledTimes(1);
  });

  it("resync() sends a 3-ping burst, and one runs every 5 minutes", () => {
    c.sock.connect();
    c.time.advance(3000);
    expect(c.server.of("ping")).toHaveLength(8);
    c.sock.resync();
    c.time.advance(1000);
    expect(c.server.of("ping")).toHaveLength(11);
    expect(c.onSync).toHaveBeenCalledTimes(2);
    c.time.advance(5 * 60_000);
    expect(c.server.of("ping")).toHaveLength(14);
  });

  it("ignores resync() while a burst is running", () => {
    c.sock.connect();
    c.time.advance(250);
    c.sock.resync();
    c.time.advance(3000);
    expect(c.server.of("ping")).toHaveLength(8);
  });

  it("sends hb every 45 s and nothing else while idle", () => {
    c.sock.connect();
    c.time.advance(3000);
    const after = c.server.received.length;
    c.time.advance(97_000); // to t = 100 s
    expect(types(c, after)).toEqual(["hb", "hb"]);
  });

  it("sends state only when it changes", () => {
    c.sock.connect();
    c.time.advance(3000);
    c.sock.setPlaying(true);
    c.sock.setPlaying(true);
    c.time.advance(1000);
    expect(c.server.of("state")).toEqual([{ t: "state", playing: true }]);
    c.sock.setPlaying(false);
    c.time.advance(1000);
    expect(c.server.of("state")).toHaveLength(2);
  });

  it("sends state set before the socket opened once it opens", () => {
    c.sock.setPlaying(true);
    c.sock.connect();
    c.time.advance(3000);
    expect(types(c).slice(0, 2)).toEqual(["hello", "state"]);
  });

  it("reconnects with backoff after a drop and restores hello, state and the burst", () => {
    c.sock.connect();
    c.time.advance(3000);
    c.sock.setPlaying(true);
    c.time.advance(1000);
    const before = c.server.received.length;
    c.server.drop();
    c.time.advance(70); // close reaches the client
    expect(c.onDisconnect).toHaveBeenCalledTimes(1);
    expect(c.sock.connected).toBe(false);
    c.time.advance(999);
    expect(c.server.connectionCount).toBe(1);
    c.time.advance(1);
    expect(c.server.connectionCount).toBe(2);
    c.time.advance(3000);
    const again = c.server.received.slice(before);
    expect(again.every((r) => r.connection === 2)).toBe(true);
    expect(again.map((r) => r.msg.t)).toEqual(["hello", "state", ...Array(8).fill("ping")]);
    expect(again[1]?.msg).toEqual({ t: "state", playing: true });
    expect(c.onWelcome).toHaveBeenCalledTimes(2);
    expect(c.onSync).toHaveBeenCalledTimes(2);
  });

  it("grows the backoff while refused and resets it after a welcome", () => {
    c.sock.connect();
    c.time.advance(3000);
    c.server.refuse(2);
    c.server.drop();
    c.time.advance(70); // disconnect seen; attempt 0 → 1000 ms
    c.time.advance(1000);
    expect(c.server.connectionCount).toBe(2); // refused after 100 ms handshake
    c.time.advance(100); // attempt 1 → 2000 ms
    c.time.advance(1999);
    expect(c.server.connectionCount).toBe(2);
    c.time.advance(1);
    expect(c.server.connectionCount).toBe(3); // refused again
    c.time.advance(100); // attempt 2 → 4000 ms
    c.time.advance(4000);
    expect(c.server.connectionCount).toBe(4);
    c.time.advance(3000);
    expect(c.sock.connected).toBe(true);
    c.server.drop();
    c.time.advance(70);
    c.time.advance(1000); // back to attempt 0
    expect(c.server.connectionCount).toBe(5);
  });

  it("reports a programme change", () => {
    c.sock.connect();
    c.time.advance(3000);
    c.server.send({ t: "programme", version: "vectors.2" });
    c.time.advance(100);
    expect(c.onProgrammeChanged).toHaveBeenCalledWith("vectors.2");
  });

  it("reports a programme change the server sends after welcome", () => {
    c.server.programmeVersion = "vectors.2";
    c.sock.connect();
    c.time.advance(3000);
    expect(c.onProgrammeChanged).toHaveBeenCalledWith("vectors.2");
  });

  it("ignores invalid server messages", () => {
    c.sock.connect();
    c.time.advance(3000);
    c.server.send("not json");
    c.server.send(JSON.stringify({ t: "bogus" }));
    c.server.send(JSON.stringify({ t: "pong", id: "x" }));
    c.server.send(JSON.stringify({ t: "pong", id: 999, c: 1, s: 1 }));
    expect(() => c.time.advance(1000)).not.toThrow();
    expect(c.onProgrammeChanged).not.toHaveBeenCalled();
    c.sock.resync();
    c.time.advance(1000);
    expect(c.onSync).toHaveBeenCalledTimes(2);
  });

  it("close() stops timers and never reconnects", () => {
    c.sock.connect();
    c.time.advance(3000);
    c.sock.close();
    const count = c.server.received.length;
    c.time.advance(60 * 60_000);
    expect(c.server.received.length).toBe(count);
    expect(c.server.connectionCount).toBe(1);
    expect(c.onDisconnect).not.toHaveBeenCalled();
    expect(c.time.pending).toBe(0);
  });

  it("close() during a backoff cancels the reconnect", () => {
    c.sock.connect();
    c.time.advance(3000);
    c.server.drop();
    c.time.advance(100);
    c.sock.close();
    c.time.advance(60_000);
    expect(c.server.connectionCount).toBe(1);
  });

  it("reconnectNow() during a backoff connects at once and resets the backoff", () => {
    c.sock.connect();
    c.time.advance(3000);
    c.server.refuse(3);
    c.server.drop();
    c.time.advance(70); // attempt 0 → 1000 ms
    c.time.advance(1100); // refused; attempt 1 → 2000 ms
    c.time.advance(2100); // refused; attempt 2 → 4000 ms pending
    expect(c.server.connectionCount).toBe(3);
    c.sock.reconnectNow();
    expect(c.server.connectionCount).toBe(4); // refused once more; attempt 0 → 1000 ms
    c.time.advance(100 + 1000);
    expect(c.server.connectionCount).toBe(5);
    c.time.advance(3000);
    expect(c.sock.connected).toBe(true);
    c.time.advance(10_000);
    expect(c.server.connectionCount).toBe(5);
  });

  it("reconnectNow() on an open socket runs a resync burst and opens nothing", () => {
    c.sock.connect();
    c.time.advance(3000);
    const before = c.server.received.length;
    c.sock.reconnectNow();
    c.time.advance(1000);
    expect(types(c, before)).toEqual(["ping", "ping", "ping"]);
    expect(c.server.connectionCount).toBe(1);
  });

  it("reconnectNow() while connecting or after close() does nothing", () => {
    c.sock.connect();
    c.sock.reconnectNow();
    expect(c.server.connectionCount).toBe(1);
    c.time.advance(3000);
    c.sock.close();
    c.sock.reconnectNow();
    c.time.advance(60_000);
    expect(c.server.connectionCount).toBe(1);
  });

  it("sendStat() sends a stat message", () => {
    c.sock.connect();
    c.time.advance(3000);
    c.sock.sendStat({ rttMs: 100, offsetMs: 4980, errMs: 12 });
    c.time.advance(100);
    expect(c.server.of("stat")).toEqual([{ t: "stat", rttMs: 100, offsetMs: 4980, errMs: 12 }]);
  });

  it("accepts a partial burst with at least 3 samples after 3 s", () => {
    let replies = 0;
    c.server.replyFilter = (m) => m.t !== "ping" || ++replies <= 3;
    c.sock.connect(); // welcome arrives at 200 ms, burst times out at 3200 ms
    c.time.advance(3100);
    expect(c.clockSync.synced).toBe(false);
    c.time.advance(200);
    expect(c.clockSync.synced).toBe(true);
    expect(Math.abs(c.clockSync.offsetMs - 5000)).toBeLessThanOrEqual(20);
  });

  it("rejects a burst with fewer than 3 samples", () => {
    let replies = 0;
    c.server.replyFilter = (m) => m.t !== "ping" || ++replies <= 2;
    c.sock.connect();
    c.time.advance(5000);
    expect(c.clockSync.synced).toBe(false);
    expect(c.onSync).not.toHaveBeenCalled();
  });

  it("cancels a burst when the connection drops", () => {
    c.sock.connect();
    c.time.advance(420); // three pings sent
    c.server.refuse(10);
    c.server.drop();
    c.time.advance(3000);
    expect(c.clockSync.synced).toBe(false);
  });
});
