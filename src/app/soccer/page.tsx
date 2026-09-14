import type { Metadata } from "next";
import { rankStories } from "@/lib/ranking";
import { fixtureStories } from "@/data/stories";
import { SectionStub } from "@/components/layout/SectionStub";

export const metadata: Metadata = { title: "Soccer" };

export default function SoccerPage() {
  const stories = rankStories(fixtureStories.filter((story) => story.sport === "soccer"));

  return (
    <SectionStub title="Soccer" description="The global game." stories={stories} />
  );
}
