import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ListeningControls from "./ListeningControls";

afterEach(cleanup);

describe("ListeningControls", () => {
  it("leaves", () => {
    const onLeave = vi.fn();
    render(<ListeningControls announce={false} onAnnounceChange={() => undefined} onLeave={onLeave} />);
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("toggles ayah announcements, off by default", () => {
    const onAnnounceChange = vi.fn();
    const { rerender } = render(
      <ListeningControls announce={false} onAnnounceChange={onAnnounceChange} onLeave={() => undefined} />,
    );
    const sw = screen.getByRole("switch", { name: "Announce each ayah to screen readers" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw);
    expect(onAnnounceChange).toHaveBeenCalledWith(true);
    rerender(<ListeningControls announce onAnnounceChange={onAnnounceChange} onLeave={() => undefined} />);
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });
});
