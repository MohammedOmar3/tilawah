/**
 * Test-only fakes for the sync engine. Everything runs in simulated time
 * driven by `FakeTime.advance`; nothing here touches real timers or sockets.
 */
import { ClientMessage, type ServerMessage } from "@tilawah/contracts";
import type { AudioLike, TimerId, Timers, WebSocketCtor, WebSocketLike } from "../runtime";

interface FakeTimer {
  id: number;
  due: number;
  seq: number;
  fn: () => void;
  every: number | null;
}

export class FakeTime implements Timers {
  private current: number;
  private timers = new Map<number, FakeTimer>();
  private nextId = 1;
  private nextSeq = 1;
  private hooks: Array<(dtMs: number) => void> = [];

  constructor(startMs = 0) {
    this.current = startMs;
  }

  now = (): number => this.current;

  /** Called with the elapsed ms whenever simulated time moves forward. */
  onAdvance(hook: (dtMs: number) => void): void {
    this.hooks.push(hook);
  }

  advance(ms: number): void {
    const end = this.current + ms;
    for (;;) {
      const t = this.earliestDue(end);
      if (!t) break;
      this.moveTo(t.due);
      if (t.every === null) this.timers.delete(t.id);
      else {
        t.due += t.every;
        t.seq = this.nextSeq++;
      }
      t.fn();
    }
    this.moveTo(end);
  }

  /** Number of pending timers (useful to assert everything was cleared). */
  get pending(): number {
    return this.timers.size;
  }

  setTimeout = (fn: () => void, ms: number): TimerId => this.add(fn, ms, null);
  setInterval = (fn: () => void, ms: number): TimerId => this.add(fn, ms, Math.max(1, ms));
  clearTimeout = (id: TimerId): void => {
    this.timers.delete(id as number);
  };
  clearInterval = (id: TimerId): void => {
    this.timers.delete(id as number);
  };

  private add(fn: () => void, ms: number, every: number | null): number {
    const id = this.nextId++;
    this.timers.set(id, { id, due: this.current + Math.max(0, ms), seq: this.nextSeq++, fn, every });
    return id;
  }

  private earliestDue(limit: number): FakeTimer | undefined {
    let best: FakeTimer | undefined;
    for (const t of this.timers.values()) {
      if (t.due > limit) continue;
      if (!best || t.due < best.due || (t.due === best.due && t.seq < best.seq)) best = t;
    }
    return best;
  }

  private moveTo(x: number): void {
    const dt = x - this.current;
    if (dt <= 0) return;
    this.current = x;
    for (const h of this.hooks) h(dt);
  }
}

export interface Received {
  connection: number;
  msg: ClientMessage;
  /** Simulated (true) time at which the server received it. */
  at: number;
}

interface Latency {
  upLatencyMs: number;
  downLatencyMs: number;
}

interface Connection {
  id: number;
  ws: FakeWebSocket;
  alive: boolean;
  latency: Latency;
}

export class FakeWebSocket implements WebSocketLike {
  readyState = 0;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  readonly sent: string[] = [];
  /** Set by FakeServer; delivers a client frame to the server. */
  transmit: ((data: string) => void) | null = null;
  /** Set by FakeServer; tells the server the client closed. */
  hangUp: (() => void) | null = null;

  constructor(readonly url: string) {}

  send(data: string): void {
    if (this.readyState !== 1) throw new Error("FakeWebSocket: send while not open");
    this.sent.push(data);
    this.transmit?.(data);
  }

  close(): void {
    if (this.readyState >= 2) return;
    this.readyState = 3;
    this.hangUp?.();
    this.onclose?.({ code: 1000 });
  }
}

export interface FakeServerOptions extends Partial<Latency> {
  time: FakeTime;
  /** Server clock − true (simulated) clock. */
  serverOffsetMs?: number;
  /** Version the server announces; null echoes the client's version. */
  programmeVersion?: string | null;
}

export class FakeServer {
  serverOffsetMs: number;
  upLatencyMs: number;
  downLatencyMs: number;
  programmeVersion: string | null;
  /** Return false to swallow the server's reply to a message (simulated loss). */
  replyFilter: ((msg: ClientMessage) => boolean) | null = null;
  readonly received: Received[] = [];
  readonly urls: string[] = [];
  private readonly time: FakeTime;
  private connections: Connection[] = [];
  private refusals = 0;
  private nextConn = 1;

  constructor(opts: FakeServerOptions) {
    this.time = opts.time;
    this.serverOffsetMs = opts.serverOffsetMs ?? 0;
    this.upLatencyMs = opts.upLatencyMs ?? 0;
    this.downLatencyMs = opts.downLatencyMs ?? 0;
    this.programmeVersion = opts.programmeVersion ?? null;
  }

  /** A WebSocket class using the server's default latencies. */
  get WebSocket(): WebSocketCtor {
    return this.socketClass();
  }

  /** A WebSocket class with its own latencies (one per simulated client). */
  socketClass(latency?: Partial<Latency>): WebSocketCtor {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const server = this;
    return class extends FakeWebSocket {
      constructor(url: string) {
        super(url);
        server.accept(this, {
          upLatencyMs: latency?.upLatencyMs ?? server.upLatencyMs,
          downLatencyMs: latency?.downLatencyMs ?? server.downLatencyMs,
        });
      }
    };
  }

  /** Messages of one type, in arrival order. */
  of<T extends ClientMessage["t"]>(t: T): Array<Extract<ClientMessage, { t: T }>> {
    return this.received.map((r) => r.msg).filter((m): m is Extract<ClientMessage, { t: T }> => m.t === t);
  }

  get openConnections(): number {
    return this.connections.filter((c) => c.alive && c.ws.readyState === 1).length;
  }

  get connectionCount(): number {
    return this.nextConn - 1;
  }

  /** Refuse the next n connection attempts. */
  refuse(n: number): void {
    this.refusals += n;
  }

  /** Server-side close of every live connection. */
  drop(): void {
    for (const c of this.connections) {
      if (!c.alive) continue;
      c.alive = false;
      this.time.setTimeout(() => {
        if (c.ws.readyState === 3) return;
        c.ws.readyState = 3;
        c.ws.onclose?.({ code: 1006 });
      }, c.latency.downLatencyMs);
    }
    this.connections = [];
  }

  /** Push a message (or a raw frame) to every live connection. */
  send(msg: ServerMessage | string): void {
    const data = typeof msg === "string" ? msg : JSON.stringify(msg);
    for (const c of this.connections) this.deliver(c, data);
  }

  private accept(ws: FakeWebSocket, latency: Latency): void {
    const conn: Connection = { id: this.nextConn++, ws, alive: true, latency };
    this.urls.push(ws.url);
    const handshake = latency.upLatencyMs + latency.downLatencyMs;
    if (this.refusals > 0) {
      this.refusals--;
      conn.alive = false;
      this.time.setTimeout(() => {
        ws.readyState = 3;
        ws.onerror?.({});
        ws.onclose?.({ code: 1006 });
      }, handshake);
      return;
    }
    this.connections.push(conn);
    ws.transmit = (data) => {
      this.time.setTimeout(() => {
        if (conn.alive) this.receive(conn, data);
      }, latency.upLatencyMs);
    };
    ws.hangUp = () => {
      this.time.setTimeout(() => {
        conn.alive = false;
        this.connections = this.connections.filter((c) => c !== conn);
      }, latency.upLatencyMs);
    };
    this.time.setTimeout(() => {
      if (!conn.alive || ws.readyState !== 0) return;
      ws.readyState = 1;
      ws.onopen?.({});
    }, handshake);
  }

  private receive(conn: Connection, data: string): void {
    const msg = ClientMessage.parse(JSON.parse(data));
    const at = this.time.now();
    this.received.push({ connection: conn.id, msg, at });
    const s = at + this.serverOffsetMs;
    if (this.replyFilter && !this.replyFilter(msg)) return;
    if (msg.t === "hello") {
      const version = this.programmeVersion ?? msg.programme;
      this.deliver(conn, JSON.stringify({ t: "welcome", v: 1, programme: version, s }));
      if (version !== msg.programme) this.deliver(conn, JSON.stringify({ t: "programme", version }));
    } else if (msg.t === "ping") {
      this.deliver(conn, JSON.stringify({ t: "pong", id: msg.id, c: msg.c, s }));
    }
  }

  private deliver(conn: Connection, data: string): void {
    this.time.setTimeout(() => {
      if (conn.alive && conn.ws.readyState === 1) conn.ws.onmessage?.({ data });
    }, conn.latency.downLatencyMs);
  }
}

export interface FakeAudioOptions {
  /** Auto-advance currentTime with simulated time. */
  time?: FakeTime;
  /** Fire `canplay` this many ms after src/load (requires `time`); null = never (tests dispatch it). */
  autoReadyMs?: number | null;
  /** Fire `playing` right after play() when ready (requires `time`). */
  autoPlaying?: boolean;
}

export class FakeAudio implements AudioLike {
  currentTimeValue = 0;
  preservesPitch = false;
  preload = "";
  paused = true;
  readyState = 0;
  stalled = false;
  readonly seeks: number[] = [];
  readonly srcHistory: string[] = [];
  readonly rateHistory: number[] = [];
  loadCalls = 0;
  playCalls = 0;
  pauseCalls = 0;
  private srcValue = "";
  private rateValue = 1;
  private listeners = new Map<string, Set<() => void>>();
  private readonly opts: FakeAudioOptions;
  private readyTimer: TimerId | null = null;

  constructor(opts: FakeAudioOptions = {}) {
    this.opts = opts;
    opts.time?.onAdvance((dt) => this.tick(dt));
  }

  get src(): string {
    return this.srcValue;
  }
  set src(v: string) {
    this.srcValue = v;
    this.srcHistory.push(v);
    this.readyState = 0;
    this.currentTimeValue = 0;
    this.scheduleReady();
  }

  get playbackRate(): number {
    return this.rateValue;
  }
  set playbackRate(v: number) {
    if (v !== this.rateValue) this.rateHistory.push(v);
    this.rateValue = v;
  }

  get currentTime(): number {
    return this.currentTimeValue;
  }
  set currentTime(v: number) {
    this.currentTimeValue = v;
    this.seeks.push(v);
  }

  play(): Promise<void> {
    this.playCalls++;
    this.paused = false;
    const t = this.opts.time;
    if (this.opts.autoPlaying && t) {
      t.setTimeout(() => {
        if (!this.paused && this.readyState >= 3) this.dispatch("playing");
      }, 0);
    }
    return Promise.resolve();
  }

  pause(): void {
    this.pauseCalls++;
    this.paused = true;
  }

  load(): void {
    this.loadCalls++;
    this.readyState = 0;
    this.scheduleReady();
  }

  addEventListener(type: string, fn: () => void): void {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(fn);
  }

  removeEventListener(type: string, fn: () => void): void {
    this.listeners.get(type)?.delete(fn);
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  /**
   * Fire an event. Convenience semantics: `canplay` makes the element ready,
   * `waiting` stalls playback until the next `playing`.
   */
  dispatch(type: string): void {
    if (type === "canplay" || type === "canplaythrough") this.readyState = 4;
    if (type === "waiting") this.stalled = true;
    if (type === "playing") this.stalled = false;
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn();
  }

  /** Advance the playhead by dtMs × playbackRate while actually playing. */
  tick(dtMs: number): void {
    if (this.paused || this.stalled || this.readyState < 3) return;
    this.currentTimeValue += (dtMs * this.playbackRate) / 1000;
  }

  private scheduleReady(): void {
    const t = this.opts.time;
    const delay = this.opts.autoReadyMs;
    if (!t || delay === null || delay === undefined) return;
    if (this.readyTimer !== null) t.clearTimeout(this.readyTimer);
    this.readyTimer = t.setTimeout(() => {
      this.readyTimer = null;
      this.dispatch("canplay");
    }, delay);
  }
}

/** Let pending promise callbacks run (no real time passes). */
export async function flushMicrotasks(rounds = 10): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}
