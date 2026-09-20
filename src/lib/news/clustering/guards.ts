import { compareEventTypes, type EventAgreement } from "./event-type";
import type { HeadlineFeatures } from "./features";
import { intersect } from "./text";

/**
 * Contradiction guards. Each guard is an explicit, inspectable finding:
 *   block      the two headlines cannot be the same event — never cluster
 *   downgrade  suspicious — cap the match at MEDIUM (near-miss queue, no auto-merge)
 */
export type GuardSeverity = "block" | "downgrade";

export interface Contradiction {
  code:
    | "sport-mismatch"
    | "league-mismatch"
    | "outside-time-window"
    | "event-type-conflict"
    | "team-mismatch"
    | "different-opponent"
    | "score-mismatch"
    | "person-mismatch"
    | "amount-mismatch"
    | "cluster-event-conflict"
    | "cluster-span-exceeded";
  severity: GuardSeverity;
  detail: string;
}

export interface GuardContext {
  sportA: string;
  sportB: string;
  leagueA: string | null;
  leagueB: string | null;
  hoursApart: number;
  windowHours: number;
}

/** Event types where WHO is involved is the whole story: a different player is a different event. */
const PERSON_SENSITIVE = new Set(["injury", "signing", "trade", "discipline", "coaching", "retirement", "death", "transaction"]);

export function evaluateGuards(a: HeadlineFeatures, b: HeadlineFeatures, ctx: GuardContext, agreement?: EventAgreement): Contradiction[] {
  const out: Contradiction[] = [];
  const block = (code: Contradiction["code"], detail: string) => out.push({ code, severity: "block", detail });
  const downgrade = (code: Contradiction["code"], detail: string) => out.push({ code, severity: "downgrade", detail });

  if (ctx.sportA !== ctx.sportB) block("sport-mismatch", `${ctx.sportA} vs ${ctx.sportB}`);
  if (ctx.leagueA && ctx.leagueB && ctx.leagueA.toLowerCase() !== ctx.leagueB.toLowerCase()) block("league-mismatch", `${ctx.leagueA} vs ${ctx.leagueB}`);
  if (ctx.hoursApart > ctx.windowHours) block("outside-time-window", `${ctx.hoursApart.toFixed(1)}h apart, window ${ctx.windowHours}h`);

  const events = agreement ?? compareEventTypes(a.event, b.event);
  if (events === "conflict") block("event-type-conflict", `${a.event.type} vs ${b.event.type}`);

  if (a.teams.length > 0 && b.teams.length > 0) {
    const shared = intersect(a.teams, b.teams);
    if (shared.length === 0) {
      block("team-mismatch", `[${a.teams.join(", ")}] vs [${b.teams.join(", ")}]`);
    } else {
      const onlyA = a.teams.filter((team) => !shared.includes(team));
      const onlyB = b.teams.filter((team) => !shared.includes(team));
      if (onlyA.length > 0 && onlyB.length > 0) block("different-opponent", `shared [${shared.join(", ")}], other side differs: [${onlyA.join(", ")}] vs [${onlyB.join(", ")}]`);
    }
  }

  if (a.scores.length > 0 && b.scores.length > 0 && intersect(a.scores, b.scores).length === 0) {
    block("score-mismatch", `${a.scores.join("/")} vs ${b.scores.join("/")}`);
  }

  if (a.amounts.length > 0 && b.amounts.length > 0 && intersect(a.amounts, b.amounts).length === 0) {
    downgrade("amount-mismatch", `${a.amounts.join("/")} vs ${b.amounts.join("/")}`);
  }

  const type = a.event.type;
  if (type && PERSON_SENSITIVE.has(type) && a.names.fullNames.length > 0 && b.names.fullNames.length > 0) {
    const aInB = a.names.surnames.some((surname) => b.names.tokens.includes(surname));
    const bInA = b.names.surnames.some((surname) => a.names.tokens.includes(surname));
    if (!aInB && !bInA) downgrade("person-mismatch", `[${a.names.fullNames.join(", ")}] vs [${b.names.fullNames.join(", ")}]`);
  }

  return out;
}
