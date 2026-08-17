"use client";

import { useEffect, useRef, useState } from "react";

type ScrambleTextProps = {
  text: string;
  /** Starts the reveal the moment this becomes true. Stays at the plain
   *  `text` while false. */
  active: boolean;
  className?: string;
  /** Base delay between each character starting to appear. */
  stepMs?: number;
  /** Random +/- jitter added to each character's own start delay, so they
   *  don't land in a perfectly even, mechanical rhythm. */
  jitterMs?: number;
  /** How many quick random-glyph flickers each character shows right
   *  before settling into its real value. */
  flickers?: number;
  /** How long each flicker frame lasts. */
  flickerMs?: number;
  /** When true, every character shows a random glyph — instead of staying
   *  blank — until its own start delay, so the full string's rendered width
   *  is present for virtually the entire reveal and never visibly grows as
   *  characters "arrive". (The very first paint is still blank, matching
   *  server-rendered HTML exactly so hydration doesn't fail on Math.random()
   *  output differing between server and client — see blankChars() above —
   *  but the reveal effect swaps in random glyphs on its first animation
   *  frame client-side, before the user perceives anything.) Each character
   *  still settles into its real value at its own independently-staggered
   *  time. Needed wherever the text's position must stay pinned to an
   *  external reference (e.g. contact-hero.tsx's ticker, which has to land
   *  exactly on the header's grid column) — a growing/blank-then-fill reveal
   *  would shift later flex siblings as the string's width changes
   *  underneath them. */
  holdWidth?: boolean;
  /** Fires once, the moment every character has settled into its real
   *  value — lets a caller time something else off *actual* completion
   *  (e.g. site-intro.tsx's "2 seconds after the reveal finishes" delay)
   *  instead of guessing a duration from stepMs/text length. */
  onSettled?: () => void;
};

// Mixed case (not just A-Z0-9): in a proportional font, an all-uppercase
// glyph set renders noticeably *wider* on average than typical prose (mixed
// case, spaces, punctuation) — with `holdWidth`, that mismatch showed up as
// the line visibly widening/narrowing as it scrambled before settling down
// to its real (narrower) final width. Mixed case is a much closer width
// match to real text, so that fluctuation stays close to the final width
// instead.
const SCRAMBLE_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomChar() {
  return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
}

// Always blank (never a random glyph) — this has to match byte-for-byte
// between the server-rendered HTML and React's first client render, or
// hydration fails (Math.random() necessarily produces different output on
// each side). `holdWidth`'s random glyphs only ever get applied inside the
// reveal effect below, which — being an effect — only ever runs client-side
// after that initial hydration-matching render has already committed.
//
// Uses " " (a non-breaking space), not "" — a genuinely *empty* text
// node (every character mapped to "") means the line has zero actual inline
// content, so browsers don't generate a real line box for it at all; under
// `text-box-trim` specifically, that collapses the line's height toward zero
// for that one blank frame, then snaps back once real glyphs arrive one
// frame later — a visible "row height collapses and snaps back" jank on
// every fresh remount (reported downstream in mobile-project-list.tsx as
// "ガタっと", diagnosed by the user themselves as content-height-dependent).
// A non-breaking space is invisible (no ink) but is still a real character —
// the line box it establishes carries the font's normal cap-height/baseline
// metrics regardless of which character is present, so text-box-trim has
// something real to measure and the line's height stays constant across
// every frame of the reveal, blank or not. Fixes that jank at its root,
// letting any consumer of this component use text-box-trim normally without
// also needing its own explicit height override to compensate (an earlier,
// more roundabout attempt at fixing this downstream forced an explicit
// height on the title span instead, which then broke *its own* underline's
// position math — see mobile-project-list.tsx's own history on this).
function blankChars(text: string) {
  return text.split("").map(() => " ");
}

/**
 * Reveals `text` one character at a time, left to right — each character is
 * empty until its turn (briefly, even with `holdWidth` — see that prop and
 * blankChars() above for why the very first frame can't skip straight to
 * random glyphs), then flickers through a couple of random glyphs before
 * settling into its real value, with a little random jitter on each
 * character's own timing so it doesn't read as a perfectly even mechanical
 * stagger. Modeled on thelookback (tlb.betteroff.studio)'s loading-screen
 * text.
 *
 * Driven by a single requestAnimationFrame loop that recomputes the *entire*
 * character array from elapsed time every frame, rather than scheduling one
 * setTimeout per character/flicker (an earlier version did that). The timer
 * version broke specifically on the very first reveal of a session: this
 * effect mounts inside a chain of components that all mount for the first
 * time together, and React's Strict Mode double-invokes effects in
 * development (mount → cleanup → mount again) to catch missing cleanup —
 * with many independent timer ids in flight, that occasionally left the
 * *second* mount's timers scheduled but the visible text stuck blank. A
 * single rAF loop keyed off elapsed time is idempotent (every frame
 * recomputes the full, correct state from scratch) and has only one id to
 * cancel, so the same double-invoke can't leave it in an inconsistent state.
 *
 * The per-frame write goes straight to the DOM via `spanRef.current.textContent`,
 * not `setChars` — per direct follow-up investigating a real-device-only
 * (never reproduced in desktop devtools, including its own mobile-viewport
 * emulation) multi-second delay before the top page's list/MENU become
 * tappable, consistently timed close to how long this component's own
 * longest simultaneous reveal (mobile-project-list.tsx mounts one of these
 * per row, all starting together) takes to fully settle. A version that
 * called `setChars` every single animation frame drives a full React state
 * update → re-render → commit for *every* instance, every frame, for that
 * entire duration — trivial for one span, but multiplied across a whole
 * list of simultaneously-revealing rows this adds up to real, sustained
 * main-thread work every frame for a couple of seconds, on top of whatever
 * else is happening on mount (other entrance transitions, layout, etc.).
 * Desktop devtools' mobile emulation still runs on the same fast desktop
 * CPU underneath, so that cost is invisible there regardless of viewport
 * size — it only becomes large enough to visibly delay touch-event handling
 * on a genuinely slower, single-threaded real device, matching reports of
 * this being reproducible *only* on real hardware. Writing `textContent`
 * directly bypasses React's reconciliation for this hot path entirely (no
 * vdom diff, no component re-render) — `chars` state still exists and still
 * drives the actual JSX (so SSR/hydration and the non-animating/`active`-
 * toggle paths are unchanged), but is only synced from the rAF loop once, at
 * the very end (once settled), so a later unrelated re-render can't clobber
 * the now-settled real DOM text back to a stale mid-scramble value.
 */
// flickers 2 → 1 → 2, stepMs 40 → 48 → 44 — first calmed down per direct
// follow-up ("PCとSPともにスクランブルテキストをもうほんの少しだけ大人し
// くシンプルにしてみて"), then partially brought back up per a further
// direct follow-up asking for a little more life again ("もう少しだけ動き
// を派手に戻してくれる"): flickers back to its original 2 (restores each
// character's own settle-shimmer), stepMs only partway back down (44, not
// all the way to the original 40) for a bit more cascade energy without
// fully reverting the calmer pacing.
export function ScrambleText({
  text,
  active,
  className,
  stepMs = 44,
  jitterMs = 35,
  flickers = 2,
  flickerMs = 45,
  holdWidth = false,
  onSettled,
}: ScrambleTextProps) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const [chars, setChars] = useState<string[]>(() => (active ? blankChars(text) : text.split("")));
  const [prevKey, setPrevKey] = useState(() => `${active}:${text}`);

  // Reset to the right starting point during render whenever `active` or
  // `text` change (React's recommended pattern for this — see
  // https://react.dev/learn/you-might-not-need-an-effect).
  const key = `${active}:${text}`;
  if (key !== prevKey) {
    setPrevKey(key);
    setChars(active ? blankChars(text) : text.split(""));
  }

  useEffect(() => {
    if (!active) return;

    const letters = text.split("");
    const startDelays = letters.map((_, i) => i * stepMs + Math.random() * jitterMs);
    const settleDuration = flickers * flickerMs;
    const startTime = performance.now();
    let frame: number;
    // One stable random glyph per character, chosen once up front — not
    // re-rolled every frame — for the "waiting its turn" state under
    // `holdWidth`. Per direct follow-up comparing SP's list (which passes
    // `holdWidth`) against PC's project-card.tsx (which doesn't): re-rolling
    // *every* not-yet-started character to a *new* random glyph on every
    // single animation frame (this ran inside `tick()` itself before) means
    // a whole title's worth of characters are all flickering at once for
    // the entire time before their own turn arrives — far busier than PC's
    // calmer "blank until it's this character's turn" reveal, reported as
    // "動きがめっちゃ激しい". Holding each waiting character at one fixed
    // placeholder glyph (instead of blank) still keeps the string's overall
    // width constant throughout — holdWidth's actual purpose, preventing a
    // reveal-driven line-wrap/height jank in this list's own fixed-width
    // column — without the every-frame flicker noise across the whole
    // string; only each character's own genuine settle window (`sinceStart`
    // between 0 and settleDuration) still flickers, exactly matching PC's
    // own reveal choreography.
    const placeholderChars = letters.map(() => randomChar());

    function tick(now: number) {
      const elapsed = now - startTime;
      let allSettled = true;

      const nextChars = letters.map((char, i) => {
        if (char === " ") return " ";
        const sinceStart = elapsed - startDelays[i];
        if (sinceStart < 0) {
          allSettled = false;
          // 順番待ちは空文字のまま。
          //
          // 一時期ここを nbsp にしていた（空文字だと全員まだ始まっていない
          // 最初の数十msに文字列全体が空になり、行ボックスが消えて高さが
          // 潰れるため）。ただし nbsp は幅を持つので、下線を引いている
          // .underline-sweep のボックスが最初からほぼ最終幅になり、下線だけ
          // 先に伸びきってしまう。高さの潰れは project-card.tsx 側で
          // 「確定後の高さを測って min-height にする」ようにしたので、
          // ここは空文字に戻してよい（下線がテキストと一緒に伸びる）。
          return holdWidth ? placeholderChars[i] : "";
        }
        if (sinceStart < settleDuration) {
          allSettled = false;
          return randomChar();
        }
        return char;
      });

      // Straight DOM write, not `setChars` — see this component's own
      // top-level doc comment ("The per-frame write goes straight to the
      // DOM...") for why this hot path deliberately bypasses React here.
      if (spanRef.current) spanRef.current.textContent = nextChars.join("");

      if (!allSettled) {
        frame = requestAnimationFrame(tick);
      } else {
        // Sync back to real React state exactly once, now that the reveal
        // has actually finished — keeps `chars` (and so a future re-render's
        // own JSX output) consistent with the settled DOM text, rather than
        // permanently stuck at whatever `chars` last held before this effect
        // switched to direct DOM writes.
        setChars(nextChars);
        onSettled?.();
      }
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSettled is intentionally excluded: it's expected to be a fresh closure every render (site-intro.tsx's usage), and including it would re-run this whole reveal effect (restarting the animation) every time the caller re-renders for unrelated reasons.
  }, [active, text, stepMs, jitterMs, flickers, flickerMs, holdWidth]);

  return (
    <span ref={spanRef} className={className}>
      {chars.join("")}
    </span>
  );
}
