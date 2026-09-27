import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import NowPlaying from "./NowPlaying";

afterEach(cleanup);

const kahf = {
  number: 18,
  nameArabic: "الكهف",
  nameTransliterated: "Al-Kahf",
  nameEnglish: "The Cave",
  ayahCount: 110,
  revelation: "meccan" as const,
};

describe("NowPlaying", () => {
  it("shows the surah names, number and ayah", () => {
    const { container } = render(<NowPlaying surah={kahf} ayah={23} />);
    const arabic = screen.getByText("الكهف");
    expect(arabic.getAttribute("lang")).toBe("ar");
    expect(arabic.getAttribute("dir")).toBe("rtl");
    expect(screen.getByRole("heading").textContent).toContain("Al-Kahf");
    expect(container.textContent).toContain("The Cave");
    expect(container.textContent).toContain("Surah 18");
    expect(container.textContent).toContain("Ayah 23");
  });

  it("shows Opening for ayah 0", () => {
    const { container } = render(<NowPlaying surah={kahf} ayah={0} />);
    expect(container.textContent).toContain("Opening");
    expect(container.textContent).not.toContain("Ayah 0");
  });

  it("renders a placeholder without a surah", () => {
    const { container } = render(<NowPlaying surah={null} ayah={0} />);
    expect(container.textContent).toContain("Loading");
  });
});
