"use client";

import { useEffect, useState } from "react";

type ProjectViewToggleProps = {
  /** Controlled by app/page.tsx, which swaps between ProjectGridSection (Tx)
   *  and ProjectThumbnailGrid (Th) based on this — this component now only
   *  renders the switch itself, not either grid. */
  showImages: boolean;
  onShowImagesChange: (showImages: boolean) => void;
  /** Fired on every click of either button (regardless of whether the view
   *  actually changes) — app/page.tsx uses this to play the underline-sweep
   *  animation on a random project title. */
  onToggleClick?: () => void;
};

/** Tx/Th switch controlling whether ProjectGridSection or ProjectThumbnailGrid renders. */
export function ProjectViewToggle({ showImages, onShowImagesChange, onToggleClick }: ProjectViewToggleProps) {
  // Fades in on mount (same slide+fade treatment as reveal-on-mount.tsx:
  // translate-y-[24px]+opacity-0 → translate-y-0+opacity-100, 500ms ease-out)
  // — applied directly to the sticky button row below rather than via a
  // RevealOnMount wrapper div, since an extra wrapper (of only its own
  // content height) would replace the `absolute inset-0` div as this row's
  // sticky "containing block", breaking the room it needs to keep sticking
  // across the full project list scroll (same reasoning as about-side-nav.tsx).
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    // Absolute + inset-0 so this takes no space in normal flow (otherwise it
    // pushes the project grid, its flow sibling, down by its own height)
    // while still spanning the full height of the origin — the inner
    // `sticky` element needs that full-height container to have room to
    // actually stick as you scroll, not just a single line's worth of space.
    <div className="absolute inset-0">
      <div
        className={`sticky top-[24px] ml-[calc(24px*var(--grid-scale))] flex items-center gap-[calc(3px*var(--scale))] whitespace-nowrap text-[length:calc(12px*var(--scale))] leading-[1.5] font-medium mix-blend-exclusion transition-[translate,opacity] duration-500 ease-out ${
          revealed ? "translate-y-0 opacity-100" : "translate-y-[24px] opacity-0"
        }`}
        data-name="btn"
      >
        <button
          type="button"
          onClick={() => {
            onShowImagesChange(false);
            onToggleClick?.();
          }}
          aria-pressed={!showImages}
          className={`cursor-pointer transition-colors hover:text-white/50 [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${!showImages ? "text-white/50" : "text-white"}`}
        >
          Txt
        </button>
        <span className="text-white [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">/</span>
        <button
          type="button"
          onClick={() => {
            onShowImagesChange(true);
            onToggleClick?.();
          }}
          aria-pressed={showImages}
          className={`cursor-pointer transition-colors hover:text-white/50 [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${showImages ? "text-white/50" : "text-white"}`}
        >
          Img
        </button>
      </div>
    </div>
  );
}
