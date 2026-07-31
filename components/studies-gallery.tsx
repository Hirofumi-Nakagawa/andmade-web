"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { mod, ORIENTATION_ASPECT_RATIO, type Study, type StudyOrientation } from "@/lib/studies";
import { ScrambleText } from "@/components/scramble-text";
import { SlotDigits } from "@/components/slot-digits";
import { StudiesCenterImage } from "@/components/studies-center-image";
import { StudiesThumbnailRail } from "@/components/studies-thumbnail-rail";

/** How many images the mount-time intro glides through before handing
 *  control over to real scroll input — per explicit request ("やっぱり1周
 *  にしてみて"), back to exactly one full lap through every study after
 *  trying 1.5 and 2 laps — only the *starting* number is random. This is the
 *  *distance* (in item-units) the rail glides through during the intro, not
 *  a count of discrete stepped jumps — see the intro effect below.
 *  (Formerly a module-level constant off STUDIES.length; now computed
 *  inline off the `studies` prop's own length instead, since the studies
 *  array is fetched/passed in rather than a static import — see
 *  introEnd's own computation below.) */
/** Total duration of the intro's one continuous glide, start to finish —
 *  scaled back down to the original one-lap pacing. */
const INTRO_DURATION_MS = 2200;
/** Wheel deltaY (px) treated as one full item's worth of scroll — raised
 *  from an earlier, more sensitive 100px per explicit feedback that
 *  thumbnails were changing too quickly one after another
 *  ("もう少しスクロール量調整できる？"), so a single mouse-wheel notch no
 *  longer advances a full item on its own; it now takes a bit more actual
 *  scroll distance per thumbnail. Raised again (220 → 280) per follow-up
 *  report of occasional unnatural-feeling switches while scrolling
 *  ("スクロールしてるとたまに不自然に画像が切り替わることがあるので、スク
 *  ロール量をもう少しだけ調整してみて") — a small bump in required distance
 *  per item reduces how often a single scroll gesture's own noise/momentum
 *  tips over an extra, unintended item boundary. Trackpads report much
 *  smaller continuous deltas, so those still track proportionally smaller
 *  amounts, exactly like a real scroll surface. */
const WHEEL_PX_PER_ITEM = 280;
/** Guards target-rounding against floating-point noise — without it, a
 *  position that's landed at e.g. 4.9999997 due to accumulated float error
 *  could round the "wrong" way. */
const SNAP_EPSILON = 0.001;
/** Decay rate (per ms) for the critically-damped glide toward a target —
 *  see startGlideToTarget below. Higher = snappier/shorter settle. */
const GLIDE_DECAY_RATE = 0.01;
/** Once the glide is within this many item-units of its target, it's
 *  considered arrived (rather than asymptotically approaching forever). */
const GLIDE_FINISH_EPSILON = 0.01;
/** Safety cap so an unusually large jump (e.g. clicking a thumbnail many
 *  slots away) can't keep animating indefinitely. */
const GLIDE_SAFETY_MAX_MS = 1500;
/** How long with no user interaction (wheel/click) before the gallery
 *  auto-advances to the next image on its own — 2000ms initially, then
 *  4000ms, now 5000ms. Runs indefinitely once the intro finishes, and resets
 *  every time the user actually scrolls or clicks, so it never fights manual
 *  control. Also drives the "01 - 10" counter's own gauge fill, which is
 *  timed to finish exactly when the advance fires (see its own usage below),
 *  so the two stay in sync automatically off this one value.
 *  mobile-studies.tsx keeps its own copy of this number — change both. */
const AUTO_ADVANCE_MS = 5000;

/** Fixed page copy (left column). A single 5-line paragraph group — per
 *  explicit follow-up correction, the line break within "Where ideas are
 *  explored before / they become outcomes." is back (a brief prior version
 *  joined it into one line, then was reverted), and the gap that used to sit
 *  between it and "A collection of studies..." (back when these were two
 *  separate paragraph groups, per the blank line in an earlier version of
 *  the brief) is gone too — the latest brief has no blank line between them,
 *  so this is now one group, five lines straight through, and the extra
 *  `mt-[20px]` paragraph gap below (only ever applied between *separate*
 *  groups) never triggers. Each inner array is one paragraph group's own
 *  lines. */
const INTRO_TEXT_PARAGRAPHS: string[][] = [
  [
    "Where ideas are explored before",
    "they become outcomes.",
    "A collection of studies, experiments,",
    "and works in progress that shape",
    "our design practice.",
  ],
];
/** Same per-line mask-curtain reveal as the site intro's own 3-line
 *  tagline — reused verbatim (technique and timing both) per explicit
 *  request ("表示アニメーションはイントロの3行テキストと同じマスクアニ
 *  メーションにして"); see site-intro.tsx's own TAGLINE_EASE/
 *  TAGLINE_REVEAL_MS/TAGLINE_LINE_STAGGER_MS for the original this mirrors. */
const INTRO_TEXT_EASE = "cubic-bezier(0.16, 1, 0.55, 1)";
const INTRO_TEXT_REVEAL_MS = 700;
const INTRO_TEXT_LINE_STAGGER_MS = 150;

/** Center image's own left edge while *unzoomed*, grid column 9 — originally
 *  shared with the zoomed state too (zoom used to grow the box *rightward
 *  only* from this same edge, per the original spec: "拡大する時は現状の
 *  左端のグリッドの位置のまま右に向けて拡大する"). Per a further direct
 *  follow-up ("Studiesのzoom時の配置を、横位置も画面中央揃えにして"), the
 *  *zoomed* state now centers horizontally on the viewport instead (see
 *  centerImageStyle below) — this constant is only the unzoomed resting
 *  position now. */
const CENTER_LEFT_PX = 546;
/** Unzoomed reference width — 6 grid columns, unchanged from before. */
const BASE_WIDTH_PX = 348;
/** Grid column width (see lib/studies.ts's own doc comments on the site's
 *  58px-per-column convention). */
const GRID_COLUMN_PX = 58;
/** Zoomed reference width, in grid columns — per explicit spec ("クリック
 *  でグリッド9マス分の横幅に拡大"), 9 columns for portrait studies, followed
 *  up with "横長画像をzoomした場合はグリッドマス11個分" (11), then "横長画像
 *  はzoom時に12マス分の幅に" (12), then "横長画像は幅14マス分に、縦長画像は
 *  幅12マス分に" (14, and portrait's own first raise to 12), then a further
 *  direct follow-up ("横長画像のzoom時の幅を16マス分にして") raising
 *  landscape once more — landscape studies zoom wider than portrait
 *  throughout, since a landscape
 *  image's own aspect ratio would otherwise make the same column count read
 *  noticeably shorter/smaller than a portrait study's own zoomed height.
 *  `square` was originally lumped in with portrait's own 9 too, then given
 *  its own explicit value per direct follow-up ("squareの画像もzoomで幅10
 *  マス分にして") once a real square photo actually existed to test
 *  against (10), then raised again per a further direct follow-up
 *  ("studiesのpc時のsquareの横幅を14マス分にして") to 14. `wide` (8:5, added
 *  per "動画比率が8:5の場合があるんだけど、それ用にorientationにも追加必
 *  要？" → "追加で") defaults to the same 16 as `landscape` — both are
 *  horizontal-ish shapes, and `wide`'s own taller aspect ratio (1.6 vs.
 *  landscape's ≈1.333) already makes the same column count read shorter,
 *  without needing its own separate tuning yet. May end up *smaller* than
 *  any of these targets in practice — see computeZoomedBoxPx below for the
 *  viewport-height cap that can override it regardless of orientation. */
const ZOOM_WIDTH_COLUMNS: Record<StudyOrientation, number> = {
  portrait: 12,
  landscape: 16,
  square: 14,
  wide: 16,
};
/** Minimum clearance from the top/bottom of the window a zoomed box must
 *  keep — was 60 (per original explicit spec, "ウィンドウの縦幅が短くて
 *  フッターやヘッダーに被る場合は、上下60pxマージンをあけた状態まで拡大"),
 *  now 0 per a further direct follow-up asking for the opposite trade-off
 *  ("ウィンドウの縦幅が狭い場合はウィンドウ縦幅に揃える" — plus "ヘッダー・
 *  フッターは画像より上にくるようにする"): rather than shrinking the zoomed
 *  box to always leave the header/footer their own clear margin, it can now
 *  grow to fill the *entire* window height with no reserved gap at all —
 *  SiteHeader/SiteFooter instead simply always paint *above* it (see
 *  app/studies/page.tsx's own z-10 wrappers around each), so an overlap is
 *  no longer a problem to avoid, just an expected outcome on short windows.
 *  Still funnelled through this same named constant (rather than deleting it
 *  and hardcoding 0 into computeZoomedBoxPx below) so a future reason to
 *  reintroduce *some* margin doesn't have to rediscover this whole
 *  mechanism. */
const ZOOM_VERTICAL_MARGIN_PX = 0;
const ZOOM_TRANSITION_MS = 550;
const ZOOM_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

/** Cursor-follow "Zoom"/"Zoom Out" label's own lag/ease amount — per
 *  explicit follow-up request ("zoomとzoom outの追従をもう少しイージング
 *  きかせて気持ち良い感じの動きにして"), the label no longer snaps straight
 *  to the cursor's own position every frame; instead it eases toward it
 *  (see ensureLabelFollowLoop below), the same simple exponential-smoothing
 *  ("lerp") a fraction of the remaining distance every frame — closer to 0
 *  reads as more of a trailing, elastic lag; closer to 1 reads as an
 *  almost-instant snap. Deliberately a plain lerp rather than this file's
 *  own critically-damped glide (used for the rail's own position) — that
 *  model solves for *arriving exactly on target* from a real trailing
 *  velocity, which matters for the rail's snap-to-item behavior; a cursor
 *  label just needs to feel pleasantly elastic while continuously chasing a
 *  constantly-moving target, which a plain lerp already does well and far
 *  more simply. */
const LABEL_FOLLOW_EASE_FACTOR = 0.16;
/** Below this many px of remaining distance (in either axis), the label's
 *  own follow loop stops re-scheduling itself rather than running forever
 *  at an imperceptible creep. */
const LABEL_FOLLOW_SETTLE_EPSILON_PX = 0.4;
/** How long the label's own opacity fade takes — the show/hide-on-image-
 *  hover case, both unzoomed ("Zoom") and zoomed ("Zoom Out"). A brief
 *  version of this feature let the "Zoom Out" label follow the cursor
 *  anywhere on the page while zoomed (fading out near the header/footer/left
 *  rail) — reverted per explicit follow-up request ("zoom outはやっぱり画像
 *  にホバーしたときだけ表示"): back to image-hover-only in both states, the
 *  same `hovering` condition either way. */
const LABEL_FADE_DURATION_MS = 250;

/** Same formula as --grid-scale in globals.css, evaluated numerically in JS
 *  rather than read from the CSS custom property — needed because the
 *  viewport-height cap in computeZoomedBoxPx below has to compare against a
 *  real `window.innerHeight` pixel value, which only makes sense against
 *  other *already-resolved* real pixel values, not a calc() string. Keep in
 *  sync with globals.css's own --grid-scale formula if that ever changes.
 *
 *  This file previously also had a separate `computeScale`/`--scale`
 *  equivalent, used for `computeZoomedBoxPx`'s own height calculation while
 *  width used this function — removed once that turned out to be a real bug
 *  (see `computeZoomedBoxPx`'s own doc comment), not just a redundant extra
 *  function. */
function computeGridScale(viewportWidth: number): number {
  return Math.max(1024 / 1440, viewportWidth / 1440);
}

/**
 * The zoomed center image's actual on-screen size, in real px — normally
 * `zoomWidthColumns * GRID_COLUMN_PX`'s own width paired with whatever height
 * that implies at this study's own aspect ratio, both scaled by the same
 * --grid-scale factor (see below for why both have to share one factor), but
 * capped by the available vertical space (viewportHeight minus 2x
 * ZOOM_VERTICAL_MARGIN_PX) whenever the window is too short for that full
 * size — in which case height is clamped to that cap and width is
 * recomputed from *that* (still preserving the same aspect ratio), landing
 * narrower than the orientation's own target rather than overflowing past
 * the window's own top/bottom.
 *
 * Both dimensions use `gridScale`, not a mix of `gridScale` (width) and
 * `scale` (height) — an earlier version did exactly that mix, which is the
 * same class of bug `unzoomedHeightRefPx`'s own doc comment describes
 * already having been found and fixed for the *unzoomed* box: `scale` clamps
 * to exactly 1 for any viewport ≤1440px (computeScale's own `Math.max(1,
 * ...)`), while `gridScale` keeps shrinking continuously down to its
 * 1024/1440 floor across that same range — so for any square study
 * (aspectRatio 1) viewed on a window narrower than 1440px, the old mixed
 * version shrank the *width* but not the *height*, silently stretching a
 * square box into a taller-than-wide (portrait-reading) shape instead —
 * exactly the bug reported as "studiesでsquareを選択して入力したんだけど、
 * zoomでportraitで表示される", confirmed to persist even with a microCMS
 * entry whose `orientation` was directly verified as `"square"`. Landscape
 * studies had the same latent distortion, just less visually obvious since a
 * landscape box getting a *touch* taller than it should reads as "slightly
 * off" rather than "wrong category" the way a square-gone-portrait does.
 *
 * Also returns `leftPx` — the box's own left EDGE, pre-computed here as a
 * literal px value (`viewportWidth/2 - widthPx/2`) rather than left at
 * `centerImageStyle` to express via `left: 50%` + a percentage `transform`.
 * Per direct follow-up ("zoomする際のアニメーションだけど、拡大する途中イ
 * メージが少しカーブして拡大してるように見える" → fixed by switching to a
 * constant transform="translate(-50%,-50%)" in both states → then further
 * follow-up "まだ画像の左端から少し見えるな。ウィンドウ幅にもよるみたい"):
 * that constant-transform version traded the curve bug for a *different*,
 * width-dependent one — `left`, `width`, and a `transform` percentage
 * resolved *against that same width* are each computed/rounded to real
 * device pixels somewhat independently through the rendering pipeline, so
 * even though `left − 0.5×width` is exactly correct in real-number math, the
 * actual painted left edge could land a hair off from the mask reveal layer
 * underneath (studies-center-image.tsx), landing differently depending on
 * how each viewport width's own fractional pixel values happened to round —
 * exactly the "depends on window width" symptom. Precomputing the literal
 * left-edge px here (matching how the *unzoomed* state already worked, and
 * always has: `left` as a plain edge value, `transform: translateY(-50%)`
 * with no X term at all) sidesteps that: both states now share the exact
 * same two-term "left edge + width" composition with no percentage-of-its-
 * own-animating-width transform on the X axis anywhere, which is also what
 * keeps the transition path itself a straight line (no product of two
 * simultaneously-animating quantities), without reintroducing the earlier
 * rounding mismatch. */
function computeZoomedBoxPx(
  aspectRatio: number,
  zoomWidthColumns: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  const gridScale = computeGridScale(viewportWidth);
  const zoomWidthRefPx = zoomWidthColumns * GRID_COLUMN_PX;
  const naturalWidthPx = zoomWidthRefPx * gridScale;
  const naturalHeightPx = (zoomWidthRefPx / aspectRatio) * gridScale;
  const maxHeightPx = Math.max(0, viewportHeight - ZOOM_VERTICAL_MARGIN_PX * 2);

  if (naturalHeightPx > maxHeightPx) {
    const heightPx = maxHeightPx;
    const widthPx = heightPx * aspectRatio;
    return { widthPx, heightPx, leftPx: (viewportWidth - widthPx) / 2 };
  }
  return { widthPx: naturalWidthPx, heightPx: naturalHeightPx, leftPx: (viewportWidth - naturalWidthPx) / 2 };
}

/** Ease-out cubic — fast start, gentle settle at the end (for the intro
 *  glide specifically, which travels a fixed known distance over a fixed
 *  known duration — unlike the physically-modeled settle/click glide
 *  below, which instead uses actual trailing velocity). */
function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

/**
 * Studies page gallery (Figma node 934:312) — orchestrates the left
 * thumbnail rail and the large center image together off one shared piece
 * of state, `position`: a continuous, ever-growing/shrinking scroll
 * position in item-units (not a plain 0..N-1 index). `activeIndex` (what the
 * big center image shows) is deliberately *not* its own separate state —
 * it's just `mod(Math.round(position), N)`, recomputed fresh every render —
 * so the center image flips to whichever thumbnail is nearest center on
 * *every* position update, during every kind of motion (intro, raw
 * scrolling, the momentum/settle glide, a click's own glide, and the
 * auto-advance below), each one retriggering StudiesCenterImage's own mask
 * reveal. Per explicit request ("スクロールしてるときも中央画像にマスクア
 * ニメーションつけて表示時と同じようにパラパラ切り替わるようにしてみて"),
 * this is intentional even *while actively scrolling* — a fast scroll flips
 * rapidly through several images' reveals ("パラパラ", flipbook-style)
 * rather than waiting for the rail to settle before updating.
 *
 * Sequence, per the brief:
 * 1. On mount, once a random starting point is picked client-side (can't be
 *    picked during the initial render itself — see the hydration-mismatch
 *    comment below), `position` glides continuously (one smooth
 *    requestAnimationFrame-driven motion, not discrete stepped jumps) from
 *    that start up to start+INTRO_STEPS over INTRO_DURATION_MS.
 * 2. Once that intro finishes, real wheel input takes over: every wheel
 *    event both moves `position` by its own raw delta *and* (re)starts a
 *    physically-modeled glide (startGlideToTarget) toward whichever whole
 *    item is nearest ahead, carrying the scroll's own actual trailing
 *    velocity into that glide. While more wheel input keeps arriving, each
 *    new event immediately supersedes the last glide before it can
 *    meaningfully diverge from raw tracking — so scrolling still feels like
 *    direct 1:1 tracking. The moment input actually stops, whichever glide
 *    was most recently started simply keeps running on its own, decelerating
 *    smoothly from that same real velocity into place with **no dead pause
 *    beforehand** and no backward correction — per explicit feedback that an
 *    earlier version's "stop, then snap" motion (a timeout-delayed,
 *    standing-start CSS transition) felt like an abrupt, disconnected
 *    correction ("位置調整でキュッと中央に移動する動きが違和感がある").
 * 3. Clicking a thumbnail (StudiesThumbnailRail's own onSelect) runs the
 *    exact same glide mechanism with an initial velocity of 0 instead of a
 *    scroll's trailing velocity — still a smooth, physically-eased slide to
 *    center rather than an instant jump.
 * 4. Whenever AUTO_ADVANCE_MS passes with no wheel/click input, the gallery
 *    advances one item forward on its own (same glide mechanism, v0=0) —
 *    per explicit request ("2秒おきに自動で次の画像に切り替わるようにして")
 *    — and keeps doing so indefinitely, resetting that countdown on any real
 *    interaction so it never fights manual control.
 *
 * The placeholder title readout (bottom, per explicit request:
 * "スクロール中は非表示で、止まったら下線タイトルと同じアニメーションを付
 * けて") tracks a separate `settled` boolean rather than just `introDone`:
 * false the instant *any* glide starts (intro included) or the intro is
 * still running, true only once a glide actually reaches its target (or the
 * intro finishes). Always mounted (an earlier version conditionally rendered
 * it altogether, `{settled && ...}`) — reverted per explicit follow-up
 * request that it fade out instead of just vanishing ("Study 01の文字が消え
 * るとき、フェードアウトつけて"): its own `opacity` now tracks `settled`
 * instead, with an asymmetric transition duration (0ms becoming visible,
 * 300ms becoming hidden) so appearing still reads exactly as before (cutting
 * straight into the scramble-reveal) while disappearing now animates.
 * `ScrambleText`'s own `active` prop still ties directly to `settled` too —
 * its *inactive* state renders the plain, already-settled text (not blank),
 * so there's no visual seam while fading out, and every time `settled` flips
 * back to true, `active` flipping back on is what restarts the scramble
 * reveal (see scramble-text.tsx's own render-time reset logic) — no separate
 * mount/key trick needed for that replay either way.
 */
export function StudiesGallery({ studies }: { studies: Study[] }) {
  // Starts `null` (not a real random pick) so the server-rendered HTML and
  // React's first client render match exactly — Math.random() necessarily
  // differs between the two, which is what caused scenic-map-background.tsx's
  // own hydration mismatch earlier in this project. The real starting point
  // is only picked once the mount effect below runs, client-side only.
  const [position, setPosition] = useState<number | null>(null);
  const [introDone, setIntroDone] = useState(false);
  // True only while nothing is actively moving — see this component's own
  // doc comment above on the title readout.
  const [settled, setSettled] = useState(false);
  // Click-to-zoom state (per explicit spec) — see CENTER_LEFT_PX/
  // ZOOM_WIDTH_COLUMNS/computeZoomedBoxPx above and the click handlers below.
  const [zoomed, setZoomed] = useState(false);
  // Real on-screen px, only meaningful while `zoomed` — recomputed by the
  // effect below (window resize, or the active study's own aspect ratio
  // changing while already zoomed).
  const [zoomedSizePx, setZoomedSizePx] = useState<{ widthPx: number; heightPx: number; leftPx: number } | null>(
    null,
  );
  // Bumped every time scheduleAutoAdvance() actually (re)arms the countdown
  // — used purely as the "01 - 10" gauge's own `key` further below, so a
  // fresh DOM node (and therefore a freshly-restarted CSS fill animation)
  // mounts every time a new AUTO_ADVANCE_MS window starts, exactly mirroring
  // what the timeout itself is doing. See that gauge's own doc comment.
  const [autoAdvanceGeneration, setAutoAdvanceGeneration] = useState(0);
  // Cursor-follow "Zoom"/"Zoom Out" label — see the eased-follow rAF loop
  // and its own doc comment further below. `hovering` tracks the image
  // itself only (mouseenter/leave on that one element) and gates the
  // label's visibility in both the unzoomed ("Zoom") and zoomed ("Zoom Out")
  // states alike, per explicit follow-up spec ("zoom outはやっぱり画像に
  // ホバーしたときだけ表示").
  const [hovering, setHovering] = useState(false);
  // The label's actual rendered position — trails `labelTargetRef` below via
  // the eased rAF loop rather than snapping straight to the cursor.
  const [labelDisplayPos, setLabelDisplayPos] = useState({ x: 0, y: 0 });

  // Mirrors `position` synchronously (state updates aren't readable until
  // the next render) — handleWheel/startGlideToTarget both need the *actual
  // current* value the instant a new wheel event arrives, not a stale
  // closure over whatever `position` was when the handler was created.
  const positionRef = useRef<number | null>(null);
  // Smoothed trailing scroll velocity, in item-units per ms — heavily
  // weighted toward the most recent wheel event so a real stop is reflected
  // quickly, but not so literally that one noisy event dominates.
  const velocityRef = useRef(0);
  const lastWheelTimeRef = useRef<number | null>(null);
  // The sign of the most recent motion — used to decide *which* neighboring
  // whole item is "ahead" (see startGlideToTarget's own caller in
  // handleWheel), so a settle only ever continues forward in the same
  // direction the user was already scrolling, never backward.
  const lastDirectionRef = useRef(1);
  const glideFrameRef = useRef<number | null>(null);
  const autoAdvanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cursor-follow label's own eased-glide bookkeeping — see
  // ensureLabelFollowLoop's own doc comment further below.
  const labelTargetRef = useRef({ x: 0, y: 0 });
  const labelDisplayRef = useRef({ x: 0, y: 0 });
  const labelFrameRef = useRef<number | null>(null);
  const labelInitializedRef = useRef(false);

  function updatePosition(value: number) {
    positionRef.current = value;
    setPosition(value);
  }

  function cancelGlide() {
    if (glideFrameRef.current !== null) {
      cancelAnimationFrame(glideFrameRef.current);
      glideFrameRef.current = null;
    }
  }

  // (Re)starts the 2-second countdown to the next auto-advance — called
  // once the intro finishes, and again on every real wheel/click interaction
  // so auto-advance only ever kicks in after a genuine pause.
  function scheduleAutoAdvance() {
    if (autoAdvanceTimeoutRef.current) clearTimeout(autoAdvanceTimeoutRef.current);
    setAutoAdvanceGeneration((g) => g + 1);
    autoAdvanceTimeoutRef.current = setTimeout(() => {
      const target = Math.round(positionRef.current ?? 0) + 1;
      startGlideToTarget(target, 0);
      scheduleAutoAdvance();
    }, AUTO_ADVANCE_MS);
  }

  // Critically-damped glide from wherever `position` currently is toward
  // `target`, starting at initial velocity `v0` (item-units/ms) — a
  // physically continuous handoff, so a glide that starts mid-scroll
  // (carrying the scroll's own real trailing velocity) never has a visible
  // "jerk" at its own start the way an instant jump into a standing-start
  // CSS transition would. `v0 = 0` (click-to-select) still works with the
  // same formula: it just starts the glide at rest instead.
  //
  // Closed-form critically-damped decay toward a fixed target:
  //   x(t) = target + [(p0-target) + (v0 + k*(p0-target))*t] * exp(-k*t)
  // — satisfies both x(0) = p0 and x'(0) = v0 by construction (verified by
  // direct differentiation), and monotonically approaches `target` with no
  // overshoot as t grows, for any starting velocity whose sign already
  // matches the direction of travel toward the target (always true here,
  // since the target itself is chosen ahead in that same direction).
  function startGlideToTarget(target: number, v0: number) {
    cancelGlide();
    setSettled(false);
    const p0 = positionRef.current ?? 0;
    const startTime = performance.now();

    function tick(now: number) {
      const t = now - startTime;
      const decay = Math.exp(-GLIDE_DECAY_RATE * t);
      const x = target + ((p0 - target) + (v0 + GLIDE_DECAY_RATE * (p0 - target)) * t) * decay;
      const remaining = Math.abs(target - x);

      if (remaining < GLIDE_FINISH_EPSILON || t > GLIDE_SAFETY_MAX_MS) {
        updatePosition(target);
        glideFrameRef.current = null;
        setSettled(true);
        return;
      }
      updatePosition(x);
      glideFrameRef.current = requestAnimationFrame(tick);
    }
    glideFrameRef.current = requestAnimationFrame(tick);
  }

  // Picks the random starting slide — deferred into requestAnimationFrame
  // rather than called directly in the effect body, matching this project's
  // established fix for the `react-hooks/set-state-in-effect` lint rule
  // (see scenic-map-background.tsx's own mount effect).
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const start = Math.floor(Math.random() * studies.length);
      updatePosition(start);
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-only (studies is a stable server-fetched array for this page's lifetime).
  }, []);

  // The intro glide — runs exactly once, the moment `position` first
  // becomes non-null (i.e. the instant the effect above resolves). Depending
  // on `position === null` (a boolean) rather than `position` itself is
  // deliberate: this same effect's own rAF loop goes on to change `position`
  // on every subsequent frame, and a plain `[position]` dependency would
  // tear down and restart the whole glide every single frame instead of
  // running it once from start to finish. A single continuous
  // requestAnimationFrame loop recomputing the full position from elapsed
  // time (rather than many setTimeout-scheduled steps) is the same pattern
  // scramble-text.tsx's own reveal uses, and for the same reason: it stays
  // correct even if React Strict Mode double-invokes this effect.
  useEffect(() => {
    if (position === null) return;
    const introStart = position;
    const introEnd = introStart + studies.length;
    const startTime = performance.now();
    let frame: number;

    function tick(now: number) {
      const t = Math.min(1, (now - startTime) / INTRO_DURATION_MS);
      const next = introStart + (introEnd - introStart) * easeOutCubic(t);
      updatePosition(next);

      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setIntroDone(true);
        setSettled(true);
        scheduleAutoAdvance();
      }
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed off position's null-ness, not its value — see comment above.
  }, [position === null]);

  useEffect(() => {
    return () => {
      cancelGlide();
      if (autoAdvanceTimeoutRef.current) clearTimeout(autoAdvanceTimeoutRef.current);
      if (labelFrameRef.current !== null) cancelAnimationFrame(labelFrameRef.current);
    };
  }, []);

  function handleWheel(event: React.WheelEvent) {
    if (!introDone) return;
    // Not while zoomed — per explicit spec ("拡大してる間は自動で次の画像に
    // 切り替わるのは切る"), auto-advance stays paused for the whole time
    // zoomed is true. The gallery root's own onWheel still fires even while
    // zoomed (scrolling over the zoomed image is still allowed), and this
    // call used to run unconditionally — quietly re-arming the timeout on
    // every wheel event and undoing the separate zoomed/introDone effect's
    // own pause, which is exactly what the bug report ("またzoom時に自動切
    // り替えがonになってる") turned out to be.
    if (!zoomed) scheduleAutoAdvance();
    const now = performance.now();
    const deltaPosition = event.deltaY / WHEEL_PX_PER_ITEM;
    if (deltaPosition !== 0) lastDirectionRef.current = deltaPosition > 0 ? 1 : -1;

    const dt = lastWheelTimeRef.current === null ? 16 : Math.min(100, Math.max(4, now - lastWheelTimeRef.current));
    lastWheelTimeRef.current = now;
    const instantVelocity = deltaPosition / dt;
    velocityRef.current = velocityRef.current * 0.4 + instantVelocity * 0.6;

    const next = (positionRef.current ?? 0) + deltaPosition;
    updatePosition(next);

    // Rounds *in the direction the user is already scrolling* rather than to
    // whichever whole item happens to be numerically nearest — per explicit
    // feedback ("行き過ぎて少し戻る動きは無しにしてほしい"): plain rounding
    // could pick the item *behind* wherever the rail has already coasted
    // past. Math.ceil/floor (with a small epsilon so an already-almost-exact
    // value doesn't get pushed an unwanted extra step) always resolves to a
    // neighbor still ahead in that same direction.
    const target =
      lastDirectionRef.current >= 0 ? Math.ceil(next - SNAP_EPSILON) : Math.floor(next + SNAP_EPSILON);
    startGlideToTarget(target, velocityRef.current);
  }

  // Clicking a thumbnail (per explicit request: "サムネクリックでも切り替
  // わるようにして") glides straight to that exact slot (see
  // StudiesThumbnailRail's own comment on why its raw `slot`, not
  // `mod(slot, N)`) — "選択したサムネは中央までスライド". Starts at velocity
  // 0 (a click has no scroll momentum of its own), reusing the same
  // physically-eased glide as the scroll settle above.
  function handleThumbnailSelect(slot: number) {
    if (!introDone) return;
    // Not while zoomed — see handleWheel's own comment above for why.
    if (!zoomed) scheduleAutoAdvance();
    velocityRef.current = 0;
    startGlideToTarget(slot, 0);
  }

  const resolvedPosition = position ?? 0;
  // Deliberately derived, not its own state — see this component's own doc
  // comment above on why the center image needs to follow *every* position
  // update, not just settled ones.
  const activeIndex = mod(Math.round(resolvedPosition), studies.length);
  const active = studies[activeIndex];
  const aspectRatio = ORIENTATION_ASPECT_RATIO[active.orientation];
  const zoomWidthColumns = ZOOM_WIDTH_COLUMNS[active.orientation];

  // The title/index-label block below (unlike the center image/rail above)
  // must NOT track `activeIndex` live — per direct follow-up ("画像が切り替
  // わる瞬間、次のテキストが一瞬表示される"): `activeIndex` flips to the next
  // study as soon as `resolvedPosition` rounds past the halfway point of a
  // glide, which happens well *before* `settled` goes true — but the text's
  // own opacity only fades out over 300ms once `settled` goes false (see the
  // render below), so for any glide shorter than that 300ms fade, the DOM
  // text content already swapped to the *next* study while the *old* text
  // was still partway through fading out, flashing the next study's copy
  // for a frame. `displayedIndexRef` instead only advances at the exact
  // instant `settled` is true (mutated here, during render, rather than via
  // an effect, so there's no extra render's worth of lag) — while gliding it
  // keeps pointing at whichever study was last actually settled, so the text
  // stays on the *old* study throughout the entire fade-out/hidden window,
  // then swaps content at the same instant it starts fading back in.
  const displayedIndexRef = useRef(activeIndex);
  if (settled) displayedIndexRef.current = activeIndex;
  const displayedIndex = displayedIndexRef.current;
  const displayed = studies[displayedIndex];

  // Reveal-complete tracking for the label/title ScrambleText below — per
  // direct follow-up ("pcのStudiesページでテキストがスクランブルで表示され
  // るとき2行に改行する際、ガタガタして表示される"). A first attempt fixed
  // this via ScrambleText's own `holdWidth` prop, but that swaps in a full
  // string's worth of random placeholder glyphs from frame one instead of
  // the usual blank-then-arrive-left-to-right growth — reported as looking
  // "めっちゃ変" (really weird), a materially different reveal *look*, not
  // just a jank fix. Reverted that in favor of keeping the exact original
  // reveal appearance and instead only changing *when* wrapping is allowed:
  // `whitespace-nowrap` for the entire duration each string is still
  // scrambling in (so the growing text simply overflows rightward past this
  // fixed-width box for that ~1s, never triggering a wrap-point recompute
  // every frame), then a single switch to `whitespace-normal` the instant
  // ScrambleText's own `onSettled` fires — one clean wrap at the very end
  // instead of the wrap point flickering back and forth throughout.
  // Mirrors ScrambleText's own render-time "key changed → reset" pattern
  // (see that component's own `prevKey` logic) rather than an effect, so
  // there's no extra render's worth of lag switching back to nowrap the
  // instant a fresh reveal starts.
  const [labelRevealed, setLabelRevealed] = useState(!settled);
  const [labelRevealKey, setLabelRevealKey] = useState(() => `${settled}:${displayed.label}`);
  const labelKey = `${settled}:${displayed.label}`;
  if (labelKey !== labelRevealKey) {
    setLabelRevealKey(labelKey);
    setLabelRevealed(!settled);
  }

  const [titleRevealed, setTitleRevealed] = useState(!settled);
  const [titleRevealKey, setTitleRevealKey] = useState(() => `${settled}:${displayed.title}`);
  const titleKey = `${settled}:${displayed.title}`;
  if (titleKey !== titleRevealKey) {
    setTitleRevealKey(titleKey);
    setTitleRevealed(!settled);
  }

  // Reserves the title line's own *true, settled-width* rendered height from
  // the moment each new study becomes displayed — per direct follow-up
  // ("Studiesのstudy01下のタイトルが2行になるとき、トップのImg時のタイトル
  // 2行問題のときと同じように、あらかじめ幅より長いテキストで2行になること
  // を計測した上で、2行になるようにスクランブルテキストが走るように調整し
  // て"), matching mobile-project-thumbnail-grid.tsx's own identical fix (see
  // that file's own titleMinHeight doc comment for the fuller mechanism):
  // this title `<p>` stays `whitespace-nowrap` (an unconstrained single line,
  // however wide) for the whole scramble reveal, only switching to
  // `whitespace-normal` (wrapping within its real 232px-equivalent width) the
  // instant `titleRevealed` flips true — so a title long enough to need 2
  // lines only actually *becomes* 2 lines at that exact instant, visibly
  // growing the box a beat after the reveal already looked finished. Measured
  // here via a hidden, invisible sibling rendering the same plain title text
  // at the true wrapped width, so its real final line count/height is known
  // immediately and reserved as this line's own min-height throughout,
  // regardless of whether it turns out to need 1 or 2 lines.
  const titleMeasureRef = useRef<HTMLParagraphElement>(null);
  const [titleMinHeightPx, setTitleMinHeightPx] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const el = titleMeasureRef.current;
    if (!el) return;
    setTitleMinHeightPx(el.offsetHeight);
  }, [displayed.title]);

  // Recomputes the zoomed box's real px size (see computeZoomedBoxPx above)
  // whenever zoom is actually on, and keeps it correct both on window resize
  // and if the active study's own aspect ratio/orientation changes while
  // still zoomed (e.g. the user scrolls the rail without leaving zoom —
  // nothing currently prevents that; only auto-advance is paused while
  // zoomed, see below). useLayoutEffect (not useEffect) so this resolves
  // *before* paint the instant `zoomed` first flips true — an effect-timed
  // update here would otherwise let one frame render with the previous
  // (usually `null`, i.e. no inline size at all) value first.
  useLayoutEffect(() => {
    if (!zoomed) return;
    function recompute() {
      setZoomedSizePx(computeZoomedBoxPx(aspectRatio, zoomWidthColumns, window.innerWidth, window.innerHeight));
    }
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [zoomed, aspectRatio, zoomWidthColumns]);

  // Auto-advance is explicitly paused while zoomed in ("拡大してる間は自動で
  // 次の画像に切り替わるのは切る") and resumes the moment the user zooms back
  // out — mirroring the same scheduleAutoAdvance()/clearTimeout pattern every
  // other interaction in this file already uses, rather than a separate ad
  // hoc mechanism.
  useEffect(() => {
    if (zoomed) {
      if (autoAdvanceTimeoutRef.current) clearTimeout(autoAdvanceTimeoutRef.current);
    } else if (introDone) {
      scheduleAutoAdvance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scheduleAutoAdvance is stable in behavior (reads refs/state at call time); depending on it would re-trigger this every render.
  }, [zoomed, introDone]);

  // Clicking the center image toggles zoom — `stopPropagation` so the
  // gallery root's own onClick (handleGalleryClick below, "画像外のエリア
  // クリックで画像縮小") doesn't *also* fire for this same click and
  // immediately re-collapse whatever this just did.
  function handleImageClick(event: React.MouseEvent) {
    if (!introDone) return;
    event.stopPropagation();
    setZoomed((current) => !current);
  }

  // Per explicit spec ("画像外のエリアクリックで画像縮小") — any click that
  // reaches the gallery's own root (i.e. everywhere *except* the image
  // itself, which stops propagation above) collapses an active zoom. A
  // no-op while not zoomed.
  function handleGalleryClick() {
    if (zoomed) setZoomed(false);
  }

  // Ensures the label's own eased-follow rAF loop is running — safe to call
  // on every single mousemove event; it's a no-op while a loop is already in
  // flight (labelFrameRef.current !== null), and self-terminates once the
  // displayed position has actually caught up to the target (within
  // LABEL_FOLLOW_SETTLE_EPSILON_PX), rather than looping forever at rest.
  function ensureLabelFollowLoop() {
    if (labelFrameRef.current !== null) return;
    function tick() {
      const dx = labelTargetRef.current.x - labelDisplayRef.current.x;
      const dy = labelTargetRef.current.y - labelDisplayRef.current.y;
      labelDisplayRef.current = {
        x: labelDisplayRef.current.x + dx * LABEL_FOLLOW_EASE_FACTOR,
        y: labelDisplayRef.current.y + dy * LABEL_FOLLOW_EASE_FACTOR,
      };
      setLabelDisplayPos(labelDisplayRef.current);
      if (Math.abs(dx) > LABEL_FOLLOW_SETTLE_EPSILON_PX || Math.abs(dy) > LABEL_FOLLOW_SETTLE_EPSILON_PX) {
        labelFrameRef.current = requestAnimationFrame(tick);
      } else {
        labelFrameRef.current = null;
      }
    }
    labelFrameRef.current = requestAnimationFrame(tick);
  }

  // Moves the label's own *target* (the cursor's real position) — the
  // actual rendered position trails this via the eased loop above. The very
  // first time this fires (labelInitializedRef still false), the displayed
  // position snaps straight there instead of easing in from (0,0) — without
  // this, the label would visibly glide in from the page's top-left corner
  // the first time it ever appears.
  function updateLabelTarget(x: number, y: number) {
    labelTargetRef.current = { x, y };
    if (!labelInitializedRef.current) {
      labelInitializedRef.current = true;
      labelDisplayRef.current = { x, y };
      setLabelDisplayPos({ x, y });
    }
    ensureLabelFollowLoop();
  }

  function handleImageMouseMove(event: React.MouseEvent) {
    updateLabelTarget(event.clientX, event.clientY);
  }

  // Flattened once per render (cheap — 5 short strings) so every line across
  // both paragraphs gets one continuous stagger index (0..4), regardless of
  // which paragraph it's actually in — the paragraph grouping only affects
  // the extra margin-top below, not the curtain-reveal ordering.
  let introTextLineCounter = 0;

  // Unzoomed reference height is *always* this fixed portrait 3:4 shape
  // (348x464, i.e. BASE_WIDTH_PX / ORIENTATION_ASPECT_RATIO.portrait) —
  // regardless of this study's own real orientation, and regardless of
  // intro vs. settled state. An earlier version made this follow each
  // study's own aspect ratio once the intro finished (per "中央画像は縦長
  // 以外に横長や正方形の画像や動画がくることもある"), morphing shape the
  // instant the intro ended — reverted per explicit follow-up correction
  // ("100%拡大時も横画像は縦4:3のままで、zoomで横画像もしくは正方形になる"):
  // the unzoomed box now stays this fixed portrait shape at all times, and a
  // landscape/square study's own real orientation only ever shows up via the
  // separate click-to-zoom feature (ZOOM_WIDTH_COLUMNS/computeZoomedBoxPx
  // below, which already uses `aspectRatio` directly for that). A landscape
  // or square source photo is simply center-cropped into this fixed portrait
  // frame via `object-cover`, the same treatment the thumbnail rail already
  // uses for its own fixed-shape crop — not letterboxed or distorted.
  //
  // This value is multiplied by `--grid-scale` below (not `--scale`) — per
  // explicit spec ("横幅はグリッド6マス分の幅に合わせてほしいんだけど、
  // ウィンドウ幅が狭いときは、画像の比率は変えずに高さを調整して"): the
  // unzoomed width (below) already uses `--grid-scale`, which keeps shrinking
  // continuously as the viewport narrows below the 1440px breakpoint (down to
  // the 1024px floor); `--scale` instead stays flat at 1 through that whole
  // range. Pairing the width with `--grid-scale` but the height with `--scale`
  // meant the box's own aspect ratio silently distorted at any viewport
  // narrower than 1440px (width shrinking while height didn't). Using
  // `--grid-scale` for both keeps them in lockstep, so the 3:4 ratio holds at
  // every width down to 1024px, exactly as asked.
  const unzoomedHeightRefPx = BASE_WIDTH_PX / ORIENTATION_ASPECT_RATIO.portrait;

  // `transform` is the plain "translateY(-50%)" — no X term at all — in BOTH
  // branches below, matching how the unzoomed state always worked. History:
  // originally only the *unzoomed* branch used a literal left-edge `left`
  // value with `translateY(-50%)`, while the *zoomed* branch used `left:
  // 50%` + `transform: translate(-50%, -50%)` to center on the viewport.
  // Per direct follow-up ("zoomする際のアニメーションだけど、拡大する途中
  // イメージが少しカーブして拡大してるように見える"): a percentage inside
  // `transform` resolves against the element's OWN border-box size at each
  // animation frame, and with `width` simultaneously animating, introducing
  // the X percentage only in the zoomed branch (0% → -50%) made the
  // resulting horizontal offset the *product* of two independently-easing
  // quantities (offsetX(t) ∝ e(t) × width(t), quadratic in the shared
  // progress) instead of linear — a curved/bowed path.
  // First fix attempt: keep transform's X percentage constant at -50% in
  // BOTH states (via `left: 50%` unzoomed too, computed as an equivalent
  // center point). That did straighten the path, but per a further direct
  // follow-up ("まだ画像の左端から少し見えるな。ウィンドウ幅にもよるみた
  // い"), it introduced a *different*, width-dependent bug: with `left`,
  // `width`, and a `transform` percentage resolved against that *same*
  // width all separately computed/rounded to real device pixels through the
  // rendering pipeline, the actual painted left edge could land a hair off
  // from the mask-reveal layer underneath (studies-center-image.tsx),
  // differently at different viewport widths depending on how each one's
  // own fractional pixel values happened to round.
  // Final fix: drop the X percentage entirely, in both states. `left` now
  // always targets the box's literal left EDGE as a plain px/calc value
  // (unzoomed: the existing CENTER_LEFT_PX*grid-scale calc, unchanged;
  // zoomed: `zoomedSizePx.leftPx`, precomputed in JS by computeZoomedBoxPx —
  // see that function's own doc comment for the full reasoning), with
  // `transform: translateY(-50%)` handling only the vertical centering, the
  // same two-term "edge + width" composition on the X axis as this box (and
  // `top`/height) already had — no percentage-of-its-own-animating-width
  // transform anywhere, so the transition path stays straight AND the
  // rounding mismatch has nothing left to disagree about.
  const centerImageStyle: React.CSSProperties =
    zoomed && zoomedSizePx
      ? {
          left: `${zoomedSizePx.leftPx}px`,
          top: "50%",
          transform: "translateY(-50%)",
          width: `${zoomedSizePx.widthPx}px`,
          height: `${zoomedSizePx.heightPx}px`,
          transitionProperty: "left, transform, width, height",
          transitionDuration: `${ZOOM_TRANSITION_MS}ms`,
          transitionTimingFunction: ZOOM_EASE,
        }
      : {
          left: `calc(${CENTER_LEFT_PX}px * var(--grid-scale))`,
          top: "50%",
          transform: "translateY(-50%)",
          width: `calc(${BASE_WIDTH_PX}px * var(--grid-scale))`,
          height: `calc(${unzoomedHeightRefPx}px * var(--grid-scale))`,
          transitionProperty: "left, transform, width, height",
          transitionDuration: `${ZOOM_TRANSITION_MS}ms`,
          transitionTimingFunction: ZOOM_EASE,
        };

  return (
    <div className="absolute inset-0" onWheel={handleWheel} onClick={handleGalleryClick}>
      <StudiesThumbnailRail studies={studies} position={resolvedPosition} onSelect={handleThumbnailSelect} />

      {/* Center image — 348x464 at the 1440x900 Figma canvas (node
         934:312) by default, exactly centered in that frame at that
         reference size (546+348/2=720, 218+464/2=450 — the canvas's own
         midpoint both ways). Positioned off the viewport's actual 50%
         vertical center (matching app/not-found.tsx's own ROW_TOP
         convention) rather than a literal calc(218px*var(--scale)) top
         offset, since --scale is a width-driven multiplier with no matching
         vertical counterpart — a fixed px-from-top value would drift from
         center on any window whose height doesn't happen to match the 900px
         reference.

         Left offset: unzoomed, the box's left EDGE rests at 546px (grid
         column 9, CENTER_LEFT_PX); zoomed, the box centers on the viewport
         instead, its own left edge precomputed in JS (computeZoomedBoxPx's
         `leftPx`) — see centerImageStyle above's own doc comment for why
         both states express `left` as a literal edge value with a plain
         `transform: translateY(-50%)` (no X term) rather than a percentage-
         based center anchor, after two rounds of follow-up fixes (a curved
         transition path, then a width-dependent 1px gap). Width/height
         (centerImageStyle above)
         instead vary: unzoomed, height is always a fixed portrait 3:4
         (unzoomedHeightRefPx above) regardless of this study's own real
         orientation — see that constant's own doc comment; zoomed, both come from
         computeZoomedBoxPx (9 grid columns, or less if the window is too
         short — see that function's own doc comment). Both states transition
         through the same width/height properties, so toggling zoom always
         animates smoothly between them (ZOOM_TRANSITION_MS/ZOOM_EASE above)
         rather than snapping.

         onClick/onMouseEnter/onMouseLeave/onMouseMove drive the click-to-zoom
         toggle and the cursor-follow "Zoom"/"Zoom Out" label (rendered
         separately below, as a `position: fixed` element) — per explicit
         follow-up request ("カーソルは非表示にしない") the real system
         cursor is left alone entirely; the label now simply floats alongside
         it rather than replacing it, so no `cursor-none` here anymore.

         `expanded={introDone}` — per explicit spec ("最初表示時にアニメー
         ションするとき、中央の画像のサイズはグリッドに沿うサイズで現状より
         一回り縮小してにして / アニメーションが止まったら現状のサイズに拡
         大"): StudiesCenterImage itself renders one grid column smaller
         while this is false (during the intro glide), then eases up to this
         wrapper's own full size the instant the intro finishes — see that
         component's own doc comment for the parallax mask/scale detail. This
         is a fully independent animation axis from the zoom above (an inner
         `transform: scale()`, vs. this wrapper's own literal width/height),
         so both can run without conflicting. */}
      <div
        className="absolute cursor-pointer"
        style={centerImageStyle}
        onClick={handleImageClick}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onMouseMove={handleImageMouseMove}
      >
        <StudiesCenterImage studies={studies} activeIndex={activeIndex} expanded={introDone} />
      </div>

      {/* Cursor-follow "Zoom" / "Zoom Out" label (per explicit spec:
         "中央画像にホバーするとカーソルにZoomの文字が追従" /
         "拡大時の画像にカーソルをもっていくとZoom Outの文字が追従する") —
         `position: fixed`, driven by the eased-follow loop above
         (labelDisplayPos, not the raw cursor position) so it trails the
         cursor with a bit of pleasant lag rather than snapping straight to
         it (per follow-up request: "追従をもう少しイージングきかせて気持ち
         良い感じの動きにして"). `pointer-events-none` so it never itself
         becomes the hover/click target in place of whatever's underneath it.

         Always mounted (while introDone) rather than conditionally rendered
         — only its own `opacity` toggles, via a CSS transition, so show/hide
         animates smoothly instead of an abrupt mount/unmount. Visibility is
         `hovering` (image-hover only) in both the unzoomed ("Zoom") and
         zoomed ("Zoom Out") states — a brief version let "Zoom Out" follow
         the cursor anywhere on the page while zoomed, fading out near the
         header/footer/left rail; reverted per explicit follow-up request
         ("zoom outはやっぱり画像にホバーしたときだけ表示").

         Text size is a literal `text-[12px]` (not `calc(12px*var(--scale))`)
         per explicit follow-up request ("zoom、zoom outの文字サイズを12px
         に") — a fixed, non-fluid 12px regardless of viewport, unlike most
         other type on this page. */}
      {introDone && (
        <div
          className="pointer-events-none fixed z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black px-[calc(14px*var(--scale))] py-[calc(8px*var(--scale))] text-[12px] leading-none font-medium whitespace-nowrap text-white transition-opacity"
          style={{
            left: labelDisplayPos.x,
            top: labelDisplayPos.y,
            opacity: hovering ? 1 : 0,
            transitionDuration: `${LABEL_FADE_DURATION_MS}ms`,
          }}
        >
          {zoomed ? "Zoom Out" : "Zoom"}
        </div>
      )}

      {/* Intro paragraph copy — left edge matches "ANDMADE Inc."'s own left
         edge in the header (per explicit follow-up correction:
         "追加したテキストの位置はANDMADE Inc.の左面に合わせて" — supersedes
         an earlier version that aligned to the thumbnail rail's own left
         edge at x=0 instead). SiteHeader renders that link at `left-0`
         *inside* its own `<header className="ml-[calc(198px*var(--grid-scale))]">`
         (see site-header.tsx), so its real left edge, relative to the page,
         sits at exactly `calc(198px * var(--grid-scale))` — the site's
         standard 198px content margin, reused directly here. Top edge
         matches the center image's own top edge at its EXPANDED (post-intro,
         full 464px-tall) size — "50% - 232px*grid-scale" (half of 464px)
         rather than `expanded`-dependent, since the spec is specifically the
         *expanded* state's top face ("中央サムネの拡大時の上面に合わせて"),
         a fixed position regardless of whether the image itself is still at
         its smaller intro size right now. Uses `--grid-scale`, not `--scale`
         — per follow-up spec ("画像の高さが変わるので...テキストの縦位置を
         画像の上面に合わせておいて"): the center image's own unzoomed height
         is now computed with `--grid-scale` too (see centerImageStyle above),
         so this offset has to track the exact same variable to keep matching
         its real top edge at every viewport width, not just at/above 1440px.
         Reveal animation: see INTRO_TEXT_EASE et al above — the exact same
         per-line mask-curtain technique as the site intro's own 3-line
         tagline, gated on `introDone` (this text has no splash-intro `split`
         state of its own to key off instead). */}
      <div
        className="absolute text-[length:calc(14px*var(--scale))] leading-[1.2] font-normal text-black"
        style={{ left: "calc(198px * var(--grid-scale))", top: "calc(50% - 232px * var(--grid-scale))" }}
      >
        {INTRO_TEXT_PARAGRAPHS.map((paragraph, paragraphIndex) => (
          <div key={paragraphIndex} className={paragraphIndex > 0 ? "mt-[calc(20px*var(--scale))]" : undefined}>
            {paragraph.map((line) => {
              const lineIndex = introTextLineCounter++;
              return (
                <div key={line} className="overflow-hidden">
                  <p
                    className="whitespace-nowrap"
                    style={{
                      transform: introDone ? "translateY(0)" : "translateY(100%)",
                      transitionProperty: "transform",
                      transitionDuration: `${INTRO_TEXT_REVEAL_MS}ms`,
                      transitionDelay: introDone ? `${lineIndex * INTRO_TEXT_LINE_STAGGER_MS}ms` : "0ms",
                      transitionTimingFunction: INTRO_TEXT_EASE,
                    }}
                  >
                    {line}
                  </p>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* "01 - 10" counter (Figma node 934:312, x=1382/y=446/w=34/h=8 at the
         1440x900 canvas) — vertically centered on the same 450/900=50%
         midpoint as the center image itself. Directly on this component's
         own full-bleed root (not nested inside a 198px-margin content
         wrapper), so `calc(Npx * var(--grid-scale))` is used directly rather
         than `var(--edge-right-inset)` — see app/not-found.tsx's own
         "Back to Home" link for why that variable only resolves correctly
         inside such a wrapper. Right offset history: originally flush 24px
         from the canvas's own right edge; moved *in* by 2 grid columns to
         140px ("右端の01/10の位置を内側に2グリッド分移動して"); then moved
         back *out* by those same 2 grid columns per this follow-up request
         ("01 - 10は右に2グリッド移動") — 140px - 2*58px = 24px, i.e. back to
         its original flush-24px position. Text opacity raised to fully
         opaque per explicit follow-up request ("01 - 10は透過100%にして") —
         was text-black/50 (50% opacity) before.

         The plain " - " text separator (per explicit follow-up spec) is now
         a 45px-wide gauge instead: a permanent 20%-opacity track the full
         45px wide, with a 100%-opacity fill on top that grows left-to-right
         from 0 to the full 45px over exactly AUTO_ADVANCE_MS — i.e. it
         visually counts down (up, technically) to the next auto-advance,
         reaching full width right as the switch happens. Implemented as a
         plain CSS `@keyframes` (.studies-gauge-fill in globals.css) rather
         than a JS-driven width, keyed on `autoAdvanceGeneration` (bumped
         once per scheduleAutoAdvance() call — see that function's own
         comment) so a fresh DOM node — and therefore a freshly-restarted
         fill animation — mounts exactly when a new AUTO_ADVANCE_MS window
         actually starts, whether that's from the intro finishing, a
         wheel/click interaction resetting the timer, or unzooming (which
         also re-arms it).

         Per explicit follow-up spec ("最初に画像が表示されるときとスクロー
         ル中はゲージは反応させない"), the fill is only *visible* while
         `introDone && settled` — hidden (opacity 0, not un-mounted) during
         the mount-time intro glide and while a manual scroll/glide is still
         moving. This has to be an opacity toggle rather than conditionally
         mounting the element at all (an earlier version did that): the very
         thing driving *when* a fresh AUTO_ADVANCE_MS window starts —
         scheduleAutoAdvance(), called on every wheel/click and again the
         instant an auto-advance actually fires — happens well *before*
         `settled` flips back to true (settling only happens once whatever
         glide that same interaction kicked off actually finishes coasting,
         which can take a few hundred ms on its own). Conditionally mounting
         only once settled meant the CSS animation didn't actually start
         until after that glide-settle delay had already eaten into the real
         timer's own budget — so the visual fill, restarting fresh from 0%
         at that later moment, would still be running when the real
         setTimeout fired, i.e. the switch happened before the gauge visibly
         reached the end (reported as "最初の切り替わり時以降、ゲージが右端
         まで来る前に切り替わってる" — true for every cycle after the very
         first, which uniquely doesn't involve a glide already in progress
         when its own scheduleAutoAdvance() call happens). Keeping the
         element mounted (so its animation clock starts in perfect lockstep
         with the real timer, whether or not it happens to be visible yet)
         and only toggling *opacity* fixes this: by the time it becomes
         visible again, its width already reflects genuinely-elapsed
         progress, and it finishes exactly when the real switch does. Still
         not rendered *at all* while `zoomed` — that one's a real, permanent
         pause (auto-advance itself doesn't run then — see
         scheduleAutoAdvance's own callers), not a transient visibility gap,
         so no similar desync risk. The bare 20% track stays visible
         throughout regardless. */}
      <div
        className="absolute flex items-baseline gap-[calc(8px*var(--scale))] text-[length:calc(12px*var(--scale))] leading-[1.5] font-medium whitespace-nowrap text-black"
        style={{ right: "calc(24px * var(--grid-scale))", top: "50%", transform: "translateY(-50%)" }}
      >
        {/* Slot/odometer-style digit roll per explicit spec
            ("数字の切り替わりをスロットにできる") — each digit column spins
            forward on its own to the new value (see slot-digits.tsx for how
            "forward-only" is kept even when going e.g. 9→2). No extra
            flourish spins here (extraSpins=0, the default) and a fairly
            quick 350ms duration — this fires on every single study change,
            so it needs to read as responsive navigation feedback, not a
            showy one-off (contrast case-counter.tsx's own use of this same
            component for its rare, one-shot "33 Cases" reveal). Drops the
            text-box-trim/cap-alphabetic classes the plain-text version had:
            those trim the leading around an element's own text content,
            which no longer applies once this renders as nested block spans
            instead of a plain text node — slot-digits.tsx now handles its
            own trimmed-baseline alignment internally instead (see its own
            comment). This row uses `items-baseline` rather than
            `items-center` specifically because of that: the reel's own
            outer box (a fixed `1lh` tall clipping window) is taller than
            "10"'s own tightly-trimmed box, so centering by box height would
            no longer land the two glyphs level with each other — aligning
            by baseline instead works regardless of that box-height
            difference, since an `overflow-hidden` inline-block's own
            baseline is defined as its bottom margin edge (see
            slot-digits.tsx), which is exactly where its glyph sits. */}
        <SlotDigits value={activeIndex + 1} digits={2} durationMs={350} />

        {/* Was nudged down 1px (top-px) per an earlier follow-up
            ("ゲージを1px下げて") for fine alignment against the flanking
            "01"/"10" text baseline, then nudged back up 1px by a later,
            separate follow-up ("ゲージを1px上に上げて") — net back to
            top-0, kept as an explicit class (not just omitting `top-*`
            entirely) so this still reads as a deliberate, already-tuned
            value rather than an unset default. See this element's own doc
            comment above for why the fill is kept mounted
            (key={autoAdvanceGeneration}) and only its *opacity* toggles on
            introDone/settled, rather than conditionally mounting it —
            that's what keeps its CSS animation's own clock in lockstep with
            the real auto-advance timer regardless of visibility.

            `self-center` overrides the row's own `items-baseline` (added for
            the "01"/"10" digit alignment fix — see the row's own comment)
            specifically for this element: having no text of its own, it has
            no real baseline, so the browser fell back to using its bottom
            margin edge as one, landing it right down at the "01"/"10"
            baseline — much lower than it sat under the row's old
            `items-center` ("ゲージの位置がまだ下位置になってる"). This
            keeps the gauge vertically centered in the row like before,
            independent of that baseline concern entirely. */}
        <div className="relative top-0 h-px w-[calc(45px*var(--scale))] shrink-0 self-center bg-black/20">
          {!zoomed && (
            <div
              key={autoAdvanceGeneration}
              aria-hidden
              className="studies-gauge-fill absolute inset-y-0 left-0 bg-black"
              style={{
                animationDuration: `${AUTO_ADVANCE_MS}ms`,
                // 80% per explicit follow-up ("右に伸びるゲージの透過を80%に
                // して") — reusing this same opacity for the introDone/
                // settled visibility toggle (0 when hidden) rather than a
                // separate bg-black/80 class, so the two don't fight over
                // the same visual property.
                opacity: introDone && settled ? 0.8 : 0,
              }}
            />
          )}
        </div>
        <span className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
          {String(studies.length).padStart(2, "0")}
        </span>
      </div>

      {/* Placeholder title (Figma's own "XxxxxxXxxxx", node 934:312,
         x=198/y=445 — grid column 3, the site's standard content margin,
         near the same vertical center as everything else above). Hidden
         entirely while scrolling/gliding, reveals via the same
         per-character ScrambleText effect as the Home page's underlined
         project titles once things settle — see this component's own doc
         comment above on `settled`.

         Now a two-line stack (title, then the "Study NN" index label 12px
         below it) rather than the single 16px line this used to be — per
         direct follow-up ("Study01の文字サイズを14pxにして、12px下に16pxで
         テキスト追加して（SPのほうと同じように2行組に）"), matching SP's own
         two-line treatment (mobile-studies.tsx's vertical title block:
         "Study NN" + the study's own title, stacked) structurally, even
         though the actual sizes differ from SP's own 12px/14px pair — PC's
         overall type scale already reads larger throughout this page, so
         14px/16px is the equivalent weight here, not a literal copy of SP's
         exact numbers. The title line is this block's own previous single
         line, its font-size lowered from 16px to 14px; the "Study NN" index
         label is the new addition, 12px below it at 16px.

         That index label now falls back to `active.label` (an optional
         per-study microCMS field — see lib/studies.ts's own `Study.label`
         doc comment) before the auto-generated count, per direct follow-up
         ("大きい方の連番自体を変えたい") — most studies still have no
         `label` set and so still just show the plain running count. */}
      <div
        className="absolute flex flex-col items-start gap-[calc(12px*var(--scale))] whitespace-nowrap text-black transition-opacity"
        style={{
          left: "calc(198px * var(--grid-scale))",
          top: "50%",
          transform: "translateY(-50%)",
          opacity: settled ? 1 : 0,
          transitionDuration: settled ? "0ms" : "300ms",
        }}
      >
        {/* Always mounted now (rather than `{settled && ...}`) so it can fade
           out on its way to hidden instead of just vanishing — per explicit
           follow-up request ("Study 01の文字が消えるとき、フェードアウトつけ
           て"). `transitionDuration` is asymmetric (0ms becoming visible,
           300ms becoming hidden) so the *appearance* still reads exactly as
           before (an instant cut straight into the scramble-reveal, no
           separate fade-in racing it) and only the *disappearance* animates —
           the same technique used elsewhere on this page (studies-center-
           image.tsx's own ghost layer) to give two directions of the same
           transition genuinely different feels. `ScrambleText`'s own `active`
           prop still ties directly to `settled`: its *inactive* state renders
           the plain, already-settled text (not blank), so there's no visual
           seam between "still fully visible" and "fading out" — only opacity
           changes during the fade (both lines below share this same gating,
           via the shared wrapper above). */}
        {/* Both lines' own width capped to 4 grid columns (4 * GRID_COLUMN_PX
           = 232px, scaled the same --grid-scale way as this file's other
           grid-unit measurements — see GRID_COLUMN_PX's own doc comment) and
           whitespace switched back to `normal` (overriding the parent flex
           container's own `whitespace-nowrap`, which both would otherwise
           inherit) — per two direct follow-ups ("pcのタイトルテキストの表示
           エリア幅は4マス分で、長い場合は改行する仕様に", then "labelのほう
           も同様に4マス分で改行する仕様に"): a long CMS `title` or `label`
           override now wraps onto additional lines within that fixed width
           instead of overflowing past it, rather than only the title line. */}
        {/* leading tightened 1.5 → 1.3 — per direct follow-up
           ("labelのほうも同様に4マス分で改行する仕様に" then "labelの行間を
           少し詰めて"): only matters once this line actually wraps to 2+
           lines (a short single-line label/auto-count reads the same either
           way), tightening the space between those wrapped lines.

           Stacking order swapped back — per direct follow-up ("pcのほうは
           上の小さい文字にNauts stickerってタイトルが入って下の大きい文字が
           Study01になってしまってるんだって" → correct order is "Study 01"
           first, title second): this 14px/top slot now holds the "Study NN"
           auto-count/label override, and the 16px/bottom slot below holds
           the real title — the reverse of this pair's original assignment
           (title first/14px, count second/16px). mobile-studies.tsx's own
           stacking was swapped to match, in the same direction. */}
        {/* whitespace-nowrap while !labelRevealed, whitespace-normal once
           the reveal settles — see labelRevealed's own doc comment above for
           the full reasoning (keeps ScrambleText's original left-to-right
           blank-growth appearance intact, unlike the reverted `holdWidth`
           attempt, while still avoiding the mid-reveal wrap-point jank). */}
        <p
          className={`w-[calc(232px*var(--grid-scale))] text-[length:calc(14px*var(--scale))] leading-[1.3] font-medium [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${labelRevealed ? "whitespace-normal" : "whitespace-nowrap"}`}
        >
          <ScrambleText
            text={displayed.label || `Study ${String(displayedIndex + 1).padStart(2, "0")}`}
            active={settled}
            onSettled={() => setLabelRevealed(true)}
          />
        </p>
        <p
          className={`w-[calc(232px*var(--grid-scale))] text-[length:calc(16px*var(--scale))] leading-[calc(20px*var(--scale))] font-medium [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${titleRevealed ? "whitespace-normal" : "whitespace-nowrap"}`}
          style={{ minHeight: titleMinHeightPx }}
        >
          <ScrambleText text={displayed.title} active={settled} onSettled={() => setTitleRevealed(true)} />
        </p>
        {/* Hidden measurer — see titleMinHeightPx's own doc comment above.
           Absolutely positioned against this whole block's own `absolute`
           ancestor (so it doesn't itself take up flex space among the real,
           visible lines), rendering the plain final title text at the exact
           same width/font/leading the real line settles to
           (whitespace-normal always, never the nowrap the real line
           temporarily uses while scrambling), so its real rendered height
           always matches what the visible line will settle to. */}
        <p
          ref={titleMeasureRef}
          aria-hidden
          className="pointer-events-none invisible absolute w-[calc(232px*var(--grid-scale))] text-[length:calc(16px*var(--scale))] leading-[calc(20px*var(--scale))] font-medium whitespace-normal [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
        >
          {displayed.title}
        </p>
      </div>
    </div>
  );
}
