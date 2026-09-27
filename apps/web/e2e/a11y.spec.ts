import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { join, openHome, waitForGlobe } from "./helpers";

// Headless Chromium renders the globe with software WebGL, so allow extra time.
test.setTimeout(90_000);

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(" ")) }));
}

test("home has no serious accessibility violations before and after joining", async ({ page }) => {
  await openHome(page);
  await waitForGlobe(page);
  expect(await seriousViolations(page)).toEqual([]);
  await join(page, 15_000);
  expect(await seriousViolations(page)).toEqual([]);
});

test("privacy page has no serious accessibility violations", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "Privacy" })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test("keyboard reaches Join, the anonymous switch, the privacy link and the globe", async ({ page }) => {
  await openHome(page);
  await waitForGlobe(page);
  const reached = new Set<string>();
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    reached.add(
      await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return "";
        const name = el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "";
        return `${el.getAttribute("role") ?? el.tagName.toLowerCase()}:${name}`;
      }),
    );
  }
  const list = [...reached];
  expect(list).toContain("button:Join global listening");
  expect(list.some((x) => x.startsWith("switch:"))).toBe(true);
  expect(list.some((x) => /^a:.*privacy/i.test(x))).toBe(true);
  expect(list.some((x) => x.startsWith("img:Globe showing"))).toBe(true);
  // The switch is the anonymous one.
  await page.getByRole("switch", { name: "Listen anonymously" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("switch", { name: "Listen anonymously" })).toHaveAttribute("aria-checked", "true");
});

test("reduced motion keeps the globe still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openHome(page);
  await waitForGlobe(page);
  await expect(page.getByRole("img", { name: /^Globe showing/ })).toHaveAttribute("data-autorotate", "false");
});
