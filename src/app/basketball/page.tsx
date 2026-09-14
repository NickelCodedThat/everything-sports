import type { Metadata } from "next";
import { rankStories } from "@/lib/ranking";
import { fixtureStories } from "@/data/stories";
import { SectionStub } from "@/components/layout/SectionStub";

export const metadata: Metadata = { title: "Basketball" };

export default function BasketballPage() {
  const stories = rankStories(fixtureStories.filter((story) => story.sport === "basketball"));

  return (
    <SectionStub
      title="Basketball"
      description="NBA first, WNBA next, college basketball when it earns it."
      stories={stories}
    />
  );
}
