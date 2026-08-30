"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowIcon } from "@/components/arrow-icon";
import { CurtainLines } from "@/components/curtain-lines";
import { useIntroReveal } from "@/components/use-intro-reveal";
import { FV_SECOND_BEAT_MS } from "@/lib/entrance";

/**
 * トップ FV のステートメント帯:
 *
 *   ・ヘッダー下 100px の位置に「What Matters」（12px / 画面左 24px）
 *   ・ステートメント本文は「ANDMADE Inc.」の左面（198px * --grid-scale）
 *     に揃えて 28px
 *   ・その下 25px に「Who we are」（About へのリンク）
 *   ・本文と同じ上面揃えで、画面右端 24px に Colors of Sound の説明 +
 *     オン/オフのトグル（デフォルトは off = 背景の色帯を出さない）
 *
 * 縦位置はすべて [text-box-trim:trim-both]（このサイト共通）前提 —
 * 「上面」= 1行目のキャップ上端、「下」= 最終行のベースライン。指定された
 * 100px / 25px はその見た目の位置どうしの距離になる。
 *
 * 行間は貼付モックの実測に合わせた 1.05（28px に対して約 29px）。詰めた
 * 組みなので、緩めたい場合は leading-[1.05] を触ればよい。
 */

/** コピーのカーテンリビール。実体は components/curtain-lines.tsx（イントロの
 *  3行タグラインと同じ作り・同じ値）。PC は改行位置がデザイン指定なので
 *  行をそのまま渡す。 */
const COPY_LINES = [
  "We uncover what truly matters and give purpose a clear form.",
  "By making every design decision intentional, we believe each thoughtful",
  "choice contributes to work that holds value over time.",
];
/** 1200px 以下用の、行を短くしたセット。
 *
 *  本文の文字サイズ（28px * --scale）は 1440px 未満では縮まない（--scale の
 *  下限は 1）のに、左マージン（198px * --grid-scale）と右の説明文は幅なりに
 *  寄ってくるので、狭いほど本文の右端が説明文に食い込む。いちばん長い行が
 *  約960px あったのを、4行に割って約640px に抑えている（1024px 幅でも
 *  右の説明文まで 60px 以上余る）。 */
const COPY_LINES_NARROW = [
  "We uncover what truly matters and give purpose",
  "a clear form. By making every design decision",
  "intentional, we believe each thoughtful choice",
  "contributes to work that holds value over time.",
];
/** 上の切り替えしきい値。 */
const NARROW_QUERY = "(max-width: 1200px)";
/** 「What Matters」と「A sound archive〜」のスライドイン＋フェードイン。
 *  値はこのサイト共通の登場演出（project-view-toggle.tsx など）と同じ
 *  translate-y 24px / 500ms / ease-out。 */
const SLIDE_MS = 500;
/** 3つの要素が同時に動くと忙しないので、わずかにずらす。 */
const DELAY_WHAT_MATTERS_MS = 0;
const DELAY_COPY_MS = 120;
/** 「A sound archive〜 / Colors of Sound」はコピーより一拍遅れて出す。 */
const DELAY_SOUND_MS = FV_SECOND_BEAT_MS;
/** 「Who we are」のフェードイン。コピーと同時 → 一拍遅れへ。 */
const WHO_FADE_MS = 500;

type HomeStatementProps = {
  /** Colors of Sound（背景の色帯）が出ているか。 */
  colorsOn: boolean;
  onColorsToggle: () => void;
};

export function HomeStatement({ colorsOn, onColorsToggle }: HomeStatementProps) {
  // イントロのスプラッシュが終わってから登場する（ヘッダーと同じ扱い）。
  const revealed = useIntroReveal();
  // 1200px 以下では改行を増やしたセットに差し替える（COPY_LINES_NARROW 参照）。
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(NARROW_QUERY);
    const update = () => setNarrow(query.matches);
    const frame = requestAnimationFrame(update);
    query.addEventListener("change", update);
    return () => {
      cancelAnimationFrame(frame);
      query.removeEventListener("change", update);
    };
  }, []);
  const copyLines = narrow ? COPY_LINES_NARROW : COPY_LINES;
  const slideStyle = (delayMs: number) => ({
    opacity: revealed ? 1 : 0,
    translate: revealed ? "0 0" : "0 24px",
    transitionDuration: `${SLIDE_MS}ms`,
    transitionDelay: `${delayMs}ms`,
  });

  return (
    // ヘッダー（mt-24px + 14px*--scale）の下 100px から始まる帯。
    // relative + 全幅なので、左右の 24px は画面端からの literal な 24px。
    <div className="relative mt-[calc(100px*var(--scale))]">
      <p
        className="absolute top-0 left-[24px] whitespace-nowrap text-[length:calc(12px*var(--scale))] leading-[1.5] font-normal text-black transition-[translate,opacity] ease-out [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
        style={slideStyle(DELAY_WHAT_MATTERS_MS)}
      >
        What Matters
      </p>

      <div className="ml-[calc(198px*var(--grid-scale))] w-[var(--content-width-fluid)]">
        <CurtainLines
          text={copyLines.join(" ")}
          lines={copyLines}
          active={revealed}
          delayMs={DELAY_COPY_MS}
          // tracking — -0.01em 相当。28px に対して -0.28px。
          className="text-[length:calc(28px*var(--scale))] leading-[1.05] font-medium tracking-[calc(-0.28px*var(--scale))] text-black"
        />

        {/* mt は Link 自身ではなくこの div に — inline-flex の縦マージンは
            行ボックスの扱いで期待どおりに効かないことがあるため。 */}
        <div
          className="mt-[calc(20px*var(--scale))] transition-opacity ease-out"
          style={{
            opacity: revealed ? 1 : 0,
            transitionDuration: `${WHO_FADE_MS}ms`,
            transitionDelay: `${FV_SECOND_BEAT_MS}ms`,
          }}
        >
          <Link
            href="/about"
            // data-ink-group — アイドル中のインク差し替えで、文字と矢印を
            // ひとかたまり（同色）で塗るための目印。lib/album-colors.ts 参照。
            data-ink-group
            className="group inline-flex items-center gap-[calc(8px*var(--scale))] text-[length:calc(18px*var(--scale))] leading-[1.5] font-medium text-black"
          >
            <span className="underline-sweep [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
              Who we are
            </span>
            {/* ホバーで矢印が右へ抜け、同じ矢印が左から入ってくる。ボックスは
                矢印1つぶんちょうどで overflow-hidden なので、抜けた矢印は
                その場で切れて見えなくなる。 */}
            <span
              className="relative block shrink-0 overflow-hidden"
              style={{ width: "calc(12px * var(--scale))", height: "calc(10px * var(--scale))" }}
            >
              {/* duration-0 + group-hover:duration-500 — ホバーアウトは
                  アニメーション無しで即座に戻す。ホバーが外れると duration も
                  0 に戻るので、逆再生されずスナップする。 */}
              <ArrowIcon style={{ width: "calc(12px * var(--scale))", height: "calc(10px * var(--scale))" }} className="block transition-transform duration-0 ease-out group-hover:translate-x-[200%] group-hover:duration-500" />
              <ArrowIcon style={{ width: "calc(12px * var(--scale))", height: "calc(10px * var(--scale))" }} className="absolute inset-0 -translate-x-[200%] transition-transform duration-0 ease-out group-hover:translate-x-0 group-hover:duration-500" />
            </span>
          </Link>
        </div>
      </div>

      {/* 本文と同じ上面（top-0）揃え・画面右端 24px。 */}
      <div
        className="absolute top-0 right-[24px] text-right text-[length:calc(12px*var(--scale))] leading-[1.2] font-normal text-black transition-[translate,opacity] ease-out"
        style={slideStyle(DELAY_SOUND_MS)}
      >
        <p className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
          A sound archive that turns
          <br />
          everyday listening into color.
        </p>
        <div className="mt-[calc(10px*var(--scale))]">
          <button
            type="button"
            onClick={onColorsToggle}
            aria-pressed={colorsOn}
            data-ink-group
            // on の間は透過50%。ラベル自体は
            // "Colors of Sound" 固定で、状態は濃さだけで示す。
            className={`cursor-pointer font-medium transition-opacity hover:opacity-50 ${
              colorsOn ? "opacity-50" : "opacity-100"
            }`}
          >
            {/* --underline-offset — 共有の .underline-sweep 既定値（-0.1em）
                から 2px 上げる。bottom は負のオフセットなので、負の量を
                減らす＝文字に近づく＝上がる。globals.css の該当ルール参照。 */}
            <span
              className="underline-sweep [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
              // --underline-untrimmed-nudge — text-box-trim が効かない環境
              // （Firefox）でだけ 2px 下げる（直接の指示）。globals.css の
              // @supports ブロックが読む。効く環境では無視される。
              style={
                {
                  "--underline-offset": "calc(-0.1em + 2px)",
                  "--underline-untrimmed-nudge": "2px",
                } as CSSProperties
              }
            >
              Colors of Sound
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
