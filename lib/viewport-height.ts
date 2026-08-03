/**
 * 全画面背景が覆うべき高さの、単一の決定箇所。
 *
 * ── 実測で分かったこと（iPhone X系 / iOS Safari 下部バー）──────────
 *   innerHeight = clientHeight = visualViewport.height = 664
 *   screen.height = 812
 * ビューポート系の値はCSSの単位も含めて全て 664 に解決される（100lvh を
 * 指定した canvas の実測高さも 664 だった）。ツールバーが占める 148px は
 * ページの座標系の外にあり、`svh` / `dvh` / `lvh` のどれを使っても届かない。
 *
 * 一方で `screen.height`（= 812、画面の物理的な高さ）を要素の高さとして
 * 与えると、ツールバー背面まで描画されることが実機で確認できた。
 * `position: fixed` の配置基準は 664 のビューポートだが、そこから*はみ出した*
 * 描画は合成される —— 通常フローの本文がツールバー背面まで見えていたのと
 * 同じ理屈。ビューポート単位で解こうとして4回失敗した末の結論なので、
 * ここを「見た目が正しいから」といって単位に戻さないこと。
 *
 * PC で screen.height を使うとモニタ全体の高さになってしまうので、
 * ブラウザが画面を占有している環境（= 粗いポインタ = モバイル）に限定する。
 */
export function fullViewportHeightPx(): number {
  const layout = Math.max(document.documentElement.clientHeight, window.innerHeight);
  const isCoarsePointer =
    typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  if (!isCoarsePointer) return layout;
  // 横向き等で screen.height が短くなるケースもあるので max を取る。
  return Math.max(layout, window.screen.height);
}

/** CSS から参照するための変数名。`height: var(--viewport-height)` の形で使う。 */
export const VIEWPORT_HEIGHT_VAR = "--viewport-height";

/**
 * 実測値を <html> のカスタムプロパティに書き込む。
 *
 * JS で要素の style を直接触るのと違い、変数にしておけば CSS 側（globals.css
 * や Tailwind の任意値）からも同じ値を参照できる。複数の全画面レイヤーが
 * それぞれ独自に計算して食い違う、という事故も防げる。
 *
 * 返り値は解除関数。リスナーの後始末に使う。
 */
export function installViewportHeightVar(): () => void {
  function apply() {
    document.documentElement.style.setProperty(VIEWPORT_HEIGHT_VAR, `${fullViewportHeightPx()}px`);
  }
  apply();
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);
  window.visualViewport?.addEventListener("resize", apply);
  return () => {
    window.removeEventListener("resize", apply);
    window.removeEventListener("orientationchange", apply);
    window.visualViewport?.removeEventListener("resize", apply);
  };
}
