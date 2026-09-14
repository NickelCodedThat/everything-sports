import type { Metadata } from "next";
import { rankStories } from "@/lib/ranking";
import { fixtureStories } from "@/data/stories";
import { SectionStub } from "@/components/layout/SectionStub";

export const metadata: Metadata = { title: "Football" };

export default function FootballPage() {
  const stories = rankStories(fixtureStories.filter((story) => story.sport === "football"));

  return (
    <SectionStub
      title="Football"
      description="NFL first, college football second."
      stories={stories}
    />
  );
}
