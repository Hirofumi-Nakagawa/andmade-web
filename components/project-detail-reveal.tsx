"use client";

import { useEffect, useState, type ReactNode } from "react";

/** Matches globals.css's own site-wide `--background` (#f6f6f4) — the
 *  neutral color this project's own `backgroundColor` fades in from on
 *  mount, since any project's real color works fading in from this one
 *  shared neutral (see lib/projects.ts's own ProjectDetail.backgroundColor
 *  doc comment: every project picks its own accent color). */
const NEUTRAL_BACKGROUND = "#f6f6f4";
const COLOR_FADE_MS = 600;
/** The page's own content starts its slide-up + fade-in this many ms after
 *  the background starts transitioning — reads as the color arriving first
 *  and the actual content settling in just behind it, rather than both
 *  changing at the exact same instant. */
const CONTENT_DELAY_MS = 150;

/**
 * Entrance treatment for app/projects/[slug]/page.tsx's own PC tree — per
 * direct follow-up ("実績詳細ページが表示される際、Aboutページと同じように
 * 背景色がフェードインしてページ要素が下からスライドイン+フェードインで表
 * 示して"). A client wrapper (the page itself is an async Server Component,
 * so the `revealed` state driving both effects below can't live inline
 * there).
 *
 * Takes plain `header`/`children`/`footer` ReactNode props (all real,
 * server-renderable JSX) rather than a render-prop function — an earlier
 * version instead exposed `revealed` via `children: (revealed) => ReactNode`
 * so the page could decide per-element which parts got the slide treatment,
 * but a plain *function* can't be passed as a prop from an async Server
 * Component (this page) to a "use client" component like this one — only
 * serializable values (including other React elements/JSX) can cross that
 * boundary, and React actually throws at render time for a function prop
 * here ("エラー出てるけど"). `header`/`footer` (SiteHeader/HeaderSummon —
 * outside the slide+fade treatment on purpose, since they have their own
 * separate fade-in logic already and shouldn't visually slide with the page
 * body) and `children` (everything else, wrapped in the slide+fade div
 * internally) are all just JSX, which *is* fine to pass this way — the
 * officially-supported "Server Component rendered as a Client Component's
 * children/props" pattern.
 *
 * `revealed` flips true one animation frame after mount (same technique as
 * reveal-on-mount.tsx), driving two independent effects:
 *  1. This wrapper's own `backgroundColor` transitions from a neutral
 *     off-white to this project's real `backgroundColor`.
 *  2. `children` slides up 24px while fading in, same treatment as
 *     reveal-on-mount.tsx/about-section.tsx elsewhere in this codebase.
 *
 * Not per-individual-block (unlike about-section.tsx's own per-section
 * IntersectionObserver reveal) — this page's own content moves as one
 * cohesive unit on entrance instead, a deliberately simpler treatment for a
 * single-project reference page.
 */
export function ProjectDetailReveal({
  backgroundColor,
  className,
  header,
  children,
  footer,
}: {
  backgroundColor: string;
  className?: string;
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className={className}
      style={{
        backgroundColor: revealed ? backgroundColor : NEUTRAL_BACKGROUND,
        transition: `background-color ${COLOR_FADE_MS}ms ease-out`,
      }}
    >
      {header}
      <div
        className={`transition-all duration-500 ease-out ${
          revealed ? "translate-y-0 opacity-100" : "translate-y-[24px] opacity-0"
        }`}
        style={{ transitionDelay: revealed ? `${CONTENT_DELAY_MS}ms` : "0ms" }}
      >
        {children}
      </div>
      {footer}
    </div>
  );
}
