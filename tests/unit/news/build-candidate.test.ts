import { describe, expect, it } from "vitest";
import { buildCandidate } from "@/lib/news/normalization/build-candidate";

describe("buildCandidate", () => {
  it("rejects a candidate missing a headline", () => {
    expect(
      buildCandidate({
        provider: "gdelt",
        headline: undefined,
        sourceUrl: "https://example.com/a",
        queryProfileSport: "basketball",
      }),
    ).toBeNull();
  });

  it("rejects a candidate missing a usable source URL", () => {
    expect(
      buildCandidate({
        provider: "gdelt",
        headline: "A headline",
        sourceUrl: undefined,
        queryProfileSport: "basketball",
      }),
    ).toBeNull();
  });

  it("rejects a candidate whose URL yields no usable publisher domain", () => {
    expect(
      buildCandidate({
        provider: "gdelt",
        headline: "A headline",
        sourceUrl: "not a valid url",
        queryProfileSport: "basketball",
      }),
    ).toBeNull();
  });

  it("does not populate a snippet for gdelt, whose policy marks snippetDisplayAllowed false", () => {
    const candidate = buildCandidate({
      provider: "gdelt",
      headline: "A headline",
      sourceUrl: "https://example.com/a",
      snippet: "Some snippet text that should not be stored.",
      queryProfileSport: "basketball",
    });
    expect(candidate?.snippet).toBeUndefined();
  });

  it("computes a fingerprint from the normalized URL", () => {
    const candidate = buildCandidate({
      provider: "gdelt",
      headline: "A headline",
      sourceUrl: "https://example.com/a?utm_source=x",
      queryProfileSport: "basketball",
    });
    const candidateNoTracking = buildCandidate({
      provider: "gdelt",
      headline: "A headline",
      sourceUrl: "https://example.com/a",
      queryProfileSport: "basketball",
    });
    expect(candidate?.fingerprint).toBe(candidateNoTracking?.fingerprint);
  });

  it("runs classification and attaches possibleSport when known", () => {
    const candidate = buildCandidate({
      provider: "gdelt",
      headline: "NBA trade sends star to contender",
      sourceUrl: "https://example.com/a",
      queryProfileSport: "basketball",
    });
    expect(candidate?.possibleSport).toBe("basketball");
    expect(candidate?.classification.confidence).toBe("high");
  });
});

describe("buildCandidate — source quality and unscoped feeds", () => {
  it("records an operational source-quality bucket from the publisher domain", () => {
    const known = buildCandidate({ provider: "gdelt", headline: "Lakers beat Celtics in overtime", sourceUrl: "https://www.espn.com/nba/story/1", queryProfileSport: "basketball" });
    const unknown = buildCandidate({ provider: "gdelt", headline: "Lakers beat Celtics in overtime", sourceUrl: "https://ktop1490.com/a", queryProfileSport: "basketball" });
    expect(known?.sourceQuality).toBe("known");
    expect(unknown?.sourceQuality).toBe("unknown");
  });

  it("labels feed-style candidates with no query sport instead of inventing a query profile", () => {
    const candidate = buildCandidate({
      provider: "wikipedia-events",
      headline: "Stefon Diggs fined $15,000 by the NFL",
      sourceUrl: "https://example.com/a",
      queryProfileLabel: "current-events",
    });
    expect(candidate?.queryProfile).toBe("current-events");
    expect(candidate?.classification.sport).toBe("football");
  });
});
