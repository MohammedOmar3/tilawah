import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AyahText from "./AyahText";

afterEach(cleanup);

const ayahs = [
  { n: 1, text: "أ" },
  { n: 2, text: "ب" },
  { n: 3, text: "ت" },
  { n: 4, text: "ث" },
];

describe("AyahText", () => {
  it("renders the current ayah in RTL Arabic with the Quranic font", () => {
    const { container } = render(<AyahText ayahs={ayahs} current={2} />);
    const current = container.querySelector('[aria-current="true"]')!;
    expect(current).not.toBeNull();
    expect(current.getAttribute("lang")).toBe("ar");
    expect(current.getAttribute("dir")).toBe("rtl");
    expect(current.className).toContain("font-quran");
    expect(current.textContent).toBe("ب ۝٢");
  });

  it("dims the previous and next ayah, each with an end-of-ayah marker", () => {
    const { container } = render(<AyahText ayahs={ayahs} current={2} />);
    const dimmed = [...container.querySelectorAll(".opacity-40")].map((e) => e.textContent);
    expect(dimmed).toEqual(["أ ۝١", "ت ۝٣"]);
    expect(container.textContent).not.toContain("ث");
  });

  it("at the opening shows only the first ayah, dimmed", () => {
    const { container } = render(<AyahText ayahs={ayahs} current={0} />);
    expect(container.querySelector('[aria-current="true"]')).toBeNull();
    expect([...container.querySelectorAll(".opacity-40")].map((e) => e.textContent)).toEqual(["أ ۝١"]);
  });

  it("renders a translation only when provided", () => {
    const { rerender } = render(<AyahText ayahs={ayahs} current={1} />);
    expect(screen.queryByTestId("translation")).toBeNull();
    rerender(<AyahText ayahs={ayahs} current={1} translation="In the name of God" />);
    const t = screen.getByTestId("translation");
    expect(t.textContent).toBe("In the name of God");
    expect(t.getAttribute("lang")).toBe("en");
  });

  it("shows a quiet placeholder while the text loads", () => {
    const { container } = render(<AyahText ayahs={null} current={1} />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});
