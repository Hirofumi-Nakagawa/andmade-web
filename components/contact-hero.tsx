"use client";

import { ScrambleText } from "@/components/scramble-text";

const TEXT = "Get in touch.";

/**
 * The Contact page's "Get in touch." hero (Figma node 870:2020) — a single
 * static line, scramble-revealed per-character on mount (same stagger as
 * the project list's titles — see scramble-text.tsx's default timing).
 * Left-aligned to the same 198px grid margin every other text block on
 * this page uses (see app/contact/page.tsx).
 */
export function ContactHero() {
  return (
    <p className="ml-[calc(198px*var(--grid-scale))] text-[length:calc(52px*var(--scale))] leading-[1.75] text-[#fff] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
      <ScrambleText text={TEXT} active />
    </p>
  );
}
