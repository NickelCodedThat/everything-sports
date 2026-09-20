import { ProviderRateLimitedError, parseRetryAfter } from "../../errors";
import { readFirstZipEntry } from "./zip";

const GDELT_DATA_BASE = "https://data.gdeltproject.org/gdeltv2";
const FILE_INTERVAL_MINUTES = 15;

export interface GkgArticleRaw {
  /** GDELT processing time, `YYYYMMDDHHMMSS` (15-minute resolution). */
  date: string;
  domain: string;
  url: string;
  title: string;
  /** True when GDELT machine-translated the article, i.e. it isn't originally English. */
  translated: boolean;
}

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (response.status === 429) {
    throw new ProviderRateLimitedError(
      "GDELT GKG request failed: 429 Too Many Requests (rate limited)",
      parseRetryAfter(response.headers.get("retry-after")),
    );
  }
  return response;
}

/**
 * GDELT publishes `lastupdate.txt` listing the newest 15-minute export /
 * mentions / gkg files. Returns the newest GKG file's timestamp
 * (`YYYYMMDDHHMMSS`). Note the host redirects http→https; we go straight to https.
 */
export async function fetchLatestGkgStamp(): Promise<string> {
  const response = await fetchOk(`${GDELT_DATA_BASE}/lastupdate.txt`);
  if (!response.ok) throw new Error(`GDELT lastupdate failed: ${response.status} ${response.statusText}`);
  const text = await response.text();
  const match = /\/(\d{14})\.gkg\.csv\.zip/.exec(text);
  if (!match) throw new Error("GDELT lastupdate.txt did not list a GKG file");
  return match[1];
}

/** The `count` most recent GKG file stamps ending at (and including) `latestStamp`, newest first. */
export function recentGkgStamps(latestStamp: string, count: number): string[] {
  const [, y, mo, d, h, mi, s] = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(latestStamp) ?? [];
  if (!y) throw new Error(`invalid GKG stamp "${latestStamp}"`);
  const latest = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));

  const stamps: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const iso = new Date(latest - i * FILE_INTERVAL_MINUTES * 60_000).toISOString();
    stamps.push(iso.replace(/[-:T]/g, "").slice(0, 14));
  }
  return stamps;
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) return String.fromCodePoint(parseInt(body.slice(2), 16));
    if (body.startsWith("#")) return String.fromCodePoint(parseInt(body.slice(1), 10));
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/**
 * Parses GKG 2.1 tab-separated rows. Only the columns we need are read:
 * 1 DATE, 3 SourceCommonName, 4 DocumentIdentifier (URL), 25 TranslationInfo,
 * 26 Extras (holds `<PAGE_TITLE>`). Rows without a page title are skipped.
 */
export function parseGkgRows(text: string): GkgArticleRaw[] {
  const rows: GkgArticleRaw[] = [];
  for (const line of text.split("\n")) {
    const columns = line.split("\t");
    if (columns.length < 27) continue;

    const titleMatch = /<PAGE_TITLE>([\s\S]*?)<\/PAGE_TITLE>/.exec(columns[26]);
    if (!titleMatch) continue;

    rows.push({
      date: columns[1],
      domain: columns[3],
      url: columns[4],
      title: decodeEntities(titleMatch[1]).trim(),
      translated: columns[25].trim().length > 0,
    });
  }
  return rows;
}

/** Downloads and parses one 15-minute GKG file. Returns null if the file doesn't exist (404). */
export async function fetchGkgFile(stamp: string): Promise<GkgArticleRaw[] | null> {
  const response = await fetchOk(`${GDELT_DATA_BASE}/${stamp}.gkg.csv.zip`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GDELT GKG file failed: ${response.status} ${response.statusText}`);

  let text: string;
  try {
    text = readFirstZipEntry(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    throw new Error(`GDELT GKG file ${stamp} could not be unzipped: ${error instanceof Error ? error.message : error}`);
  }
  return parseGkgRows(text);
}
