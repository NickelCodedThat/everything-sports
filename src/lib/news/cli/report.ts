import type { FetchNewsCandidatesResult } from "../newsroom";
import type { ProbeCliOptions } from "./parse-args";

function formatCandidateBlock(candidate: FetchNewsCandidatesResult["candidates"][number]): string {
  const lines = [
    `PROVIDER      ${candidate.provider}`,
    `SPORT         ${candidate.classification.sport} (${candidate.classification.confidence})`,
    `PUBLISHER     ${candidate.publisherName ?? candidate.publisherDomain} (${candidate.sourceQuality})`,
    `PUBLISHED     ${candidate.publishedAt ?? "unknown"}`,
    `HEADLINE      ${candidate.headline}`,
    `SOURCE URL    ${candidate.sourceUrl}`,
    `CLASSIFY      ${candidate.classification.signals.join(" | ")}`,
    `FINGERPRINT   ${candidate.fingerprint}${candidate.isDuplicateUrl ? " (duplicate URL candidate)" : ""}`,
  ];
  return lines.join("\n");
}

/** Human-readable report: one block per candidate, no article bodies, no secrets. */
export function formatHumanReport(result: FetchNewsCandidatesResult, options: ProbeCliOptions): string {
  const sections: string[] = [];

  sections.push(
    `Everything Sports newsroom probe — provider=${options.provider} sport=${options.sport} window=${options.window} limit=${options.limit}`,
  );
  sections.push("");

  for (const providerResult of result.providerResults) {
    const header = `== ${providerResult.providerId} — ${providerResult.status} (${providerResult.durationMs}ms) ==`;
    sections.push(header);
    if (providerResult.message) sections.push(providerResult.message);
    if (providerResult.candidates.length === 0) {
      sections.push("(no candidates)");
    }
    sections.push("");
  }

  if (result.candidates.length > 0) {
    sections.push("-- candidates --");
    sections.push("");
    for (const candidate of result.candidates) {
      sections.push(formatCandidateBlock(candidate));
      sections.push("");
    }
  }

  if (result.rejected.length > 0) {
    sections.push("-- rejected by intake filter --");
    for (const item of result.rejected) {
      sections.push(`[${item.reasons.join(", ")}] ${item.candidate.headline} (${item.candidate.publisherDomain})`);
    }
    sections.push("");
  }

  sections.push("-- newsroom health summary --");
  for (const health of result.health) {
    const counts = `${health.accepted} accepted of ${health.returned} returned`;
    switch (health.state) {
      case "ok":
        sections.push(`${health.providerId}: OK — ${counts}${health.message ? ` (${health.message})` : ""}`);
        break;
      case "empty":
        sections.push(`${health.providerId}: OK but empty — no candidates returned${health.message ? ` (${health.message})` : ""}`);
        break;
      case "unavailable":
        sections.push(`${health.providerId}: UNAVAILABLE — ${health.message ?? "not configured"}`);
        break;
      case "throttled":
        sections.push(`${health.providerId}: THROTTLED — ${health.message ?? "rate limited"}`);
        break;
      case "error":
        sections.push(`${health.providerId}: ERROR — ${health.message ?? "unknown error"}`);
        break;
    }
  }
  sections.push("");
  sections.push(`TOTAL ACCEPTED: ${result.summary.totalCandidates}`);
  for (const [sport, count] of Object.entries(result.summary.bySport).sort((a, b) => b[1] - a[1])) {
    sections.push(`${sport}: ${count}`);
  }
  sections.push(`Duplicates: ${result.summary.duplicates}`);
  sections.push(`Rejected: ${result.summary.rejected}`);
  for (const [reason, count] of Object.entries(result.summary.rejectedByReason).sort((a, b) => b[1] - a[1])) {
    sections.push(`  ${reason}: ${count}`);
  }

  return sections.join("\n");
}

export function formatJsonReport(result: FetchNewsCandidatesResult, options: ProbeCliOptions): string {
  return JSON.stringify({ options, ...result }, null, 2);
}
