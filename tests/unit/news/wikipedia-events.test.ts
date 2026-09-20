import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSportsSection } from "@/lib/news/providers/wikipedia-events/parse";
import { currentEventsPageTitle } from "@/lib/news/providers/wikipedia-events/client";
import { wikipediaEventsProvider, windowToDays } from "@/lib/news/providers/wikipedia-events/provider";

/** Trimmed from the real 2026-09-19 Current Events page. */
const WIKITEXT = `'''Politics'''
*[[Some politics]]
**Something else. [https://example.com/politics (Reuters)]

'''Sports'''
*[[2026 Asian Games]]
**The 20th [[Asian Games]] are opened by [[Emperor of Japan|Emperor]] [[Naruhito]] in [[Nagoya]]. [https://www.reuters.com/sports/asian-games-open-nagoya-2026-09-19/ (Reuters)]
*[[2026 WNBA season]]
**In [[women's basketball]], [[Atlanta Dream]] player [[Angel Reese]] becomes the first player in [[Women's National Basketball Association]] history to reach 500 [[Rebound (basketball)|rebounds]] in a single season. [https://bleacherreport.com/articles/25500900-angel-reese (Bleacher Report)] [https://www.espn.com/wnba/story/_/id/1/reese (''ESPN'')]
*The [[Women's Tennis Association]] announces its finals will move to [[Charlotte]]. [https://www.bbc.com/sport/tennis/articles/cmly495rnkq7o (BBC)]
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
    expect(items[0].text).toBe("The 20th Asian Games are opened by Emperor Naruhito in Nagoya.");
    expect(items[1].text).toContain("500 rebounds in a single season.");
    expect(items[1].text).not.toMatch(/\[|\]|https?:/);
  });

  it("keeps the parent event as context and every cited link with its publisher label", () => {
    expect(items[1].parent).toBe("2026 WNBA season");
    expect(items[1].links).toEqual([
      { url: "https://bleacherreport.com/articles/25500900-angel-reese", label: "Bleacher Report" },
      { url: "https://www.espn.com/wnba/story/_/id/1/reese", label: "ESPN" },
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
    const reese = result.candidates.filter((c) => c.headline.includes("Angel Reese"));
    expect(reese.map((c) => c.publisherName).sort()).toEqual(["Bleacher Report", "ESPN"]);
    expect(reese.every((c) => c.classification.sport === "basketball")).toBe(true);
    expect(reese.every((c) => c.publisherDomain !== "wikipedia.org")).toBe(true);
    expect(reese[0].provider).toBe("wikipedia-events");

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
