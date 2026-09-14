import { describe, expect, it } from "vitest";
import { normalizeGdeltArticle, parseGdeltSeenDate } from "@/lib/news/providers/gdelt/normalize";

describe("parseGdeltSeenDate", () => {
  it("parses a well-formed GDELT seendate into ISO 8601", () => {
    expect(parseGdeltSeenDate("20260914T153045Z")).toBe("2026-09-14T15:30:45Z");
  });

  it("returns undefined for missing or malformed values", () => {
    expect(parseGdeltSeenDate(undefined)).toBeUndefined();
    expect(parseGdeltSeenDate("not-a-date")).toBeUndefined();
    expect(parseGdeltSeenDate("2026-09-14")).toBeUndefined();
  });
});

describe("normalizeGdeltArticle", () => {
  it("maps a well-formed article into a NewsCandidate", () => {
    const candidate = normalizeGdeltArticle(
      {
        url: "https://www.espn.com/nba/story/_/id/123/lakers-trade?utm_source=twitter",
        title: "Lakers agree to trade for All-Star forward, NBA sources say",
        seendate: "20260914T153045Z",
        domain: "espn.com",
        language: "English",
        socialimage: "https://example.com/image.jpg",
      },
      "basketball",
    );

    expect(candidate).not.toBeNull();
    expect(candidate?.provider).toBe("gdelt");
    expect(candidate?.headline).toContain("Lakers");
    expect(candidate?.sourceUrl).toBe("https://www.espn.com/nba/story/_/id/123/lakers-trade");
    expect(candidate?.publisherDomain).toBe("espn.com");
    expect(candidate?.publishedAt).toBe("2026-09-14T15:30:45Z");
    expect(candidate?.queryProfile).toBe("basketball");
    expect(candidate?.classification.sport).toBe("basketball");
    // Image is diagnostic-only metadata, never treated as displayable content.
    expect(candidate?.imageRef?.url).toBe("https://example.com/image.jpg");
  });

  it("never identifies GDELT itself as the publisher", () => {
    const candidate = normalizeGdeltArticle(
      { url: "https://apnews.com/story/1", title: "A headline", domain: "apnews.com" },
      "baseball",
    );
    expect(candidate?.publisherDomain).not.toContain("gdeltproject");
    expect(candidate?.publisherDomain).toBe("apnews.com");
  });

  it("rejects a row missing a headline", () => {
    const candidate = normalizeGdeltArticle({ url: "https://example.com/story", domain: "example.com" }, "soccer");
    expect(candidate).toBeNull();
  });

  it("rejects a row missing a usable source URL", () => {
    const candidate = normalizeGdeltArticle({ title: "Headline with no URL", domain: "example.com" }, "soccer");
    expect(candidate).toBeNull();
  });

  it("rejects a row with a malformed URL rather than throwing", () => {
    expect(() =>
      normalizeGdeltArticle({ title: "Headline", url: "not a valid url" }, "tennis"),
    ).not.toThrow();
    const candidate = normalizeGdeltArticle({ title: "Headline", url: "not a valid url" }, "tennis");
    expect(candidate).toBeNull();
  });

  it("still derives a publisher domain from the URL when the provider omits `domain`", () => {
    const candidate = normalizeGdeltArticle({ title: "Headline", url: "https://example.com/story" }, "golf");
    expect(candidate?.publisherDomain).toBe("example.com");
  });
});
