import { expect, test } from "@playwright/test";
import { listenersShown, openHome, readStore } from "./helpers";

test.setTimeout(60_000);

// Counts can lag by the browser's max-age on presence.json (5 s) plus one
// snapshot and one poll interval (1 s each here), so allow 10 s.
const COUNT_TIMEOUT = 10_000;

test("join starts synchronized listening and updates the count", async ({ page }) => {
  await openHome(page);
  await expect(page.getByTestId("surah-name")).not.toBeEmpty();
  await expect(page.getByRole("status")).toContainText("Now reciting");
  await expect.poll(() => listenersShown(page), { timeout: COUNT_TIMEOUT }).toBe(0);

  await page.getByRole("button", { name: "Join the recitation" }).click();
  // S3 proxy: Join to audio playing within 5 s.
  await expect(page.getByRole("status")).toHaveText("In sync", { timeout: 5000 });
  expect((await readStore(page)).status).toBe("playing");
  // S6: the new listener shows up in the counts.
  await expect.poll(() => listenersShown(page), { timeout: COUNT_TIMEOUT }).toBeGreaterThanOrEqual(1);

  await page.getByRole("button", { name: "Leave" }).click();
  await expect(page.getByRole("status")).toContainText("Now reciting");
  await expect.poll(() => listenersShown(page), { timeout: COUNT_TIMEOUT }).toBe(0);
});
