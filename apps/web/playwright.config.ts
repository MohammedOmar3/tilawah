import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Ports can be moved when 3000/8080 are taken on a shared machine.
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3000);
const API_PORT = Number(process.env.E2E_API_PORT ?? 8080);
const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;
const API_ORIGIN = `http://localhost:${API_PORT}`;

// The API announces this version in `welcome`; matching the dev programme avoids a reload.
const devProgramme = JSON.parse(readFileSync(join(__dirname, "public/data/programme.dev.json"), "utf8")) as {
  version: string;
};

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: WEB_ORIGIN,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "go run ./cmd/server",
      cwd: "../api",
      url: `${API_ORIGIN}/healthz`,
      env: {
        PORT: String(API_PORT),
        ALLOWED_ORIGINS: WEB_ORIGIN,
        SNAPSHOT_INTERVAL: "1s",
        K_MIN: "1",
        PROGRAMME_VERSION: devProgramme.version,
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm build && node e2e/serve-static.mjs",
      url: WEB_ORIGIN,
      env: {
        PORT: String(WEB_PORT),
        NEXT_PUBLIC_API_URL: API_ORIGIN,
        NEXT_PUBLIC_WS_URL: `ws://localhost:${API_PORT}/v1/ws`,
        NEXT_PUBLIC_PROGRAMME_URL: "/data/programme.dev.json",
        NEXT_PUBLIC_PRESENCE_POLL_MS: "1000",
        NEXT_PUBLIC_E2E: "1",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
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
