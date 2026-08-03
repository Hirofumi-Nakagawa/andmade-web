"use client";

import { useFadeIn } from "@/components/use-fade-in";

/**
 * Studies ページの背景（地色 + テクスチャ）だけを1枚に分離したレイヤー。
 *
 * per direct follow-up ("aboutとstudiesとcontactのページが表示されるとき、
 * 背景はフェードインで表示させて")。地色は元々コンテンツを内包する
 * ラッパーの `backgroundColor` に直接書かれていたため、そのままフェード
 * させると本文まで一緒に薄くなってしまう。背景だけを `absolute inset-0` の
 * 別レイヤーに出して、これだけをフェードインさせる。
 *
 * `-z-10` ではなく DOM 順（このレイヤーを最初に置く）で下に敷いている —
 * 兄弟要素はどれも `position: absolute`／通常フローで、負のz-indexを使うと
 * 親の背景より後ろに回り込む場合があるため。
 */
/** 背景のフェードイン時間。studies-gallery.tsx / mobile-studies.tsx が
 *  「パラパラ表示（イントロ）を背景が出揃ってから始める」ための待ち時間と
 *  して読む — per direct follow-up ("背景がフェードインする前にパラパラが
 *  始まってる")。下の transition と必ず同じ値であること。 */
export const STUDIES_BACKGROUND_FADE_MS = 450;

export function StudiesBackground({
  color,
  textureSrc,
}: {
  /** ページの地色。 */
  color: string;
  /** 上に敷くタイルテクスチャのURL（basePath 適用済みのものを渡すこと）。 */
  textureSrc: string;
}) {
  const shown = useFadeIn();

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundColor: color,
        opacity: shown ? 1 : 0,
        transition: `opacity ${STUDIES_BACKGROUND_FADE_MS}ms ease-out`,
      }}
    >
      {/* タイルテクスチャ — `mix-blend-mode: multiply` で地色に対して
         インクのような一様な陰りとして乗る。地色と一緒にフェードさせたい
         ので、外側のレイヤーの子にしてある。 */}
      <div
        className="absolute inset-0 opacity-[0.35] mix-blend-multiply"
        style={{ backgroundImage: `url("${textureSrc}")`, backgroundRepeat: "repeat" }}
      />
    </div>
  );
}
