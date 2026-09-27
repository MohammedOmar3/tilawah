import { z } from "zod";

const SurahNumber = z.number().int().min(1).max(114);
const Ms = z.number().int().min(0);

export const Surah = z.object({
  number: SurahNumber,
  nameArabic: z.string().min(1),
  nameTransliterated: z.string().min(1),
  nameEnglish: z.string().min(1),
  ayahCount: z.number().int().positive(),
  revelation: z.enum(["meccan", "medinan"]),
});
export const Surahs = z.array(Surah).length(114);

export const SurahText = z.object({
  surah: SurahNumber,
  source: z.string().min(1),
  ayahs: z.array(z.object({ n: z.number().int().positive(), text: z.string().min(1) })).min(1),
});

export const TimingSegment = z
  .object({ ayah: z.number().int().min(0), startMs: Ms, endMs: Ms })
  .refine((s) => s.endMs > s.startMs, "endMs must be greater than startMs");

export const Timings = z
  .object({ surah: SurahNumber, reciter: z.string().min(1), segments: z.array(TimingSegment).min(1) })
  .superRefine((t, ctx) => {
    for (let i = 1; i < t.segments.length; i++) {
      const prev = t.segments[i - 1]!;
      const cur = t.segments[i]!;
      if (cur.startMs < prev.endMs) {
        ctx.addIssue({ code: "custom", message: `segment ${i} overlaps or is unsorted` });
      }
    }
  });

export const Track = z.object({
  surah: SurahNumber,
  durationMs: z.number().int().positive(),
  audio: z.string().min(1),
  timings: z.string().min(1),
});

export const Programme = z.object({
  version: z.string().min(1),
  epoch: z.iso.datetime(),
  reciter: z.object({ id: z.string().min(1), name: z.string().min(1), riwayah: z.string().min(1) }),
  tracks: z.array(Track).min(1),
});

export const ClientMessage = z.discriminatedUnion("t", [
  z.object({ t: z.literal("hello"), v: z.literal(1), anon: z.boolean(), programme: z.string() }),
  z.object({ t: z.literal("ping"), id: z.number().int(), c: z.number() }),
  z.object({ t: z.literal("state"), playing: z.boolean() }),
  z.object({ t: z.literal("hb") }),
  z.object({ t: z.literal("stat"), rttMs: z.number(), offsetMs: z.number(), errMs: z.number() }),
]);

export const ServerMessage = z.discriminatedUnion("t", [
  z.object({ t: z.literal("welcome"), v: z.literal(1), programme: z.string(), s: z.number() }),
  z.object({ t: z.literal("pong"), id: z.number().int(), c: z.number(), s: z.number() }),
  z.object({ t: z.literal("programme"), version: z.string() }),
]);

const Cell = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  n: z.number().int().positive(),
});

export const Presence = z.object({
  v: z.literal(1),
  generatedAt: z.iso.datetime(),
  listeners: z.number().int().min(0),
  countries: z.number().int().min(0),
  cells: z.array(Cell),
  joins: z.array(Cell),
});

export type Surah = z.infer<typeof Surah>;
export type SurahText = z.infer<typeof SurahText>;
export type TimingSegment = z.infer<typeof TimingSegment>;
export type Timings = z.infer<typeof Timings>;
export type Track = z.infer<typeof Track>;
export type Programme = z.infer<typeof Programme>;
export type ClientMessage = z.infer<typeof ClientMessage>;
export type ServerMessage = z.infer<typeof ServerMessage>;
export type Presence = z.infer<typeof Presence>;
export type PresenceCell = z.infer<typeof Cell>;
