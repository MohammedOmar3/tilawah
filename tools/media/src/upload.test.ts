import { describe, expect, it } from "vitest";
import { objectParams } from "./upload";

describe("objectParams", () => {
  it("uses an immutable, versioned key", () => {
    expect(objectParams("/x/output/alafasy/002.m4a", "alafasy", "v1")).toEqual({
      Key: "alafasy/v1/002.m4a",
      ContentType: "audio/mp4",
      CacheControl: "public, max-age=31536000, immutable",
    });
  });
});
