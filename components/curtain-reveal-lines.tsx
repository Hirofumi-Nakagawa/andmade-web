"use client";

import { useEffect, useState, type CSSProperties } from "react";

/** Same per-line mask-curtain timing already established for site-intro.tsx's
 *  own splash tagline and studies-gallery.tsx/mobile-studies.tsx's own intro
 *  paragraph — reused here as a genuinely shared building block (rather than
 *  duplicated a third/fourth time) since, unlike those files' own many other
 *  page-specific local constants, this is nothing but the reveal mechanism
 *  itself with no other content tied to it. */
const REVEAL_MS = 700;
const LINE_STAGGER_MS = 150;
const EASE = "cubic-bezier(0.16, 1, 0.55, 1)";

type CurtainRevealLinesProps = {
  /** One entry per line — each gets its own `overflow-hidden` "window" the
   *  exact height of one line, revealed via `translateY(100%)` → `0`. */
  lines: string[];
  /** Applied to the outer wrapping div (font size/color/leading/position/etc). */
  className?: string;
  style?: CSSProperties;
  /** Extra classes per line, index-aligned with `lines` (e.g. text-box-trim
   *  on the first/last line only) — combined with the "whitespace-nowrap"
   *  every line already gets by default, matching every other curtain-reveal
   *  in this codebase (each line stays on its own row regardless of
   *  container width, sized to its own content). A plain array rather than a
   *  callback: this component is rendered from Server Components too (see
   *  app/contact/page.tsx), and functions can't cross that boundary as
   *  props ("Functions cannot be passed directly to Client Components"). */
  lineClassNames?: (string | undefined)[];
  /** Externally-controlled reveal trigger — when provided, this replaces the
   *  default "reveal once, shortly after mount" behavior with "revealed
   *  exactly when `active` is true," so the curtain can play again every
   *  time the caller's own condition flips back on (e.g. app/not-found.tsx's
   *  own `idle` state, which can go idle → not-idle → idle repeatedly across
   *  a single mount, unlike Contact/Studies' own one-shot mount reveals). */
  active?: boolean;
};

/**
 * Per-line mask-curtain reveal — the same technique already used by
 * site-intro.tsx's own splash tagline and studies-gallery.tsx/
 * mobile-studies.tsx's own intro paragraph, pulled out here as a shared
 * component since Contact's own 3-line tagline needed the exact same
 * treatment (per explicit follow-up: "この英字3行は下からスライドイン+フェ
 * ードインは無しで、変わりにカーテンリビールをつけて", replacing the usual
 * RevealOnMount slide+fade for this one specific block). Each line slides up
 * from fully hidden (behind its own `overflow-hidden` box) to settled,
 * staggered top to bottom by `LINE_STAGGER_MS`, starting the moment this
 * mounts — always rendered (the mask itself already keeps the text fully
 * invisible before the transform animates), no separate "hide pre-active"
 * class needed.
 */
export function CurtainRevealLines({ lines, className, style, lineClassNames, active: activeProp }: CurtainRevealLinesProps) {
  const [mountActive, setMountActive] = useState(false);

  useEffect(() => {
    if (activeProp !== undefined) return;
    const frame = requestAnimationFrame(() => setMountActive(true));
    return () => cancelAnimationFrame(frame);
  }, [activeProp]);

  const active = activeProp ?? mountActive;

  return (
    <div className={className} style={style}>
      {lines.map((line, index) => {
        const extra = lineClassNames?.[index];
        return (
          <div key={line} className="overflow-hidden">
            <p
              className={extra ? `whitespace-nowrap ${extra}` : "whitespace-nowrap"}
              style={{
                transform: active ? "translateY(0)" : "translateY(100%)",
                transitionProperty: "transform",
                transitionDuration: `${REVEAL_MS}ms`,
                transitionDelay: active ? `${index * LINE_STAGGER_MS}ms` : "0ms",
                transitionTimingFunction: EASE,
              }}
            >
              {line}
            </p>
          </div>
        );
      })}
    </div>
  );
}
