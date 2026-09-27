import { type Page, expect, test } from "@playwright/test";

// Headless Chromium renders WebGL in software, so allow extra time.
test.setTimeout(60_000);

const globe = (page: Page) => page.getByRole("img", { name: /^Globe showing listeners in 3 countries$/ });

async function openLab(page: Page) {
  await page.goto("/lab/globe");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 20_000 });
  await expect(globe(page)).toHaveAttribute("data-globe-state", "ready", { timeout: 10_000 });
}

test("renders the globe without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await openLab(page);
  await expect(globe(page)).toHaveAttribute("data-frameloop", "always");
  // Let a few frames render before checking for errors.
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);
});

test("keyboard interaction pauses auto-rotation", async ({ page }) => {
  await openLab(page);
  await expect(globe(page)).toHaveAttribute("data-autorotate", "true");
  await globe(page).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(globe(page)).toHaveAttribute("data-autorotate", "false");
});

test("joins schedule rings", async ({ page }) => {
  await openLab(page);
  await page.getByRole("button", { name: "Add joins" }).click();
  await expect(globe(page)).not.toHaveAttribute("data-rings", "0");
});

test("reduced motion: no auto-rotation and no rings", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openLab(page);
  await expect(globe(page)).toHaveAttribute("data-autorotate", "false");
  await page.getByRole("button", { name: "Add joins" }).click();
  await expect(globe(page)).toHaveAttribute("data-rings", "0");
});

test("stops rendering while the page is hidden", async ({ page }) => {
  await openLab(page);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(globe(page)).toHaveAttribute("data-frameloop", "never");
});
