import { containsProperNoun, containsTerm, SPORT_LEXICON } from "../classification/lexicon";
import { stripDiacritics } from "./text";

/**
 * Compact entity layer built on the existing sport lexicon — teams and leagues, plus a
 * conservative person-name heuristic. Not a roster database, not NLP.
 */

/** Words in the lexicon's team/weak lists that are vocabulary, divisions or acronyms rather than teams. */
const NOT_A_TEAM = new Set([
  "NBA", "WNBA", "NFL", "MLB", "FBS", "SEC", "ACC", "WR", "QB", "RB", "RBI", "ERA", "Big Ten", "Big 12",
  "Heisman", "Pro Bowl", "Super Bowl", "World Series", "Cy Young", "March Madness", "Grapefruit League", "Cactus League",
]);

/** Different spellings of one team collapse to a single canonical key. */
const TEAM_ALIASES: Record<string, string> = {
  sixers: "76ers",
  cavs: "cavaliers",
  mavs: "mavericks",
  bucs: "buccaneers",
  "d-backs": "diamondbacks",
  blazers: "trail blazers",
  "miami heat": "heat",
  "orlando magic": "magic",
  "indiana fever": "fever",
  "atlanta dream": "dream",
  "chicago sky": "sky",
  "connecticut sun": "sun",
  "dallas wings": "wings",
  "new york liberty": "liberty",
  "seattle storm": "storm",
  "portland fire": "fire",
  "toronto tempo": "tempo",
};

function isTeamTerm(term: string): boolean {
  if (NOT_A_TEAM.has(term)) return false;
  if (!/^[A-Z0-9]/.test(term)) return false; // lower-case vocabulary: "quarterback", "dunk", "home run"
  if (/^(?:AL|NL) /.test(term) || /^Week \d/.test(term)) return false;
  return true;
}

const TEAM_TERMS: string[] = [
  ...new Set(
    Object.values(SPORT_LEXICON)
      .flatMap((lexicon) => [...lexicon.team, ...lexicon.weak])
      .filter(isTeamTerm),
  ),
].sort((a, b) => b.length - a.length);

/** Weak-tier lexicon words that are professional nicknames (the rest of football's weak list is college). */
const PRO_WEAK = new Set(["Giants", "Jets", "Lions", "Cardinals", "Panthers", "Rangers", "Kings", "Heat", "Magic", "Dream", "Sky", "Fever", "Storm", "Fire", "Liberty", "Wings", "Tempo", "Sun"]);

/** Canonical team keys the lexicon knows as professional franchises. */
export const PRO_TEAM_KEYS: ReadonlySet<string> = new Set(
  [
    ...SPORT_LEXICON.basketball.team,
    ...SPORT_LEXICON.football.team,
    ...SPORT_LEXICON.baseball.team,
    ...Object.values(SPORT_LEXICON).flatMap((lexicon) => lexicon.weak.filter((term) => PRO_WEAK.has(term))),
  ]
    .filter(isTeamTerm)
    .map(canonicalTeam),
);

/** Canonical team keys the lexicon knows as college programs (football's weak list minus the pro nicknames). */
export const COLLEGE_TEAM_KEYS: ReadonlySet<string> = new Set(
  SPORT_LEXICON.football.weak.filter((term) => isTeamTerm(term) && !PRO_WEAK.has(term)).map(canonicalTeam),
);

const LEAGUE_TERMS = ["NBA", "WNBA", "NFL", "MLB", "FBS", "NCAA", "NHL", "MLS"];

export function canonicalTeam(term: string): string {
  const key = term.toLowerCase();
  return TEAM_ALIASES[key] ?? key;
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Postgres regex (matched against the lower-cased normalized headline) that finds headlines
 * mentioning any of the given canonical teams under any known spelling. Used only to bound
 * the neighbour search; the real entity decision is made by `extractTeams`. Null when empty.
 */
export function teamSearchRegex(canonicalTeams: string[]): string | null {
  const wanted = new Set(canonicalTeams);
  const forms = TEAM_TERMS.filter((term) => wanted.has(canonicalTeam(term))).map((term) => escapeRegex(term.toLowerCase()));
  return forms.length ? `\\y(?:${[...new Set(forms)].join("|")})\\y` : null;
}

/** ALL-CAPS headlines defeat case-sensitive proper-noun matching; re-case them first. */
export function normalizeCase(headline: string): string {
  const letters = headline.replace(/[^\p{L}]/gu, "");
  if (letters.length < 8) return headline;
  const upper = headline.replace(/[^\p{Lu}]/gu, "").length;
  if (upper / letters.length < 0.8) return headline;
  return headline.toLowerCase().replace(/(^|[\s(-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

export function extractTeams(headline: string): string[] {
  const text = normalizeCase(headline);
  const found = new Set<string>();
  for (const term of TEAM_TERMS) if (containsProperNoun(text, term)) found.add(canonicalTeam(term));
  return [...found].sort();
}

export function extractLeagues(headline: string): string[] {
  return LEAGUE_TERMS.filter((term) => containsTerm(headline, term)).map((term) => term.toLowerCase());
}

// ---------------------------------------------------------------------------
// Person names (heuristic, positive evidence first)
// ---------------------------------------------------------------------------

/** Capitalized words that are not names: sentence openers, roles, positions, calendar words. */
const NOT_A_NAME = new Set(
  (
    "a an the and or of in on at to for from with by as is are was were be how what why who when where watch week game games " +
    "rookie former star veteran ace new top first final another mic opportunity resurgent eleventh three key keys " +
    "monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december " +
    "sept jan feb mar apr jun jul aug oct nov dec today tonight yesterday " +
    "nfl nba mlb wnba nhl ncaa fbs mls cf cbs espn tv live stream channel roundup report recap preview predictions " +
    "quarterback pitcher catcher guard forward center receiver tackle safety kicker punter shortstop outfielder infielder " +
    "qb wr rb lb dt de te ol lg rg lt rt cb ss fs pg sg sf pf ml al nl " +
    "coach manager mr mrs dr jr sr ii iii " +
    "no not yes his her their its our and but " +
    "pittsburgh kansas city york los angeles san francisco diego miami houston atlanta chicago boston baltimore cleveland detroit seattle " +
    "denver dallas phoenix toronto tampa bay oakland minnesota milwaukee cincinnati philadelphia washington colorado texas louisiana " +
    "ohio michigan georgia florida carolina tennessee kentucky alabama indiana arizona oregon utah nevada " +
    "premier league cup open championship championships playoff playoffs series division conference trophy tournament final finals classic bowl "
  ).split(" "),
);

function ascii(word: string): string {
  return stripDiacritics(word).toLowerCase().replace(/[’']s?$/, "").replace(/[.,:;!?]+$/, "");
}

/** Title Case headlines capitalize everything, so capitalization carries no name evidence there. */
export function isTitleCased(headline: string): boolean {
  const words = headline.split(/\s+/).filter((w) => /^\p{L}{4,}/u.test(w));
  // Short headlines carry too few words to tell Title Case from a name-heavy sentence.
  if (words.length < 5) return false;
  const capitalized = words.filter((w) => /^\p{Lu}/u.test(w)).length;
  return capitalized / words.length > 0.7;
}

export interface NameEvidence {
  /** Capitalized, non-team, non-vocabulary tokens, diacritics/possessives stripped. Positive overlap evidence. */
  tokens: string[];
  /** Runs of 2–3 such tokens ("ethan salas"). Only these can contradict another headline. */
  fullNames: string[];
  /** Last token of each full name ("salas"). */
  surnames: string[];
}

export function extractNames(headline: string, teams: string[]): NameEvidence {
  if (isTitleCased(headline)) return { tokens: [], fullNames: [], surnames: [] };
  const teamWords = new Set(teams.flatMap((team) => team.split(/[ -]/)));
  const words = normalizeCase(headline).split(/\s+/);
  const tokens = new Set<string>();
  const fullNames: string[] = [];
  let run: string[] = [];

  const flush = () => {
    if (run.length >= 2) fullNames.push(run.slice(0, 3).join(" "));
    run = [];
  };

  words.forEach((raw, index) => {
    const stripped = raw.replace(/^[("'“‘]+/, "");
    const isCap = /^\p{Lu}[\p{L}'’.-]{1,}/u.test(stripped) && !/^\p{Lu}{2,}$/u.test(stripped.replace(/[^\p{L}]/gu, ""));
    const token = ascii(stripped.replace(/[^\p{L}'’.-]/gu, ""));
    if (!isCap || token.length < 3 || NOT_A_NAME.has(token) || teamWords.has(token) || (index === 0 && NOT_A_NAME.has(token))) {
      flush();
      return;
    }
    tokens.add(token);
    run.push(token);
    if (/[,:;!?]$/.test(raw)) flush();
  });
  flush();

  return {
    tokens: [...tokens].sort(),
    fullNames: [...new Set(fullNames)].sort(),
    surnames: [...new Set(fullNames.map((name) => name.split(" ").at(-1)!))].sort(),
  };
}
