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
 * ES Cut compact mark (blueprint section 4). The E and S share their center
 * bar so the silhouette reads as a publication stamp first and a monogram
 * second. Two-unit strokes and open counters hold at favicon size.
 */
export function ESCutMark({
  tone = "ink",
  size = 24,
  className = "",
  title,
}: ESCutMarkProps) {
  const textClass = TONE_TEXT[tone];

  return (
    <svg
      viewBox="0 0 14 12"
      width={(size * 7) / 6}
      height={size}
      className={`${textClass} ${className}`}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      shapeRendering="geometricPrecision"
    >
      {title ? <title>{title}</title> : null}
      <path
        fill="currentColor"
        d="M0 0H6V2H2V5H6V7H2V10H6V12H0V0ZM6 0H14V2H8V5H14V12H6V10H12V7H6V0Z"
      />
    </svg>
  );
}
