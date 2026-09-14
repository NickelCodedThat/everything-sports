import type { Metadata } from "next";
import { fixtureStories } from "@/data/stories";
import { SectionStub } from "@/components/layout/SectionStub";

export const metadata: Metadata = { title: "Latest" };

export default function LatestPage() {
  const stories = [...fixtureStories].sort(
    (a, b) =>
      new Date(b.updatedAt ?? b.publishedAt).getTime() - new Date(a.updatedAt ?? a.publishedAt).getTime(),
  );

  return (
    <SectionStub
      title="Latest"
      description="Everything, in the order it happened."
      stories={stories}
    />
  );
}
