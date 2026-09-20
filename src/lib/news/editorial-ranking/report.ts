import type { AuditEntry, EditorialItemView } from "./queries";
import type { RankRunReport } from "./run";
import type { Slate, SlateEntry } from "./slate";
import { SECTION_ORDER } from "./slate";
import type { StoryPreview } from "./story-mapping";
import type { RankedCluster, ScorePart } from "./types";

const clip = (text: string | null, max = 96) => (text === null ? "(no publication-safe headline)" : text.length > max ? `${text.slice(0, max - 1)}…` : text);
const pts = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** Compact one-line score explanation: "sport +100 · tier +20 · recency +47.1 …" */
export function explainParts(parts: ScorePart[]): string {
  return parts.map((p) => `${p.key.replace(/^breadth\./, "").replace(/^override\./, "✎")} ${pts(Number(p.points.toFixed(1)))}`).join(" · ");
}

export const SECTION_TITLES: Record<string, string> = {
  lead: "LEAD",
  wire: "WIRE",
  now: "NOW",
  run: "THE RUN (basketball)",
  huddle: "THE HUDDLE (football)",
  diamond: "THE DIAMOND (baseball)",
  "fight-desk": "FIGHT DESK",
  "world-game": "WORLD GAME",
  "across-the-board": "ACROSS THE BOARD",
};

export function formatRankReport(report: RankRunReport, options: { top?: number; explain?: boolean } = {}): string {
  const lines = [
    `Editorial ranking${report.dryRun ? " — DRY RUN (nothing written)" : ""} — window=${report.window}${report.sport ? ` sport=${report.sport}` : ""}`,
    "",
    `status               ${report.status}${report.runId ? `  (run ${report.runId})` : ""}`,
    `clusters considered  ${report.considered}`,
    `eligible / review / held   ${report.eligible} / ${report.review} / ${report.held}`,
    `items created / updated    ${report.itemsCreated} / ${report.itemsUpdated}`,
    `duration             ${report.durationMs}ms`,
  ];
  for (const error of report.errors) lines.push(`error: ${error}`);
  const top = options.top ?? 25;
  const ranked = report.ranked.filter((r) => r.position !== null).slice(0, top);
  if (ranked.length) {
    lines.push("", "RANK  SCORE  URGENCY             SPORT       SRC  TYPE          HEADLINE");
    for (const r of ranked) {
      lines.push(
        `${String(r.position).padStart(3)}   ${r.finalScore.toFixed(1).padStart(6)}  ${r.urgency.padEnd(18)}  ${r.input.sport.padEnd(10)}  ${String(r.metrics.domains).padStart(3)}  ${(r.input.eventType ?? "-").padEnd(12)}  ${clip(r.headline)}${r.eligibility.state === "review" ? "  [review]" : ""}`,
      );
      if (options.explain) lines.push(`        ${explainParts(r.scoreParts)}`);
    }
  }
  return lines.join("\n");
}

function slateEntryLines(entry: SlateEntry, items: Map<string, EditorialItemView>, explain: boolean): string[] {
  const item = entry.item;
  const view = items.get(item.clusterId);
  const flags = [item.urgency !== "normal" ? item.urgency : null, item.pinned ? "pinned" : null, view?.status === "approved" ? "approved" : null, item.eligibility === "review" ? "review" : null].filter(Boolean);
  const lines = [`  ${entry.position}. [${item.score.toFixed(0)}] ${clip(item.headline, 92)}  — ${item.sourceCount} src, ${item.eventType ?? "-"}, ${item.sport}${flags.length ? `  {${flags.join(", ")}}` : ""}`];
  if (explain && view) lines.push(`       ${explainParts(view.scoreParts)}`);
  return lines;
}

export function formatSlate(slate: Slate, items: Map<string, EditorialItemView>, options: { explain?: boolean } = {}): string {
  const lines = ["EVERYTHING SPORTS — INTERNAL FRONT PAGE (not public)", ""];
  for (const section of SECTION_ORDER) {
    lines.push(SECTION_TITLES[section]);
    const entries = slate.sections[section];
    if (entries.length === 0) lines.push("  (quiet)");
    for (const entry of entries) lines.push(...slateEntryLines(entry, items, options.explain ?? false));
    lines.push("");
  }
  if (slate.skipped.length) {
    lines.push("DIVERSITY SKIPS");
    for (const skip of slate.skipped) lines.push(`  ${SECTION_TITLES[skip.section]}: ${clip(items.get(skip.clusterId)?.headline ?? skip.clusterId, 70)} — ${skip.reason}`);
  }
  return lines.join("\n").trimEnd();
}

export function formatItem(view: EditorialItemView, extra: { audit?: AuditEntry[] } = {}): string {
  const lines = [
    `EDITORIAL ITEM ${view.id}`,
    `cluster ${view.clusterId}`,
    "",
    clip(view.headline, 140),
    "",
    `  status: ${view.status}   eligibility: ${view.eligibility}   urgency: ${view.urgency}`,
    `  rank: ${view.rankPosition ?? "unranked"}   score: ${view.score}   priority band: ${view.priority}   desk: ${view.section ?? "-"}`,
    `  sport: ${view.sport}${view.league ? ` (${view.league})` : ""}   event: ${view.eventType ?? "unclear"}   cluster confidence: ${view.clusterConfidence ?? "-"}`,
    `  sources: ${view.sourceCount} publishers   candidates: ${view.candidateCount}   providers: ${view.providerCount}`,
    `  eligible for  lead: ${view.sectionEligibility.lead}   wire: ${view.sectionEligibility.wire}   now: ${view.sectionEligibility.now}   image: ${view.imageStatus}`,
    "",
    "  Score breakdown:",
    ...view.scoreParts.map((p) => `    ${pts(Number(p.points.toFixed(2))).padStart(8)}  ${p.label}${p.detail ? `  (${p.detail})` : ""}`),
    `    ${"=".padStart(8)}  ${view.score}`,
  ];
  if (view.eligibilityReasons.length) lines.push("", "  Eligibility:", ...view.eligibilityReasons.map((r) => `    [${r.severity}] ${r.code}: ${r.detail}`));
  if (view.sectionEligibility.notes.length) lines.push("", "  Placement notes:", ...view.sectionEligibility.notes.map((n) => `    ${n}`));
  if (view.activeOverrides.length) lines.push("", "  Active overrides:", ...view.activeOverrides.map((o) => `    #${o.id} ${o.kind}${o.amount !== null ? ` ${o.amount}` : ""}${o.text ? ` ${o.text}` : ""}${o.reason ? ` — ${o.reason}` : ""}`));
  if (extra.audit?.length) lines.push("", "  Audit:", ...extra.audit.map((a) => `    ${a.at.toISOString()}  ${a.action}  by ${a.actor}${a.reason ? `  — ${a.reason}` : ""}  ${JSON.stringify(a.detail)}`));
  return lines.join("\n");
}

export function formatStoryPreview(preview: StoryPreview | null): string {
  if (!preview) return "No story preview: the item has no publication-safe publisher headline or is ineligible.";
  const lines = [
    "INTERNAL STORY PREVIEW (not public; nothing here is published)",
    "",
    preview.headline,
    "",
    `  attribution: ${preview.attribution ? `${preview.attribution.publisher} — ${preview.attribution.url}` : "(none)"}`,
    `  ${preview.sourcesReporting} sources reporting   sport: ${preview.sport}${preview.league ? ` (${preview.league})` : ""}   event: ${preview.eventType ?? "unclear"}`,
    `  urgency: ${preview.storyUrgency}${preview.breakingCandidate ? "   ⚑ breaking-candidate (editor decision required)" : ""}   status: ${preview.status}${preview.readyForPublication ? " (ready for future publication)" : ""}`,
    `  first reported: ${preview.publishedAt?.toISOString() ?? "-"}   last: ${preview.updatedAt?.toISOString() ?? "-"}`,
    `  absent by design: ${preview.missing.join(", ")}   image status: ${preview.imageStatus}`,
    "",
    "  Sources:",
    ...preview.supportingSources.map((s) => `    ${s.isRepresentative ? "★" : " "} ${s.publisher.padEnd(28)} ${s.publishedAt?.toISOString().slice(0, 16) ?? "-"}  ${s.url}`),
  ];
  return lines.join("\n");
}

export function summarizeRanked(r: RankedCluster) {
  return { rank: r.position, score: r.finalScore, urgency: r.urgency, sport: r.input.sport, sources: r.metrics.domains, eventType: r.input.eventType, headline: r.headline, eligibility: r.eligibility.state, reasons: r.reasons, scoreParts: r.scoreParts };
}
