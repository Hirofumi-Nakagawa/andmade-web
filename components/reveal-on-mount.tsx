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
export function RevealOnMount({ className = "", style, children, ...rest }: RevealOnMountProps) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className={`transition-all duration-500 ease-out ${
        revealed ? "translate-y-0 opacity-100" : "translate-y-[24px] opacity-0"
      } ${className}`}
      style={style}
      {...rest}
    >
      {children}
    </div>
  );
}
