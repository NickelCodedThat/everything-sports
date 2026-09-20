/** Small, dependency-free text helpers for headline comparison. */

const SOURCE_SUFFIX = /\s[–—|]\s[^–—|]{2,60}$/;

/** "Headline – Orange County Register" → "Headline". Publisher-branding suffixes are noise for matching. */
export function stripSourceSuffix(headline: string): string {
  return headline.replace(SOURCE_SUFFIX, "").trim();
}

export function stripDiacritics(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/** Numbers spelled out in headlines that otherwise differ only in spelling ("six-start" vs "6-start"). */
const NUMBER_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12",
};

export const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "in", "on", "at", "to", "for", "from", "with", "by", "as", "is", "are",
  "was", "were", "be", "been", "it", "its", "his", "her", "their", "this", "that", "these", "those", "than", "then",
  "after", "before", "over", "past", "into", "out", "up", "down", "off", "vs", "vs.", "v", "not", "no", "has", "have",
  "had", "will", "can", "how", "what", "who", "why", "when", "s", "us", "we", "our", "new", "one",
]);

/** Lower-cased content words of a headline: no diacritics, possessives or stopwords, spelled-out numbers normalized. */
export function contentTokens(headline: string): string[] {
  const cleaned = stripDiacritics(stripSourceSuffix(headline))
    .toLowerCase()
    .replace(/[’']s\b/g, "")
    .replace(/[’']/g, "");
  return cleaned
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((token) => NUMBER_WORDS[token] ?? token)
    .filter((token) => (token.length > 1 || /^\d$/.test(token)) && !STOPWORDS.has(token));
}

export function jaccard(a: Iterable<string>, b: Iterable<string>): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  let shared = 0;
  for (const item of setA) if (setB.has(item)) shared++;
  return shared / (setA.size + setB.size - shared);
}

export function intersect<T>(a: Iterable<T>, b: Iterable<T>): T[] {
  const setB = new Set(b);
  return [...new Set(a)].filter((item) => setB.has(item)).sort();
}

const SCORE_DASH = /(?<![\d/-])(\d{1,3})\s?[-–]\s?(\d{1,3})(?![\d/-])/g;
const SCORE_LINE = /\b[A-Z][\w.'’-]*(?: [A-Z][\w.'’-]*)* (\d{1,3}), [A-Z][\w.'’-]*(?: [A-Z][\w.'’-]*)* (\d{1,3})\b/g;

/**
 * Final-score evidence ("6-3", "Angels 6, Twins 5") as unordered keys — "3-6" and "6-3" are the
 * same game, "6-3" and "5-2" are not. Years, dates and times never look like a score.
 */
export function extractScores(headline: string): string[] {
  const keys = new Set<string>();
  const add = (x: string, y: string) => {
    const a = Number(x);
    const b = Number(y);
    if (a > 250 || b > 250) return;
    keys.add(`${Math.min(a, b)}-${Math.max(a, b)}`);
  };
  for (const m of headline.matchAll(SCORE_DASH)) add(m[1], m[2]);
  for (const m of headline.matchAll(SCORE_LINE)) add(m[1], m[2]);
  return [...keys].sort();
}

const MONEY = /\$\s?(\d[\d,]*(?:\.\d+)?)\s?(million|billion|thousand|m|b|k)?\b/gi;

/** Dollar amounts, normalized to whole dollars ("$15,000", "$15K" → "$15000"). */
export function extractAmounts(headline: string): string[] {
  const keys = new Set<string>();
  for (const m of headline.matchAll(MONEY)) {
    const base = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(base)) continue;
    const unit = (m[2] ?? "").toLowerCase();
    const mult = unit === "million" || unit === "m" ? 1e6 : unit === "billion" || unit === "b" ? 1e9 : unit === "thousand" || unit === "k" ? 1e3 : 1;
    keys.add(`$${Math.round(base * mult)}`);
  }
  return [...keys].sort();
}
