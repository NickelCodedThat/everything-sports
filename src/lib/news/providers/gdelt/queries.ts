import type { Sport } from "@/types/sport";
import { getQueryProfile } from "../../queries/sport-profiles";

/**
 * Builds a GDELT DOC 2.0 query string from a sport's query profile terms.
 * GDELT's query syntax ORs bare/quoted terms together; multi-word terms must
 * be quoted as exact phrases. `sourcelang:english` is appended for the
 * initial English-only filtering the brief asks for.
 */
export function buildGdeltQuery(sport: Sport): string | null {
  const profile = getQueryProfile(sport);
  if (!profile || profile.terms.length === 0) return null;

  const clause = profile.terms
    .map((term) => (term.includes(" ") ? `"${term}"` : term))
    .join(" OR ");

  return `(${clause}) sourcelang:english`;
}
