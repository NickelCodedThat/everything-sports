import type { ReactNode } from "react";

interface ContainerProps {
  children: ReactNode;
  className?: string;
  /** Renders a <section> instead of a <div> for editorial packages that need a landmark boundary. */
  as?: "div" | "section";
}

/** The shared editorial shell: max 1440px (--content-max is 90rem), fluid gutter per blueprint section 8. */
export function Container({ children, className = "", as = "div" }: ContainerProps) {
  const Tag = as;
  return (
    <Tag className={`mx-auto w-full max-w-[90rem] px-[var(--gutter)] ${className}`}>{children}</Tag>
  );
}
