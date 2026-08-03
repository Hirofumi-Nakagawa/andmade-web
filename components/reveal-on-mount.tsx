"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

type RevealOnMountProps = {
  className?: string;
  style?: CSSProperties;
  /** Omit for purely decorative reveals with no content of their own (e.g.
   *  the Contact page's placeholder photo box, which is just a colored
   *  box). */
  children?: ReactNode;
  /** Passed straight through — for purely decorative reveals (e.g. the
   *  Contact page's placeholder photo box). */
  "aria-hidden"?: boolean;
  /** 24px の下からのスライドを外し、フェードインだけにする — per direct
   *  follow-up（About の FV リード文、"リード文のスライドインはやっぱり無しで
   *  フェードインだけにして"）。すぐ上の見出しがカーテンリビール（下から
   *  せり上がる）なので、リード文まで同じ方向に動くと2つの動きがぶつかる。
   *  既定は false（従来どおりスライド＋フェード）で他の呼び出し側は不変。 */
  fadeOnly?: boolean;
};

/**
 * Slides up 24px while fading in shortly after mount — the same slide+fade
 * treatment as the About page's sections (about-section.tsx:
 * translate-y-[24px]+opacity-0 → translate-y-0+opacity-100, 500ms ease-out).
 * That component triggers via an IntersectionObserver since About's sections
 * are scrolled to one at a time; this one triggers on mount instead, for
 * pages (or elements) that are simply always in view from the start, e.g.
 * the Contact page's info block/photo/copyright — the whole page no longer
 * scrolls at all (see app/contact/page.tsx), so there's nothing to observe.
 */
export function RevealOnMount({ className = "", style, children, fadeOnly = false, ...rest }: RevealOnMountProps) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      // Only the two properties this actually animates — `transition-all`
      // would also delay/ease inherited values such as the Konami easter
      // egg's page-wide text-shadow (see project-card.tsx for the full note).
      //
      // transform → translate（直接の指摘 "リード文にスライドイン付いてない"）。
      // Tailwind v4 の translate-y-* は transform ではなく CSS の `translate`
      // プロパティを出力する（.translate-y-\[24px\]{translate:var(--tw-translate-x)
      // var(--tw-translate-y)}）。そのため transform を対象にしていた間は
      // スライドだけトランジションが乗らず、24px ぶん瞬間移動していた
      // （フェードは効いていたので気づきにくい）。transition-all を使って
      // いる about-section.tsx などは影響を受けていなかった。同じ書き方を
      // していた project-card.tsx / project-view-toggle.tsx /
      // recent-news.tsx も同時に修正済み。
      className={`${fadeOnly ? "transition-opacity" : "transition-[translate,opacity]"} duration-500 ease-out ${
        revealed
          ? `opacity-100${fadeOnly ? "" : " translate-y-0"}`
          : `opacity-0${fadeOnly ? "" : " translate-y-[24px]"}`
      } ${className}`}
      style={style}
      {...rest}
    >
      {children}
    </div>
  );
}
