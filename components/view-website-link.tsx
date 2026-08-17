"use client";

import { useState, type CSSProperties } from "react";
import { ArrowBlankIcon } from "@/components/arrow-blank-icon";

/** テキストと矢印の間隔。 */
const ARROW_GAP = "8px";
/** 表示サイズ。支給 SVG の viewBox は 7x7 だが、8px で使う。 */
const ARROW_SIZE = "8px";
/** 出入りのスライド — トップの「Who we are →」（home-statement.tsx）と
 *  同値。ホバーアウトは 0ms＝アニメーション無しで即座に戻すのも同じ。 */
const SLIDE_MS = 500;
/** 抜ける／入ってくる距離（矢印の一辺に対する割合）。窓は矢印1つぶん
 *  ちょうどで overflow-hidden なので、1辺ぶん動けば隠れるが、斜めに
 *  動くぶん角が見えないよう余裕を持たせている。 */
const SLIDE_PERCENT = 200;

type ViewWebsiteLinkProps = {
  href: string;
  /** `<a>` に載る文字組み（サイズ・色・whitespace など）。下線と
   *  text-box-trim は中のテキスト span 側が持つので渡さなくてよい。 */
  className?: string;
  /** `--underline-offset` の上書きなど。カスタムプロパティは継承するので
   *  `<a>` に載せれば中のテキスト span まで届く。 */
  style?: CSSProperties;
  /** 中のテキスト span に足すクラス。`text-box-trim` の有無は元の `<a>` に
   *  合わせて呼び出し側が渡す — 下線の位置（.underline-sweep::after は
   *  ボックスの下端基準）が変わってしまうため、勝手に付けない。 */
  textClassName?: string;
  /** 矢印の一辺。PC は `calc(8px*var(--scale))` のように --scale 追従で
   *  渡す。既定は SP 用の literal px。 */
  arrowSize?: string;
  /** テキストと矢印の間隔。既定 8px。 */
  gap?: string;
  children?: React.ReactNode;
};

/**
 * 実績詳細の「View Website」— 文字の右に別窓矢印（↗）を置いた外部リンク。
 *
 * ホバーで矢印が右斜め上へ抜け、同じ矢印が左斜め下から入ってくる。窓は
 * 矢印1つぶんちょうどで overflow-hidden なので、抜けた矢印はその場で
 * 切れて見えなくなる（トップの「Who we are →」と同じ作りで、向きだけ
 * 斜めにしたもの）。
 *
 * 下線（.underline-sweep）は**テキストだけ**に付く。`<a>` 自体に付けると
 * 矢印の下まで線が伸びてしまうので、テキストを span で包んで内側に持たせ、
 * ホバーは `<a>` の `group` から拾わせている。
 *
 * 動きをクラス（group-hover:…）ではなく state + インラインスタイルで
 * 持っているのは、このコードベースで新規の arbitrary ユーティリティが
 * dev の生成CSSに追いつかず一時的に効かないことがあるため（斜め移動は
 * translate の x/y 両方が新規クラスになる）。インラインスタイルはCSSの
 * 生成を待たない。
 */
export function ViewWebsiteLink({
  href,
  className,
  style,
  textClassName,
  arrowSize = ARROW_SIZE,
  gap = ARROW_GAP,
  children = "View Website",
}: ViewWebsiteLinkProps) {
  const [hovered, setHovered] = useState(false);

  /** entering = 左斜め下から入ってくるほう（absolute の2枚目）。 */
  const arrowStyle = (entering: boolean): CSSProperties => ({
    display: "block",
    width: arrowSize,
    height: arrowSize,
    ...(entering ? { position: "absolute", inset: 0 } : null),
    translate: entering
      ? hovered
        ? "0 0"
        : `-${SLIDE_PERCENT}% ${SLIDE_PERCENT}%`
      : hovered
        ? `${SLIDE_PERCENT}% -${SLIDE_PERCENT}%`
        : "0 0",
    transitionProperty: "translate",
    transitionDuration: hovered ? `${SLIDE_MS}ms` : "0ms",
    transitionTimingFunction: "cubic-bezier(0, 0, 0.2, 1)",
  });

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`group inline-flex items-center ${className ?? ""}`}
      style={{ gap, ...style }}
    >
      <span className={`underline-sweep ${textClassName ?? ""}`}>{children}</span>
      <span
        className="relative block shrink-0 overflow-hidden"
        style={{ width: arrowSize, height: arrowSize }}
      >
        <ArrowBlankIcon style={arrowStyle(false)} />
        <ArrowBlankIcon style={arrowStyle(true)} />
      </span>
    </a>
  );
}
