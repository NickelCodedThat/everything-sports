"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ESCutMark } from "@/components/brand";
import { IconButton } from "@/components/ui/IconButton";
import { CloseIcon } from "@/components/ui/icons";
import { MORE_SPORTS, PRIMARY_NAV_ITEMS } from "./nav-items";

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
  activeHref?: string;
}

/**
 * Full-height mobile navigation dialog: focus trap, visible close action,
 * body scroll lock, and focus restoration to the trigger on close, per
 * blueprint section 14.
 */
export function MobileMenu({ open, onClose, activeHref }: MobileMenuProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Site menu"
      className="fixed inset-0 z-modal flex flex-col bg-canvas"
    >
      <div className="flex h-14 items-center justify-between border-b-2 border-brand bg-blacktop px-4">
        <ESCutMark tone="reversed" size={26} title="Everything Sports" />
        <IconButton
          tone="reversed"
          ref={closeButtonRef}
          label="Close menu"
          onClick={onClose}
        >
          <CloseIcon />
        </IconButton>
      </div>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-4 py-6">
        <ul className="space-y-1">
          {PRIMARY_NAV_ITEMS.map((item) => {
            const isActive = item.href === activeHref;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex min-h-11 items-center border-b border-border py-3 font-display text-2xl uppercase tracking-tight ${
                    isActive ? "text-brand" : "text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <p className="mt-8 text-meta font-semibold uppercase tracking-wide text-ink-muted">
          More sports
        </p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {MORE_SPORTS.map((sport) => (
            <li key={sport} className="text-ui font-semibold text-ink-muted">
              {sport}
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
