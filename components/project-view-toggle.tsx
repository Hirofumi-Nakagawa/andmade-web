"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { SlotDigits } from "@/components/slot-digits";
import { LIST_ENTRANCE_DELAY_MS } from "@/lib/entrance";

type ProjectViewToggleProps = {
  /** 実績の件数 — 「Made Here / N Cases」として Txt - Img の上に出す。
   *  以前は画面右下の CaseCounter が
   *  持っていた表示で、右下は「Scroll」に置き換わった。 */
  count: number;
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

/** カウントアップ（SlotDigits）を回し始めるまで。レール自体が
 *  一拍おいて（LIST_ENTRANCE_DELAY_MS）500ms かけてフェードインするので、
 *  それが終わってから回し始める。 */
const COUNT_UP_START_MS = LIST_ENTRANCE_DELAY_MS + 500;

/** ブレンドモードは廃止し #000 に。
 *
 *  Tx/Th switch controlling whether ProjectGridSection or ProjectThumbnailGrid renders. */
export function ProjectViewToggle({ count, showImages, onShowImagesChange, onToggleClick }: ProjectViewToggleProps) {
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

  // カウントアップの開始待ち（COUNT_UP_START_MS 参照）。それまでは 0 を
  // 出しておく（桁数は同じなので、始まった瞬間に幅が動かない）。
  const [countUpStarted, setCountUpStarted] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setCountUpStarted(true), COUNT_UP_START_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    // Absolute + inset-0 so this takes no space in normal flow (otherwise it
    // pushes the project grid, its flow sibling, down by its own height)
    // while still spanning the full height of the origin — the inner
    // `sticky` element needs that full-height container to have room to
    // actually stick as you scroll, not just a single line's worth of space.
    <div className="absolute inset-0">
      <div
        className={`sticky top-[24px] ml-[calc(24px*var(--grid-scale))] whitespace-nowrap text-[length:calc(12px*var(--scale))] leading-[1.5] transition-[translate,opacity] duration-500 ease-out ${
          revealed ? "translate-y-0 opacity-100" : "translate-y-[24px] opacity-0"
        }`}
        data-name="btn"
        // 一覧と足並みを揃えて一拍おいてから出す。
        style={{ transitionDelay: `${LIST_ENTRANCE_DELAY_MS}ms` }}
      >
        {/* 「Made Here / N Cases」。
            数字だけ medium、"Cases" は regular（PC の右下カウンターが
            そうだった組み合わせをそのまま引き継ぐ）。イントロ完了時に
            この行ごと再マウントされる（home-view.tsx の
            toggleReplayGeneration）ので、スロットもそのたび回り直す。 */}
        <p className="text-black [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">Made Here</p>
        <p className="mt-[calc(9px*var(--scale))] text-black [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
          <span className="font-medium">
            <SlotDigits
              value={countUpStarted ? count : 0}
              digits={String(count).length}
              extraSpins={2}
              durationMs={1200}
            />
          </span>{" "}
          Cases
        </p>

        <div className="mt-[calc(19px*var(--scale))] flex items-center gap-[calc(3px*var(--scale))] font-medium">
        <button
          type="button"
          // --underline-offset — 下線を既定（-0.1em）から1px下げる。bottom は負の
          // オフセットなので、負を増やす＝文字から離れる＝下がる。
          style={{ "--underline-offset": "calc(-0.1em - 1px)" } as CSSProperties}
          onClick={() => {
            onShowImagesChange(false);
            onToggleClick?.();
          }}
          aria-pressed={!showImages}
          // 選択中（current）は下線無し、非選択にだけ下線。
          // .underline-sweep はホバーで下線が一度掃ける共有クラス
          // （globals.css）。
          className={`cursor-pointer transition-colors hover:text-black/50 [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${!showImages ? "text-black/50" : "underline-sweep text-black"}`}
        >
          Txt
        </button>
        {/* 区切りは "/" → "-"。 */}
        <span className="text-black [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">-</span>
        <button
          type="button"
          style={{ "--underline-offset": "calc(-0.1em - 1px)" } as CSSProperties}
          onClick={() => {
            onShowImagesChange(true);
            onToggleClick?.();
          }}
          aria-pressed={showImages}
          className={`cursor-pointer transition-colors hover:text-black/50 [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${showImages ? "text-black/50" : "underline-sweep text-black"}`}
        >
          Img
        </button>
        </div>
      </div>
    </div>
  );
}
