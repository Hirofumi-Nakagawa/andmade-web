/**
 * About ページの背景グラデを3種から選ぶための小さな外部ストア。
 *
 * UI（components/about-grad-switch.tsx の「Change Grad. 1 2 3」）と
 * 背景（components/about-blend-background.tsx）は親子関係に無く、PC と SP で
 * 別々の木に居るので、props では繋げない。lib/footer-mode-store.ts と
 * まったく同じ形の購読ストアにして、どちらも useSyncExternalStore で読む。
 *
 * **保存しない。** リロードでもページ移動でも 1（既存の背景）に戻る
 * （直接の指示）。localStorage / sessionStorage は使わず、値はモジュール
 * スコープにだけ持つ。ただしモジュールスコープはクライアント遷移をまたいで
 * 生き残るので、About を離れて戻ってきたときに選択が残ってしまう。
 * それを防ぐため、背景コンポーネントがアンマウント時に
 * resetAboutGradient() を呼ぶ（footer-mode-store が各ページの unmount で
 * false に戻しているのと同じ考え方）。
 */
type Listener = () => void;

/** 1 = 既存の背景（ワープ色面）。2 = 溶け合い。3 = 水彩。 */
export type AboutGradientVariant = 1 | 2 | 3;

export const ABOUT_GRADIENT_VARIANTS: readonly AboutGradientVariant[] = [1, 2, 3];

const DEFAULT_VARIANT: AboutGradientVariant = 1;

let variant: AboutGradientVariant = DEFAULT_VARIANT;
const listeners = new Set<Listener>();

export function setAboutGradient(value: AboutGradientVariant) {
  if (variant === value) return;
  variant = value;
  listeners.forEach((listener) => listener());
}

/** About を離れるときに呼ぶ。上の doc comment 参照。 */
export function resetAboutGradient() {
  setAboutGradient(DEFAULT_VARIANT);
}

export function subscribeAboutGradient(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAboutGradient() {
  return variant;
}

/** useSyncExternalStore の getServerSnapshot。SSR は常に既定値 —
 *  サーバーで描かれる HTML が毎回同じになるので、ハイドレーションの
 *  不一致が起きない。 */
export function getAboutGradientServerSnapshot() {
  return DEFAULT_VARIANT;
}
