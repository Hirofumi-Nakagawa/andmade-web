"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useLenis } from "lenis/react";
import type Lenis from "lenis";
import { useStatusBarInset } from "@/components/status-bar-mask";
import { isSamePath, normalizePath } from "@/lib/route-path";
import {
  getScrollGaugeSuppressed,
  getScrollGaugeSuppressedServerSnapshot,
  subscribeScrollGaugeSuppressed,
} from "@/lib/scroll-gauge-store";

/** The mask strip only renders below the lg breakpoint, so the gauge only
 *  offsets itself below it too — on PC it stays at the window's very top. */
const SP_MEDIA_QUERY = "(max-width: 1023.98px)";

function subscribeSpViewport(onChange: () => void) {
  const mq = window.matchMedia(SP_MEDIA_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getIsSpViewport() {
  return window.matchMedia(SP_MEDIA_QUERY).matches;
}

/** Bar thickness, px. Literal (not --scale'd) on both platforms: it reads as a
 *  fixed piece of chrome sitting on the window's edge, like a scrollbar, not
 *  as part of the scaled page layout. 4px (the reference's own
 *  .scroll-indicator height) → 2px → 3px, per two direct follow-ups
 *  ("ゲージの太さを2pxにして", then "ゲージの太さを3pxに"). */
const THICKNESS_PX = 3;

/**
 * Where the gauge appears at all, as an allowlist rather than a list of
 * exclusions.
 *
 * Per two direct follow-ups: "studiesとcontactはゲージ自体無し", then
 * "404も無しで". The first was implemented as a deny-list, which the second
 * can't extend — a 404 has no path of its own. Next.js renders not-found for
 * whatever URL was requested, so `/asdf` and `/projects/nonexistent` are both
 * 404s while reporting those pathnames. Listing the pages that *should* have
 * a gauge inverts that problem away: anything unrecognised — every 404 — gets
 * nothing, with no need to enumerate what doesn't exist.
 *
 * (One case an allowlist alone would still miss is a bad project slug, which
 * matches the /projects/ prefix but renders not-found; app/not-found.tsx
 * suppresses the gauge explicitly for exactly that, via
 * lib/scroll-gauge-store.ts.)
 */
function gaugeModeFor(pathname: string): "solid" | "blended" | "none" {
  if (isSamePath(pathname, "/") || isSamePath(pathname, "/about")) return "solid";
  if (normalizePath(pathname).startsWith("/projects/")) return "blended";
  return "none";
}

/* "solid" above means flat #000 with no blending — per direct follow-up
   ("トップとAboutのゲージの色は#000にしてブレンドモード無しに"). Both pages
   are cream (--background) top to bottom, so a fixed black bar is legible
   everywhere on them, and it avoids the blend's one oddity: inverting against
   whatever colored section happens to sit behind it (About has a pink block
   mid-page) reads as the bar changing colour as you scroll rather than as one
   steady indicator.

   Project detail pages stay "blended" because they have no single known
   background — each picks its own from the CMS
   (ProjectDetail.backgroundColor), so no fixed colour stays visible across
   all of them. */

/**
 * A scroll-progress gauge pinned to the top of the window: a bar that grows
 * from the left edge to the right as the page scrolls, full width at the
 * bottom of the page. PC and SP alike.
 *
 * Per direct request, modelled on studiofreight.com/work — inspected live
 * while building this: theirs is a `position: fixed` 4px black bar at
 * top/left with its `width` set as an inline percentage of scroll progress.
 *
 * Two deliberate departures from that implementation:
 *
 * 1. `transform: scaleX()` rather than an animated `width`. Both look
 *    identical, but width is a layout property — changing it every frame
 *    forces layout and paint, where a transform is composited on the GPU.
 *    Cheap matters here because this runs on every scroll frame of every
 *    page, and this codebase has already had to unwind per-frame paint cost
 *    once (see .konami-glitch's blurred text-shadows in globals.css).
 *
 * 2. On pages whose background isn't a known constant, white +
 *    `mix-blend-mode: difference` instead of a fixed colour, so the bar
 *    inverts whatever is behind it and stays visible without this component
 *    having to know the page's palette — the same reasoning
 *    site-header.tsx already uses for its own blended text. The top page and
 *    About opt out and use flat #000; see gaugeModeFor.
 *
 * Progress comes from Lenis (`lenis.progress`), not `window.scrollY`, because
 * Lenis drives scrolling on this site and its own virtual offset is what the
 * page visually follows — reading the native position instead would run
 * slightly ahead of what's on screen during smooth-scroll easing. The native
 * fallback below exists only for the case where no Lenis instance ever
 * reports in.
 */
export function ScrollProgressGauge() {
  const pathname = usePathname();
  const suppressed = useSyncExternalStore(
    subscribeScrollGaugeSuppressed,
    getScrollGaugeSuppressed,
    getScrollGaugeSuppressedServerSnapshot
  );
  const isSp = useSyncExternalStore(subscribeSpViewport, getIsSpViewport, () => false);
  const statusBarInset = useStatusBarInset();
  const barRef = useRef<HTMLDivElement>(null);
  /** Whether Lenis has driven at least one frame — gates the fallback so the
   *  two can't fight over the same element. */
  const lenisDrivingRef = useRef(false);

  const write = useCallback((progress: number) => {
    const bar = barRef.current;
    if (!bar) return;
    const clamped = Math.max(0, Math.min(1, progress));
    bar.style.transform = `scaleX(${clamped})`;
  }, []);

  // Reference-stable callback passed without a deps array — lenis-react
  // re-invokes the callback whenever its *identity* changes, so a fresh
  // inline arrow every render would fire it constantly instead of only on
  // real scroll ticks. Same convention konami-glitch.tsx and mobile-home.tsx
  // already use for their own Lenis subscriptions.
  const handleLenisTick = useCallback(
    (lenis: Lenis) => {
      lenisDrivingRef.current = true;
      // `progress` is Lenis's own scroll/limit ratio. On a page too short to
      // scroll, `limit` is 0 and this comes back NaN rather than 0.
      write(Number.isFinite(lenis.progress) ? lenis.progress : 0);
    },
    [write]
  );
  useLenis(handleLenisTick);

  useEffect(() => {
    function update() {
      if (lenisDrivingRef.current) return;
      const limit = document.documentElement.scrollHeight - window.innerHeight;
      write(limit > 0 ? window.scrollY / limit : 0);
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [write]);

  // After the hooks, never before — the Lenis subscription and the fallback
  // listener have to be set up on every render regardless of which page this
  // is, or navigating from a gauge-less page to a gauged one would land
  // without them.
  const mode = suppressed ? "none" : gaugeModeFor(pathname);
  if (mode === "none") return null;

  const solid = mode === "solid";

  return (
    // z-[60] — above the header (z-50) so the bar is never painted over, and
    // well below the Konami overlay (z-[9997]) and the debug grid (z-[9999]).
    //
    // On blended pages the blend lives on this wrapper while the inner
    // element carries the scaleX, rather than both on one element:
    // `mix-blend-mode` needs a stable box to blend, and this codebase has
    // already hit PC Safari dropping a blend on an element that also animates
    // (see site-header.tsx's own `transform-gpu` fix, applied for exactly
    // that). Solid pages skip both the blend and that GPU hint, since neither
    // does anything for a plain opaque bar.
    <div
      aria-hidden
      // zIndex 80 (was a z-60 class) — above the status-bar mask strip (70,
      // status-bar-mask.tsx): on SP with env()=0 the gauge sits at top:0,
      // inside the strip's own 16px, and at a lower z it vanished behind it.
      // Inline rather than a z-[80] utility on purpose: a brand-new utility
      // class only exists once the generated stylesheet catches up, and this
      // dev setup's stylesheet has repeatedly lagged behind the JS (the
      // gauge disappeared under the strip for exactly that reason — both new
      // z classes missing, DOM order deciding, strip painted last). Inline
      // styles need no stylesheet.
      className={`pointer-events-none fixed inset-x-0 ${
        solid ? "" : "transform-gpu mix-blend-difference"
      }`}
      // top: on SP, exactly the status-bar mask strip's own height — the two
      // share one hook (useStatusBarInset) so the gauge always sits flush
      // against the strip's bottom edge; they previously used different
      // formulas and visibly disagreed ("プログレスバーの位置とステータス
      // バーのマスクの高さが合ってない"). On PC there is no strip, so the
      // gauge stays at the window's very top.
      style={{ height: THICKNESS_PX, top: isSp ? statusBarInset : 0, zIndex: 80 }}
    >
      <div
        ref={barRef}
        className={`h-full w-full origin-left ${solid ? "bg-black" : "bg-white"}`}
        // scaleX(0) inline as the initial value so the very first paint is an
        // empty bar even before the first scroll tick — a full-width flash on
        // load is exactly what a progress gauge shouldn't do.
        style={{ transform: "scaleX(0)" }}
      />
    </div>
  );
}
