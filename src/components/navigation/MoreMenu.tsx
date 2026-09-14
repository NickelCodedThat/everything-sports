"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "@/components/ui/icons";
import { MORE_SPORTS } from "./nav-items";

/**
 * "More" popover per blueprint section 14: an accessible disclosure, not a
 * hover-only mega menu. Closes on outside click and Escape.
 */
export function MoreMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 items-center gap-1 px-2 text-ui font-semibold text-ink-muted hover:text-ink"
      >
        More
        <ChevronDownIcon width={16} height={16} />
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-dropdown mt-2 w-56 border border-border bg-canvas p-4 shadow-[0_8px_24px_rgb(12_12_14_/_0.18)]">
          <p className="text-meta font-semibold uppercase tracking-wide text-ink-muted">More sports</p>
          <ul className="mt-2 space-y-2">
            {MORE_SPORTS.map((sport) => (
              <li key={sport} className="text-ui font-semibold text-ink">
                {sport}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
