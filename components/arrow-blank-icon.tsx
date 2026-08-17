import type { CSSProperties } from "react";

/**
 * 「別窓で開く」の斜め矢印（↗）— ユーザー支給の arw-blank.svg（7x7）を
 * そのままパス化したもの。塗り1本のパスなので線幅の調整は不要で、色は
 * currentColor で親のテキスト色（#000 / #fff）に追従する。
 *
 * まっすぐな矢印（components/arrow-icon.tsx）とは別物 — あちらはページ内
 * 遷移（Who we are）、こちらは外部リンク（View Website）に使う。
 * サイズは呼び出し側が className / style で指定する。
 */
export function ArrowBlankIcon({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg aria-hidden viewBox="0 0 7 7" fill="none" className={className} style={style}>
      <path
        d="M1.60206 0L1.62176 1.14272L4.95371 1.2248L0 6.1785L0.821495 7L5.78116 2.04034L5.85728 5.37824L7 5.39794L6.89238 0.115836L1.60206 0Z"
        fill="currentColor"
      />
    </svg>
  );
}
