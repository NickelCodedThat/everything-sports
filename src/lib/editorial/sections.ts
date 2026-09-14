export interface SectionMeta {
  id: string;
  /** Editorial section name, e.g. "The Run". */
  title: string;
  /** Plain-language label shown alongside the editorial name for accessibility/clarity. */
  plainLabel: string;
}

/**
 * Homepage section identity per docs/BRAND-UI-BLUEPRINT.md section 11. Kept
 * separate from ranking/assembly logic so section copy can be reused by nav,
 * future section pages, and tests without importing React.
 */
export const HOMEPAGE_SECTIONS = {
  WIRE: { id: "wire", title: "The Wire", plainLabel: "Breaking & developing news" },
  LEAD: { id: "lead", title: "The Lead", plainLabel: "Top story" },
  NOW: { id: "now", title: "Now", plainLabel: "Latest news" },
  RUN: { id: "run", title: "The Run", plainLabel: "Basketball" },
  HUDDLE: { id: "huddle", title: "The Huddle", plainLabel: "Football" },
  CUT: { id: "cut", title: "The Cut", plainLabel: "Feature" },
  DIAMOND: { id: "diamond", title: "The Diamond", plainLabel: "Baseball" },
  FIGHT_DESK: { id: "fight-desk", title: "Fight Desk", plainLabel: "Boxing & MMA" },
  WORLD_GAME: { id: "world-game", title: "World Game", plainLabel: "Soccer" },
  ACROSS_THE_BOARD: { id: "across-the-board", title: "Across the Board", plainLabel: "More sports" },
  MOST_READ: { id: "most-read", title: "Most Read", plainLabel: "Editors' picks" },
} as const satisfies Record<string, SectionMeta>;
