import type { Metadata } from "next";
import { rankStories } from "@/lib/ranking";
import { fixtureStories } from "@/data/stories";
import { SectionStub } from "@/components/layout/SectionStub";

export const metadata: Metadata = { title: "Fight" };

export default function FightPage() {
  const stories = rankStories(
    fixtureStories.filter((story) => story.sport === "boxing" || story.sport === "mma"),
  );

  return (
    <SectionStub title="Fight" description="Boxing and MMA, one desk." stories={stories} />
  );
}
