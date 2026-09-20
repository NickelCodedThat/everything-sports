import { afterEach, describe, expect, it, vi } from "vitest";
import { readFirstZipEntry } from "@/lib/news/providers/gdelt-gkg/zip";
import { parseGkgRows, recentGkgStamps } from "@/lib/news/providers/gdelt-gkg/client";
import {
  gdeltGkgProvider,
  normalizeGkgArticle,
  stripSiteSuffix,
  windowToFileCount,
} from "@/lib/news/providers/gdelt-gkg/provider";
import { buildZip, gkgRow } from "./helpers-zip";

const LAST_UPDATE =
  "1 abc http://data.gdeltproject.org/gdeltv2/20260920044500.export.CSV.zip\n" +
  "1 def http://data.gdeltproject.org/gdeltv2/20260920044500.mentions.CSV.zip\n" +
  "1 ghi http://data.gdeltproject.org/gdeltv2/20260920044500.gkg.csv.zip\n";

const ROWS = [
  gkgRow({ date: "20260920044500", domain: "ktbb.com", url: "https://ktbb.com/acuna-slam?utm_source=x", title: "Acuña grand slam leads Braves to 6-3 win, dropping Astros from AL West lead &#8211; KTBB News, Weather, Ta" }),
  gkgRow({ date: "20260920044500", domain: "wpsd.com", url: "https://wpsd.com/truck-pull", title: "Special Olympics Kentucky Truck Pull raises more than $35,000" }),
  gkgRow({ date: "20260920044500", domain: "punchng.com", url: "https://punchng.com/probe", title: "NBA demands probe into deaths of 37 illegal miners in Niger" }),
  gkgRow({ date: "20260920044500", domain: "elpais.com", url: "https://elpais.com/x", title: "Real Madrid gana la Liga con un gol de Serie A", translated: true }),
  gkgRow({ date: "20260920044500", domain: "notitle.com", url: "https://notitle.com/a" }),
  gkgRow({ date: "20260920044500", domain: "yahoo.com", url: "https://sports.yahoo.com/nfl-fines", title: "Stefon Diggs fined $15,000 by the NFL | Yahoo Sports" }),
].join("\n");

describe("GKG zip + row parsing", () => {
  it("reads the first entry of a one-entry zip", () => {
    expect(readFirstZipEntry(buildZip("x.csv", "hello\tworld"))).toBe("hello\tworld");
  });

  it("rejects non-zip data with a clear error", () => {
    expect(() => readFirstZipEntry(Buffer.from("not a zip at all, definitely not"))).toThrow(/not a zip/);
  });

  it("parses titles (decoding entities), skips rows without a PAGE_TITLE, and flags translated rows", () => {
    const rows = parseGkgRows(ROWS);
    expect(rows).toHaveLength(5);
    expect(rows[0].title).toContain("–"); // &#8211; decoded
    expect(rows.find((r) => r.domain === "elpais.com")?.translated).toBe(true);
    expect(rows.find((r) => r.domain === "notitle.com")).toBeUndefined();
  });

  it("lists recent 15-minute stamps newest-first across hour and day boundaries", () => {
    expect(recentGkgStamps("20260920004500", 3)).toEqual(["20260920004500", "20260920003000", "20260920001500"]);
    expect(recentGkgStamps("20260920000000", 2)).toEqual(["20260920000000", "20260919234500"]);
  });

  it("maps windows to a bounded file count", () => {
    expect(windowToFileCount("1h")).toBe(4);
    expect(windowToFileCount("6h")).toBe(24);
    expect(windowToFileCount("3d")).toBe(24);
    expect(windowToFileCount("5min")).toBe(2);
  });
});

describe("GKG normalization", () => {
  it("strips publisher-name suffixes but keeps genuine dashes in headlines", () => {
    expect(stripSiteSuffix("Cubs top Reds | 107.5 The Game (WNKT-FM)")).toBe("Cubs top Reds");
    expect(stripSiteSuffix("Acuña slam leads Braves – KTBB News, Weather, Ta")).toBe("Acuña slam leads Braves");
    expect(stripSiteSuffix("Coach says team is ready - and he means it now")).toBe("Coach says team is ready - and he means it now");
  });

  it("keeps sports rows, drops translated / non-sports / false-positive rows", () => {
    const candidates = parseGkgRows(ROWS).map(normalizeGkgArticle).filter((c) => c !== null);
    const headlines = candidates.map((c) => c!.headline);
    expect(headlines).toContain("Stefon Diggs fined $15,000 by the NFL");
    expect(headlines.some((h) => h.includes("Special Olympics"))).toBe(false);
    expect(headlines.some((h) => h.includes("Niger"))).toBe(false);
    expect(headlines.some((h) => h.includes("Real Madrid"))).toBe(false);
  });

  it("strips tracking params from the URL, records GDELT GKG as provider (not publisher), and parses the timestamp", () => {
    const slam = parseGkgRows(ROWS).map(normalizeGkgArticle).find((c) => c?.headline.startsWith("Acuña"));
    expect(slam?.sourceUrl).toBe("https://ktbb.com/acuna-slam");
    expect(slam?.provider).toBe("gdelt-gkg");
    expect(slam?.publisherDomain).toBe("ktbb.com");
    expect(slam?.publishedAt).toBe("2026-09-20T04:45:00Z");
    expect(slam?.classification.sport).toBe("baseball");
  });
});

describe("GKG provider", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubNetwork(handler: (url: string) => Response | Promise<Response>) {
    const fetchMock = vi.fn(async (url: string) => handler(url));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("fetches lastupdate then the requested number of 15-minute files, returning classified candidates", async () => {
    const fetchMock = stubNetwork((url) =>
      url.endsWith("lastupdate.txt") ? new Response(LAST_UPDATE) : new Response(new Uint8Array(buildZip("g.csv", ROWS))),
    );
    const result = await gdeltGkgProvider.fetchCandidates({ sport: "all", window: "30min", limit: 10 });

    expect(result.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(3); // lastupdate + 2 files
    expect(result.candidates.map((c) => c.classification.sport)).toContain("football");
  });

  it("applies the sport filter after classification", async () => {
    stubNetwork((url) =>
      url.endsWith("lastupdate.txt") ? new Response(LAST_UPDATE) : new Response(new Uint8Array(buildZip("g.csv", ROWS))),
    );
    const result = await gdeltGkgProvider.fetchCandidates({ sport: "football", window: "30min", limit: 10 });
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.every((c) => c.classification.sport === "football")).toBe(true);
  });

  it("tolerates a missing (404) file among the batch", async () => {
    let call = 0;
    stubNetwork((url) => {
      if (url.endsWith("lastupdate.txt")) return new Response(LAST_UPDATE);
      call += 1;
      return call === 1 ? new Response("", { status: 404 }) : new Response(new Uint8Array(buildZip("g.csv", ROWS)));
    });
    const result = await gdeltGkgProvider.fetchCandidates({ sport: "all", window: "30min", limit: 10 });
    expect(result.status).toBe("ok");
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it("reports an error when lastupdate.txt is unusable", async () => {
    stubNetwork(() => new Response("garbage"));
    const result = await gdeltGkgProvider.fetchCandidates({ sport: "all", window: "30min", limit: 10 });
    expect(result.status).toBe("error");
  });

  it("reports throttled when the host answers 429", async () => {
    stubNetwork(() => new Response("", { status: 429 }));
    const result = await gdeltGkgProvider.fetchCandidates({ sport: "all", window: "30min", limit: 10 });
    expect(result.status).toBe("throttled");
  });

  it("reports an error when every file is corrupt", async () => {
    stubNetwork((url) => (url.endsWith("lastupdate.txt") ? new Response(LAST_UPDATE) : new Response("this is not a zip file at all!!")));
    const result = await gdeltGkgProvider.fetchCandidates({ sport: "all", window: "30min", limit: 10 });
    expect(result.status).toBe("error");
    expect(result.message).toMatch(/unzipped/);
  });
});
