import { expect, type Page } from "@playwright/test";

export interface StoreSnapshot {
  status: string;
  offsetMs: number | null;
  rttMs: number | null;
  errMs: number | null;
  rate: number;
  trackIndex: number;
  posInTrackMs: number;
}

/** The listening store, read through the NEXT_PUBLIC_E2E test hook. */
export function readStore(page: Page): Promise<StoreSnapshot> {
  return page.evaluate(() => {
    const s = window.__tilawah!.store.getState();
    return {
      status: s.status,
      offsetMs: s.offsetMs,
      rttMs: s.rttMs,
      errMs: s.errMs,
      rate: s.rate,
      trackIndex: s.trackIndex,
      posInTrackMs: s.posInTrackMs,
    };
  });
}

/** currentTime of the element being heard (the one not paused), in seconds. */
export function heardTime(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const el = window.__tilawah!.audio().find((a) => !a.paused);
    return el ? el.currentTime : null;
  });
}

export async function openHome(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("surah-name")).toBeVisible();
  await expect(page.getByRole("button", { name: "Join global listening" })).toBeEnabled();
  await page.waitForFunction(() => window.__tilawah !== undefined);
}

/**
 * Waits for the lazy globe chunk to load and render. Joining while three.js is
 * still being parsed (slow in headless software WebGL) inflates the clock-sync
 * round trips, so timing-sensitive tests join after this.
 */
export async function waitForGlobe(page: Page): Promise<void> {
  await expect(page.locator('[data-globe-state="ready"]')).toBeVisible({ timeout: 30_000 });
}

export async function join(page: Page, timeout = 5000): Promise<void> {
  await page.getByRole("button", { name: "Join global listening" }).click();
  await expect(page.getByRole("status")).toHaveText("Listening", { timeout });
}

export function listenersShown(page: Page): Promise<number> {
  return page
    .getByTestId("counts")
    .getAttribute("data-listeners")
    .then((v) => (v === null || v === "" ? -1 : Number(v)));
}
