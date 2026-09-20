import type { Sport } from "@/types/sport";

/**
 * Deterministic, inspectable sport lexicon for the three priority sports.
 * Built from real headline samples (see docs/NEWS-SOURCE-STRATEGY.md, 2026-09-20
 * validation) where the biggest classification gap was that headlines name teams
 * and players, not leagues — e.g. 74% of MLB-query baseball headlines never
 * contained "MLB" or "Major League Baseball".
 *
 * Three evidence tiers, each worth a different amount in `classify.ts`:
 *  - strong: league / event tokens that essentially only mean this sport
 *  - team:   distinctive team nicknames and sport-specific vocabulary
 *  - weak:   words that are also common English or shared across sports
 *            ("Sky", "Dream", "Giants", "bullpen"…). Never enough on their own
 *            to move a candidate away from the sport whose query found it.
 */
export type LexiconSport = "basketball" | "football" | "baseball";

export interface SportLexicon {
  strong: string[];
  team: string[];
  weak: string[];
}

export const SPORT_LEXICON: Record<LexiconSport, SportLexicon> = {
  basketball: {
    strong: ["NBA", "WNBA", "March Madness", "NBA Finals", "NBA Draft", "WNBA Draft"],
    team: [
      "Celtics", "Nets", "Knicks", "76ers", "Sixers", "Raptors", "Bulls", "Cavaliers", "Cavs",
      "Pistons", "Pacers", "Bucks", "Hawks", "Hornets", "Wizards", "Nuggets", "Timberwolves",
      "Thunder", "Trail Blazers", "Blazers", "Jazz", "Warriors", "Clippers", "Lakers", "Suns",
      "Mavericks", "Mavs", "Rockets", "Grizzlies", "Pelicans", "Spurs", "Miami Heat", "Orlando Magic",
      "Lynx", "Aces", "Sparks", "Mystics", "Valkyries", "Mercury", "Indiana Fever", "Atlanta Dream",
      "Chicago Sky", "Connecticut Sun", "Dallas Wings", "New York Liberty", "Seattle Storm",
      "Portland Fire", "Toronto Tempo",
      "point guard", "three-pointer", "three-pointers", "triple-double", "rebounds", "dunk",
    ],
    weak: ["Kings", "Heat", "Magic", "Dream", "Sky", "Fever", "Storm", "Fire", "Liberty", "Wings", "Tempo", "Sun", "layup", "buzzer-beater"],
  },
  football: {
    strong: ["NFL", "Super Bowl", "College Football Playoff", "Heisman", "Pro Bowl", "NFL Draft", "FBS"],
    team: [
      "Bills", "Dolphins", "Patriots", "Ravens", "Bengals", "Browns", "Steelers", "Texans", "Colts",
      "Jaguars", "Titans", "Broncos", "Chiefs", "Raiders", "Chargers", "Cowboys", "Eagles", "Commanders",
      "Bears", "Packers", "Vikings", "Falcons", "Saints", "Buccaneers", "Bucs", "49ers", "Seahawks", "Rams",
      "quarterback", "wide receiver", "running back", "linebacker", "tight end", "touchdown", "touchdowns",
      "Big Ten", "SEC", "Big 12", "ACC",
    ],
    weak: [
      "Giants", "Jets", "Lions", "Cardinals", "Panthers", "Alabama", "LSU", "Ole Miss", "Vanderbilt",
      "Georgia", "Mississippi", "Ohio State", "Michigan", "Notre Dame", "Oklahoma", "Clemson", "Florida State",
      "Auburn", "Tennessee", "Texas A&M", "Nebraska", "Penn State", "NC State", "Kentucky",
      "field goal", "Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "WR", "QB", "RB",
    ],
  },
  baseball: {
    strong: ["MLB", "Major League Baseball", "World Series", "Cy Young", "MLB Draft", "Grapefruit League", "Cactus League"],
    team: [
      "Yankees", "Red Sox", "Blue Jays", "Orioles", "Rays", "Guardians", "Tigers", "Royals", "Twins",
      "White Sox", "Astros", "Angels", "Athletics", "Mariners", "Braves", "Marlins", "Mets", "Phillies",
      "Nationals", "Cubs", "Reds", "Brewers", "Pirates", "Diamondbacks", "D-backs", "Rockies", "Dodgers",
      "Padres", "home run", "home runs", "walk-off", "strikeouts", "bullpen", "AL West", "AL East",
      "AL Central", "NL West", "NL East", "NL Central", "grand slam", "no-hitter", "balk", "walks it off",
      "walked off", "strikeout", "RBI single", "two-run", "three-run", "stolen base",
    ],
    weak: ["Rangers", "Giants", "Cardinals", "homer", "RBI", "ERA", "pitcher", "innings", "wild card", "slam"],
  },
};

/**
 * Tokens that indicate a headline is really about a *different* sport than a
 * football/basketball/baseball query profile suggested. Reported as a
 * contradictory signal. (The remaining sports' own profile terms — Premier
 * League, NHL, etc. — already act as strong evidence in classify.ts.)
 */
export const CONTRADICTION_LEXICON: Partial<Record<Sport, string[]>> = {
  soccer: ["goalkeeper", "striker", "midfielder", "FIFA", "transfer window", "Ballon d'Or", "LaLiga", "Ligue 1", "Europa League"],
  hockey: ["Stanley Cup", "power play goal"],
};

/**
 * Ambiguous acronyms and the context that shows they are NOT the sport term.
 * When the guard matches anywhere in the text, that acronym is ignored.
 * Grown from real data: a Nigerian news story about the Nigerian Bar Association
 * ("NBA") matched basketball/high on 2026-09-20.
 */
export const AMBIGUOUS_TERM_GUARDS: Record<string, RegExp> = {
  NBA: /\b(Niger|Nigeria|Nigerian|Bar Association|lawyers?|National Building)\b/i,
  SEC: /\b(Securities|Exchange Commission|fraud|filings?|investors?|SEC charges|SEC sues)\b/i,
  ACC: /\b(cement|Adani|Ltd|shares|accounting)\b/i,
  FBS: /\b(Broadcasting|Bank)\b/i,
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const patternCache = new Map<string, RegExp>();
const properNounCache = new Map<string, RegExp>();

/**
 * Team nicknames are proper nouns that double as everyday words ("Bills",
 * "Bears", "Reds", "Rays", "Jets"). Matching them case-sensitively keeps
 * "Congress debates new bills" from reading as NFL. Acronyms and lowercase
 * vocabulary ("NBA", "home run") stay case-insensitive.
 */
export function containsProperNoun(text: string, term: string): boolean {
  const isCapitalizedWord = /^[A-Z][a-z]/.test(term);
  if (!isCapitalizedWord) return containsTerm(text, term);
  let pattern = properNounCache.get(term);
  if (!pattern) {
    pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(term)}(?![\\p{L}\\p{N}])`, "u");
    properNounCache.set(term, pattern);
  }
  return pattern.test(text);
}

/**
 * Case-insensitive, whole-word match. Substring matching (the original
 * behavior) wrongly matched "NBA" inside "WNBA" and short tokens like "SEC"
 * inside ordinary words.
 */
export function containsTerm(text: string, term: string): boolean {
  let pattern = patternCache.get(term);
  if (!pattern) {
    pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(term)}(?![\\p{L}\\p{N}])`, "iu");
    patternCache.set(term, pattern);
  }
  return pattern.test(text);
}

function isGuarded(text: string, term: string): boolean {
  const guard = AMBIGUOUS_TERM_GUARDS[term.toUpperCase()];
  return guard !== undefined && guard.test(text);
}

export function matchTerms(text: string, terms: string[]): string[] {
  return terms.filter((term) => containsTerm(text, term) && !isGuarded(text, term));
}

export function matchProperNouns(text: string, terms: string[]): string[] {
  return terms.filter((term) => containsProperNoun(text, term) && !isGuarded(text, term));
}
