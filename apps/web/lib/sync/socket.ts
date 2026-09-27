import { ServerMessage, type ClientMessage } from "@tilawah/contracts";
import { backoffDelay } from "./backoff";
import type { ClockSample, ClockSync } from "./clock-sync";
import { WS_OPEN, type NowFn, type TimerId, type Timers, type WebSocketCtor, type WebSocketLike } from "./runtime";

export const JOIN_BURST = 8;
export const RESYNC_BURST = 3;
export const PING_SPACING_MS = 100;
export const BURST_TIMEOUT_MS = 3000;
export const MIN_BURST_SAMPLES = 3;
export const RESYNC_EVERY_MS = 5 * 60_000;
export const HEARTBEAT_EVERY_MS = 45_000;

export interface SyncSocketDeps extends Timers {
  WebSocket: WebSocketCtor;
  now: NowFn;
  random: () => number;
}

export interface SyncSocketOptions {
  url: string;
  anon: boolean;
  programmeVersion: string;
  clockSync: ClockSync;
  deps: SyncSocketDeps;
  /** The server accepted `hello`; its programme version. */
  onWelcome?: (programmeVersion: string) => void;
  /** A burst finished; `accepted` says whether the clock offset changed. */
  onSync?: (accepted: boolean) => void;
  /** The connection dropped (a reconnect is scheduled). */
  onDisconnect?: () => void;
  onProgrammeChanged?: (version: string) => void;
}

export interface Stat {
  rttMs: number;
  offsetMs: number;
  errMs: number;
}

interface Burst {
  size: number;
  sent: number;
  pending: Map<number, number>; // ping id → c0
  samples: ClockSample[];
  spacing: TimerId | null;
  timeout: TimerId;
}

/**
 * The WebSocket side of the sync engine (spec §4.5, §5.2, §5.4): hello,
 * clock-sync bursts, heartbeat, playing state, telemetry and reconnects.
 */
export class SyncSocket {
  private readonly o: SyncSocketOptions;
  private ws: WebSocketLike | null = null;
  private closed = false;
  private attempt = 0;
  private nextPingId = 1;
  private playing: boolean | null = null;
  private burst: Burst | null = null;
  private reconnectTimer: TimerId | null = null;
  private heartbeat: TimerId | null = null;
  private periodicResync: TimerId | null = null;

  constructor(options: SyncSocketOptions) {
    this.o = options;
  }

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WS_OPEN;
  }

  connect(): void {
    if (this.closed || this.ws) return;
    const { deps } = this.o;
    const ws = new deps.WebSocket(this.o.url);
    this.ws = ws;
    ws.onopen = () => {
      this.send({ t: "hello", v: 1, anon: this.o.anon, programme: this.o.programmeVersion });
      if (this.playing !== null) this.send({ t: "state", playing: this.playing });
      this.heartbeat = deps.setInterval(() => this.send({ t: "hb" }), HEARTBEAT_EVERY_MS);
    };
    ws.onmessage = (ev) => this.onMessage(ev.data);
    ws.onclose = () => this.onClose(ws);
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  /** Run a short re-sync burst (visibility, online, every 5 minutes). */
  resync(): void {
    this.startBurst(RESYNC_BURST);
  }

  /**
   * The network came back (`online`): resync an open socket; if the socket is
   * down and waiting in its backoff, skip the wait and connect now with the
   * backoff reset. A handshake already in flight is left alone.
   */
  reconnectNow(): void {
    if (this.closed) return;
    if (this.connected) {
      this.resync();
      return;
    }
    if (this.reconnectTimer === null) return;
    this.o.deps.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.attempt = 0;
    this.connect();
  }

  setPlaying(playing: boolean): void {
    if (this.playing === playing) return;
    this.playing = playing;
    this.send({ t: "state", playing });
  }

  sendStat(stat: Stat): void {
    this.send({ t: "stat", ...stat });
  }

  close(): void {
    this.closed = true;
    const { deps } = this.o;
    if (this.reconnectTimer !== null) deps.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopConnectionTimers();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      ws.close(1000);
    }
  }

  private send(msg: ClientMessage): void {
    if (this.connected) this.ws!.send(JSON.stringify(msg));
  }

  private onMessage(data: unknown): void {
    if (typeof data !== "string") return;
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    const parsed = ServerMessage.safeParse(json);
    if (!parsed.success) return;
    const msg = parsed.data;
    switch (msg.t) {
      case "welcome":
        this.attempt = 0;
        this.o.onWelcome?.(msg.programme);
        this.startBurst(JOIN_BURST);
        if (this.periodicResync === null) {
          this.periodicResync = this.o.deps.setInterval(() => this.resync(), RESYNC_EVERY_MS);
        }
        break;
      case "pong":
        this.onPong(msg.id, msg.s);
        break;
      case "programme":
        this.o.onProgrammeChanged?.(msg.version);
        break;
    }
  }

  private onClose(ws: WebSocketLike): void {
    if (ws !== this.ws) return;
    this.ws = null;
    this.stopConnectionTimers();
    if (this.closed) return;
    this.o.onDisconnect?.();
    const delay = backoffDelay(this.attempt++, this.o.deps.random);
    this.reconnectTimer = this.o.deps.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private stopConnectionTimers(): void {
    const { deps } = this.o;
    if (this.heartbeat !== null) deps.clearInterval(this.heartbeat);
    if (this.periodicResync !== null) deps.clearInterval(this.periodicResync);
    this.heartbeat = this.periodicResync = null;
    this.cancelBurst();
  }

  private startBurst(size: number): void {
    if (this.burst || !this.connected) return;
    const { deps } = this.o;
    const burst: Burst = {
      size,
      sent: 0,
      pending: new Map(),
      samples: [],
      spacing: null,
      timeout: deps.setTimeout(() => this.finishBurst(), BURST_TIMEOUT_MS),
    };
    this.burst = burst;
    const sendPing = () => {
      burst.spacing = null;
      const id = this.nextPingId++;
      const c = deps.now();
      burst.pending.set(id, c);
      burst.sent++;
      this.send({ t: "ping", id, c });
      if (burst.sent < burst.size) burst.spacing = deps.setTimeout(sendPing, PING_SPACING_MS);
    };
    sendPing();
  }

  private onPong(id: number, s: number): void {
    const burst = this.burst;
    const c0 = burst?.pending.get(id);
    if (!burst || c0 === undefined) return;
    burst.pending.delete(id);
    burst.samples.push({ c0, s, c1: this.o.deps.now() });
    if (burst.samples.length === burst.size) this.finishBurst();
  }

  private finishBurst(): void {
    const burst = this.burst;
    if (!burst) return;
    this.cancelBurst();
    if (burst.samples.length < Math.min(MIN_BURST_SAMPLES, burst.size)) return;
    const accepted = this.o.clockSync.acceptBurst(burst.samples);
    this.o.onSync?.(accepted);
  }

  private cancelBurst(): void {
    const burst = this.burst;
    if (!burst) return;
    const { deps } = this.o;
    deps.clearTimeout(burst.timeout);
    if (burst.spacing !== null) deps.clearTimeout(burst.spacing);
    this.burst = null;
  }
}
