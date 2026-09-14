import Link from "next/link";
import type { Story } from "@/types/story";
import { StoryImage } from "./StoryImage";
import { StoryMeta } from "./StoryMeta";
import { ContentTypeTag, UrgencyTag } from "@/components/ui/Tag";

interface MajorSplitStoryProps {
  story: Story;
  /** Alternates orientation so packages don't repeat the same left/right layout twice in a row. */
  reverse?: boolean;
}

/** Major split story: image and text at near-equal weight (blueprint section 10.B). */
export function MajorSplitStory({ story, reverse = false }: MajorSplitStoryProps) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:items-center md:gap-8">
      <div className={reverse ? "md:order-2" : "md:order-1"}>
        {story.image ? (
          <Link href={story.sourceUrl} className="block">
            <StoryImage image={story.image} aspectRatio="4/3" sizes="(min-width: 768px) 50vw, 100vw" />
          </Link>
        ) : null}
      </div>
      <div className={reverse ? "md:order-1" : "md:order-2"}>
        <div className="flex flex-wrap items-center gap-2">
          {story.urgency !== "none" ? <UrgencyTag urgency={story.urgency} /> : null}
          <ContentTypeTag storyType={story.storyType} />
        </div>
        <h3 className="mt-2 font-editorial text-headline-2 font-bold text-ink">
          <Link href={story.sourceUrl} className="hover:underline focus-visible:underline">
            {story.headline}
          </Link>
        </h3>
        <p className="mt-2 font-editorial text-body text-ink-muted">{story.deck}</p>
        <StoryMeta story={story} className="mt-3" />
      </div>
    </div>
  );
}
