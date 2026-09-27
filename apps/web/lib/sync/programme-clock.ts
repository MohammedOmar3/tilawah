import { positionAt, type CompiledProgramme, type Position } from "@tilawah/contracts";
import type { ClockSync } from "./clock-sync";
import { browserNow, type NowFn } from "./runtime";

export interface Target extends Position {
  /** True until the first clock sync: position comes from the unadjusted local clock. */
  approximate: boolean;
  serverNowMs: number;
}

export interface ProgrammeClockOptions {
  compiled: CompiledProgramme;
  clockSync: ClockSync;
  /** Local clock; defaults to performance.timeOrigin + performance.now() (spec §5.2). */
  now?: NowFn;
}

/** Where the programme is right now, derived only from the (synced) clock (spec §3.1). */
export class ProgrammeClock {
  readonly compiled: CompiledProgramme;
  readonly nowFn: NowFn;
  private readonly clockSync: ClockSync;

  constructor(options: ProgrammeClockOptions) {
    this.compiled = options.compiled;
    this.clockSync = options.clockSync;
    this.nowFn = options.now ?? browserNow;
  }

  get synced(): boolean {
    return this.clockSync.synced;
  }

  target(localNow: number = this.nowFn()): Target {
    const serverNowMs = this.clockSync.serverNow(localNow);
    return { ...positionAt(this.compiled, serverNowMs), approximate: !this.clockSync.synced, serverNowMs };
  }
}
