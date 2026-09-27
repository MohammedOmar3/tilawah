import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Footer from "./Footer";

afterEach(cleanup);

describe("Footer", () => {
  it("links to the privacy notice and credits the reciter and text source", () => {
    const { container } = render(<Footer reciter="Development tone" />);
    expect(screen.getByRole("link", { name: /privacy/i }).getAttribute("href")).toBe("/privacy");
    expect(container.textContent).toContain("Recitation: Development tone");
    expect(container.textContent).toContain("Quran text: Tanzil Project (tanzil.net)");
  });

  it("omits the reciter credit until it is known", () => {
    const { container } = render(<Footer />);
    expect(container.textContent).not.toContain("Recitation:");
  });
});
