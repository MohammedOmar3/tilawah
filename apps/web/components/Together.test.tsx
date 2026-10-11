import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TogetherLine, TogetherList, type TogetherInfo } from "./Together";

afterEach(cleanup);

const together: TogetherInfo = {
  recited: { recitedMs: 12 * 86_400_000, surahs: 312, khatms: 2 },
  recitedSinceMs: Date.parse("2026-09-28T00:00:00Z"),
  listening: {
    since: "2026-10-10T12:00:00Z",
    listeningMinutes: 252_600,
    peakListeners: 1204,
    peakAt: "2026-10-10T15:42:10Z",
    countries: 41,
  },
};

describe("TogetherLine", () => {
  it("shows listening time and surahs recited", () => {
    render(<TogetherLine together={together} />);
    expect(screen.getByTestId("together").textContent).toBe("4,210 hours listened together · 312 surahs recited");
  });

  it("shows only surahs until the API reports listening totals", () => {
    render(<TogetherLine together={{ ...together, listening: null, recited: { ...together.recited, surahs: 1 } }} />);
    expect(screen.getByTestId("together").textContent).toBe("1 surah recited");
  });
});

describe("TogetherList", () => {
  it("lists recited and listening totals with their start dates", () => {
    const { container } = render(<TogetherList together={together} />);
    const text = container.textContent;
    expect(text).toContain("Since the recitation began, 28 Sep 2026");
    expect(text).toContain("Recited288 hours");
    expect(text).toContain("Surahs312");
    expect(text).toContain("Khatms2");
    expect(text).toContain("Listened together since 10 Oct 2026");
    expect(text).toContain("Most at once1,204 listeners");
    expect(text).toContain("Countries41");
  });

  it("leaves out listening totals the API has not reported", () => {
    const { container } = render(<TogetherList together={{ ...together, listening: null }} />);
    expect(container.textContent).not.toContain("Listened");
  });
});
