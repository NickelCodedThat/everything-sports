import type { EventType, MatchConfidence } from "../clustering/config";

export type EditorialStatus = "candidate" | "review" | "approved" | "held" | "rejected" | "published";
export type Urgency = "normal" | "developing" | "breaking-candidate";
export type Eligibility = "eligible" | "review" | "ineligible";
export type DeskId = "run" | "huddle" | "diamond" | "fight-desk" | "world-game" | "across-the-board";
export type SlateSectionId = "lead" | "wire" | "now" | DeskId;
export type SourceQuality = "known" | "unknown" | "low-quality";
export type OverrideKind = "pin" | "boost" | "suppress" | "force_section" | "force_priority";

export interface MemberInput {
  candidateId: string;
  headline: string;
  headlineKind: "publisher-title" | "discovery-text";
  url: string;
  domain: string;
  sourceName: string;
  quality: SourceQuality;
  sourceEnabled: boolean;
  providerKey: string;
  /** published_at, falling back to discovered_at — when the report appeared. */
  reportedAt: Date;
  publishedAt: Date | null;
}

export interface NearMissInput {
  reason: string;
  confidence: MatchConfidence;
}

/** Everything the ranker knows about one cluster. Pure data — no database handles. */
export interface ClusterInput {
  clusterId: string;
  sport: string;
  league: string | null;
  eventType: EventType | null;
  status: string;
  confidence: MatchConfidence;
  canonicalHeadline: string | null;
  representativeCandidateId: string | null;
  candidateCount: number;
  sourceCount: number;
  providerCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  firstPublishedAt: Date | null;
  lastPublishedAt: Date | null;
  entities: string[];
  members: MemberInput[];
  nearMisses: NearMissInput[];
}

export interface OverrideInput {
  id: number;
  kind: OverrideKind;
  amount: number | null;
  text: string | null;
  reason: string | null;
  createdAt: Date;
}

export interface EligibilityReason {
  code: string;
  severity: "ineligible" | "review" | "info";
  detail: string;
}

export interface EligibilityResult {
  state: Eligibility;
  reasons: EligibilityReason[];
}

export interface ScorePart {
  key: string;
  label: string;
  points: number;
  detail?: string;
}

export interface SectionEligibility {
  lead: boolean;
  wire: boolean;
  now: boolean;
  /** Substantive enough for its native desk. */
  desk: boolean;
  /** Why an otherwise-eligible item did not qualify for Lead/Wire — inspectable, never silent. */
  notes: string[];
}

export interface RankedCluster {
  clusterId: string;
  input: ClusterInput;
  headline: string | null;
  eligibility: EligibilityResult;
  urgency: Urgency;
  urgencyReasons: string[];
  desk: DeskId;
  sectionEligibility: SectionEligibility;
  /** Sum of scoreParts, rounded to 2 dp. Present for ineligible clusters too (for inspection). */
  finalScore: number;
  scoreParts: ScorePart[];
  priority: 1 | 2 | 3 | 4;
  /** 1-based among ELIGIBLE (incl. review) clusters; null when ineligible. */
  position: number | null;
  overrides: OverrideInput[];
  /** Overrides that were requested but had no effect, and why (e.g. force_section into a section the item cannot enter). */
  ignoredOverrides: { kind: OverrideKind; reason: string }[];
  reasons: string[];
  metrics: ClusterMetrics;
}

export interface ClusterMetrics {
  domains: number;
  knownDomains: number;
  headlineVariants: number;
  sourcesLast15m: number;
  sourcesLastHour: number;
  latestAgeHours: number;
  eventAgeHours: number;
  tier: string;
  stakes: boolean;
  teams: string[];
}
