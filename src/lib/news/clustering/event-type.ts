import type { EventType } from "./config";

/**
 * Lightweight deterministic event typing. Each rule is (type, weight, pattern) against the
 * lower-cased headline; a type's evidence is the SUM of the weights of its matching rules.
 * The primary type is the strongest one at weight >= 2, otherwise null ("unclear" — never
 * forced). Types above weight 2 that are not primary are kept as secondary evidence.
 *
 * Weights: 3 = the phrase essentially means this type; 2 = strongly suggestive; 1 = weak hint
 * that only counts in combination.
 */
interface Rule {
  type: EventType;
  weight: number;
  pattern: RegExp;
  label: string;
  /** Weak hints add up: the rule earns `weight` per distinct match, up to 3 matches. */
  each: boolean;
}

const r = (type: EventType, weight: number, pattern: RegExp, label: string): Rule => ({
  type,
  weight,
  label,
  each: weight === 1,
  pattern: weight === 1 ? new RegExp(pattern.source, "g") : pattern,
});

const RULES: Rule[] = [
  // preview — pre-game/what-to-expect coverage; the big false-merge trap next to game-result
  r("preview", 3, /\bhow to watch\b|\bwhere to watch\b|\bhow to stream\b|\bviewing options\b|\blive ?stream\b|\bstart time\b|\bwhat to watch\b|\bthings to watch\b/, "watch-guide"),
  r("preview", 3, /\bpredictions?\b|\bpreview\b|\bkeys? to (?:victory|the game|success)\b|\bkey matchups?\b|\brooting guide\b|\bx-factors?\b|\bwhat to expect\b|\blineups?\b/, "preview-words"),
  r("preview", 3, /^game \d+:|\bgame thread\b|\bgameday\b/, "game-thread"),
  r("preview", 1, /\bdiscussion\b|\blive!|\bmatchups?\b/, "preview-hint"),
  // game-result
  r("game-result", 3, /\b(?:beats?|defeats?|defeated|routs?|routed|blanks?|blanked|stuns?|outlasts?|crush(?:es|ed)?|tames?|tamed|clinch(?:es|ed)?|sweeps?|swept|edges?|edged|topped|tops|dominat(?:e|es|ed)|cruis(?:e|es|ed)|overpower(?:s|ed)?|thump(?:s|ed)?|outslug(?:s|ged)?)\b/, "result-verb"),
  r("game-result", 3, /\b(?:loss|defeat|win|victory)\s+(?:to|over|against|vs\.?)\b|\bleads? (?:the )?[\w.'’ -]{1,30}?\b(?:to|past|over)\b|\bto (?:a|the) (?:win|victory|loss)\b|\bfinal score\b/, "result-frame"),
  r("game-result", 3, /\bshuts? out\b|\bshut out\b|\bwalks? off\b|\bwalk-?off\b|\bwalked off\b|\bwalks it off\b|\blifts?\b|\blifted\b|\brall(?:y|ies|ied)\b|(?:,|\band)\s+top\b/, "result-phrase"),
  r("game-result", 1, /\bpast\b|\bover\b|\bwins?\b|\bwon\b|\bwinning\b|\bvictory\b|\bloss\b|\bloses?\b|\blost\b|\bdrops?\b|\bfalls? to\b|\bhomers?\b|\bhome runs?\b|\bgrand slam\b|\bstrikeouts?\b|\binnings?\b|\bcomeback\b|\bsqueezes?\b|\bstrands?\b|\bsquanders?\b/, "result-hint"),
  // injury
  r("injury", 3, /\brul(?:e|es|ed) out\b|\bout for (?:the )?(?:season|year|weeks?|months?)\b|\btorn\b|\bacl\b|\bsurgery\b|\bplaced on (?:the )?(?:il|ir|injured)\b|\binjured list\b|\bwill miss\b|\bsidelined\b/, "injury-phrase"),
  r("injury", 2, /\binjur(?:y|ies|ed)\b|\bquestionable\b|\bdoubtful\b|\bday-to-day\b|\bconcussion\b|\bfracture[sd]?\b/, "injury-word"),
  r("injury", 1, /\bhamstring\b|\bknee\b|\bankle\b|\bshoulder\b|\bstrain\b|\bsprain\b|\bachilles\b|\boblique\b|\bgroin\b|\bcalf\b|\bwrist\b|\belbow\b|\bhip\b/, "body-part"),
  // trade / signing / transaction
  r("trade", 3, /\btrades?\b|\btraded\b|\btrading\b|\bdealt\b|\btrade (?:talks|rumors?|request)\b/, "trade-word"),
  r("trade", 2, /\bacquires?\b|\bacquired\b|\bblockbuster deal\b/, "acquire"),
  r("signing", 3, /\bsigns?\b|\bsigned\b|\bagrees? to\b|\bre-?signs?\b|\binks?\b|\bfree agen(?:t|cy)\b|\bcontract extension\b|\bextension\b|\bmulti-?year\b/, "signing-word"),
  r("transaction", 3, /\bwaives?\b|\bwaived\b|\bdesignated for assignment\b|\bcalled up\b|\bcalls? up\b|\bpractice squad\b|\broster move\b|\bactivates?\b|\bwaiver claim\b/, "transaction-phrase"),
  r("transaction", 2, /\belevat(?:e|es|ed)\b|\breinstates?\b|\breleases? (?:the )?(?:veteran|player)\b|\bpromot(?:es|ed) \w+ from\b/, "transaction-word"),
  // record / milestone
  r("record", 3, /\b(?:breaks?|ties?|sets?|tied|broke|set)\b[^.]{0,40}\brecord\b/, "breaks-record"),
  r("record", 2, /\brecord\b|\bmilestone\b|\ball-time\b|\bcareer-?high\b|\bfranchise (?:record|history)\b|\bhistoric\b/, "record-word"),
  // discipline / legal
  r("discipline", 3, /\bsuspend(?:s|ed)?\b|\bsuspension\b|\bfined\b|\bfines\b|\bejected\b|\barrest(?:ed)?\b|\blawsuit\b|\bsues?\b|\bsued\b|\bbanned\b|\bbans?\b|\bdisciplin\w*/, "discipline-word"),
  r("discipline", 2, /\bcharged\b|\binvestigation\b|\bauthorities\b|\bfacing backlash\b|\bpenalt(?:y|ies)\b/, "legal-word"),
  // coaching
  r("coaching", 3, /\bfires?\b|\bfired\b|\bhires?\b|\bhired\b|\bparts? ways\b|\bsteps? down\b|\bresigns?\b|\bcoaching (?:change|search|staff)\b|\binterim\b/, "coaching-move"),
  r("coaching", 2, /\bhead coach\b|\bcoordinator\b|\bmanager\b/, "coaching-role"),
  // draft
  r("draft", 3, /\bmock draft\b|\bdraft (?:pick|class|prospect|night|order|stock)\b|\bexpansion draft\b|\bdrafted\b|\bselected (?:no\.|first|second)/, "draft-phrase"),
  r("draft", 2, /\bdraft\b/, "draft-word"),
  // retirement / death
  r("retirement", 3, /\bretire(?:s|d|ment)?\b/, "retire"),
  r("death", 3, /\bdies\b|\bdied\b|\bdeath\b|\bpass(?:es|ed) away\b|\bkilled\b|\bmourn(?:s|ing)?\b|\bfuneral\b/, "death-word"),
  // business
  r("business", 3, /\bsale of\b|\bownership\b|\bprivate equity\b|\btv (?:deal|rights)\b|\bbroadcast rights\b|\brelocat\w+|\bcollective bargaining\b|\block-?out\b|\bfranchise value\b|\bvaluation\b/, "business-phrase"),
  r("business", 2, /\bstadium\b|\barena\b|\bexpansion\b|\bsponsor\w*|\bpolicy change\b|\bshoe\b|\bendorsement\b/, "business-word"),
];

/** Tie-break order when two types have equal weight. Specific, high-stakes types win over generic ones. */
const PRIORITY: EventType[] = [
  "death", "retirement", "trade", "signing", "discipline", "coaching", "injury", "draft", "transaction",
  "record", "business", "preview", "game-result",
];

export interface EventClassification {
  /** Null = unclear (never forced). */
  type: EventType | null;
  /** Every type with evidence weight >= 2, strongest first. Always includes `type`. */
  types: EventType[];
  /** Rule labels that fired, for inspection. */
  signals: string[];
}

/** "may defeat", "will steamroll", "how to beat": a hypothetical, not a result. */
const FUTURE_RESULT = /\b(?:may|might|will|could|would|should|hopes? to|looking to|looks to|needs? to|how to|ways? to)\s+(?:[\w'’-]+\s+){0,3}?(?:beat|defeat|topple|rout|sweep|steamroll|outlast|stun|crush|tame)\b/g;

/** Score-line evidence ("Angels 6, Twins 5", "5-2") counts toward game-result unless the text is a preview. */
export function classifyEvent(headline: string, hasScore: boolean): EventClassification {
  let text = headline.toLowerCase();
  const totals = new Map<EventType, number>();
  const signals: string[] = [];
  if (FUTURE_RESULT.test(text)) {
    FUTURE_RESULT.lastIndex = 0;
    text = text.replace(FUTURE_RESULT, " ");
    totals.set("preview", 2);
    signals.push("preview:future-tense");
  }
  FUTURE_RESULT.lastIndex = 0;
  for (const rule of RULES) {
    const hits = rule.each ? Math.min(3, new Set([...text.matchAll(rule.pattern)].map((m) => m[0])).size) : rule.pattern.test(text) ? 1 : 0;
    if (hits > 0) {
      totals.set(rule.type, (totals.get(rule.type) ?? 0) + rule.weight * hits);
      signals.push(`${rule.type}:${rule.label}`);
    }
  }
  if (hasScore && (totals.get("preview") ?? 0) < 3) {
    totals.set("game-result", (totals.get("game-result") ?? 0) + 2);
    signals.push("game-result:scoreline");
  }

  const ranked = [...totals.entries()]
    .filter(([, weight]) => weight >= 2)
    .sort((a, b) => b[1] - a[1] || PRIORITY.indexOf(a[0]) - PRIORITY.indexOf(b[0]));
  const types = ranked.map(([type]) => type);
  return { type: types[0] ?? null, types, signals };
}

/** Pairs of types that describe overlapping real-world events, in addition to identical types. */
const COMPATIBLE: [EventType, EventType][] = [
  ["trade", "signing"],
  ["trade", "transaction"],
  ["signing", "transaction"],
  ["game-result", "record"],
];

export type EventAgreement = "same" | "compatible" | "unknown" | "conflict";

/**
 * How two headlines' event types relate.
 *   same        identical primary types
 *   compatible  each primary type is also supported by the other headline, or the pair is on the
 *               compatible list (trade~signing~transaction, game-result~record)
 *   unknown     at least one side has no event type — neutral, but never enough for HIGH on its own
 *   conflict    both known and unrelated: a preview is not a result, an injury is not a trade
 */
export function compareEventTypes(a: EventClassification, b: EventClassification): EventAgreement {
  if (a.type === null || b.type === null) return "unknown";
  if (a.type === b.type) return "same";
  if (COMPATIBLE.some(([x, y]) => (a.type === x && b.type === y) || (a.type === y && b.type === x))) return "compatible";
  if (b.types.includes(a.type) && a.types.includes(b.type)) return "compatible";
  return "conflict";
}
