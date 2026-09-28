import { expect, test } from "@playwright/test";
import { join, openHome, waitForGlobe } from "./helpers";

// Headless Chromium renders the globe with software WebGL, so allow extra time.
test.setTimeout(90_000);

test("the page never scrolls, on a phone and on a desktop", async ({ page }) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await openHome(page);
    const overflow = () =>
      page.evaluate(() => ({
        x: document.documentElement.scrollWidth - window.innerWidth,
        y: document.documentElement.scrollHeight - window.innerHeight,
      }));
    expect(await overflow()).toEqual({ x: 0, y: 0 });
    await join(page, 15_000);
    await expect(page.getByRole("region", { name: "Current ayah" })).toBeVisible();
    expect(await overflow()).toEqual({ x: 0, y: 0 });
    await page.getByRole("button", { name: "Leave" }).click();
  }
});

test("the theme button switches between Night and Fajr and is remembered", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await openHome(page);
  await page.getByRole("button", { name: "Switch to Fajr (light)" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "fajr");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "fajr");
  await expect(page.getByRole("button", { name: "Switch to Night (dark)" })).toBeVisible();

  // Auto follows the device again.
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Auto" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeHidden();
});

test("About shows the details of the recitation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  await waitForGlobe(page);
  await join(page, 15_000);
  await page.getByRole("button", { name: "About" }).click();
  const about = page.getByRole("dialog");
  await expect(about).toContainText("Hafs 'an 'Asim");
  await about.getByRole("button", { name: "Close" }).click();
  await expect(about).toBeHidden();
});

test("the translation shows under the ayah and the globe grows when it is switched off", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  await join(page, 15_000);
  const translation = page.getByTestId("translation");
  await expect(translation).not.toBeEmpty();
  await expect(translation).toHaveAttribute("lang", "en");
  const reading = page.getByRole("region", { name: "Current ayah" });
  const withTranslation = (await reading.boundingBox())!.height;

  const toggle = page.getByRole("button", { name: "Translation" });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(translation).toBeHidden();
  expect((await reading.boundingBox())!.height).toBeLessThan(withTranslation);

  // Remembered, and mirrored in Settings.
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("switch", { name: "English translation" })).toHaveAttribute("aria-checked", "false");
});
