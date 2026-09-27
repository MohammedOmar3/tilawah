import { expect, test } from "@playwright/test";
import { join, openHome } from "./helpers";

test.setTimeout(60_000);

const API_HOST = `localhost:${process.env.E2E_API_PORT ?? 8080}`;
const WEB_HOST = `localhost:${process.env.E2E_WEB_PORT ?? 3000}`;

test("no cookies and no third-party requests while listening", async ({ page, context }) => {
  const hosts = new Set<string>();
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.protocol !== "data:" && url.protocol !== "blob:") hosts.add(url.host);
  });
  page.on("websocket", (ws) => hosts.add(new URL(ws.url()).host));

  await openHome(page);
  await join(page, 15_000);
  // Let presence polls, timings and the globe's assets load.
  await page.waitForTimeout(3000);
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "Privacy" })).toBeVisible();

  expect(await context.cookies()).toEqual([]);
  // next/font self-hosts the fonts, so nothing reaches fonts.gstatic.com at runtime.
  expect([...hosts].sort()).toEqual([API_HOST, WEB_HOST].sort());
});
