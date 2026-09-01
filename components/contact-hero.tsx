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
    //
    // marginLeft — 基準はこのページ共通の 198px * --grid-scale だが、そこから
    // 1px 左へ（直接の指示）。"G" の左サイドベアリングぶん右に浮いて見えるのを
    // 目視で詰めるためのもので、グリッドの値そのものではないので calc の中に
    // 直接書いている。--scale ではなく素の 1px（見た目の微調整なので
    // 画面幅で増減させない）。Tailwind の任意値クラスではなくインラインなのは、
    // 新規ユーティリティが dev の生成CSSに乗り遅れることがあるため。
    <p
      style={{ marginLeft: "calc(198px * var(--grid-scale) - 1px)" }}
      className="text-[length:calc(60px*var(--scale))] leading-[1.75] font-normal text-[#fff] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
    >
      <ScrambleText text={TEXT} active />
    </p>
  );
}
