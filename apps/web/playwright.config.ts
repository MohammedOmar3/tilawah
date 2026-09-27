import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  // Interim: plan 05 replaces this with the real API plus a static build.
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: ["--autoplay-policy=no-user-gesture-required"],
          // Cloud sessions ship a pre-installed Chromium; CI installs its own.
          executablePath: process.env.PW_CHROMIUM_PATH || undefined,
        },
      },
    },
  ],
});
