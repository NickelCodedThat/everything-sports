import { Timestamp } from "@/components/ui/Timestamp";
import type { Story } from "@/types/story";

interface StoryMetaProps {
  story: Story;
  className?: string;
  /** "reversed" for use over photography or Blacktop surfaces (blueprint: never lay small Film Gray text over photography). */
  tone?: "default" | "reversed";
}

/** Byline/source, timestamp, and update marker — shown on every card per blueprint's trust-layer rules. */
export function StoryMeta({ story, className = "", tone = "default" }: StoryMetaProps) {
  const textClass = tone === "reversed" ? "text-chalk" : "text-ink-muted";
  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-meta font-semibold ${textClass} ${className}`}>
      <span>{story.byline ?? story.source.name}</span>
      <span aria-hidden="true">·</span>
      <Timestamp iso={story.updatedAt ?? story.publishedAt} />
      {story.status === "updated" ? <span className="font-semibold text-brand">Updated</span> : null}
    </div>
  );
}
