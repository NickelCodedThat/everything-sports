import type { ReactNode } from "react";

/** Screen-reader-only text: visually hidden but announced, per WCAG 2.2 AA. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return (
    <span className="absolute h-px w-px overflow-hidden whitespace-nowrap border-0 p-0 [clip:rect(0,0,0,0)]">
      {children}
    </span>
  );
}
