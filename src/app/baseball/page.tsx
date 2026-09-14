import type { Metadata } from "next";
import { rankStories } from "@/lib/ranking";
import { fixtureStories } from "@/data/stories";
import { SectionStub } from "@/components/layout/SectionStub";

export const metadata: Metadata = { title: "Baseball" };

export default function BaseballPage() {
  const stories = rankStories(fixtureStories.filter((story) => story.sport === "baseball"));

  return (
    <SectionStub
      title="Baseball"
      description="MLB first, college and minors when nationally relevant."
      stories={stories}
    />
  );
}
