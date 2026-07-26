"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type MobileAboutSectionProps = {
  /** Anchor id — also what MobileAboutSideNav's IntersectionObserver watches. */
  id: string;
  /** Shown in parens, Courier, e.g. "Vision". */
  label: string;
  /** Zero-padded index shown at the row's right edge, e.g. "01". */
  index: string;
  children: ReactNode;
};

/**
 * SP counterpart to components/about-section.tsx — Figma node 1067:4
 * ("sp_about"), each numbered section's repeating "border-t / (Label) NN /
 * body" pattern (e.g. node 1067:543 "01"). Same reveal-on-scroll mechanism as
 * the PC version (a plain IntersectionObserver on the section itself,
 * slide-up + fade-in the first time it enters view) — genuinely shared
 * *thinking*, per direct follow-up ("基本的にPCと同じ考え方で実装して"), but
 * its own separate fixed-px component rather than the same file/props: PC's
 * border/gap/font-size classes all read from --scale/--grid-scale (fluid,
 * 1024px+ only), which have no meaning on SP's own fixed-px layout — mirrors
 * every other PC/SP pair in this codebase (mobile-project-list.tsx vs
 * project-card.tsx, mobile-menu.tsx vs the old nav, etc.), all separate
 * implementations of the same idea rather than one component branching on a
 * viewport prop.
 */
export function MobileAboutSection({ id, label, index, children }: MobileAboutSectionProps) {
  const ref = useRef<HTMLElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setRevealed(true);
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    // scroll-mt-[30px] — matches mobile-about-side-nav.tsx's own
    // `sticky top-[30px]` exactly (was 24px, a small unintentional
    // mismatch) — per direct follow-up ("左ナビを押してスクロールしたと
    // き、左ナビの上の線と右の各セクションの線の上面を揃えたい"): Lenis's
    // own `scrollTo` reads this section's `scroll-margin-top` to decide
    // where its own top edge (this border-t line) lands once scrolled to
    // (see lenis.mjs's own `scrollTo` — subtracts `scrollMarginTop` from
    // the computed target), while the side nav's decorative line rests at
    // whatever height its sticky wrapper's own `top` offset resolves to —
    // two independently-tuned numbers that need to actually match for the
    // two lines to land flush against each other.
    <section ref={ref} id={id} className="scroll-mt-[30px]">
      {/* The reveal-on-scroll slide-up/fade-in transform+opacity now live on
          *this inner* div, not the outer `<section>` above — per direct
          follow-up reporting the line-alignment fix consistently landing
          ~24px off (reproduced even in desktop devtools, ruling out any
          real-device-only timing race): Lenis's own `scrollTo(target)`
          reads `target.getBoundingClientRect()` directly (lenis.mjs), and
          for a section not yet scrolled into view even once, that target
          *was* this outer element, still sitting at its own pre-reveal
          `translate-y-[24px]` offset at the exact moment a nav tap measured
          it — a rect 24px below where that same section settles at once
          its own IntersectionObserver below fires. Scrolling to that
          transiently-offset rect landed short by exactly that 24px, which
          only self-corrected on a *second* tap because the first scroll's
          own motion had by then already triggered this section's reveal.
          Keeping the outer `<section>` (the actual scroll/observer target)
          permanently untransformed and moving the animated transform+opacity
          onto this inner child instead means `getBoundingClientRect()` on
          the real target is always its true, final layout position, with
          nothing left able to transiently offset it — the same "separate
          the moving part from the part something else measures" fix already
          used for about-background.tsx's own mask/transform split. */}
      <div
        className={`flex w-full flex-col items-start gap-[40px] transition-all duration-500 ease-out ${
          revealed ? "translate-y-0 opacity-100" : "translate-y-[24px] opacity-0"
        }`}
      >
        <div className="flex w-full items-start justify-between whitespace-nowrap border-t border-black/15 pt-[15px] font-(family-name:--font-courier) text-[12px] leading-[1.2] tracking-[-0.6px] text-black">
          <p className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">({label})</p>
          <p className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">{index}</p>
        </div>
        {children}
      </div>
    </section>
  );
}
