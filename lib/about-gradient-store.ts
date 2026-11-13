/**
 * About ページの背景グラデを3種から選ぶための小さな外部ストア。
 *
 * UI（components/about-grad-switch.tsx の「Change Grad. 1 2 3」）と
 * 背景（components/about-blend-background.tsx）は親子関係に無く、PC と SP で
 * 別々の木に居るので、props では繋げない。lib/footer-mode-store.ts と
 * まったく同じ形の購読ストアにして、どちらも useSyncExternalStore で読む。
 *
 * **保持の範囲はモジュールスコープそのもの**（直接の指示）:
 *   ・別ページへ移動して About に戻る → 選んだ背景のまま
 *     （クライアント遷移では JS のモジュールが生き続けるので何もしなくてよい）
 *   ・リロード / 直接アクセス → 1（既存の背景）に戻る
 *     （バンドルが読み直されてこの値が初期化されるので、これも自動）
 *
 * つまり localStorage / sessionStorage は使わない。使うとリロードでも
 * 残ってしまい、「初めて開いた人が見る背景」が人によって変わる。
 */
type Listener = () => void;

/** 1 = 既存の背景（ワープ色面）。2 = 溶け合い。3 = 水彩。 */
export type AboutGradientVariant = 1 | 2 | 3;

export const ABOUT_GRADIENT_VARIANTS: readonly AboutGradientVariant[] = [1, 2, 3];

/** リロード直後・初回アクセス時の背景。 */
const DEFAULT_VARIANT: AboutGradientVariant = 1;

let variant: AboutGradientVariant = DEFAULT_VARIANT;
const listeners = new Set<Listener>();

export function setAboutGradient(value: AboutGradientVariant) {
  if (variant === value) return;
  variant = value;
  listeners.forEach((listener) => listener());
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
