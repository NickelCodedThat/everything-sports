import type { ClusterInput, MemberInput } from "@/lib/news/editorial-ranking/types";

export const NOW = new Date("2026-09-20T12:00:00Z");
export const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
export const hoursAgo = (h: number) => minutesAgo(h * 60);

let counter = 0;
export function member(over: Partial<MemberInput> & { domain: string }): MemberInput {
  counter += 1;
  return {
    candidateId: `cand-${counter}`,
    headline: "Herons rule out star guard Ruiz vs. Owls",
    headlineKind: "publisher-title",
    url: `https://${over.domain}/story-${counter}`,
    sourceName: over.domain,
    quality: "unknown",
    sourceEnabled: true,
    providerKey: "gdelt-gkg",
    reportedAt: hoursAgo(1),
    publishedAt: hoursAgo(1),
    ...over,
  };
}

/** N distinct domains, all reporting `hours` ago, sharing (or varying) a headline. */
export function members(n: number, over: Partial<MemberInput> = {}, vary = false): MemberInput[] {
  return Array.from({ length: n }, (_, i) => member({ domain: `outlet-${i}.example`, ...over, ...(vary ? { headline: `${over.headline ?? "Story"} variant ${i}` } : {}) }));
}

/** A cluster with sensible defaults; every field is overridable. Invented teams/headlines only. */
export function cluster(over: Partial<ClusterInput> & { domains?: number; ageHours?: number; firstAgeHours?: number } = {}): ClusterInput {
  counter += 1;
  const { domains = 5, ageHours = 1, firstAgeHours, ...rest } = over;
  const ms = members(domains, { reportedAt: hoursAgo(ageHours), publishedAt: hoursAgo(ageHours), headline: rest.canonicalHeadline ?? "Cubs rule out star guard vs. Reds" });
  const repId = ms[0]?.candidateId ?? null;
  return {
    clusterId: `cluster-${counter}`,
    sport: "baseball",
    league: null,
    eventType: "injury",
    status: "open",
    confidence: "high",
    canonicalHeadline: "Cubs rule out star guard vs. Reds",
    representativeCandidateId: repId,
    candidateCount: domains,
    sourceCount: domains,
    providerCount: 1,
    firstSeenAt: hoursAgo(firstAgeHours ?? ageHours),
    lastSeenAt: hoursAgo(ageHours),
    firstPublishedAt: hoursAgo(firstAgeHours ?? ageHours),
    lastPublishedAt: hoursAgo(ageHours),
    entities: ["league:mlb", "team:cubs", "team:reds"],
    members: ms,
    nearMisses: [],
    ...rest,
  };
}
