import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  label: string;
  tone?: "default" | "reversed";
}

/** 44x44px touch target per blueprint section 9, with a required accessible label since the glyph alone isn't one. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { children, label, tone = "default", className = "", ...props },
    ref,
  ) {
    const toneClass =
      tone === "reversed"
        ? "text-clean-sheet hover:bg-clean-sheet/10"
        : "text-ink hover:bg-surface";

    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        className={`flex h-11 w-11 items-center justify-center rounded-md transition-colors duration-[var(--duration-fast)] ${toneClass} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  },
);
