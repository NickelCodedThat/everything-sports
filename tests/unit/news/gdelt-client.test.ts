import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGdeltArticles } from "@/lib/news/providers/gdelt/client";

function jsonResponse(body: unknown, init: { status?: number; contentType?: string } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": init.contentType ?? "application/json" },
  });
}

describe("fetchGdeltArticles", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests the documented GDELT DOC 2.0 JSON article-list shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ articles: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchGdeltArticles({ query: "(NBA) sourcelang:english", window: "3h", limit: 25 });

    const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestedUrl.origin + requestedUrl.pathname).toBe("https://api.gdeltproject.org/api/v2/doc/doc");
    expect(requestedUrl.searchParams.get("mode")).toBe("artlist");
    expect(requestedUrl.searchParams.get("format")).toBe("json");
    expect(requestedUrl.searchParams.get("query")).toBe("(NBA) sourcelang:english");
    expect(requestedUrl.searchParams.get("timespan")).toBe("3h");
    expect(requestedUrl.searchParams.get("maxrecords")).toBe("25");
  });

  it("clamps maxrecords into GDELT's 1-250 supported range", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ articles: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchGdeltArticles({ query: "(NBA)", window: "3h", limit: 5000 });
    const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestedUrl.searchParams.get("maxrecords")).toBe("250");
  });

  it("falls back to a safe timespan for an unrecognized window string", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ articles: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchGdeltArticles({ query: "(NBA)", window: "not-a-timespan", limit: 25 });
    const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestedUrl.searchParams.get("timespan")).toBe("3h");
  });

  it("returns the articles array from a well-formed response", async () => {
    const articles = [{ title: "A", url: "https://example.com/a" }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ articles })));

    const result = await fetchGdeltArticles({ query: "(NBA)", window: "3h", limit: 25 });
    expect(result).toEqual(articles);
  });

  it("returns an empty array when the response has no articles field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));
    const result = await fetchGdeltArticles({ query: "(NBA)", window: "3h", limit: 25 });
    expect(result).toEqual([]);
  });

  it("throws a clear error on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("rate limited", { status: 429, statusText: "Too Many Requests" })),
    );
    await expect(fetchGdeltArticles({ query: "(NBA)", window: "3h", limit: 25 })).rejects.toThrow(/429/);
  });

  it("throws a clear error when GDELT returns an HTML error page instead of JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>malformed query</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );
    await expect(fetchGdeltArticles({ query: "bad(((query", window: "3h", limit: 25 })).rejects.toThrow(
      /non-JSON/,
    );
  });

  it("throws a clear error when the body claims JSON but isn't parseable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{not valid json", { headers: { "content-type": "application/json" } })),
    );
    await expect(fetchGdeltArticles({ query: "(NBA)", window: "3h", limit: 25 })).rejects.toThrow(/JSON/);
  });
});
