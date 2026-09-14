import type { Sport } from "@/types/sport";
import type { Story } from "@/types/story";
import { rankStories, type RankingContext } from "@/lib/ranking";
import { createUsageTracker, takeStories } from "./usage-tracker";

export interface LeadPackageData {
  headline: Story;
  supporting: Story[];
}

export interface HomepageData {
  wire: Story[];
  lead: LeadPackageData | null;
  now: Story[];
  run: Story[];
  huddle: Story[];
  cut: Story | null;
  diamond: Story[];
  fightDesk: Story[];
  worldGame: Story[];
  acrossTheBoard: Story[];
  mostRead: Story[];
}

const ACROSS_THE_BOARD_SPORTS: Sport[] = ["hockey", "tennis", "golf", "motorsports", "olympics"];

function bySport(sport: Sport) {
  return (story: Story) => story.sport === sport;
}

/**
 * Assembles the homepage per docs/BRAND-UI-BLUEPRINT.md section 11: an edited
 * edition with a live spine, not a stack of equal sport shelves. Pure
 * function over a story list so it's testable without React or fixtures.
 */
export function buildHomepage(stories: Story[], ctx: RankingContext = {}): HomepageData {
  const ranked = rankStories(stories, ctx);
  const chronological = [...stories].sort(
    (a, b) =>
      new Date(b.updatedAt ?? b.publishedAt).getTime() -
      new Date(a.updatedAt ?? a.publishedAt).getTime(),
  );

  const tracker = createUsageTracker(2);

  const leadHeadline = takeStories(ranked, 1, tracker)[0];
  const lead: LeadPackageData | null = leadHeadline
    ? {
        headline: leadHeadline,
        supporting: takeStories(ranked, 2, tracker, (story) => story.id !== leadHeadline.id),
      }
    : null;

  const wire = takeStories(
    ranked,
    8,
    tracker,
    (story) => story.urgency === "breaking" || story.urgency === "developing",
  );

  const now = takeStories(chronological, 8, tracker);

  const run = takeStories(ranked, 4, tracker, bySport("basketball"));
  const huddle = takeStories(ranked, 4, tracker, bySport("football"));

  // Prefer a genuinely cross-sport piece (sport "other") so The Cut reads as a
  // culture/feature interruption rather than just another single-sport
  // analysis story that happens not to be basketball or football.
  const cut =
    takeStories(ranked, 1, tracker, (story) => story.sport === "other")[0] ??
    takeStories(
      ranked,
      1,
      tracker,
      (story) =>
        (story.storyType === "visual-feature" || story.storyType === "analysis") &&
        story.sport !== "basketball" &&
        story.sport !== "football",
    )[0] ??
    null;

  const diamond = takeStories(ranked, 3, tracker, bySport("baseball"));
  const fightDesk = takeStories(
    ranked,
    3,
    tracker,
    (story) => story.sport === "boxing" || story.sport === "mma",
  );
  const worldGame = takeStories(ranked, 3, tracker, bySport("soccer"));
  const acrossTheBoard = takeStories(ranked, 5, tracker, (story) =>
    ACROSS_THE_BOARD_SPORTS.includes(story.sport),
  );

  const mostRead = takeStories(ranked, 5, tracker);

  return { wire, lead, now, run, huddle, cut, diamond, fightDesk, worldGame, acrossTheBoard, mostRead };
}
