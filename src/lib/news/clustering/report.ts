import type { ClusterRunReport, DecisionRecord } from "./run";
import type { ReviewItem, StoryClusterView } from "./queries";

const short = (id: string) => id.slice(0, 8);
const clip = (text: string, max = 110) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function decisionLines(d: DecisionRecord): string[] {
  const head = d.action === "create" ? `NEW   ${d.clusterId}` : `JOIN  ${short(d.clusterId)}`;
  const lines = [`  ${head}  [${d.confidence} ${d.score.toFixed(2)}] ${d.method}  ${d.eventType ?? "-"}  (${d.source})`, `        ${clip(d.headline)}`];
  const e = d.evidence as { matchedHeadline?: string; similarity?: number; sharedTeams?: string[]; sharedNames?: string[]; contradictions?: { code: string }[]; alternatives?: { score: number; confidence: string }[] };
  if (d.action === "join" && e.matchedHeadline) {
    lines.push(`        ↳ matched: ${clip(e.matchedHeadline)}`);
    if (e.similarity !== undefined) lines.push(`          sim ${e.similarity}  teams [${(e.sharedTeams ?? []).join(", ")}]  names [${(e.sharedNames ?? []).join(", ")}]`);
  }
  for (const a of d.ambiguous) lines.push(`        ? near miss → ${short(a.clusterId)} [${a.confidence} ${a.score.toFixed(2)}] ${a.reason}: ${clip(String((a.evidence as { matched?: string }).matched ?? ""), 80)}`);
  return lines;
}

export function formatClusterRunReport(report: ClusterRunReport, options: { verbose?: boolean } = {}): string {
  const lines = [
    `Story clustering${report.dryRun ? " — DRY RUN (nothing written)" : ""} — window=${report.window}${report.sport ? ` sport=${report.sport}` : ""}`,
    "",
    `status               ${report.status}${report.runId ? `  (run ${report.runId})` : ""}`,
    `candidates considered ${report.considered}`,
    `clusters created      ${report.clustersCreated}`,
    `memberships created   ${report.membershipsCreated}  (${report.joinedExisting} joined an existing cluster)`,
    `ambiguous (near miss) ${report.ambiguousCount}`,
    `duration              ${report.durationMs}ms`,
  ];
  for (const error of report.errors) lines.push(`error: ${error}`);
  if (options.verbose && report.decisions.length > 0) {
    lines.push("", "Decisions (oldest first):");
    for (const d of report.decisions) lines.push(...decisionLines(d));
  }
  return lines.join("\n");
}

export function formatCluster(cluster: StoryClusterView): string {
  const lines = [
    `CLUSTER ${cluster.id}`,
    cluster.canonicalHeadline ?? "(no publisher headline — discovery-text only)",
    "",
    `  sport: ${cluster.sport}${cluster.league ? ` (${cluster.league})` : ""}`,
    `  event type: ${cluster.eventType ?? "unknown"}`,
    `  confidence: ${cluster.confidence}   status: ${cluster.status}`,
    `  sources: ${cluster.sourceCount}   candidates: ${cluster.candidateCount}   providers: ${cluster.providerCount}`,
    `  first seen: ${cluster.firstSeenAt.toISOString()}   last seen: ${cluster.lastSeenAt.toISOString()}`,
    "",
    "  Representative:",
    cluster.representative ? `    ${cluster.representative.sourceName ?? cluster.representative.sourceDomain ?? "?"}\n    ${cluster.canonicalHeadline}` : "    (none)",
  ];
  if (cluster.sources) {
    lines.push("", "  Sources:");
    for (const s of cluster.sources) lines.push(`    ${s.name || s.domain}${s.candidateCount > 1 ? ` (${s.candidateCount})` : ""}`);
  }
  if (cluster.members) {
    lines.push("", "  Members:");
    for (const m of cluster.members) lines.push(`    [${m.score.toFixed(2)}] [${m.method}] ${clip(m.headline, 100)}  — ${m.sourceDomain}${m.headlineKind === "discovery-text" ? "  (discovery-text)" : ""}`);
  }
  return lines.join("\n");
}

export function formatReviewQueue(items: ReviewItem[]): string {
  if (items.length === 0) return "NEEDS REVIEW\n  (empty)";
  const lines = ["NEEDS REVIEW — close to a cluster, below auto-merge confidence", ""];
  for (const item of items) {
    lines.push(
      `  [${item.confidence} ${item.score.toFixed(2)}] ${item.reason}`,
      `    candidate  ${clip(item.headline)}  (in cluster ${short(item.currentClusterId)})`,
      `    nearly joined ${short(item.suggestedClusterId)}: ${clip(item.suggestedHeadline ?? item.matchedHeadline ?? "")}`,
    );
  }
  return lines.join("\n");
}
