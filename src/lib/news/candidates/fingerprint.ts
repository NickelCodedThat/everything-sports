import { createHash } from "node:crypto";
import { normalizeUrl } from "../urls/normalize";

/**
 * Deterministic candidate fingerprint, based primarily on the normalized
 * source URL. This is NOT full story clustering (a later phase) — it only
 * lets us flag obvious exact-URL duplicates within a probe batch.
 */
export function fingerprintCandidate(sourceUrl: string): string {
  const normalized = normalizeUrl(sourceUrl);
  const basis = normalized ? normalized.href : sourceUrl.trim().toLowerCase();
  return createHash("sha1").update(basis).digest("hex").slice(0, 16);
}

/** Flags candidates sharing a fingerprint with an earlier one in the same list — first occurrence stays unflagged. */
export function flagDuplicateFingerprints<T extends { fingerprint: string; isDuplicateUrl?: boolean }>(
  candidates: T[],
): T[] {
  const seen = new Set<string>();
  return candidates.map((candidate) => {
    const isDuplicateUrl = seen.has(candidate.fingerprint);
    seen.add(candidate.fingerprint);
    return isDuplicateUrl ? { ...candidate, isDuplicateUrl: true } : candidate;
  });
}
