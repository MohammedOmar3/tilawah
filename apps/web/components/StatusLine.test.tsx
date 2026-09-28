import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import StatusLine from "./StatusLine";

afterEach(cleanup);

describe("StatusLine", () => {
  it.each([
    ["idle", "Now reciting"],
    ["connecting", "Connecting…"],
    ["syncing", "Syncing…"],
    ["playing", "In sync"],
    ["reconnecting", "Reconnecting… audio continues"],
    ["error", "Something went wrong"],
  ] as const)("%s → %s", (status, text) => {
    render(<StatusLine status={status} />);
    const s = screen.getByRole("status");
    expect(s.textContent).toBe(text);
    expect(s.getAttribute("data-status")).toBe(status);
  });
});
