import Image from "next/image";
import type { CSSProperties } from "react";
import type { ImageMeta } from "@/types/story";

interface StoryImageProps {
  image: ImageMeta;
  /** CSS aspect-ratio value, e.g. "4/5", "16/10", "4/3", "3/4". Reserves space to avoid layout shift. */
  aspectRatio: string;
  /** Protects the lead image from lazy loading, per blueprint section 19. */
  priority?: boolean;
  sizes?: string;
  className?: string;
  showCredit?: boolean;
}

/**
 * Fixture art is original locally-generated SVG (see public/images/fixtures),
 * not photography, so it's rendered unoptimized rather than routed through
 * the image optimizer. Real photography added later should drop that prop.
 */
export function StoryImage({
  image,
  aspectRatio,
  priority = false,
  sizes = "100vw",
  className = "",
  showCredit = false,
}: StoryImageProps) {
  const objectPosition = image.focalPoint
    ? `${image.focalPoint.x * 100}% ${image.focalPoint.y * 100}%`
    : "50% 50%";
  const frameStyle = {
    "--story-aspect": aspectRatio,
  } as CSSProperties;

  return (
    <figure
      className={`story-image relative overflow-hidden bg-surface ${className}`}
      style={frameStyle}
    >
      <Image
        src={image.src}
        alt={image.alt}
        fill
        sizes={sizes}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        unoptimized
        style={{ objectFit: "cover", objectPosition }}
      />
      {showCredit && image.credit ? (
        <figcaption className="absolute bottom-1 right-1 bg-blacktop/70 px-1.5 py-0.5 text-micro text-clean-sheet">
          {image.credit}
        </figcaption>
      ) : null}
    </figure>
  );
}
