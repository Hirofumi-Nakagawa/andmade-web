"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useLenis } from "lenis/react";
import type Lenis from "lenis";
import { FlowerShaderBackground } from "@/components/flower-shader-background";

/** Same `lg` breakpoint (1024px) app/about/page.tsx's own PC/MobileAbout
 *  split already uses, so "SP" here means exactly the same thing it does
 *  everywhere else on this page. */
const SP_BREAKPOINT_QUERY = "(max-width: 1023px)";

/** useSyncExternalStore trio for SHADER_NOISE_INTENSITY_SP's own gate below —
 *  not a plain useState+useEffect (an earlier version of this file), which
 *  the `react-hooks/set-state-in-effect` lint rule flags for calling setState
 *  synchronously inside an effect body purely to sync from an external
 *  source (window.matchMedia here) — exactly the "subscribe to an external
 *  system" case useSyncExternalStore exists for, same convention this
 *  codebase's own PageBodyBackground already uses (lib/footer-mode-store.ts)
 *  for an analogous external-store subscription. getSpServerSnapshot always
 *  returns false so SSR/first paint stays deterministic and matches the PC
 *  value, exactly like the previous useState(false) default did. */
function subscribeToSpBreakpoint(callback: () => void) {
  const mql = window.matchMedia(SP_BREAKPOINT_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}
function getSpSnapshot() {
  return window.matchMedia(SP_BREAKPOINT_QUERY).matches;
}
function getSpServerSnapshot() {
  return false;
}

/** Classic smoothstep ease (3t²-2t³) — used below to shape the wash's own
 *  fade band as a curve instead of a straight line. */
function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}

/** "#RRGGBB" → "rgba(r, g, b, alpha)" — per direct follow-up ("スクロールで
 *  表示されるグラデがまだ不自然"): a plain 2-stop linear alpha ramp (an
 *  earlier version of this file) reads as unnaturally abrupt partway through
 *  — human contrast perception isn't linear, so a mathematically-even fade
 *  visually looks like it "clears" faster than it numerically does. Sampling
 *  several intermediate stops along a smoothstep curve (see FADE_CURVE_STEPS
 *  below) instead of just the two endpoints approximates a proper eased
 *  fade, which needs each stop's own literal alpha value — hence rgba()
 *  instead of `${hex}${alphaAsHex}`, which can only ever express alpha in
 *  discrete 1/255 steps and would need re-deriving that hex byte per stop
 *  anyway. */
function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Fractional positions (0 = start of the fade band, 1 = fully transparent
 *  end) sampled along the smoothstep curve above — see hexToRgba's own doc
 *  comment. 5 points is enough for the curve to read as smooth rather than
 *  faceted once rendered. */
const FADE_CURVE_STEPS = [0, 0.25, 0.5, 0.75, 1];

/** How far through the *entire* document's scroll range (Lenis's own
 *  `progress`, 0..1) the wash reaches full coverage — reusing
 *  `lenis.progress` itself (a fraction of the *whole page's* scrollable
 *  height, not a flat px distance) — the exact mechanism the original,
 *  since-reverted design used for this same reveal (see
 *  about-background.tsx's own doc history: "a scroll-driven wash
 *  gradient...ramping with lenis.progress"). 0.5 (full coverage at the
 *  halfway point of the whole document) is a starting point, not measured
 *  off any reference pixel-for-pixel — tune up/down once seen on a real
 *  device against real (not placeholder) page content. */
const WASH_FULL_PROGRESS_FRACTION = 0.5;

/** How tall (as a % of the viewport) the gradient's own soft fade band is —
 *  rather than one flat, uniform opacity covering the whole screen at once
 *  (an original version of this file), the wash reads as a solid color
 *  growing up from the bottom edge, with this soft leading band above it
 *  fading out to fully transparent — a bigger number reads as a longer,
 *  gentler fade; a smaller one reads as a harder edge. 45 → 65 → 140 → 60
 *  across three direct follow-ups, the last one specifically asking to match
 *  the *original* design's own fade ("スクロール時の下からのグラデは、元の
 *  静止画を使ってたときのグラデの出現の仕方が理想的" — referring to
 *  about-background.tsx's own IMAGE_BOTTOM_FADE_MASK: `black 0%, black 45%,
 *  transparent 75%`, i.e. a substantial solid core with a moderate ~30-unit
 *  fade span above it, not one long haze the whole way up): 140 read as
 *  perpetually soft/hazy with barely any real solid presence until very late
 *  in the scroll; 60 brings back a clearer, more defined solid-then-fade
 *  shape closer to that original mask's own proportions, while
 *  PROGRESS_EASE_POWER below still keeps the very start of the scroll gentle
 *  (a concern the original, non-scroll-tied static mask never had to solve,
 *  since it was never mid-*reveal* at all). */
const GRADIENT_FEATHER_PERCENT = 60;

/** Applied to `progress` before it drives anything below (`progress **
 *  PROGRESS_EASE_POWER`) — per direct follow-up ("スクロールした瞬間の画面
 *  下の見た目がこんな感じだけど、これだとまだピンクが強すぎて自然じゃな
 *  い"): a plain linear ramp off `lenis.progress` reached a visually
 *  strong-looking wash after only a small amount of scrolling — a power >1
 *  eases the *start* of the ramp (small `progress` values shrink a lot more
 *  than they do near 1), so the very first bit of scrolling barely shows
 *  any wash at all, and the reveal accelerates the further you go, instead
 *  of scaling evenly the whole way. */
const PROGRESS_EASE_POWER = 2;

/** Slower than Contact's own default (SETTINGS.meltSpeed, 0.33) — per direct
 *  follow-up on About's own usage ("背景の動きはもう少しゆっくりにして"),
 *  then nudged back up a little (0.18 → 0.24) per a later follow-up asking
 *  for slightly more motion ("背景画像もうちょっと動いてる感じにしてほしい")
 *  — still well under Contact's own 0.33. */
const SHADER_MELT_SPEED = 0.24;
/** >0 — per direct follow-up ("現状画像をローテーションさせてるだけで動い
 *  てるように見せてるけど、ちょっと単調だから調整して"): with the default 0
 *  (Contact's own unchanged behavior), the melt sample ring sweeps at one
 *  perfectly constant rate, reading as a plain rotation rather than organic
 *  motion — see FlowerShaderBackground's own `meltWobble` prop doc comment
 *  for the actual mechanism (a time-varying, per-sample angular jitter, not
 *  just a bigger/faster rotation). 1.8 is a moderate amount — noticeably
 *  irregular without breaking the sense that samples are still orbiting
 *  roughly the same center. */
const SHADER_MELT_WOBBLE = 1.8;
/** Weaker than Contact's own default (SETTINGS.cursorStrength, 0.14) — 0.14
 *  → 0.07 → 0.035 → 0 → 0.07 → 0.045 across five direct follow-ups: reduced
 *  twice for a gentler reaction, then zeroed out entirely ("両サイドのピクセ
 *  ル伸びは無くしたい"), then restored per a further follow-up asking to keep
 *  the cursor reactivity and fix the stretch a different way ("カーソル反応
 *  は残したい...両サイドのピクセルにブラーかけるとかで解決できない？") — see
 *  IMAGE_OVERSCAN below for that actual fix (reserving a UV margin so the
 *  cursor offset never reaches the texture's real edge, rather than
 *  disguising the artifact with blur or removing the reactivity outright) —
 *  then dialed down once more per a later follow-up asking for the reaction
 *  to be toned down further ("カーソル反応をもう少し抑える"). */
const SHADER_CURSOR_STRENGTH = 0.045;
/** <1 reserves a small crop margin specifically so `SHADER_CURSOR_STRENGTH`'s
 *  own UV shift never reaches the photo's real texture edge — see
 *  FlowerShaderBackground's own `imageOverscan` prop doc comment (and
 *  coverUV's own doc comment in that file's FRAG_SRC) for the full mechanism.
 *  0.85 leaves an ~7.5%-of-frame margin on every side, comfortably more than
 *  SHADER_CURSOR_STRENGTH=0.07's own worst-case UV shift at a typical desktop
 *  aspect ratio. */
const SHADER_IMAGE_OVERSCAN = 0.85;
/** <1 forces real vertical crop slack to exist even on narrow/portrait
 *  canvases where coverUV()'s own aspect-ratio math alone would otherwise
 *  leave zero vertical crop (scale.y === 1.0, see FlowerShaderBackground's
 *  own coverUV doc comment) — per direct follow-up ("背景画像中央揃えになっ
 *  てる感じがするけど"): about_bg1.jpg is itself portrait (1372x2047,
 *  aspect ≈0.67), close enough to a typical mobile viewport's own aspect
 *  ratio that scale.y was computing out to exactly 1.0 there, making
 *  imageOffsetY=0 (top-align, below) a complete no-op on that axis — the
 *  photo's full height was always shown regardless, reading as vertically
 *  centered rather than pinned to the top. 0.8 caps scale.y at 80%,
 *  guaranteeing a real 20%-of-image vertical crop margin on every canvas,
 *  which imageOffsetY=0 can then actually use to pin the visible crop to the
 *  photo's own top edge. */
const SHADER_MAX_VERTICAL_SCALE = 0.8;
/** Back to Contact's own default (SETTINGS.blurRadius, 0.018) — was briefly
 *  increased to 0.028 per an earlier follow-up ("ブラーをもう少しかけて"),
 *  reverted per a later, broader one ("全体的にcontactよりも重い感じがす
 *  る。もっと軽くして"): the extra blur was part of what made this page's
 *  own version of the effect read as heavier/denser than Contact's. */
const SHADER_BLUR_RADIUS = 0.018;
/** Back to Contact's own default (SETTINGS.edgeBlurStrength, 0.55) — same
 *  revert/reasoning as SHADER_BLUR_RADIUS above (was briefly 0.7). */
const SHADER_EDGE_BLUR_STRENGTH = 0.55;
/** Slightly *below* Contact's own default (SETTINGS.noiseIntensity, 0.02) —
 *  was briefly increased to 0.028 per an earlier follow-up ("ノイズをもう少
 *  しだけ強くして"), reverted (and then some) per the same "重い感じがす
 *  る...もっと軽くして" follow-up as the blur values above. */
const SHADER_NOISE_INTENSITY = 0.016;
/** SP-only bump on top of SHADER_NOISE_INTENSITY above — per direct
 *  follow-up ("SP表示のときノイズエフェクトを少しだけ大きくして"), scoped to
 *  SP only (PC's own value above is untouched). A small step up, not
 *  doubled or more — "少しだけ" asked for a subtle increase. */
const SHADER_NOISE_INTENSITY_SP = 0.022;
/** 1 → 0.8 → 0.7 → 0.4 → 0.6 — per direct follow-ups ("画像の透過を80%に",
 *  then "画像の透過を0.7に", then "画像の透過0.4に", then "背景画像の透過を
 *  0.6に"): was fully 1 (no `bgColor` blend at all, see
 *  FlowerShaderBackground's own `imageOpacity` prop doc comment, added for
 *  the earlier "ブレンド無しにして" request) — now a good deal more of
 *  `bgColor` (white, see that prop's own doc comment) mixes back in. */
const SHADER_IMAGE_OPACITY = 0.6;
/** Below Contact's own default (4) — per direct follow-up ("まだだいぶ重い
 *  な"): this and SHADER_MELT_SAMPLES below are compile-time shader sample
 *  counts (see FlowerShaderBackground's own `samples`/`meltSamples` prop doc
 *  comments and buildFragSrc's own doc comment in that file) — fewer samples
 *  means fewer sceneColor/texture2D evaluations per pixel, a real cut in
 *  per-frame GPU cost, continuing the same trade-off this shader's own
 *  SAMPLES/MELT_SAMPLES history already used twice before for Contact
 *  (8→6→4 melt, 6→4 corner blur) — just now scoped to About only instead of
 *  reducing Contact's own already-tuned look further for no reason Contact
 *  itself asked for. */
const SHADER_SAMPLES = 3;
/** Below Contact's own default (6) — see SHADER_SAMPLES above for the full
 *  reasoning; this is the (per that file's own doc comment) now-dominant
 *  melt pass, so trimming it has the bigger relative impact of the two. */
const SHADER_MELT_SAMPLES = 4;

export type AboutHeroBackgroundProps = {
  imageSrc: string;
  /** [r, g, b] each 0..1 — passed straight through to FlowerShaderBackground's
   *  own `bgColor`, mixed in continuously underneath the photo wherever
   *  SHADER_IMAGE_OPACITY (< 1) leaves it partially see-through — deliberately
   *  a *different* color from `washColor` below (app/about/page.tsx now
   *  passes plain white here), per direct follow-up ("画像を透過にしたことで
   *  背面に背景色が見えてるのが嫌なので、画像背面には#fffを設定して"). */
  bgColor: [number, number, number];
  /** CSS color string for the wash overlay below — a real CSS value, not the
   *  0..1 float triple `bgColor` above needs; no longer required to match
   *  `bgColor` (see that prop's own doc comment for why they're deliberately
   *  different colors now). */
  washColor: string;
};

/**
 * FV (first view) hero background for the About page — restores the
 * original design's scroll-driven wash-to-solid-color reveal (previously in
 * AboutBackground, reverted long before this project's own shader background
 * existed — see that file's own doc history), now driving
 * app/about/page.tsx's new animated shader background
 * (flower-shader-background.tsx) instead of the old plain parallax photo.
 *
 * Two layers, composited independently:
 *  1. The shader canvas itself — plain, no parallax, almost no color blend
 *     (SHADER_IMAGE_OPACITY, see that constant's own doc comment) — per
 *     direct follow-up ("ブレンド無しにして...イメージの色をそのまま使う"),
 *     later dialed back slightly ("画像の透過を80%に"): the photo's own real
 *     colors dominate (still passed through the melt/blur/grain/saturation/
 *     contrast machinery), with only a light 20% tint of `bgColor` mixed in
 *     underneath.
 *  2. A `washColor` gradient overlay, driven by the same Lenis scroll
 *     callback: fully solid from the viewport's own bottom edge up to
 *     `progress * 100`%, then fading out to fully transparent over the next
 *     GRADIENT_FEATHER_PERCENT% above that — reading as a tide of color rising
 *     up from the bottom of the screen as you scroll, rather than a flat
 *     wash appearing uniformly everywhere at once. `position: fixed`, so it
 *     stays pinned over whatever's on screen for the rest of the page's own
 *     scroll range; once `progress` reaches 1 the solid region spans the
 *     entire viewport with no transparent band left at all (see the
 *     gradient math below), reading exactly like a solid page background
 *     from that point on without this page's actual root background needing
 *     to be anything other than plain white (app/about/page.tsx's own FV
 *     color).
 *
 * Once the wash reaches full coverage, the shader is told to stop actually
 * drawing (`paused`, see that prop's own doc comment on
 * FlowerShaderBackground) — it's completely hidden underneath the now-opaque
 * overlay at that point, so there's nothing left to gain from still paying
 * for the animation.
 */
export function AboutHeroBackground({ imageSrc, bgColor, washColor }: AboutHeroBackgroundProps) {
  const [progress, setProgress] = useState(0);
  // SHADER_NOISE_INTENSITY_SP's own gate — see the useSyncExternalStore trio
  // above.
  const isSp = useSyncExternalStore(subscribeToSpBreakpoint, getSpSnapshot, getSpServerSnapshot);

  // useCallback — a fresh function reference every render would re-fire
  // lenis-react's own effect (and so this callback) on every render, not
  // just real scroll ticks — see mobile-home.tsx's own handleLenisTick doc
  // comment for the documented history of exactly this bug elsewhere in
  // this codebase.
  const handleLenisScroll = useCallback((lenis: Lenis) => {
    const linear = Math.min(lenis.progress / WASH_FULL_PROGRESS_FRACTION, 1);
    setProgress(linear ** PROGRESS_EASE_POWER);
  }, []);
  const lenis = useLenis(handleLenisScroll);

  useEffect(() => {
    // iOS Safari only composites this page's own real pixels behind the
    // status bar / top safe area once the page has scrolled off *exactly*
    // 0 — at rest (scrollY === 0, i.e. every fresh page load) it instead
    // shows a sampled/fallback color there, regardless of `viewport-fit=
    // cover` or how this shader canvas itself is positioned — ported from
    // the old AboutBackground's own identical fix (see that component's own
    // doc comment on this exact quirk) per direct follow-up reporting the
    // regression carried over when this shader background replaced it: text
    // shows correctly behind the address bar/status bar (mix-blend content,
    // unaffected by this quirk) but the background image doesn't ("SPで見た
    // ときアドレスバーの背面にテキストは表示されるけど画像が表示されてない
    // ...背景画像が静止画で入れてたときは自然な見え感だったので、それに合
    // わせてほしい"). A 1px nudge off the very top — imperceptible, and
    // immediately overwritten the moment the user does any real scrolling of
    // their own — is enough to make Safari start showing this canvas's own
    // real pixels there instead of the fallback color.
    if (!CSS.supports("-webkit-touch-callout: none")) return;

    const frame = requestAnimationFrame(() => {
      if (window.scrollY === 0) {
        window.scrollTo(0, 1);
        lenis?.scrollTo(1, { immediate: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [lenis]);

  // reachPercent — the gradient's *total* upward reach (solid region +
  // fade band together), scaled by `progress` from the very bottom edge —
  // per direct follow-up ("FVでは画面下のピンクグラデは表示しないで"): an
  // earlier version anchored the fade band's *bottom* edge at a fixed 0%
  // regardless of `progress`, so even at progress===0 (no scroll at all,
  // i.e. the FV) a GRADIENT_FEATHER_PERCENT-tall fade sliver was already
  // visible at the screen's own bottom edge. Scaling the *whole* reach
  // (solid + fade) by progress instead means at progress===0 every stop
  // collapses to 0%, i.e. genuinely nothing visible — the fade band only
  // starts growing (from a zero-height sliver) once real scrolling begins.
  const reachPercent = progress * (100 + GRADIENT_FEATHER_PERCENT);
  // fadeHeightPercent — the fade band's own physical height: ramps up from 0
  // to GRADIENT_FEATHER_PERCENT while reachPercent is still below that (the
  // same "start as a zero-height sliver" behavior as before), then STAYS
  // fixed at GRADIENT_FEATHER_PERCENT for the rest of the scroll — per direct
  // follow-up ("画面全体が背景色になる寸前の画面上のグラデの幅が狭いから、
  // 不自然な境界ができてる"): an earlier version instead clamped
  // `fadeTopPercent` itself to 100 independently of `solidTopPercent`, which
  // forced the *visible* fade band to physically shrink (down to a hard,
  // zero-width edge right at progress===1) for the entire back half of the
  // reveal, since both were racing toward the same 100% ceiling. Keeping the
  // fade band's height constant instead, and letting `fadeTopPercent` climb
  // *past* 100 uncapped, keeps the gradient's own rate of change constant the
  // whole time — the "extra" portion above 100% simply sits outside this
  // `fixed inset-0` div's own visible box (CSS gradients render fine past
  // their own box bounds, nothing needs manual clamping for that), so what's
  // actually on screen always reads as the same smooth curve sliding upward
  // and off, never a curve getting visually compressed into a sudden line.
  const fadeHeightPercent = Math.min(reachPercent, GRADIENT_FEATHER_PERCENT);
  // Solid region: 0% (bottom) up to solidTopPercent, growing to exactly 100%
  // right as progress reaches 1 — full, flat coverage with nothing left
  // above it, matching the `paused` cutoff below.
  const solidTopPercent = Math.max(reachPercent - GRADIENT_FEATHER_PERCENT, 0);
  const fadeTopPercent = solidTopPercent + fadeHeightPercent;

  // Smoothstep-eased fade stops (see FADE_CURVE_STEPS/hexToRgba's own doc
  // comments) — each `rgba()` stop's own alpha follows the smoothstep curve
  // rather than a straight line, and every stop shares the *same* washColor
  // RGB (only alpha changes), so — unlike interpolating toward the literal
  // `transparent` keyword — there's no hue/lightness shift anywhere in the
  // fade either, just a pure, eased alpha ramp.
  const fadeSpan = fadeTopPercent - solidTopPercent;
  const fadeStops = FADE_CURVE_STEPS.map((t) => {
    const alpha = 1 - smoothstep(t);
    const position = solidTopPercent + t * fadeSpan;
    return `${hexToRgba(washColor, alpha)} ${position}%`;
  });

  return (
    <>
      <FlowerShaderBackground
        imageSrc={imageSrc}
        bgColor={bgColor}
        imageOpacity={SHADER_IMAGE_OPACITY}
        paused={progress >= 1}
        meltSpeed={SHADER_MELT_SPEED}
        meltWobble={SHADER_MELT_WOBBLE}
        cursorStrength={SHADER_CURSOR_STRENGTH}
        blurRadius={SHADER_BLUR_RADIUS}
        edgeBlurStrength={SHADER_EDGE_BLUR_STRENGTH}
        noiseIntensity={isSp ? SHADER_NOISE_INTENSITY_SP : SHADER_NOISE_INTENSITY}
        imageOverscan={SHADER_IMAGE_OVERSCAN}
        maxVerticalScale={SHADER_MAX_VERTICAL_SCALE}
        samples={SHADER_SAMPLES}
        meltSamples={SHADER_MELT_SAMPLES}
        // 0 (topmost) — was FlowerShaderBackground's own default per-mount
        // Math.random() crop position, fixed per direct follow-up ("aboutの
        // 背景画像の表示位置はランダムにせず、上面合わせで表示").
        imageOffsetY={0}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background: `linear-gradient(to top, ${washColor} 0%, ${fadeStops.join(", ")})`,
        }}
      />
    </>
  );
}
