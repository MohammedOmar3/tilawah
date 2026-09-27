export interface AudioContextLike {
  outputLatency?: number;
  baseLatency?: number;
  close(): Promise<void> | void;
}

export type AudioContextFactory = () => AudioContextLike;

/** The browser's AudioContext constructor as a factory, when there is one. */
export function browserAudioContextFactory(): AudioContextFactory | undefined {
  const Ctor = (globalThis as { AudioContext?: new () => AudioContextLike }).AudioContext;
  return Ctor ? () => new Ctor() : undefined;
}

/**
 * How long after the element outputs a sample it is heard, in ms. Call inside
 * the Join click handler: creating an AudioContext needs a user gesture.
 */
export function probeOutputLatencyMs(factory: AudioContextFactory | undefined = browserAudioContextFactory()): number {
  if (!factory) return 0;
  let ctx: AudioContextLike;
  try {
    ctx = factory();
  } catch {
    return 0;
  }
  const seconds = ctx.outputLatency || ctx.baseLatency || 0;
  try {
    const closing = ctx.close();
    if (closing) closing.catch(() => undefined);
  } catch {
    /* already closed */
  }
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
}
