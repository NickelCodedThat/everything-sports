import { DIVERSITY, SECTION, SLATE_DEPTH } from "./config";
import { contentTokens, jaccard } from "../clustering/text";
import { DESK_IDS } from "./sections";
import type { DeskId, Eligibility, EditorialStatus, SlateSectionId, Urgency } from "./types";

/** What the slate needs to know about one editorial item — a plain shape both ranked clusters and stored rows can supply. */
export interface SlateItem {
  itemId: string;
  clusterId: string;
  headline: string | null;
  score: number;
  urgency: Urgency;
  sport: string;
  desk: DeskId;
  eventType: string | null;
  sourceCount: number;
  eligibility: Eligibility;
  status: EditorialStatus;
  lead: boolean;
  wire: boolean;
  now: boolean;
  /** Substantive enough for its native desk. */
  deskOk: boolean;
  /** team:/name: entity keys, used to spot one event that clustering split in two. */
  entityKeys: string[];
  latestAt: Date | null;
  teams: string[];
  /** force_section override target, if any. */
  forcedSection: string | null;
  pinned: boolean;
}

export type SlateDepth = Record<SlateSectionId, number>;
export type DiversityConfig = { -readonly [K in keyof typeof DIVERSITY]: number };

export interface SlateEntry {
  item: SlateItem;
  section: SlateSectionId;
  /** 1-based within the section. */
  position: number;
}

export interface SlateSkip {
  clusterId: string;
  section: SlateSectionId;
  reason: string;
}

export interface Slate {
  sections: Record<SlateSectionId, SlateEntry[]>;
  skipped: SlateSkip[];
  diversity: DiversityConfig;
  depth: SlateDepth;
}

export interface SlateOptions {
  depth?: Partial<SlateDepth>;
  diversity?: Partial<DiversityConfig>;
}

const sharedCount = (a: string[], b: string[]) => a.filter((key) => b.includes(key)).length;
/** Probably one event that clustering split: ≥ N shared entities, or a shared entity plus similar wording, or near-identical wording. */
function sameEvent(a: SlateItem, b: SlateItem, minShared: number): boolean {
  const shared = sharedCount(a.entityKeys, b.entityKeys);
  if (shared >= minShared) return true;
  const overlap = jaccard(contentTokens(a.headline ?? ""), contentTokens(b.headline ?? ""));
  return (shared >= 1 && overlap >= 0.3) || overlap >= 0.4;
}
const withinHours = (a: Date | null, b: Date | null, hours: number) => !a || !b || Math.abs(a.getTime() - b.getTime()) <= hours * 3_600_000;

const SECTION_ORDER: SlateSectionId[] = ["lead", "wire", ...DESK_IDS, "now"];

/**
 * Build the internal front-page slate from ranked, eligible editorial items.
 *
 * Rules:
 *  - Only eligible/review items that an editor has not held or rejected are considered.
 *  - A cluster appears ONCE across the whole slate. Fill order is Lead → Wire → desks → Now,
 *    so the freshest cross-sport news is not consumed before each desk gets its own depth.
 *  - Lead: the highest-scoring lead-qualified item — any sport. Pinned items sort first
 *    (a pin is a score bonus, and never bypasses eligibility).
 *  - An editor's force_section override moves an item to that section only if it qualifies.
 *  - Sections are quiet-tolerant: fewer items rather than filler (Now also has a score floor).
 *  - Diversity (per section): ≤ 2 items per team; Wire/Now ≤ 40% of one sport; ≤ 50% of one
 *    event type; ≤ 3 per team across the slate. Breaking-candidates, pins and developing stories
 *    with ≥ 6 independent sources are EXEMPT — a genuinely dominant news moment can be lopsided.
 *  - Same-event guard: a cluster sharing ≥ 2 team/person entities with one already on the slate
 *    (same sport, reported within 24h) is probably the SAME event that clustering split in two;
 *    only the better-ranked one is shown (never applied to pins).
 *    Every skip is reported in `skipped` with its reason.
 */
export function buildSlate(items: SlateItem[], options: SlateOptions = {}): Slate {
  const depth: SlateDepth = { ...SLATE_DEPTH, ...options.depth } as SlateDepth;
  const diversity: DiversityConfig = { ...DIVERSITY, ...options.diversity };

  const pool = items
    .filter((item) => item.eligibility !== "ineligible" && item.headline && item.status !== "held" && item.status !== "rejected" && item.status !== "published")
    .sort((a, b) => b.score - a.score || (a.clusterId < b.clusterId ? -1 : 1));

  const used = new Set<string>();
  const sections = Object.fromEntries(SECTION_ORDER.map((id) => [id, [] as SlateEntry[]])) as Record<SlateSectionId, SlateEntry[]>;
  const skipped: SlateSkip[] = [];
  const teamAcrossSlate = new Map<string, number>();
  const placed: SlateItem[] = [];

  const qualifies = (item: SlateItem, section: SlateSectionId): boolean => {
    if (section === "lead") return item.lead;
    if (section === "wire") return item.wire;
    if (section === "now") return item.now;
    return item.desk === section && item.deskOk;
  };
  // Forced placement wins over the native section, but only into a section the item qualifies for.
  const belongsTo = (item: SlateItem, section: SlateSectionId): boolean => {
    if (item.forcedSection && item.forcedSection !== "" && qualifies(item, item.forcedSection as SlateSectionId) && SECTION_ORDER.includes(item.forcedSection as SlateSectionId)) {
      return item.forcedSection === section;
    }
    return qualifies(item, section);
  };

  for (const section of SECTION_ORDER) {
    const limit = depth[section];
    const candidates = pool.filter((item) => !used.has(item.clusterId) && belongsTo(item, section));
    candidates.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.score - a.score || (a.clusterId < b.clusterId ? -1 : 1));
    const cross = section === "wire" || section === "now";
    const teamCount = new Map<string, number>();
    const sportCount = new Map<string, number>();
    const typeCount = new Map<string, number>();

    for (const item of candidates) {
      if (sections[section].length >= limit) break;
      if (section === "now" && item.score < SECTION.now.minScore && !item.pinned) continue;
      const exempt = item.urgency === "breaking-candidate" || item.pinned || (item.urgency !== "normal" && item.sourceCount >= diversity.dominantMinSources);
      let reason: string | null = null;
      if (!item.pinned) {
        const twin = placed.find((p) => p.sport === item.sport && withinHours(p.latestAt, item.latestAt, 24) && sameEvent(p, item, diversity.sameEventSharedEntities));
        if (twin) {
          const shared = item.entityKeys.filter((key) => twin.entityKeys.includes(key)).join(", ");
          skipped.push({ clusterId: item.clusterId, section, reason: `probable duplicate of "${(twin.headline ?? "").slice(0, 60)}" (shares ${shared})` });
          continue;
        }
      }
      if (!exempt) {
        const overTeam = item.teams.find((team) => (teamCount.get(team) ?? 0) >= diversity.maxPerTeamPerSection || (teamAcrossSlate.get(team) ?? 0) >= diversity.maxPerTeamAcrossSlate);
        if (overTeam) reason = `team concentration (${overTeam})`;
        else if (cross && (sportCount.get(item.sport) ?? 0) + 1 > Math.max(1, Math.ceil(limit * diversity.maxSportShare))) reason = `sport concentration (${item.sport})`;
        else if (cross && item.eventType && (typeCount.get(item.eventType) ?? 0) + 1 > Math.max(1, Math.ceil(limit * diversity.maxEventTypeShare))) reason = `event-type concentration (${item.eventType})`;
      }
      if (reason) {
        skipped.push({ clusterId: item.clusterId, section, reason });
        continue;
      }
      sections[section].push({ item, section, position: sections[section].length + 1 });
      used.add(item.clusterId);
      placed.push(item);
      for (const team of item.teams) {
        teamCount.set(team, (teamCount.get(team) ?? 0) + 1);
        teamAcrossSlate.set(team, (teamAcrossSlate.get(team) ?? 0) + 1);
      }
      sportCount.set(item.sport, (sportCount.get(item.sport) ?? 0) + 1);
      if (item.eventType) typeCount.set(item.eventType, (typeCount.get(item.eventType) ?? 0) + 1);
    }
  }
  return { sections, skipped, diversity, depth };
}

export { SECTION_ORDER };
