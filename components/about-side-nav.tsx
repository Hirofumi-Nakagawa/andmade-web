"use client";

import { useEffect, useState } from "react";
import { ABOUT_NAV_ITEMS } from "@/lib/about-content";

/**
 * Left-edge scroll-spy nav for the About page (Figma node 520:1740,
 * "Frame 82") — Vision/Approach/Services/Awards/Media/Outline. Positioned
 * exactly like project-view-toggle.tsx's Txt/Img switch: an `absolute
 * inset-0` wrapper (so it takes no space in normal flow but gives the
 * `sticky` child room to stick for the whole scroll range) with the nav
 * itself `sticky top-[24px]`, offset from the grid's left margin via
 * `ml-[calc(24px*var(--grid-scale))]` — same pattern, same numbers.
 *
 * The current section is indicated the same way SiteHeader marks the
 * current page (`aria-current` → 50% opacity) rather than a moving
 * highlight — the small horizontal line above "Vision" (matching Figma's
 * static "Line 1") stays put; it isn't a per-item active indicator.
 *
 * Fades in on mount (same slide+fade treatment as reveal-on-mount.tsx:
 * translate-y-[24px]+opacity-0 → translate-y-0+opacity-100, 500ms ease-out)
 * — applied directly to the `nav` itself rather than via a RevealOnMount
 * wrapper div, since an extra wrapper here (of only its own content height)
 * would replace the `absolute inset-0` div as `nav`'s sticky "containing
 * block", breaking the room it needs to keep sticking across the full page
 * scroll (see this file's own top comment).
 */
export function AboutSideNav() {
  const [activeId, setActiveId] = useState<string>(ABOUT_NAV_ITEMS[0].id);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const sections = ABOUT_NAV_ITEMS.map((item) => document.getElementById(item.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (sections.length === 0) return;

    const visible = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        // Among sections currently crossing the band, the topmost one (in
        // document order) is the "current" one.
        const firstVisible = ABOUT_NAV_ITEMS.find((item) => visible.has(item.id));
        if (firstVisible) setActiveId(firstVisible.id);
      },
      // A thin horizontal band a bit above vertical center — crossing it is
      // what flips a section "current".
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 },
    );

    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="absolute inset-0">
      <nav
        aria-label="About sections"
        className={`sticky top-[24px] ml-[calc(24px*var(--grid-scale))] flex flex-col items-start whitespace-nowrap text-[length:calc(12px*var(--scale))] leading-[1.2] font-medium text-black transition-all duration-500 ease-out ${
          revealed ? "translate-y-0 opacity-100" : "translate-y-[24px] opacity-0"
        }`}
        data-name="about-side-nav"
      >
        <span aria-hidden className="mb-[calc(15px*var(--scale))] h-px w-[calc(10px*var(--scale))] bg-black" />
        <div className="flex flex-col items-start gap-[calc(7px*var(--scale))]">
          {ABOUT_NAV_ITEMS.map((item) => {
            const isCurrent = item.id === activeId;
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                aria-current={isCurrent ? "true" : undefined}
                className={`transition-colors [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${
                  isCurrent ? "text-black/50" : "text-black hover:text-black/50"
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
