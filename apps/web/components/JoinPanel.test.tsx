import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import JoinPanel from "./JoinPanel";

afterEach(cleanup);

describe("JoinPanel", () => {
  it("offers a Join button and an anonymous switch that is off by default", () => {
    render(<JoinPanel status="idle" onJoin={() => undefined} />);
    const join = screen.getByRole("button", { name: "Join global listening" });
    expect((join as HTMLButtonElement).disabled).toBe(false);
    const sw = screen.getByRole("switch", { name: "Listen anonymously" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(document.body.textContent).toContain(
      "Anonymous listeners are counted but never placed on the globe.",
    );
    expect(screen.getByRole("link", { name: /privacy/i }).getAttribute("href")).toBe("/privacy");
  });

  it("joins with the anonymous choice", () => {
    const onJoin = vi.fn();
    render(<JoinPanel status="idle" onJoin={onJoin} />);
    fireEvent.click(screen.getByRole("button", { name: "Join global listening" }));
    expect(onJoin).toHaveBeenLastCalledWith({ anon: false });

    const sw = screen.getByRole("switch", { name: "Listen anonymously" });
    fireEvent.click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Join global listening" }));
    expect(onJoin).toHaveBeenLastCalledWith({ anon: true });
  });

  it("is disabled while connecting", () => {
    const onJoin = vi.fn();
    render(<JoinPanel status="connecting" onJoin={onJoin} />);
    const button = screen.getByRole("button", { name: "Connecting…" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onJoin).not.toHaveBeenCalled();
  });

  it("is disabled until the programme is ready", () => {
    render(<JoinPanel status="idle" disabled onJoin={() => undefined} />);
    expect((screen.getByRole("button", { name: "Join global listening" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows an error message", () => {
    render(<JoinPanel status="error" error="Audio could not start" onJoin={() => undefined} />);
    expect(screen.getByRole("alert").textContent).toContain("Audio could not start");
  });
});
