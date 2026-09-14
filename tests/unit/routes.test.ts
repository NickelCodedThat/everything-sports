import { describe, expect, it } from "vitest";
import { getSectionHref, getStoryPath } from "@/lib/routes";

describe("getStoryPath", () => {
  it("builds the canonical internal path from sport and slug", () => {
    expect(getStoryPath({ sport: "basketball", slug: "some-story" })).toBe("/basketball/some-story");
  });

  it("is deterministic for any sport/slug pair", () => {
    expect(getStoryPath({ sport: "mma", slug: "another-story" })).toBe("/mma/another-story");
    expect(getStoryPath({ sport: "other", slug: "culture-piece" })).toBe("/other/culture-piece");
  });
});

describe("getSectionHref", () => {
  it("maps sports with a dedicated nav section to that route", () => {
    expect(getSectionHref("basketball")).toBe("/basketball");
    expect(getSectionHref("football")).toBe("/football");
    expect(getSectionHref("baseball")).toBe("/baseball");
    expect(getSectionHref("soccer")).toBe("/soccer");
    expect(getSectionHref("boxing")).toBe("/fight");
    expect(getSectionHref("mma")).toBe("/fight");
  });

  it("falls back to /latest for sports without a dedicated page", () => {
    expect(getSectionHref("hockey")).toBe("/latest");
    expect(getSectionHref("tennis")).toBe("/latest");
    expect(getSectionHref("other")).toBe("/latest");
  });
});
