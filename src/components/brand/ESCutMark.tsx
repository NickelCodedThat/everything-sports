import type { BrandTone } from "./Wordmark";

const TONE_TEXT: Record<BrandTone, string> = {
  ink: "text-ink",
  reversed: "text-clean-sheet",
  brand: "text-brand",
};

interface ESCutMarkProps {
  tone?: BrandTone;
  size?: number;
  className?: string;
  title?: string;
}

/**
 * Implementation-safe first pass of the ES Cut compact mark (blueprint
 * section 4): a continuous rectangular "E" path on a 12x12 grid with a
 * notch cut through the middle bar. This is a geometric approximation, not
 * JD's hand-tuned optical variants — swap the `<path>` below when those
 * arrive, the surrounding component contract (size/tone) should not need
 * to change.
 */
export function ESCutMark({ tone = "ink", size = 24, className = "", title }: ESCutMarkProps) {
  const textClass = TONE_TEXT[tone];

  return (
    <svg
      viewBox="0 0 12 12"
      width={size}
      height={size}
      className={`${textClass} ${className}`}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M1 1H11V3H3V5H9V7H3V9H11V11H1V1Z"
      />
    </svg>
  );
}
