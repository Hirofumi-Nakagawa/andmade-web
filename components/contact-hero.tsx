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
    // ウェイトは medium → regular に戻した（"AboutのDesign with clarity~の
    // 3行と、ContactのGet in touchをregularに戻す"）。
    <p className="ml-[calc(198px*var(--grid-scale))] text-[length:calc(60px*var(--scale))] leading-[1.75] font-normal text-[#fff] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
      <ScrambleText text={TEXT} active />
    </p>
  );
}
