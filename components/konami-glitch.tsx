"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useLenis } from "lenis/react";
import type Lenis from "lenis";
import { KonamiDissolveLogo } from "@/components/konami-dissolve-logo";
import { KonamiWarpCanvas } from "@/components/konami-warp-canvas";

/** ↑↑↓↓←→←→BA. Compared against `event.key`, so the letters are matched
 *  case-insensitively below (Shift or Caps Lock shouldn't break it). */
const SEQUENCE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

/** Below this viewport width the whole thing stays off. It needs a real
 *  keyboard to trigger at all, but this also keeps the effect off phones
 *  that happen to have one attached — the glitch is tuned against the PC
 *  tree's own type sizes and scroll feel. Matches the `lg` breakpoint this
 *  codebase splits its PC/SP trees on everywhere else. */
const MIN_VIEWPORT_PX = 1024;

/** Scroll velocity (px/frame, as Lenis reports it) that maps to a fully
 *  saturated glitch. Anything faster clamps to 1. Lower means the effect
 *  reaches full strength from an ordinary scroll rather than only from a
 *  hard flick — 45 needed a deliberate fast swipe before much happened. */
const VELOCITY_AT_FULL_GLITCH = 18;

/** How fast the glitch decays once scrolling stops — a plain exponential
 *  ease toward 0 applied per frame, so it settles smoothly instead of
 *  snapping off the instant velocity hits zero. Slightly faster than it was
 *  now that the effect itself is stronger — a big glitch lingering on a
 *  stationary page reads as broken rather than as a reaction to scrolling. */
const GLITCH_DECAY = 0.82;

/** Below this the variable is pinned to exactly 0, so the browser can stop
 *  recalculating the (inherited, page-wide) text-shadow entirely rather than
 *  keeping it alive at an invisible fraction of a pixel forever. */
const GLITCH_EPSILON = 0.02;

/** The intensity is rounded to 1/this before being written to the DOM, and a
 *  write that lands on the same step as the previous one is skipped entirely.
 *
 *  Every write invalidates a text-shadow that the whole document inherits, so
 *  it costs a full-page repaint — with blurred shadows in that list (see
 *  .konami-glitch in globals.css) those repaints are expensive enough that
 *  doing one per animation frame made scrolling feel heavy. Quantising drops
 *  most of them: while the glitch decays, successive frames differ by
 *  fractions of a step and collapse into a single write, and a scroll held at
 *  a steady speed stops writing altogether.
 *
 *  16 steps is fine enough that the quantisation isn't visible — one step is
 *  ~1px of trail at the far end and well under a pixel everywhere else. */
const GLITCH_QUANTIZE_STEPS = 16;

/**
 * Konami-code easter egg — PC, top page only: type ↑↑↓↓←→←→BA and the page
 * inverts (photography excepted — see .konami-glitch img in globals.css),
 * with text tearing into an RGB-split glitch that intensifies with scroll
 * speed. Media is deliberately left out of the glitch itself and only has its
 * colours restored. Entering the sequence again (or pressing Escape) turns it
 * back off.
 *
 * The inversion is a full-screen `mix-blend-mode: difference` layer over a
 * white fill, not a `filter: invert()` on an ancestor. That distinction
 * matters here: `filter` on an ancestor makes it the containing block for
 * every `position: fixed` descendant, which would break the header, the
 * MENU pill, the hover previews and the idle overlay all at once. A blended
 * overlay inverts whatever is painted beneath it while leaving layout and
 * positioning completely untouched.
 *
 * The glitch itself is driven by one inherited CSS custom property
 * (`--konami-glitch`, 0..1) rather than per-element JS, so a single style
 * write per frame drives the entire page — see .konami-glitch in
 * globals.css for what actually reads it. Text uses `text-shadow`
 * specifically because it inherits, so no element needs to be selected or
 * touched individually, and because it changes nothing about layout or
 * transforms — several elements on this site already animate their own
 * `transform`, and stacking another one on top of those would fight them.
 *
 * Scoped to "/" so it can't follow the visitor into a project detail page or
 * About: it's a joke about the top page, and the detail pages in particular
 * are full of client photography that shouldn't be tangled up in it. The
 * effect switches itself off on navigation rather than merely hiding, so
 * nothing is left behind on <html> for the next page to inherit.
 */
export function KonamiGlitch() {
  const pathname = usePathname();
  const isTopPage = pathname === "/";
  const [active, setActive] = useState(false);
  /** How far into SEQUENCE the current run of keystrokes has matched. */
  const progressRef = useRef(0);
  /** Current glitch intensity, 0..1 — a ref, not state: it updates every
   *  frame while scrolling and only ever feeds a CSS variable, so putting it
   *  in state would re-render the whole component ~60 times a second for no
   *  rendered output at all. */
  const glitchRef = useRef(0);
  /** Mirrors `active` for the Lenis callback to read — that callback is kept
   *  reference-stable (see below), so it can't close over the state value. */
  const activeRef = useRef(active);
  /** Same trick for `isTopPage`, read by the key handler below (which is
   *  bound once on mount and must not be re-bound on every navigation). */
  const isTopPageRef = useRef(isTopPage);
  const decayFrameRef = useRef<number | null>(null);

  // Both mirrors are written in an effect rather than straight from the
  // render body: a ref assignment during render is a lint error here
  // (react-hooks/refs) and is genuinely unsafe under a re-render that gets
  // thrown away. Neither reader can run before this commits — the Lenis tick
  // and the keydown handler are both driven by events that happen after
  // paint — so nothing is lost by the one-commit delay.
  useEffect(() => {
    activeRef.current = active;
    isTopPageRef.current = isTopPage;
  }, [active, isTopPage]);

  /** Which way the trail currently points, as a Y multiplier: -1 draws it
   *  upward, +1 downward. Held separately from the magnitude so it keeps
   *  pointing the right way while the glitch decays, instead of snapping to
   *  a default the moment scrolling stops. Starts at -1 (upward), matching
   *  the downward scroll that any first interaction almost always is. */
  const trailDirectionRef = useRef(-1);
  /** Previous scroll offset, for deriving the direction below. */
  const prevScrollRef = useRef(0);

  /** Last values actually written to the DOM — see GLITCH_QUANTIZE_STEPS.
   *  NaN so the very first write can never be skipped as a no-op. */
  const writtenGlitchRef = useRef(Number.NaN);
  const writtenDirectionRef = useRef(Number.NaN);

  const writeGlitch = useCallback((value: number, trailDirection?: number) => {
    const clamped = value < GLITCH_EPSILON ? 0 : Math.min(1, value);
    // The *unrounded* value stays in glitchRef: it's what the decay below
    // multiplies each frame, and feeding the rounded one back would make the
    // decay stair-step (and stall outright once a step maps to itself).
    glitchRef.current = clamped;
    if (trailDirection) trailDirectionRef.current = trailDirection;

    const quantized =
      Math.round(clamped * GLITCH_QUANTIZE_STEPS) / GLITCH_QUANTIZE_STEPS;
    const direction = trailDirectionRef.current;
    if (quantized === writtenGlitchRef.current && direction === writtenDirectionRef.current) {
      return;
    }
    writtenGlitchRef.current = quantized;
    writtenDirectionRef.current = direction;

    const root = document.documentElement;
    root.style.setProperty("--konami-glitch", String(quantized));
    root.style.setProperty("--konami-glitch-dir", String(direction));
  }, []);

  // Leaving the top page turns it off outright — see this component's own
  // doc comment. Coming back requires entering the sequence again, which is
  // the point: it's meant to be found, not to persist as a mode.
  //
  // The disable is deliberate. react-hooks/set-state-in-effect exists to stop
  // effects that derive state which could have been computed during render —
  // but this isn't derivation, it's a one-way reset on navigation, and the
  // derived alternative (`active && isTopPage`) has different behaviour: it
  // would switch the egg straight back on when the visitor returned to "/",
  // since nothing would have cleared the flag in between.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    if (!isTopPage) setActive(false);
  }, [isTopPage]);

  // --- sequence detection -------------------------------------------------
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isTopPageRef.current) return;
      if (window.innerWidth < MIN_VIEWPORT_PX) return;

      if (event.key === "Escape") {
        setActive(false);
        return;
      }

      const expected = SEQUENCE[progressRef.current];
      const pressed = event.key.length === 1 ? event.key.toLowerCase() : event.key;

      if (pressed === expected) {
        progressRef.current += 1;
        if (progressRef.current === SEQUENCE.length) {
          progressRef.current = 0;
          setActive((current) => !current);
        }
        return;
      }

      // A wrong key resets — but if it happens to be the sequence's own first
      // key, start a fresh run from 1 rather than 0. Without that, "↑↑↑↓↓..."
      // (an easy thing to do on a keyboard that repeats) would never match.
      progressRef.current = pressed === SEQUENCE[0] ? 1 : 0;
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // --- class + cleanup ----------------------------------------------------
  useEffect(() => {
    const root = document.documentElement;
    // Both properties are removed outright rather than zeroed, so the
    // write-skipping cache above has to be invalidated alongside them —
    // otherwise the first write after re-enabling could match the last value
    // from the previous run and be skipped, leaving the variables unset.
    if (!active) {
      root.classList.remove("konami-glitch");
      root.style.removeProperty("--konami-glitch");
      root.style.removeProperty("--konami-glitch-dir");
      glitchRef.current = 0;
      writtenGlitchRef.current = Number.NaN;
      writtenDirectionRef.current = Number.NaN;
      return;
    }
    root.classList.add("konami-glitch");
    return () => {
      root.classList.remove("konami-glitch");
      root.style.removeProperty("--konami-glitch");
      root.style.removeProperty("--konami-glitch-dir");
      writtenGlitchRef.current = Number.NaN;
      writtenDirectionRef.current = Number.NaN;
    };
  }, [active]);

  // --- scroll velocity -> glitch intensity --------------------------------
  // Reads Lenis's own velocity rather than differencing scrollY by hand, for
  // the same reason every other scroll-driven effect on this site does: it's
  // already smoothed and already ticking, so there's nothing extra to
  // measure or throttle.
  // Wrapped in useCallback and passed without a deps array — matching
  // mobile-home.tsx's own handleLenisTick convention: lenis-react re-invokes
  // the callback immediately whenever its *reference* changes, so a fresh
  // inline arrow every render would fire it constantly rather than only on
  // real scroll ticks.
  const handleLenisTick = useCallback(
    (lenis: Lenis) => {
      if (!activeRef.current) return;
      const velocity = Math.abs(lenis.velocity);
      const target = Math.min(1, velocity / VELOCITY_AT_FULL_GLITCH);
      // Direction is derived from the change in scroll offset rather than
      // from `lenis.velocity`/`lenis.direction`, whose sign convention isn't
      // documented either way — `scroll` is unambiguously "how far down the
      // page we are", so a positive delta is unambiguously downward.
      // The trail then points *opposite* to travel, the way a motion streak
      // lags behind the thing making it: scrolling down smears upward,
      // scrolling up smears downward.
      const delta = lenis.scroll - prevScrollRef.current;
      prevScrollRef.current = lenis.scroll;
      const trailDirection = delta > 0 ? -1 : delta < 0 ? 1 : 0;
      // Rising edges snap, falling edges decay — a glitch that fades in
      // gradually reads as a slow filter rather than as tearing.
      if (target >= glitchRef.current) {
        writeGlitch(target, trailDirection);
      } else {
        writeGlitch(glitchRef.current * GLITCH_DECAY);
      }
    },
    [writeGlitch]
  );
  useLenis(handleLenisTick);

  // Lenis only ticks while it has something to do, so the decay above can
  // stall part-way once scrolling stops. This keeps easing it to 0 on its
  // own rAF until it actually gets there.
  useEffect(() => {
    if (!active) return;
    function step() {
      if (glitchRef.current > 0) writeGlitch(glitchRef.current * GLITCH_DECAY);
      decayFrameRef.current = requestAnimationFrame(step);
    }
    decayFrameRef.current = requestAnimationFrame(step);
    return () => {
      if (decayFrameRef.current !== null) cancelAnimationFrame(decayFrameRef.current);
    };
  }, [active, writeGlitch]);

  if (!active) return null;

  return (
    <>
      {/* Dissolving ANDMADE wordmark behind the whole page — see its own doc
          comment for the reference it reproduces and the negative-z stacking
          that makes it read as the background. Mounted only while the egg
          runs, like everything else here. */}
      <KonamiDissolveLogo />

      {/* Warps the project list's text on scroll. Mounted only while the egg
          runs, and it tears itself down completely on unmount (texture, GL
          context and the list's own hidden state) — see its doc comment. It
          reads the same two refs that drive the CSS half, so the two stay in
          lockstep without a second velocity calculation. */}
      <KonamiWarpCanvas intensityRef={glitchRef} directionRef={trailDirectionRef} />

      {/* z-[9997] — above the page, above the warp canvas (so the warped text
          gets inverted along with everything else), but deliberately below
          grid-overlay.tsx's own z-[9999] debug grid, so that stays readable
          while this is on. `hidden lg:block` mirrors the MIN_VIEWPORT_PX
          guard above for the case where the window is resized down while
          active. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[9997] hidden bg-white mix-blend-difference lg:block"
      />
    </>
  );
}
