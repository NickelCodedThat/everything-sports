import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSportsSection } from "@/lib/news/providers/wikipedia-events/parse";
import { currentEventsPageTitle } from "@/lib/news/providers/wikipedia-events/client";
import { wikipediaEventsProvider, windowToDays } from "@/lib/news/providers/wikipedia-events/provider";

/** Synthetic page in the same wikitext shape as a Portal:Current_events day (invented events and example.com links). */
const WIKITEXT = `'''Politics'''
*[[Some politics]]
**Something else. [https://example.com/politics (Example Wire)]

'''Sports'''
*[[2026 Regional Games]]
**The 5th [[Regional Games]] are opened by a [[Head of state|head of state]] in [[Springfield]]. [https://www.example-wire.com/sports/regional-games-open (Example Wire)]
*[[2026 WNBA season]]
**In [[women's basketball]], [[Atlanta Dream]] forward Jane Placeholder becomes the first player in [[Women's National Basketball Association]] history to reach a fictional [[Rebound (basketball)|rebounds]] milestone. [https://example-sports.com/articles/placeholder-milestone (Example Sports)] [https://www.example-network.com/wnba/story/1 (''Example Network'')]
*The [[Women's Tennis Association]] announces its finals will move to [[Charlotte]]. [https://www.example-news.co.uk/sport/tennis/articles/abc123 (Example News)]
*A bullet with no citation at all.
<!-- All news items above this line -->

{{Current events|year=2026|month=09|day=19|bottom=yes}}`;

describe("parseSportsSection", () => {
  const items = parseSportsSection(WIKITEXT);

  it("reads only the Sports section", () => {
    expect(items).toHaveLength(3);
    expect(items.some((i) => i.text.includes("Something else"))).toBe(false);
  });

  it("strips wiki markup and citation links from the text", () => {
    expect(items[0].text).toBe("The 5th Regional Games are opened by a head of state in Springfield.");
    expect(items[1].text).toContain("milestone.");
    expect(items[1].text).not.toMatch(/\[|\]|https?:/);
  });

  it("keeps the parent event as context and every cited link with its publisher label", () => {
    expect(items[1].parent).toBe("2026 WNBA season");
    expect(items[1].links).toEqual([
      { url: "https://example-sports.com/articles/placeholder-milestone", label: "Example Sports" },
      { url: "https://www.example-network.com/wnba/story/1", label: "Example Network" },
    ]);
    expect(items[2].parent).toBeUndefined();
  });

  it("returns nothing for a page with no Sports section", () => {
    expect(parseSportsSection("'''Politics'''\n*x [https://a.com/b (AP)]")).toEqual([]);
  });
});

describe("Wikipedia Current Events provider", () => {
  afterEach(() => vi.unstubAllGlobals());

  const page = (wikitext: string) => new Response(JSON.stringify({ parse: { wikitext } }), { headers: { "content-type": "application/json" } });
  const missing = () => new Response(JSON.stringify({ error: { code: "missingtitle" } }), { headers: { "content-type": "application/json" } });

  it("builds daily page titles from a UTC date", () => {
    expect(currentEventsPageTitle(new Date("2026-09-19T12:00:00Z"))).toBe("Portal:Current_events/2026_September_19");
  });

  it("maps windows to a bounded number of daily pages", () => {
    expect(windowToDays("3h")).toBe(2);
    expect(windowToDays("3d")).toBe(3);
    expect(windowToDays("30d")).toBe(7);
    expect(windowToDays("nonsense")).toBe(2);
  });

  it("emits one candidate per cited publisher link, classified with parent-event context, and never uses the provider as publisher", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(page(WIKITEXT)).mockResolvedValueOnce(missing());
    vi.stubGlobal("fetch", fetchMock);

    const result = await wikipediaEventsProvider.fetchCandidates({ sport: "all", window: "3h", limit: 25 });

    expect(result.status).toBe("ok");
    expect(result.candidates).toHaveLength(4); // 1 + 2 + 1 links
    const milestone = result.candidates.filter((c) => c.headline.includes("Jane Placeholder"));
    expect(milestone.map((c) => c.publisherName).sort()).toEqual(["Example Network", "Example Sports"]);
    expect(milestone.every((c) => c.classification.sport === "basketball")).toBe(true);
    expect(milestone.every((c) => c.publisherDomain !== "wikipedia.org")).toBe(true);
    expect(milestone[0].provider).toBe("wikipedia-events");

    // Wikimedia etiquette: descriptive User-Agent, sequential requests.
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["user-agent"]).toMatch(/EverythingSportsNewsroom/);
  });

  it("filters to a requested sport", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(page(WIKITEXT)).mockResolvedValueOnce(missing()));
    const result = await wikipediaEventsProvider.fetchCandidates({ sport: "basketball", window: "3h", limit: 25 });
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.every((c) => c.classification.sport === "basketball")).toBe(true);
  });

  it("treats a not-yet-created day page as empty, not an error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => missing()));
    const result = await wikipediaEventsProvider.fetchCandidates({ sport: "all", window: "3h", limit: 25 });
    expect(result).toMatchObject({ status: "ok", candidates: [] });
  });

  it("reports 429 as throttled and stops requesting", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response("", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await wikipediaEventsProvider.fetchCandidates({ sport: "all", window: "3d", limit: 25 });
    expect(result.status).toBe("throttled");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports malformed JSON as an error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response("<html>nope</html>", { status: 200 })));
    const result = await wikipediaEventsProvider.fetchCandidates({ sport: "all", window: "3h", limit: 25 });
    expect(result.status).toBe("error");
  });
});
