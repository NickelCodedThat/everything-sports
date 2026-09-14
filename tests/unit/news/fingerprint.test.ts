import { describe, expect, it } from "vitest";
import { fingerprintCandidate, flagDuplicateFingerprints } from "@/lib/news/candidates/fingerprint";

describe("fingerprintCandidate", () => {
  it("is deterministic for the same URL", () => {
    const a = fingerprintCandidate("https://example.com/story?id=1");
    const b = fingerprintCandidate("https://example.com/story?id=1");
    expect(a).toBe(b);
  });

  it("produces the same fingerprint for URLs that differ only by tracking params", () => {
    const a = fingerprintCandidate("https://example.com/story?id=1");
    const b = fingerprintCandidate("https://example.com/story?id=1&utm_source=twitter&utm_medium=social");
    expect(a).toBe(b);
  });

  it("produces the same fingerprint for URLs that differ only by fragment", () => {
    const a = fingerprintCandidate("https://example.com/story?id=1");
    const b = fingerprintCandidate("https://example.com/story?id=1#comments");
    expect(a).toBe(b);
  });

  it("produces a different fingerprint for genuinely different URLs", () => {
    const a = fingerprintCandidate("https://example.com/story-one");
    const b = fingerprintCandidate("https://example.com/story-two");
    expect(a).not.toBe(b);
  });

  it("produces the same fingerprint regardless of hostname casing", () => {
    const a = fingerprintCandidate("https://Example.com/story");
    const b = fingerprintCandidate("https://example.com/story");
    expect(a).toBe(b);
  });
});

interface FingerprintedItem {
  fingerprint: string;
  isDuplicateUrl?: boolean;
}

describe("flagDuplicateFingerprints", () => {
  it("leaves the first occurrence unflagged and flags subsequent ones", () => {
    const items: FingerprintedItem[] = [
      { fingerprint: "a" },
      { fingerprint: "b" },
      { fingerprint: "a" },
      { fingerprint: "a" },
    ];
    const flagged = flagDuplicateFingerprints(items);
    expect(flagged[0].isDuplicateUrl).toBeUndefined();
    expect(flagged[1].isDuplicateUrl).toBeUndefined();
    expect(flagged[2].isDuplicateUrl).toBe(true);
    expect(flagged[3].isDuplicateUrl).toBe(true);
  });

  it("does not delete or drop any records", () => {
    const items: FingerprintedItem[] = [{ fingerprint: "a" }, { fingerprint: "a" }];
    expect(flagDuplicateFingerprints(items)).toHaveLength(2);
  });

  it("flags nothing when every fingerprint is unique", () => {
    const items: FingerprintedItem[] = [{ fingerprint: "a" }, { fingerprint: "b" }, { fingerprint: "c" }];
    const flagged = flagDuplicateFingerprints(items);
    expect(flagged.every((item) => !item.isDuplicateUrl)).toBe(true);
  });
});
