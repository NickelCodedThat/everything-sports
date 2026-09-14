import type { FetchNewsCandidatesResult } from "../newsroom";
import type { ProbeCliOptions } from "./parse-args";

function formatCandidateBlock(candidate: FetchNewsCandidatesResult["candidates"][number]): string {
  const lines = [
    `PROVIDER      ${candidate.provider}`,
    `SPORT         ${candidate.classification.sport} (${candidate.classification.confidence})`,
    `PUBLISHER     ${candidate.publisherName ?? candidate.publisherDomain}`,
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

  sections.push("-- newsroom health summary --");
  for (const providerResult of result.providerResults) {
    if (providerResult.status === "unavailable") {
      sections.push(`${providerResult.providerId}: unavailable — ${providerResult.message ?? "not configured"}`);
    } else if (providerResult.status === "error") {
      sections.push(`${providerResult.providerId}: error — ${providerResult.message ?? "unknown error"}`);
    } else {
      sections.push(`${providerResult.providerId}: ${providerResult.candidates.length} candidates, 0 failures`);
    }
  }
  sections.push("");
  sections.push(`TOTAL: ${result.summary.totalCandidates}`);
  for (const [sport, count] of Object.entries(result.summary.bySport).sort((a, b) => b[1] - a[1])) {
    sections.push(`${sport}: ${count}`);
  }
  sections.push(`Duplicates: ${result.summary.duplicates}`);

  return sections.join("\n");
}

export function formatJsonReport(result: FetchNewsCandidatesResult, options: ProbeCliOptions): string {
  return JSON.stringify({ options, ...result }, null, 2);
}
