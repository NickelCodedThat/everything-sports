import type { Sport } from "@/types/sport";
import { ProviderRateLimitedError, describeFetchError } from "../../errors";
import { buildCandidate } from "../../normalization/build-candidate";
import type { NewsCandidate } from "../../candidates/types";
import type { CandidateProvider, CandidateProviderResult, FetchCandidatesOptions, ProviderUnits } from "../types";
import { fetchGkgFile, fetchLatestGkgStamp, recentGkgStamps, type GkgArticleRaw } from "./client";

/** Each 15-minute file is ~2 MB compressed; cap how many one probe pulls. */
const MAX_FILES = 24;
const FILE_INTERVAL_MINUTES = 15;
const FILE_SPACING_MS = 200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** "3h" → 12 files, "90min" → 6, capped at MAX_FILES (6 hours) and never fewer than 2. */
export function windowToFileCount(window: string): number {
  const match = /^(\d+)(min|h|d|w|m)$/.exec(window);
  if (!match) return 4;
  const value = Number(match[1]);
  const minutes = { min: 1, h: 60, d: 1440, w: 10_080, m: 43_200 }[match[2] as "min" | "h" | "d" | "w" | "m"] * value;
  return Math.min(MAX_FILES, Math.max(2, Math.ceil(minutes / FILE_INTERVAL_MINUTES)));
}

/** GKG `DATE` is `YYYYMMDDHHMMSS` UTC. */
export function parseGkgDate(value: string): string | undefined {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(value);
  if (!match) return undefined;
  const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
  return Number.isNaN(new Date(iso).getTime()) ? undefined : iso;
}

const PUBLISHER_SUFFIX_WORDS =
  /\b(news|times|post|sports?|radio|fm|am|herald|journal|tribune|gazette|weather|network|daily|press|report|online|live|tv)\b/i;

/**
 * GKG page titles are the HTML <title>, which sites suffix with their own
 * name ("… | 99.9 The Example (WXMP-FM)", "… – Example Radio News, Weather, Sp…"). Strips
 * a trailing site-name segment: always after " | ", and after " – "/" - " only
 * when the tail is short and looks like a publisher name, so genuine dashes in
 * headlines survive.
 */
export function stripSiteSuffix(title: string): string {
  const pipe = title.lastIndexOf(" | ");
  if (pipe > 0 && title.slice(0, pipe).trim().split(/\s+/).length >= 3) return title.slice(0, pipe).trim();

  const dash = Math.max(title.lastIndexOf(" – "), title.lastIndexOf(" - "), title.lastIndexOf(" — "));
  if (dash > 0) {
    const head = title.slice(0, dash).trim();
    const tail = title.slice(dash + 3).trim();
    if (head.split(/\s+/).length >= 3 && tail.split(/\s+/).length <= 6 && PUBLISHER_SUFFIX_WORDS.test(tail)) return head;
  }
  return title;
}

/**
 * Normalizes one GKG row. The GKG feed is the whole global news firehose, not
 * a sports query — so the classifier runs with no query origin and rows that
 * don't clear its sport-evidence bar (classification.sport === "unknown") are
 * dropped here. Machine-translated (non-English-original) rows are skipped.
 */
export function normalizeGkgArticle(raw: GkgArticleRaw): NewsCandidate | null {
  if (raw.translated) return null;
  const candidate = buildCandidate({
    provider: "gdelt-gkg",
    headline: stripSiteSuffix(raw.title),
    sourceUrl: raw.url,
    publisherDomainHint: raw.domain,
    publishedAt: parseGkgDate(raw.date),
    language: "English",
    queryProfileLabel: "gkg-firehose",
  });
  if (!candidate || candidate.classification.sport === "unknown") return null;
  return candidate;
}

const UNIT_PREFIX = "gdelt-gkg:";

export function gkgUnitKey(stamp: string): string {
  return `${UNIT_PREFIX}${stamp}`;
}

/** Each 15-minute GKG file is immutable, so it is a natural exactly-once unit for the warehouse. */
export const gdeltGkgUnits: ProviderUnits = {
  async list({ window }) {
    const stamps = recentGkgStamps(await fetchLatestGkgStamp(), windowToFileCount(window));
    return stamps.reverse().map(gkgUnitKey);
  },

  async fetch(unitKey) {
    if (!unitKey.startsWith(UNIT_PREFIX)) throw new Error(`not a GKG unit key: ${unitKey}`);
    const rows = await fetchGkgFile(unitKey.slice(UNIT_PREFIX.length));
    if (rows === null) return null;
    return rows.map(normalizeGkgArticle).filter((candidate): candidate is NewsCandidate => candidate !== null);
  },
};

export const gdeltGkgProvider: CandidateProvider = {
  id: "gdelt-gkg",
  displayName: "GDELT GKG 15-minute files",
  requiresApiKey: false,
  expectedFreshness: "near-realtime",
  units: gdeltGkgUnits,

  async fetchCandidates({ sport, window, limit }: FetchCandidatesOptions): Promise<CandidateProviderResult> {
    const startedAt = Date.now();
    const candidates: NewsCandidate[] = [];
    const errors: string[] = [];
    let throttled = false;

    let stamps: string[];
    try {
      stamps = recentGkgStamps(await fetchLatestGkgStamp(), windowToFileCount(window));
    } catch (error) {
      const message = error instanceof ProviderRateLimitedError ? error.message : describeFetchError(error);
      return {
        providerId: "gdelt-gkg",
        candidates: [],
        status: error instanceof ProviderRateLimitedError ? "throttled" : "error",
        message,
        durationMs: Date.now() - startedAt,
      };
    }

    let filesRead = 0;
    for (const [index, stamp] of stamps.entries()) {
      if (index > 0) await delay(FILE_SPACING_MS);
      try {
        const rows = await fetchGkgFile(stamp);
        if (rows === null) continue;
        filesRead += 1;
        for (const row of rows) {
          const candidate = normalizeGkgArticle(row);
          if (candidate) candidates.push(candidate);
        }
      } catch (error) {
        if (error instanceof ProviderRateLimitedError) {
          throttled = true;
          errors.push(error.message);
          break;
        }
        errors.push(`${stamp}: ${describeFetchError(error)}`);
      }
    }

    // Feed-style provider: sport filtering happens after classification, newest first, limit applied per sport.
    const wanted: Sport | "all" = sport;
    const perSport = new Map<string, number>();
    const selected = candidates
      .filter((candidate) => wanted === "all" || candidate.classification.sport === wanted)
      .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
      .filter((candidate) => {
        const key = candidate.classification.sport;
        const count = perSport.get(key) ?? 0;
        perSport.set(key, count + 1);
        return count < limit;
      });

    const durationMs = Date.now() - startedAt;

    if (throttled && filesRead === 0) {
      return { providerId: "gdelt-gkg", candidates: [], status: "throttled", message: errors.join("; "), durationMs };
    }
    if (filesRead === 0 && errors.length > 0) {
      return { providerId: "gdelt-gkg", candidates: [], status: "error", message: errors.join("; "), durationMs };
    }

    return {
      providerId: "gdelt-gkg",
      candidates: selected,
      status: "ok",
      message: errors.length > 0 ? `partial failures: ${errors.join("; ")}` : undefined,
      durationMs,
    };
  },
};
