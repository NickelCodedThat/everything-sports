/**
 * Parser for Wikipedia's "Portal:Current events" daily wikitext. Only the
 * "Sports" section is read. Each bullet that cites external sources becomes an
 * item: the bullet's text (markup stripped) plus one entry per cited link
 * (`[https://… (Publisher)]`). Parent bullets such as `*[[2026 WNBA season]]`
 * are kept as context because child text often omits the league.
 */

export interface CurrentEventsLink {
  url: string;
  /** Publisher label from the parenthesized link text, e.g. "Reuters", when present. */
  label?: string;
}

export interface CurrentEventsItem {
  /** Bullet text with wiki markup and citation links removed. */
  text: string;
  /** Nearest preceding parent bullet, e.g. "2026 WNBA season", when the item is nested. */
  parent?: string;
  links: CurrentEventsLink[];
}

const EXTERNAL_LINK = /\[(https?:\/\/[^\s\]]+)(?:\s+([^\]]*))?\]/g;

function stripMarkup(value: string): string {
  return value
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/'{2,}/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function parseLabel(rawLabel: string | undefined): string | undefined {
  if (!rawLabel) return undefined;
  const cleaned = stripMarkup(rawLabel).replace(/^\(/, "").replace(/\)$/, "").trim();
  return cleaned || undefined;
}

/** Returns just the lines belonging to the "Sports" category of a daily page. */
function extractSportsLines(wikitext: string): string[] {
  const lines = wikitext.split("\n");
  const start = lines.findIndex((line) => /^'''\s*Sports\s*'''/.test(line.trim()));
  if (start === -1) return [];

  const section: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("'''") || trimmed.startsWith("<!--") || trimmed.startsWith("{{")) break;
    if (trimmed) section.push(trimmed);
  }
  return section;
}

export function parseSportsSection(wikitext: string): CurrentEventsItem[] {
  const items: CurrentEventsItem[] = [];
  let parent: string | undefined;

  for (const line of extractSportsLines(wikitext)) {
    const depthMatch = /^(\*+)\s*(.*)$/.exec(line);
    if (!depthMatch) continue;
    const depth = depthMatch[1].length;
    const body = depthMatch[2];

    const links: CurrentEventsLink[] = [];
    for (const match of body.matchAll(EXTERNAL_LINK)) {
      links.push({ url: match[1], label: parseLabel(match[2]) });
    }
    const text = stripMarkup(body.replace(EXTERNAL_LINK, ""));

    if (links.length === 0) {
      // A top-level bullet with no citations is a grouping header for the bullets nested under it.
      if (depth === 1) parent = text || undefined;
      continue;
    }

    if (text) items.push({ text, parent: depth > 1 ? parent : undefined, links });
  }

  return items;
}
