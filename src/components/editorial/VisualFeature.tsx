import Image from "next/image";
import Link from "next/link";
import type { Story } from "@/types/story";
import { getStoryPath } from "@/lib/routes";
import { StoryMeta } from "./StoryMeta";
import { ContentTypeTag } from "@/components/ui/Tag";

/**
 * Visual feature: full-bleed photography, controlled bottom scrim, white
 * text, minimum 420px mobile height, no hover zoom (blueprint section 10.F).
 * Renders next/image directly (rather than through StoryImage) because the
 * frame is defined by the container's min-height, not an aspect ratio.
 */
export function VisualFeature({ story }: { story: Story }) {
  if (!story.image) return null;
  const objectPosition = story.image.focalPoint
    ? `${story.image.focalPoint.x * 100}% ${story.image.focalPoint.y * 100}%`
    : "50% 50%";

  return (
    <Link
      href={getStoryPath(story)}
      className="relative block min-h-[420px] overflow-hidden bg-blacktop md:min-h-[560px]"
    >
      <Image
        src={story.image.src}
        alt={story.image.alt}
        fill
        unoptimized
        sizes="100vw"
        style={{ objectFit: "cover", objectPosition }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-blacktop/95 via-blacktop/15 to-transparent"
      />
      <div className="relative z-10 flex h-full min-h-[420px] flex-col justify-end p-6 md:min-h-[560px] md:p-10">
        <ContentTypeTag storyType={story.storyType} tone="reversed" />
        <h3 className="mt-2 max-w-2xl font-editorial text-headline-1 font-bold text-clean-sheet">
          {story.headline}
        </h3>
        <p className="mt-2 max-w-xl font-editorial text-body-lg text-chalk">{story.deck}</p>
        <StoryMeta story={story} tone="reversed" className="mt-3" />
      </div>
    </Link>
  );
}
