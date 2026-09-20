import { describe, expect, it } from "vitest";
import { extractDomain, normalizeUrl } from "@/lib/news/urls/normalize";

describe("normalizeUrl", () => {
  it("strips fragments", () => {
    const result = normalizeUrl("https://example.com/story?a=1#section-2");
    expect(result?.href).toBe("https://example.com/story?a=1");
  });

  it("removes known UTM tracking parameters", () => {
    const result = normalizeUrl(
      "https://example.com/story?utm_source=twitter&utm_medium=social&utm_campaign=launch&id=42",
    );
    expect(result?.href).toBe("https://example.com/story?id=42");
  });

  it("removes fbclid and gclid tracking params", () => {
    const result = normalizeUrl("https://example.com/story?fbclid=abc123&gclid=xyz789");
    expect(result?.href).toBe("https://example.com/story");
  });

  it("preserves meaningful, non-tracking query parameters", () => {
    const result = normalizeUrl("https://example.com/search?query=lakers&page=2");
    expect(result?.href).toBe("https://example.com/search?query=lakers&page=2");
  });

  it("does not remove query params that merely look ugly but aren't known tracking params", () => {
    const result = normalizeUrl("https://example.com/story?ref=homepage&sid=abcdef123456");
    expect(result?.href).toBe("https://example.com/story?ref=homepage&sid=abcdef123456");
  });

  it("normalizes hostname casing and strips a leading www.", () => {
    const result = normalizeUrl("https://WWW.Example.COM/story");
    expect(result?.hostname).toBe("example.com");
  });

  it("does not touch path casing or path segments", () => {
    const result = normalizeUrl("https://example.com/Story/CamelCasePath");
    expect(result?.href).toBe("https://example.com/Story/CamelCasePath");
  });

  it("returns null for malformed input", () => {
    expect(normalizeUrl("not a url")).toBeNull();
    expect(normalizeUrl("")).toBeNull();
  });

  it("returns null for non-http(s) protocols", () => {
    expect(normalizeUrl("ftp://example.com/file")).toBeNull();
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("extractDomain", () => {
  it("returns the normalized hostname", () => {
    expect(extractDomain("https://www.Example.com/story")).toBe("example.com");
  });

  it("returns undefined for malformed URLs", () => {
    expect(extractDomain("not a url")).toBeUndefined();
  });
});

describe("normalizeUrl — additional tracking parameters", () => {
  it("strips real-world tracking params so the same article dedupes across syndicated links", () => {
    const base = "https://example.com/story";
    for (const param of ["ocid", "ncid", "cmpid", "igshid", "ref_src", "mkt_tok", "yclid", "msclkid"]) {
      expect(normalizeUrl(`${base}?${param}=abc`)?.href).toBe(base);
    }
  });

  it("keeps meaningful query params (e.g. article ids)", () => {
    expect(normalizeUrl("https://example.com/story?id=42&ocid=x")?.href).toBe("https://example.com/story?id=42");
  });
});
