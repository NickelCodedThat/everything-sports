import { describe, expect, it } from "vitest";
import { buildCandidate } from "@/lib/news/normalization/build-candidate";
import { applyIntakeFilter } from "@/lib/news/filters/intake";
import { headlineKindFor, normalizeHeadline, normalizedUrlKey, toCandidatePayload, toRejectionPayload } from "@/lib/news/warehouse/normalize";

describe("normalizeHeadline", () => {
  it("lowercases, collapses whitespace and trims", () => {
    expect(normalizeHeadline("  Herons   RALLY \t past\nOwls  ")).toBe("herons rally past owls");
  });

  it("normalizes smart punctuation, dashes and ellipses", () => {
    expect(normalizeHeadline("Herons’ “big” win — Owls fall…")).toBe("herons' \"big\" win - owls fall...");
    expect(normalizeHeadline("2–10 record")).toBe("2-10 record");
  });

  it("applies Unicode compatibility normalization and strips zero-width characters", () => {
    expect(normalizeHeadline("Ｈｅｒｏｎｓ win")).toBe("herons win");
    expect(normalizeHeadline("Her​ons win")).toBe("herons win");
  });

  it("never removes words or fuzzes wording", () => {
    expect(normalizeHeadline("Cubs top Reds")).not.toBe(normalizeHeadline("Cubs beat Reds"));
    expect(normalizeHeadline("The Herons win")).toBe("the herons win");
  });

  it("is idempotent", () => {
    const once = normalizeHeadline("  Herons’  WIN — again ");
    expect(normalizeHeadline(once)).toBe(once);
  });

  it("keeps accented characters (no ASCII folding)", () => {
    expect(normalizeHeadline("Señor Núñez homers")).toBe("señor núñez homers");
  });
});

describe("headlineKindFor", () => {
  it("treats publisher-title providers and discovery-text providers differently, defaulting to restrictive", () => {
    expect(headlineKindFor("gdelt-gkg")).toBe("publisher-title");
    expect(headlineKindFor("gdelt")).toBe("publisher-title");
    expect(headlineKindFor("wikipedia-events")).toBe("discovery-text");
    expect(headlineKindFor("some-unregistered-provider")).toBe("discovery-text");
  });
});

describe("normalizedUrlKey", () => {
  it("matches the Phase 3 normalization (tracking params, fragments, host case)", () => {
    expect(normalizedUrlKey("https://EXAMPLE.com/a?utm_source=x&id=1#frag")).toBe("https://example.com/a?id=1");
  });
});

describe("payload mapping (domain → storage)", () => {
  const candidate = buildCandidate({
    provider: "gdelt-gkg",
    providerItemId: "abc",
    headline: "Herons  rally past Owls",
    sourceUrl: "https://www.Example-News.com/mlb/1?utm_medium=x",
    publisherName: "Example News",
    publishedAt: "2026-09-20T04:45:00Z",
    language: "English",
    queryProfileSport: "baseball",
    imageRef: { url: "https://cdn.example.com/x.jpg", note: "diagnostic" },
  })!;

  it("maps every stored field and keeps the domain type separate from row types", () => {
    const payload = toCandidatePayload(candidate);
    expect(payload).toMatchObject({
      provider_item_id: "abc",
      headline: "Herons  rally past Owls",
      normalized_headline: "herons rally past owls",
      headline_kind: "publisher-title",
      normalized_source_url: "https://www.example-news.com/mlb/1",
      publisher_domain: "example-news.com",
      publisher_name: "Example News",
      source_quality: "unknown",
      sport: "baseball",
      language: "English",
      remote_image_ref: "https://cdn.example.com/x.jpg",
      query_profile: "baseball",
    });
    expect(payload.classification_signals.length).toBeGreaterThan(0);
  });

  it("carries no article body, snippet or image bytes — only metadata", () => {
    const keys = Object.keys(toCandidatePayload(candidate));
    expect(keys).not.toContain("snippet");
    expect(keys).not.toContain("body");
    expect(keys.filter((k) => k.includes("image"))).toEqual(["remote_image_ref"]);
  });

  it("maps rejections to headline + link metadata + reasons", () => {
    const junk = buildCandidate({ provider: "gdelt-gkg", headline: "Best bets and parlay picks for Sunday", sourceUrl: "https://tips.example/x", queryProfileSport: "baseball" })!;
    const [rejected] = applyIntakeFilter([junk]).rejected;
    expect(toRejectionPayload(rejected)).toEqual({
      fingerprint: junk.fingerprint,
      headline: "Best bets and parlay picks for Sunday",
      source_url: "https://tips.example/x",
      publisher_domain: "tips.example",
      publisher_name: null,
      source_quality: "unknown",
      sport: "baseball",
      reasons: ["betting-or-fantasy"],
    });
  });
});
