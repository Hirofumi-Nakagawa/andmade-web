/**
 * 効果音トグル（トップ右下）のアイコン — Figma node 1825:9。
 *
 * 13×8 の中に 1px 幅のバーを 2px おきに7本。高さは 8 / 6 / 4 / 2 / 4 / 6 / 8 で
 * 左右対称、中央がいちばん低い砂時計のような波形。座標・寸法は Figma の
 * 値そのまま（下の x/height がそれ）。
 *
 * fill は currentColor。親の `color` をそのまま拾うので、通常時の黒も、
 * アイドル中のジャケ色インク差し替え（lib/album-colors.ts）も、エッグ中の
 * 反転も、テキストと同じように効く。
 *
 * サイズは呼び出し側が width/height で決める（--scale を掛けるのは
 * case-counter.tsx 側）。viewBox があるので何倍でも崩れない。
 */
export function TickIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 13 8"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={className}
      style={style}
    >
      {/* rx=0.5 — 1px 幅なので両端が半円になり、Figma の角丸矩形と一致する。 */}
      <rect x="0" y="0" width="1" height="8" rx="0.5" fill="currentColor" />
      <rect x="2" y="1" width="1" height="6" rx="0.5" fill="currentColor" />
      <rect x="4" y="2" width="1" height="4" rx="0.5" fill="currentColor" />
      <rect x="6" y="3" width="1" height="2" rx="0.5" fill="currentColor" />
      <rect x="8" y="2" width="1" height="4" rx="0.5" fill="currentColor" />
      <rect x="10" y="1" width="1" height="6" rx="0.5" fill="currentColor" />
      <rect x="12" y="0" width="1" height="8" rx="0.5" fill="currentColor" />
    </svg>
  );
}
