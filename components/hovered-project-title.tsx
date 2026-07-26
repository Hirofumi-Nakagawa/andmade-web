"use client";

import { useEffect, useRef, useState } from "react";

type HoveredProjectTitleProps = {
  /** The currently hovered project's title, or null while nothing should
   *  show (Img view, or nothing hovered) — see app/page.tsx. */
  title: string | null;
  /** That project's category — what was *made* (e.g. "Brand site", or
   *  "Identity, Brand site, Graphic..."), shown as supplementary text below
   *  the title (Figma node 812:2, node 839:1697). Deliberately not the
   *  project's `role` (what was *done*, e.g. "Art Direction, Design") —
   *  the brief was explicit that only the former belongs here. */
  category: string | null;
};

/** How long the plain opacity fade takes. */
const REVEAL_MS = 400;
/** Matches the underline-sweep hover's exaggerated ease-out curve (see
 *  globals.css) — reused here for the opacity fade. */
const REVEAL_EASE = "cubic-bezier(0.16, 1, 0.55, 1)";

/** Base delay between each character starting to appear. */
const STEP_MS = 28;
/** Random +/- jitter added to each character's own start delay. */
const JITTER_MS = 25;
/** How many quick random-glyph flickers each character shows before settling. */
const FLICKERS = 2;
/** How long each flicker frame lasts. */
const FLICKER_MS = 32;

const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomChar() {
  return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
}

function blank(text: string) {
  return text.split("").map((char) => (char === " " ? " " : ""));
}

/** One line's worth of reveal state: its own per-character start delays,
 *  recomputed against a shared elapsed-time clock every frame. */
function revealLine(letters: string[], delays: number[], elapsed: number, settleDuration: number) {
  let settled = true;
  const result = letters.map((char, i) => {
    if (char === " ") return " ";
    const sinceStart = elapsed - delays[i];
    if (sinceStart < 0) {
      settled = false;
      return "";
    }
    if (sinceStart < settleDuration) {
      settled = false;
      return randomChar();
    }
    return char;
  });
  return { result, settled };
}

/**
 * Huge title (plus its category as smaller supplementary text underneath)
 * shown bottom-left of the viewport while hovering a project in the Txt list
 * (Figma node 812:2) — both reveal one character at a time, each one
 * flickering briefly through a couple of random glyphs before settling
 * (modeled on thelookback (tlb.betteroff.studio)'s loading-screen text),
 * while the outer wrapper handles a plain opacity fade-in/out.
 *
 * `chars`/`categoryChars` are the *only* state driving what's rendered — an
 * earlier version also kept a separate `displayTitle` string purely to gate
 * visibility (`{displayTitle && chars.join("")}`), and on a cold first hover
 * `chars` reliably finished revealing the correct text while `displayTitle`
 * intermittently ended up stuck empty, so the (correct!) revealed text never
 * actually showed. Tracking one value per line instead removes that
 * possibility entirely — emptying the array *is* "nothing to show".
 *
 * Both lines are revealed by the *same* single requestAnimationFrame loop
 * (one shared elapsed-time clock, recomputing both lines' full character
 * arrays every frame), guarded by a `revealId` ref so a superseded hover's
 * stale loop can detect it's been replaced and stop. Never unmounts/remounts
 * anything to replay the reveal.
 *
 * Runs alongside the existing background image preview and the other cards
 * dimming to 60% (see project-card.tsx). Rendered in literal black (#000,
 * no mix-blend-mode) rather than the mix-blend-exclusion white used
 * elsewhere on the site's overlay text — this one deliberately doesn't
 * invert against whatever's behind it.
 */
export function HoveredProjectTitle({ title, category }: HoveredProjectTitleProps) {
  const [prevTitle, setPrevTitle] = useState(title);
  const [chars, setChars] = useState<string[]>(() => blank(title ?? ""));
  const [categoryChars, setCategoryChars] = useState<string[]>(() => blank(category ?? ""));
  const revealIdRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adjust state during render when a *new* title starts (React's
  // recommended pattern for this — see
  // https://react.dev/learn/you-might-not-need-an-effect): blanks out both
  // lines immediately, before the effect below even runs. When `title` goes
  // null instead, both are deliberately left as-is here — they still show
  // the outgoing content while the wrapper fades out (see the effect's
  // hide-timeout below, which clears both once that finishes).
  if (title !== prevTitle) {
    setPrevTitle(title);
    if (title) {
      setChars(blank(title));
      setCategoryChars(blank(category ?? ""));
    }
  }

  useEffect(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    if (!title) {
      hideTimeoutRef.current = setTimeout(() => {
        setChars([]);
        setCategoryChars([]);
      }, REVEAL_MS);
      return;
    }

    const myRevealId = ++revealIdRef.current;
    const titleLetters = title.split("");
    const categoryLetters = (category ?? "").split("");
    const titleDelays = titleLetters.map((_, i) => i * STEP_MS + Math.random() * JITTER_MS);
    const categoryDelays = categoryLetters.map((_, i) => i * STEP_MS + Math.random() * JITTER_MS);
    const settleDuration = FLICKERS * FLICKER_MS;
    const startTime = performance.now();

    function tick(now: number) {
      // A newer hover has since started its own loop — stop.
      if (revealIdRef.current !== myRevealId) return;

      const elapsed = now - startTime;
      const titleReveal = revealLine(titleLetters, titleDelays, elapsed, settleDuration);
      const categoryReveal = revealLine(categoryLetters, categoryDelays, elapsed, settleDuration);

      setChars(titleReveal.result);
      setCategoryChars(categoryReveal.result);

      if (!titleReveal.settled || !categoryReveal.settled) {
        frameRef.current = requestAnimationFrame(tick);
      }
    }

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [title, category]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed bottom-[20px] left-[calc(24px*var(--grid-scale))]"
      style={{
        opacity: title ? 1 : 0,
        transitionProperty: "opacity",
        transitionDuration: `${REVEAL_MS}ms`,
        transitionTimingFunction: REVEAL_EASE,
      }}
    >
      <div className="flex flex-col items-start gap-[calc(12px*var(--scale))]">
        <p className="[word-break:break-word] whitespace-nowrap text-[length:calc(70px*var(--scale))] leading-[1.5] font-medium text-[#000] tracking-[calc(-1.2px*var(--scale))] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
          {chars.join("")}
        </p>
        <p className="whitespace-nowrap text-[length:calc(14px*var(--scale))] leading-[1.25] font-medium text-[#000] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
          {categoryChars.join("")}
        </p>
      </div>
    </div>
  );
}
