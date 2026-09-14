import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  label: string;
}

/** 44x44px touch target per blueprint section 9, with a required accessible label since the glyph alone isn't one. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { children, label, className = "", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={`flex h-11 w-11 items-center justify-center rounded-md text-ink transition-colors duration-[var(--duration-fast)] hover:bg-surface ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});
