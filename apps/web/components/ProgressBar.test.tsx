import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ProgressBar from "./ProgressBar";

afterEach(cleanup);

describe("ProgressBar", () => {
  it("exposes progress as a percentage and shows elapsed / total", () => {
    const { container } = render(<ProgressBar posMs={763_000} durationMs={3_730_000} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("20");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    expect(container.textContent).toContain("12:43 / 1:02:10");
  });

  it("clamps and handles a zero duration", () => {
    render(<ProgressBar posMs={5000} durationMs={0} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
  });
});
