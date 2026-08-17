"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { introDefinitelyWontShow, willIntroShow } from "@/components/site-intro";

/**
 * 「イントロのスプラッシュが終わってから登場する」要素のための共有フラグ。
 *
 * site-header.tsx / case-counter.tsx / mobile-home.tsx が各自で持っていた
 * のと同じロジックをそのまま切り出したもの（トップ FV のステートメント
 * — home-statement.tsx と mobile-home.tsx — が新たに同じ扱いを必要としたため）。
 *
 * 初期値に `introDefinitelyWontShow` を使う理由（`!willIntroShow(pathname)`
 * ではなく）は site-header.tsx の `revealed` の doc comment を参照 —
 * SSR とクライアント初回レンダーで必ず同じ値（false）になるので、
 * hydration mismatch を起こさない。
 */
export function useIntroReveal(): boolean {
  const pathname = usePathname();
  // 常に「隠れた状態」から始める（introDefinitelyWontShow で初期値を
  // true にしない）。イントロが出ない復帰時にも
  // 演出を見せたいので、その回はマウント直後の1フレームで true にする。
  // SSR とクライアント初回レンダーはどちらも false なので hydration
  // mismatch は起きない。
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    // イントロが出る回は、その完了を待つ（スプラッシュの裏で終わらせない）。
    if (willIntroShow(pathname) && !introDefinitelyWontShow()) {
      function handleIntroComplete() {
        setRevealed(true);
      }
      window.addEventListener("andmade:intro-complete", handleIntroComplete, { once: true });
      return () => window.removeEventListener("andmade:intro-complete", handleIntroComplete);
    }
    // 出ない回（＝下層からの復帰など）はその場で再生。
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately mount-only: `pathname` is intentionally only read at its initial value, matching site-header.tsx / case-counter.tsx's own identical convention.
  }, []);

  return revealed;
}
