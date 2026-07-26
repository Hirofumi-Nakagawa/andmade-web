"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type AboutSectionProps = {
  /** Anchor id — also what AboutSideNav's IntersectionObserver watches. */
  id: string;
  /** Shown in parens, Courier, e.g. "Vision". */
  label: string;
  /** Zero-padded index shown at the row's right edge, e.g. "01". */
  index: string;
  children: ReactNode;
};

/**
 * One numbered section of the About page (Vision/Approach/Services/Awards/
 * Media/Outline) — a top border, a small "(Label)  NN" header row in
 * Courier Prime, then whatever body content the section needs. Matches
 * Figma node 520:1628 ("about" frame)'s repeating section pattern.
 *
 * Reveals with the same slide-up + fade-in as the project list's cards
 * (project-card.tsx: translate-y-[24px]+opacity-0 → translate-y-0+opacity-100,
 * 500ms ease-out) via an IntersectionObserver on the section itself, so each
 * one animates in as it's scrolled to — including right away on first paint
 * for whichever section (Vision) is already in view, which is what makes a
 * freshly-navigated-to page feel like it's entering rather than just
 * appearing.
 *
 * The border-t + "(Label) NN" row live on their own inner wrapper (not on
 * `section` itself, which stays plain `w-full`/content-width-fluid like
 * every other page section) sized via `--content-width * --grid-scale`
 * directly, rather than `w-full` — per explicit spec ("(Vision)の上の横棒を
 * コンテンツ幅に合わせて"/"1024pxまでは横棒の長さも可変させて"):
 * --content-width-fluid (used everywhere else on this page) deliberately
 * *clamps* at 1218px for any viewport below 1440px (see globals.css's own
 * doc comment on it), so a `w-full` bar here would have stayed pixel-locked
 * that whole 1024–1440px range instead of continuing to shrink with the
 * viewport. `--grid-scale` has no such clamp below 1440px, only flooring at
 * the ratio computed at 1024px, so multiplying it directly against
 * `--content-width` keeps this one bar (and the index number sharing its own
 * `justify-between` row) genuinely fluid down to that floor, while leaving
 * the section's actual body content at the usual frozen width. The index
 * number automatically lands at this same bar's own right edge for free —
 * it's the other end of the exact same flex row, not a separately positioned
 * element ("右端にある01も横棒幅に合わせて右端にくるように").
 */
export function AboutSection({ id, label, index, children }: AboutSectionProps) {
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
    <section
      ref={ref}
      id={id}
      className={`flex w-full scroll-mt-[24px] flex-col items-start gap-[calc(50px*var(--scale))] transition-all duration-500 ease-out ${
        revealed ? "translate-y-0 opacity-100" : "translate-y-[24px] opacity-0"
      }`}
    >
      <div className="flex w-[calc(var(--content-width)*var(--grid-scale))] items-start justify-between whitespace-nowrap border-t border-black/15 pt-[calc(15px*var(--scale))] font-(family-name:--font-courier) text-[length:calc(12px*var(--scale))] leading-[1.2] tracking-[calc(-0.6px*var(--scale))] text-black">
        <p className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">({label})</p>
        <p className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">{index}</p>
      </div>
      {children}
    </section>
  );
}
