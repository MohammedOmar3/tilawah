import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";
import { heardTime, join, openHome, readStore } from "./helpers";

// Two joins 20 s apart, 20 s of settling, up to ~2 min waiting for a long enough
// stretch of one track, ~40 s of rate correction and a 10 s outage.
test.setTimeout(360_000);

const SKEW_MS = 7000;
/** The rate path corrects 800 ms in ~40 s; a track change midway would seek, so start with room. */
const RATE_PHASE_HEADROOM_MS = 48_000;

function note(text: string) {
  test.info().annotations.push({ type: "sync", description: text });
  console.log(`[sync] ${text}`);
}

/** Resolves once at least `ms` remain before the next track boundary. */
async function waitForHeadroom(page: Page, ms: number) {
  const durations = await page.evaluate(async () => {
    const res = await fetch("/data/programme.dev.json");
    const p = (await res.json()) as { tracks: { durationMs: number }[] };
    return p.tracks.map((t) => t.durationMs);
  });
  await expect
    .poll(
      async () => {
        const s = await readStore(page);
        return durations[s.trackIndex]! - s.posInTrackMs;
      },
      { timeout: 150_000, intervals: [1000] },
    )
    .toBeGreaterThanOrEqual(ms);
}

test("clients agree on the programme clock and correct drift", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  // Client B's clock runs 7 s fast.
  await ctxB.addInitScript((skew) => {
    const origin = performance.timeOrigin + skew;
    Object.defineProperty(performance, "timeOrigin", { get: () => origin, configurable: true });
  }, SKEW_MS);
  // No presence snapshot means no globe: headless Chromium renders WebGL in software,
  // and two globes at 60 fps saturate the CPU, delaying pong handling by 100–300 ms
  // and turning this into a test of the CI machine rather than of clock sync.
  for (const ctx of [ctxA, ctxB]) await ctx.route("**/v1/presence.json", (route) => route.abort());
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  // A's socket goes through a pass-through route so the outage below can cut it.
  const outage: { blocked: boolean; current: WebSocketRoute | null } = { blocked: false, current: null };
  await a.routeWebSocket(/\/v1\/ws/, (ws) => {
    if (outage.blocked) {
      ws.close({ code: 1011, reason: "e2e outage" });
      return;
    }
    outage.current = ws;
    ws.connectToServer();
  });

  await openHome(a);
  await join(a, 15_000);
  await a.waitForTimeout(20_000);
  await openHome(b);
  await join(b, 15_000);
  await b.waitForTimeout(20_000);
  const sa = await readStore(a);
  const sb = await readStore(b);
  note(`A offset ${sa.offsetMs?.toFixed(1)} ms, rtt ${sa.rttMs?.toFixed(1)} ms, err ${sa.errMs?.toFixed(1)} ms, track ${sa.trackIndex} @ ${Math.round(sa.posInTrackMs)} ms`);
  note(`B offset ${sb.offsetMs?.toFixed(1)} ms, rtt ${sb.rttMs?.toFixed(1)} ms, err ${sb.errMs?.toFixed(1)} ms, track ${sb.trackIndex} @ ${Math.round(sb.posInTrackMs)} ms`);
  expect(sa.offsetMs).not.toBeNull();
  expect(sb.offsetMs).not.toBeNull();
  const relative = sb.offsetMs! - sa.offsetMs!;
  note(`B − A offset ${relative.toFixed(1)} ms (expected −${SKEW_MS})`);
  expect(Math.abs(relative + SKEW_MS)).toBeLessThan(50);
  // Playback error, sampled once a second (a track change or correction can spike one reading).
  const errs: string[] = [];
  await expect
    .poll(
      async () => {
        const [ea, eb] = [(await readStore(a)).errMs ?? Infinity, (await readStore(b)).errMs ?? Infinity];
        errs.push(`${ea.toFixed(0)}/${eb.toFixed(0)}`);
        return Math.max(Math.abs(ea), Math.abs(eb));
      },
      { timeout: 15_000, intervals: [1000] },
    )
    .toBeLessThan(100);
  note(`err samples A/B (ms): ${errs.join(", ")}`);

  // Rate path: put A's audio 800 ms ahead of its programme clock; it must converge
  // by rate nudging alone, without a seek. Jumping audio.currentTime can't test this:
  // Chrome fires `waiting` on every seek, which the engine rightly treats as a stall
  // and answers with a hard seek. Moving A's clock back 800 ms gives the engine the
  // same +800 ms error with the element untouched.
  await waitForHeadroom(a, RATE_PHASE_HEADROOM_MS);
  const trackBefore = (await readStore(a)).trackIndex;
  await a.evaluate((ms) => {
    const w = window as unknown as { __seeks: number };
    w.__seeks = 0;
    for (const el of window.__tilawah!.audio()) el.addEventListener("seeking", () => w.__seeks++);
    const origin = performance.timeOrigin - ms;
    Object.defineProperty(performance, "timeOrigin", { get: () => origin, configurable: true });
  }, 800);
  const started = Date.now();
  await expect
    .poll(async () => (await readStore(a)).errMs, { timeout: 5000 })
    .toBeGreaterThan(500);
  note(`A forced ahead: err ${(await readStore(a)).errMs?.toFixed(1)} ms, rate ${(await readStore(a)).rate}`);
  await expect
    .poll(async () => Math.abs((await readStore(a)).errMs ?? Infinity), { timeout: 60_000, intervals: [1000] })
    .toBeLessThan(40);
  const seeks = await a.evaluate(() => (window as unknown as { __seeks: number }).__seeks);
  const after = await readStore(a);
  note(`A converged in ${((Date.now() - started) / 1000).toFixed(1)} s, err ${after.errMs?.toFixed(1)} ms, seeks ${seeks}`);
  expect(after.trackIndex).toBe(trackBefore);
  expect(seeks).toBe(0);

  // Outage: drop A's WebSocket and refuse new ones for 10 s, with the context offline.
  // (Offline emulation alone leaves an open WebSocket up, so the route closes it.)
  // Audio keeps playing on the clock; the socket comes back.
  const before = await readStore(a);
  const t0 = await heardTime(a);
  outage.blocked = true;
  await outage.current?.close({ code: 1011, reason: "e2e outage" });
  await ctxA.setOffline(true);
  await expect.poll(async () => (await readStore(a)).status, { timeout: 5000 }).toBe("reconnecting");
  await expect(a.getByRole("status")).toHaveText("Reconnecting… audio continues");
  await a.waitForTimeout(10_000);
  const t1 = await heardTime(a);
  const during = await readStore(a);
  note(
    `during outage: audio ${t0?.toFixed(2)} s → ${t1?.toFixed(2)} s, track ${before.trackIndex} → ${during.trackIndex}, status ${during.status}`,
  );
  expect(t0).not.toBeNull();
  expect(t1).not.toBeNull();
  if (during.trackIndex === before.trackIndex) expect(t1! - t0!).toBeGreaterThan(8);
  else expect(t1).not.toBe(t0);
  await ctxA.setOffline(false);
  outage.blocked = false;
  // Reconnect backoff can be up to 16 s at this point (full jitter), plus the join burst.
  await expect(a.getByRole("status")).toHaveText("In sync", { timeout: 45_000 });
  const final = await readStore(a);
  note(`after reconnect: offset ${final.offsetMs?.toFixed(1)} ms, rtt ${final.rttMs?.toFixed(1)} ms, err ${final.errMs?.toFixed(1)} ms`);

  await ctxA.close();
  await ctxB.close();
});
