import type { CSSProperties } from "react";

/**
 * 「Who we are →」の矢印 — ユーザー支給の Vector.svg（12x10）をそのまま
 * パス化したもの。塗り1本のパスなので
 * 線幅の調整は不要で、色は currentColor で親のテキスト色に追従する。
 *
 * PC（home-statement.tsx）と SP（mobile-home.tsx）で共有。サイズは呼び出し側
 * が className / style で指定する — PC は --scale 追従の calc、SP は literal px。
 */
export function ArrowIcon({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg aria-hidden viewBox="0 0 12 10" fill="none" className={className} style={style}>
      <path
        d="M7.20698 0L6.16675 1.07672L9.17704 4.23907H0V5.76093L9.18807 5.76094L6.16675 8.92328L7.20698 10L12 5.00761L7.20698 0Z"
        fill="currentColor"
      />
    </svg>
  );
}
