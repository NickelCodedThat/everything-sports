import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "tertiary";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "min-h-11 rounded-md bg-brand px-4 text-ui font-semibold text-clean-sheet hover:bg-brand-hover",
  secondary: "min-h-11 rounded-md bg-blacktop px-4 text-ui font-semibold text-clean-sheet hover:opacity-90",
  tertiary: "inline-flex items-center gap-1 text-ui font-semibold text-ink underline-offset-4 hover:underline focus-visible:underline",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/** Buttons per blueprint section 9. 44px minimum touch target on primary/secondary. */
export function Button({ variant = "primary", className = "", disabled, ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center ${VARIANT_CLASS[variant]} transition-colors duration-[var(--duration-fast)] disabled:opacity-50 ${className}`}
      aria-disabled={disabled}
      disabled={disabled}
      {...props}
    />
  );
}

interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: ButtonVariant;
}

/** Same visual contract as Button, for cases where the action navigates rather than submits. */
export function ButtonLink({ variant = "primary", className = "", href, ...props }: ButtonLinkProps) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center ${VARIANT_CLASS[variant]} transition-colors duration-[var(--duration-fast)] ${className}`}
      {...props}
    />
  );
}
