import type { Sport } from "@/types/sport";
import { getQueryProfile } from "../../queries/sport-profiles";

/**
 * Builds a NewsData.io `q` query string from a sport's query profile terms.
 * NewsData's query syntax supports boolean OR and quoted exact phrases,
 * similar in shape to GDELT's but built independently so either provider's
 * query grammar can evolve without touching the other.
 */
export function buildNewsDataQuery(sport: Sport): string | null {
  const profile = getQueryProfile(sport);
  if (!profile || profile.terms.length === 0) return null;

  return profile.terms.map((term) => (term.includes(" ") ? `"${term}"` : term)).join(" OR ");
}
