import { expect, test } from "@playwright/test";
import { listenersShown, openHome, readStore } from "./helpers";

test.setTimeout(60_000);

test("join starts synchronized listening and updates the count", async ({ page }) => {
  await openHome(page);
  await expect(page.getByTestId("surah-name")).not.toBeEmpty();
  await expect(page.getByRole("status")).toContainText("Live");
  await expect.poll(() => listenersShown(page), { timeout: 5000 }).toBe(0);

  await page.getByRole("button", { name: "Join global listening" }).click();
  // S3 proxy: Join to audio playing within 5 s.
  await expect(page.getByRole("status")).toHaveText("Listening", { timeout: 5000 });
  expect((await readStore(page)).status).toBe("playing");
  // S6: the new listener shows up in the counts.
  await expect.poll(() => listenersShown(page), { timeout: 5000 }).toBeGreaterThanOrEqual(1);

  await page.getByRole("button", { name: "Leave" }).click();
  await expect(page.getByRole("status")).toContainText("Live");
  await expect.poll(() => listenersShown(page), { timeout: 5000 }).toBe(0);
});
