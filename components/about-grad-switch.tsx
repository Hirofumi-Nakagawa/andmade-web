"use client";

import { useSyncExternalStore } from "react";
import {
  ABOUT_GRADIENT_VARIANTS,
  getAboutGradient,
  getAboutGradientServerSnapshot,
  setAboutGradient,
  subscribeAboutGradient,
} from "@/lib/about-gradient-store";

/**
 * About FV の「Change Grad. 1 2 3」— 背景グラデを3種から選ぶ切替。
 * Figma node 1848:7。
 *
 * 選択中の数字は不透明度 50% にする（Figma では 1 が rgba(0,0,0,0.5)、
 * 残りが黒）。サイト内の既存の「オンの状態を濃さで示す」書き方と同じ
 * （home-statement.tsx の Colors of Sound、case-counter.tsx の Tick）。
 *
 * 状態は lib/about-gradient-store.ts に置いてある。背景
 * （about-blend-background.tsx）とは親子関係に無く、PC と SP で別の木に
 * 居るので props では繋げないため。
 *
 * ラベルは Figma 上では "Chasnge Grad." と綴られているが、指示の文面
 * （"Change Grad."）に合わせてある。
 */

/** 数字どうしの間隔（Figma: gap 5px）。 */
const NUMBER_GAP_PX = 5;
/** ラベルと数字群の間隔（Figma: gap 8px）。 */
const LABEL_GAP_PX = 8;

export function AboutGradSwitch({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const active = useSyncExternalStore(subscribeAboutGradient, getAboutGradient, getAboutGradientServerSnapshot);

  return (
    // 12px / leading 1.2 / text-box-trim は Figma の指定そのまま。
    // 数字は medium、ラベルは regular。
    <div
      className={`flex items-center whitespace-nowrap text-[length:calc(12px*var(--scale))] leading-[1.2] text-black ${className ?? ""}`}
      style={{ gap: `calc(${LABEL_GAP_PX}px * var(--scale))`, ...style }}
    >
      <p className="font-normal [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">Change Grad.</p>
      <div className="flex items-center" style={{ gap: `calc(${NUMBER_GAP_PX}px * var(--scale))` }}>
        {ABOUT_GRADIENT_VARIANTS.map((variant) => (
          <button
            key={variant}
            type="button"
            onClick={() => setAboutGradient(variant)}
            // aria-pressed — 見た目の濃さでしか状態を示していないので、
            // 支援技術には明示的に伝える（Colors of Sound のトグルと同じ）。
            aria-pressed={variant === active}
            aria-label={`背景グラデーション ${variant}`}
            // data-ink-group — アイドル中のインク差し替えで、ひとかたまりで
            // 塗るための目印（lib/album-colors.ts 参照）。
            data-ink-group
            className={`cursor-pointer font-medium transition-opacity hover:opacity-50 [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${
              variant === active ? "opacity-50" : "opacity-100"
            }`}
          >
            {variant}
          </button>
        ))}
      </div>
    </div>
  );
}
