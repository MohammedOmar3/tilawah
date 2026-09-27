import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AyahAnnouncer from "./AyahAnnouncer";

afterEach(cleanup);

describe("AyahAnnouncer", () => {
  it("renders nothing when disabled", () => {
    const { container } = render(<AyahAnnouncer enabled={false} surahName="Al-Kahf" ayah={23} />);
    expect(container.querySelector("[aria-live]")).toBeNull();
  });

  it("announces the surah and ayah politely", () => {
    const { container, rerender } = render(<AyahAnnouncer enabled surahName="Al-Kahf" ayah={23} />);
    const region = container.querySelector("[aria-live]")!;
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toBe("Al-Kahf, ayah 23");
    rerender(<AyahAnnouncer enabled surahName="Al-Kahf" ayah={0} />);
    expect(region.textContent).toBe("Al-Kahf, opening");
  });
});
