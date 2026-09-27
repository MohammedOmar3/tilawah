import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import StatusLine from "./StatusLine";

afterEach(cleanup);

describe("StatusLine", () => {
  it.each([
    ["idle", "Live"],
    ["connecting", "Connecting…"],
    ["syncing", "Syncing…"],
    ["playing", "Listening"],
    ["reconnecting", "Reconnecting… audio continues"],
    ["error", "Something went wrong"],
  ] as const)("%s → %s", (status, text) => {
    render(<StatusLine status={status} approximate={false} />);
    expect(screen.getByRole("status").textContent).toBe(text);
  });

  it("marks an approximate position", () => {
    render(<StatusLine status="idle" approximate />);
    expect(screen.getByRole("status").textContent).toBe("Live (approximate until you join)");
  });
});
