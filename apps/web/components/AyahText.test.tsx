import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AyahText from "./AyahText";

afterEach(cleanup);

const ayahs = [
  { n: 1, text: "أ" },
  { n: 2, text: "ب" },
  { n: 3, text: "ت" },
];

describe("AyahText", () => {
  it("renders only the current ayah, in RTL Arabic with the Quranic font", () => {
    const { container } = render(<AyahText ayahs={ayahs} current={2} />);
    const current = container.querySelector('[aria-current="true"]')!;
    expect(current.getAttribute("lang")).toBe("ar");
    expect(current.getAttribute("dir")).toBe("rtl");
    expect(current.className).toContain("font-quran");
    expect(current.textContent).toBe("ب ﴿٢﴾");
    expect(container.textContent).not.toContain("أ");
    expect(container.textContent).not.toContain("ت");
  });

  it("at the opening shows the first ayah, dimmed and not current", () => {
    const { container } = render(<AyahText ayahs={ayahs} current={0} />);
    expect(container.querySelector('[aria-current="true"]')).toBeNull();
    expect(container.querySelector(".opacity-45")?.textContent).toBe("أ ﴿١﴾");
  });

  it("shows a quiet placeholder while the text loads", () => {
    const { container } = render(<AyahText ayahs={null} current={1} />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});
