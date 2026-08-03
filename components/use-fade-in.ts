"use client";

import { useEffect, useState } from "react";

/**
 * マウント直後に false → true になるフラグ。CSS transition と組み合わせて
 * 「表示されたらフェードイン」を作るための最小の道具。
 *
 * per direct follow-up ("aboutとstudiesとcontactのページが表示されるとき、
 * 背景はフェードインで表示させて")。背景レイヤーは複数ページ・複数要素に
 * またがるので、各所で useState + rAF を書き写すのをやめて1箇所にまとめた。
 *
 * 初期値を false にして 1フレーム後に true にするのがポイント —— 初期状態で
 * 一度描画されないと、ブラウザには「変化」が無く transition が走らない
 * （reveal-on-mount.tsx など、このコードベースの既存の登場アニメと同じ理屈）。
 *
 * `delayMs` は true になるまでの待ち時間。段階的に見せたいときに使う。
 */
export function useFadeIn(delayMs = 0): boolean {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (delayMs > 0) {
      const timer = setTimeout(() => setShown(true), delayMs);
      return () => clearTimeout(timer);
    }
    // rAF に逃がしているのは react-hooks/set-state-in-effect 対策も兼ねる
    // （effect 本体で直接 setState すると連鎖レンダリングになる）。
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, [delayMs]);

  return shown;
}
