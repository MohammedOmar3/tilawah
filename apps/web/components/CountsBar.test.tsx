import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import CountsBar from "./CountsBar";

afterEach(cleanup);

describe("CountsBar", () => {
  it("shows formatted counts with an accessible summary", () => {
    render(<CountsBar listeners={4821} countries={82} />);
    const bar = screen.getByLabelText("4,821 people listening from 82 countries");
    expect(bar.textContent).toContain("4,821 listening");
    expect(bar.textContent).toContain("82 countries");
  });

  it("uses singular forms for one", () => {
    render(<CountsBar listeners={1} countries={1} />);
    expect(screen.getByLabelText("1 person listening from 1 country").textContent).toContain("1 country");
  });

  it("shows placeholders before the first snapshot", () => {
    render(<CountsBar listeners={null} countries={null} />);
    const bar = screen.getByTestId("counts");
    expect(bar.textContent).toContain("— listening");
    expect(bar.textContent).toContain("— countries");
    expect(bar.getAttribute("aria-label")).toBe("Listener count loading");
  });
});
