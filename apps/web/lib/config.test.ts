import { describe, expect, it } from "vitest";
import { readConfig } from "./config";

const base = {
  NEXT_PUBLIC_API_URL: "http://localhost:8080",
  NEXT_PUBLIC_WS_URL: "ws://localhost:8080/v1/ws",
};

describe("readConfig", () => {
  it("applies defaults", () => {
    expect(readConfig(base)).toEqual({
      apiUrl: "http://localhost:8080",
      wsUrl: "ws://localhost:8080/v1/ws",
      programmeUrl: "/data/programme.json",
      rateNudgeMax: 0.02,
      translationId: "",
      presencePollMs: 15000,
      e2e: false,
    });
  });

  it("treats empty strings as unset", () => {
    const c = readConfig({ ...base, NEXT_PUBLIC_PROGRAMME_URL: "", NEXT_PUBLIC_RATE_NUDGE_MAX: "" });
    expect(c.programmeUrl).toBe("/data/programme.json");
    expect(c.rateNudgeMax).toBe(0.02);
  });

  it("strips a trailing slash from the API URL", () => {
    expect(readConfig({ ...base, NEXT_PUBLIC_API_URL: "https://api.example/" }).apiUrl).toBe("https://api.example");
  });

  it("reads every variable", () => {
    const c = readConfig({
      ...base,
      NEXT_PUBLIC_PROGRAMME_URL: "/data/programme.dev.json",
      NEXT_PUBLIC_RATE_NUDGE_MAX: "0",
      NEXT_PUBLIC_TRANSLATION_ID: "en.sahih",
      NEXT_PUBLIC_PRESENCE_POLL_MS: "1000",
      NEXT_PUBLIC_E2E: "1",
    });
    expect(c).toMatchObject({
      programmeUrl: "/data/programme.dev.json",
      rateNudgeMax: 0,
      translationId: "en.sahih",
      presencePollMs: 1000,
      e2e: true,
    });
  });

  it.each([
    ["NEXT_PUBLIC_API_URL", { NEXT_PUBLIC_API_URL: undefined }],
    ["NEXT_PUBLIC_WS_URL", { NEXT_PUBLIC_WS_URL: "" }],
    ["NEXT_PUBLIC_WS_URL", { NEXT_PUBLIC_WS_URL: "http://localhost:8080/v1/ws" }],
    ["NEXT_PUBLIC_RATE_NUDGE_MAX", { NEXT_PUBLIC_RATE_NUDGE_MAX: "0.06" }],
    ["NEXT_PUBLIC_RATE_NUDGE_MAX", { NEXT_PUBLIC_RATE_NUDGE_MAX: "-0.01" }],
    ["NEXT_PUBLIC_RATE_NUDGE_MAX", { NEXT_PUBLIC_RATE_NUDGE_MAX: "fast" }],
    ["NEXT_PUBLIC_PRESENCE_POLL_MS", { NEXT_PUBLIC_PRESENCE_POLL_MS: "999" }],
    ["NEXT_PUBLIC_E2E", { NEXT_PUBLIC_E2E: "yes" }],
  ])("rejects a bad %s", (name, override) => {
    expect(() => readConfig({ ...base, ...override })).toThrow(name);
  });
});
