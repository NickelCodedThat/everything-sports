import { describe, expect, it } from "vitest";
import { normalizeNewsDataArticle, parseNewsDataPubDate } from "@/lib/news/providers/newsdata/normalize";

describe("parseNewsDataPubDate", () => {
  it("parses NewsData's 'YYYY-MM-DD HH:MM:SS' format into ISO 8601", () => {
    expect(parseNewsDataPubDate("2026-09-14 15:30:45")).toBe("2026-09-14T15:30:45Z");
  });

  it("returns undefined for missing or malformed values", () => {
    expect(parseNewsDataPubDate(undefined)).toBeUndefined();
    expect(parseNewsDataPubDate("not a date")).toBeUndefined();
  });
});

describe("normalizeNewsDataArticle", () => {
  it("maps a well-formed article into the same NewsCandidate shape as GDELT", () => {
    const candidate = normalizeNewsDataArticle(
      {
        article_id: "abc123",
        title: "Cowboys sign veteran lineman ahead of NFL deadline",
        link: "https://www.si.com/nfl/story?utm_campaign=push",
        description: "A short summary of the signing.",
        pubDate: "2026-09-14 12:00:00",
        source_id: "si",
        source_name: "Sports Illustrated",
        language: "english",
        category: ["sports"],
        image_url: "https://example.com/photo.jpg",
      },
      "football",
    );

    expect(candidate).not.toBeNull();
    expect(candidate?.provider).toBe("newsdata");
    expect(candidate?.providerItemId).toBe("abc123");
    expect(candidate?.sourceUrl).toBe("https://www.si.com/nfl/story");
    expect(candidate?.publisherDomain).toBe("si.com");
    expect(candidate?.publishedAt).toBe("2026-09-14T12:00:00Z");
    expect(candidate?.providerCategories).toEqual(["sports"]);
    expect(candidate?.imageRef?.url).toBe("https://example.com/photo.jpg");
  });

  it("does not populate a snippet, since NewsData's policy record marks snippetDisplayAllowed false", () => {
    const candidate = normalizeNewsDataArticle(
      { title: "Headline", link: "https://example.com/a", description: "Some description text" },
      "hockey",
    );
    expect(candidate?.snippet).toBeUndefined();
  });

  it("rejects a row missing a headline or URL", () => {
    expect(normalizeNewsDataArticle({ link: "https://example.com/a" }, "golf")).toBeNull();
    expect(normalizeNewsDataArticle({ title: "Headline only" }, "golf")).toBeNull();
  });

  it("rejects a row with a malformed URL rather than throwing", () => {
    expect(() =>
      normalizeNewsDataArticle({ title: "Headline", link: "not a url" }, "tennis"),
    ).not.toThrow();
    expect(normalizeNewsDataArticle({ title: "Headline", link: "not a url" }, "tennis")).toBeNull();
  });
});
