import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import JoinView from "./JoinView";
import type { NowInfo } from "./NowCard";

afterEach(cleanup);

const now: NowInfo = {
  surah: { number: 6, nameArabic: "الأنعام", nameTransliterated: "Al-An'am", nameEnglish: "The Cattle", ayahCount: 165, revelation: "meccan" },
  ayah: 104,
  posMs: 60_000,
  durationMs: 120_000,
  reciter: "Mishary Rashid Alafasy",
  riwayah: "Hafs 'an 'Asim",
  next: { number: 7, nameArabic: "الأعراف", nameTransliterated: "Al-A'raf", nameEnglish: "The Heights", ayahCount: 206, revelation: "meccan" },
  msToNext: 29 * 60_000,
};

function renderView(props: Partial<Parameters<typeof JoinView>[0]> = {}) {
  const onJoin = vi.fn();
  const onAnonChange = vi.fn();
  render(<JoinView status="idle" now={now} onJoin={onJoin} anon={false} onAnonChange={onAnonChange} {...props} />);
  return { onJoin, onAnonChange };
}

describe("JoinView", () => {
  it("shows what is being recited and what comes next", () => {
    renderView();
    expect(screen.getByTestId("surah-name").textContent).toBe("Surah Al-An'am");
    expect(document.body.textContent).toContain("Ayah 104 of 165 · Mishary Rashid Alafasy");
    expect(document.body.textContent).toContain("Up next: Surah Al-A'raf, in 29 min");
    expect(screen.getByRole("status").textContent).toBe("Now reciting");
  });

  it("joins, and passes the anonymous choice up", () => {
    const { onJoin, onAnonChange } = renderView();
    fireEvent.click(screen.getByRole("button", { name: "Join the recitation" }));
    expect(onJoin).toHaveBeenCalledOnce();
    const sw = screen.getByRole("switch", { name: /Listen anonymously/ });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw);
    expect(onAnonChange).toHaveBeenLastCalledWith(true);
  });

  it("links to the privacy page and credits the text", () => {
    renderView();
    expect(screen.getByRole("link", { name: /privacy/i }).getAttribute("href")).toBe("/privacy");
    expect(screen.getByRole("link", { name: "Tanzil Project" }).getAttribute("href")).toBe("https://tanzil.net");
  });

  it("is disabled while connecting and until the programme is ready", () => {
    renderView({ status: "connecting" });
    expect((screen.getByRole("button", { name: "Connecting…" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    renderView({ disabled: true });
    expect((screen.getByRole("button", { name: "Join the recitation" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows an error message", () => {
    renderView({ status: "error", error: "Audio could not start" });
    expect(screen.getByRole("alert").textContent).toContain("Audio could not start");
  });
});
