"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useLenis } from "lenis/react";
import type Lenis from "lenis";

/** Fade-in duration on mount (page-transition entrance). */
const FADE_MS = 500;
/** How much slower the photo scrolls relative to the rest of the page — 0.25
 *  means it moves at 75% of the normal scroll rate, reading as sitting
 *  slightly "behind" the page (a parallax depth cue) — per direct follow-up
 *  ("背景画像がパララックスになってない"), reintroducing this after an
 *  earlier version was removed (see this component's own doc comment on
 *  that history) — that earlier removal was really about removing `position:
 *  fixed` (which this drift paired badly with, see below), not about
 *  removing motion outright. Modest on purpose — a strong factor reads as
 *  the image detaching from the page rather than gently trailing it. */
const PARALLAX_FACTOR = 0.25;
/** Hard ceiling on the parallax offset, as a *fraction of the photo's own
 *  real rendered height* — not a flat px value (an earlier version used a
 *  flat 150px cap, reasoned about only against the narrowest mobile
 *  viewport's own rendered height; that stayed safely inside
 *  FADE_BUFFER_PERCENT's buffer zone there, but on PC — where this same photo
 *  renders dramatically taller, since IMAGE_ENLARGE_WIDTH_PERCENT_PC scales
 *  the photo's width (and so, via its fixed aspect ratio, its height too) with
 *  the viewport itself — that flat 150px cap was reached after only a few
 *  hundred px of real scrolling, then held flat for the rest of this much
 *  taller photo's own on-screen scroll range: no more differential motion at
 *  all for most of it, reported as "PCのAboutページがまたページ途中からパラ
 *  ラックス効いてない"). A height-relative cap scales up right along with
 *  the photo on wide viewports exactly like the mask below already does,
 *  instead of silently going flat partway through. Deliberately kept under
 *  FADE_BUFFER_PERCENT's own 25% (see below) with a safety margin, for the
 *  same reason the old flat value had to: a shift larger than that would
 *  start pushing still-opaque content past this wrapper's own clipped
 *  (`overflow-hidden`) box bottom, rather than only ever eating into the
 *  mask's already-fully-transparent tail. */
const PARALLAX_MAX_FRACTION = 0.2;
/** Fades the photo's own bottom edge to transparent via a mask, blending it
 *  into the page's own solid background color (currently #E897B4, matching
 *  app/about/page.tsx's own `bg-[#E897B4]` — was #DD82A3, then briefly
 *  #DEA4B0; see that file's own doc history for the full sequence) rather
 *  than cutting off abruptly against it. Percentage-based (not a fixed px
 *  value), so it scales with
 *  the image's own rendered box at any viewport width.
 *
 * The gradient reaches fully transparent at (100 - FADE_BUFFER_PERCENT)%, not
 * literally 100% — deliberately leaving the last FADE_BUFFER_PERCENT% of this
 * box already fully invisible *before* its own true bottom edge, per a real
 * regression this fixes: an earlier version faded all the way to exactly
 * 100% (this box's own true edge) and separately reserved extra
 * `paddingBottom` (equal to the max parallax drift) on the outer wrapper so
 * the still-fading, not-yet-transparent tail wouldn't get clipped early as
 * the photo shifted down via parallax — but since nothing clips this
 * `position: absolute` wrapper's own contribution to the page's total
 * scrollable height (app/about/page.tsx's own `#top` root has no
 * `overflow: hidden`), that reserved padding directly inflated the whole
 * document's real scroll height, opening up blank space below the footer
 * ("フッター下に余白ができてしまってる") — worse the larger the reservation,
 * and still present even once that reservation was cut down substantially,
 * since *any* added padding here still leaks into page height by
 * construction. Baking the necessary safety margin into the mask itself
 * instead needs zero extra box size at all: as long as PARALLAX_MAX_PX never
 * exceeds FADE_BUFFER_PERCENT's own share of the photo's real rendered
 * height, the point where the photo is already fully invisible always falls
 * safely inside this box's own true, unpadded bottom edge — so clipping it
 * exactly there (no padding needed) can never cut off anything still
 * genuinely visible, regardless of how far the parallax drift has shifted
 * it. black 0%..45%: a fairly long fade, spread over much more than just the
 * last sliver of the photo's own height, so it reads as a genuinely gradual
 * dissolve rather than a fade confined to a thin strip right at the edge. */
const FADE_BUFFER_PERCENT = 25;
const IMAGE_BOTTOM_FADE_MASK = `linear-gradient(to bottom, black 0%, black 45%, transparent ${100 - FADE_BUFFER_PERCENT}%)`;
/** Enlarges the photo to this % of its wrapper's own width (centered,
 *  overflow clipped left/right) — per direct follow-up reporting a visible
 *  flat-pink gap between the photo's own bottom and the page's first real
 *  content ("背景画像上のピンク背景エリアまで背景画像を拡大して表示できる？
 *  （ピンクエリアを無くしたい）"): IMAGE_BOTTOM_FADE_MASK's own fade zone is
 *  percentage-based against the photo's *own* rendered height, so making the
 *  photo itself taller (not just adjusting the mask's own percentages)
 *  pushes the same relative fade proportionally further down the page in
 *  real pixels, directly covering more of that gap — while also reading as
 *  a bigger, more immersive photo, matching what was literally asked for
 *  ("拡大して表示"). A plain width increase (not `transform: scale()`) —
 *  ordinary layout sizing, not a transform, so this wrapper's own
 *  `overflow-hidden` parent naturally grows its own auto-height to match
 *  the now-taller content with zero extra bookkeeping, and there's no
 *  transform/stacking-context involved at all — sidesteps the exact class
 *  of bug the iOS bleed fix above already had to recover from once
 *  (`transform: scale()` on a *full-width* box bled horizontally past the
 *  viewport, see this component's own `ios-about-hero-bleed` doc comment) by
 *  never using a transform for this in the first place. 145 → 115 → 110 —
 *  per direct follow-ups ("現状大きく配置されてるっぽいけど、もう少し小さく
 *  表示できる？", then "110%にして"): still enough overscan to keep covering
 *  the fade-mask's own gap-hiding purpose above, just noticeably less
 *  blown-up than before. If this reopens a visible flat-color gap under the
 *  photo's bottom edge, nudge this back up a bit rather than all the way to
 *  145 again.
 *
 * PC (110%) and SP (150% → 175%) now differ — per direct follow-ups ("spの
 * 画像サイズを150%にして", then "175%にして"), SP alone got noticeably bigger
 * again while PC stays at its own already-tuned 110%. Applied via a
 * `--hero-enlarge` custom property switched at the same `lg` breakpoint every
 * other PC/SP split in this codebase uses (rather than two separate JS
 * constants driving inline `style`, which can't vary per breakpoint on their
 * own — inline styles don't support media queries), with the JSX below
 * deriving `width`/`marginLeft` from that one property via `calc()` so the
 * "enlarge % → centered negative margin" relationship (see this constant's
 * own doc history above) stays a single formula instead of two numbers that
 * could drift out of sync. */
const IMAGE_ENLARGE_WIDTH_PERCENT_SP = 175;
const IMAGE_ENLARGE_WIDTH_PERCENT_PC = 110;

/**
 * About page hero photo (Figma node 855:1918) — a photo with a 35%-white
 * wash over it, matching that design's own `w-full` + `h-auto` (overflowing)
 * treatment: the image scales to the *width* of the viewport and lets its
 * height follow proportionally (rather than `object-cover`, which would pick
 * whichever dimension crops least — Figma explicitly sizes this one to 100%
 * width and lets height overflow, clipped by the parent's `overflow-hidden`).
 *
 * `position: absolute` (anchored to the top of app/about/page.tsx's own
 * `#top` root, its nearest `relative` ancestor), not `fixed` — per direct
 * follow-up ("About背景画像固定にしないで、スクロールしたとき上でマスクか
 * けずに背景画像が画面上まで見えるようにして"), reversing an earlier
 * `position: fixed` version entirely. That version pinned the photo to the
 * viewport and needed a scroll-driven "wash" gradient (a bottom-up fade to
 * solid color, ramping with `lenis.progress`) to ever visually get out of
 * the way as you scrolled toward the bottom of a much taller page — a
 * source of several follow-up bugs in a row (a color-mismatched seam where
 * the wash met the real page background, then a genuine gap opening at the
 * screen's own top edge once an added parallax drift carried the photo's
 * top edge up past the fixed container's own top). A plain, non-fixed hero
 * image sidesteps that whole class of bugs by construction: it's ordinary
 * in-flow-adjacent content now, scrolling away with the rest of the page
 * exactly once you've scrolled past its own real height, with nothing left
 * to keep in sync against scroll position at all — no wash, no parallax, no
 * fixed-viewport bookkeeping. `overflow-hidden` + the bottom fade mask below
 * are the only two effects left, both scoped to the image's own box, not the
 * viewport's.
 *
 * Rendered first (in app/about/page.tsx) so later siblings (SiteHeader's
 * mix-blend-exclusion text, etc.) still blend correctly against it — same
 * DOM-order-over-z-index reasoning as ProjectHoverPreview on the home page
 * (see app/page.tsx).
 *
 * Fades in once the photo itself has actually loaded (not just on a fixed
 * mount timer) so it enters gently on every page transition into /about,
 * matching the slide+fade the page's own sections use (about-section.tsx) —
 * per direct follow-up reporting a jarring flash of the page's own flat pink
 * background right after navigating in, before the photo appears ("Aboutペー
 * ジが表示される瞬間、イメージが表示されるまでピンクの背景が一瞬表示され
 * る"): the previous version started this fade via `requestAnimationFrame`
 * on mount, completely independent of whether the actual photo had finished
 * downloading yet — on a slower connection (or simply a cold cache on first
 * visit, unlike repeat visits where the browser's own image cache serves it
 * near-instantly), the wrapper would already be mid-transition to full
 * opacity while the `<Image>` inside it still had nothing real to show,
 * reading as "pink, then a hard pop-in" instead of a genuine fade — the exact
 * same class of bug mobile-home.tsx's own PreviewImage documents fixing the
 * same way (see that component's own doc comment). Tying `revealed` to the
 * image's own `onLoad`/`complete` state instead guarantees the fade-in only
 * ever starts once real pixels already exist underneath it.
 *
 * This component went through a whole round of decorative motion effects on
 * top of the plain photo above — a blurred/rotated "melt" layer, a halftone/
 * RGB-misregistration print effect, a settled-on blur+SVG-liquid-warp, a
 * scroll-driven parallax drift, and a scroll-progress-driven wash gradient —
 * all eventually reverted, the last two per this component's own doc history
 * above. Back to just the plain photo, nothing else.
 */
export function AboutBackground() {
  const [revealed, setRevealed] = useState(false);
  const [parallaxY, setParallaxY] = useState(0);
  // Photo's own real rendered height (the masked div below, ref'd via
  // photoRef) — measured rather than assumed, since it varies with viewport
  // width (see IMAGE_ENLARGE_WIDTH_PERCENT_SP/_PC and PARALLAX_MAX_FRACTION's
  // own doc comments above for why a flat px cap broke on wide PC viewports).
  // `transform` doesn't affect layout height, so this stays the *unshifted*
  // height regardless of the parallax drift applied to the inner div below.
  const photoRef = useRef<HTMLDivElement>(null);
  const [photoHeight, setPhotoHeight] = useState(0);
  // See AboutBackground's own top-level doc comment on the pink-flash fix —
  // `imgRef` lets the effect below check `.complete` for the already-cached
  // case (a cached image can be `complete` the instant this ref attaches,
  // before an `onLoad` listener would ever fire for it), matching
  // mobile-home.tsx's own PreviewImage/imgRef pattern exactly.
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (imgRef.current?.complete) setRevealed(true);
  }, []);

  useEffect(() => {
    const el = photoRef.current;
    if (!el) return;
    const updateHeight = () => setPhotoHeight(el.offsetHeight);
    updateHeight();
    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, []);

  // useCallback — a fresh function reference on every render would re-fire
  // lenis-react's own effect (and so this callback) on every render, not
  // just real scroll ticks — see mobile-home.tsx's own handleLenisTick doc
  // comment for the documented history of exactly this bug elsewhere in
  // this codebase.
  const handleLenisScroll = useCallback(
    (lenis: Lenis) => {
      setParallaxY(Math.min(lenis.scroll * PARALLAX_FACTOR, photoHeight * PARALLAX_MAX_FRACTION));
    },
    [photoHeight],
  );
  const lenis = useLenis(handleLenisScroll);

  useEffect(() => {
    // iOS Safari only composites this photo's own real pixels behind the
    // status bar / top safe area once the page has scrolled off *exactly*
    // 0 — at rest (scrollY === 0, i.e. every fresh page load) it instead
    // shows a sampled/fallback color there (this page's own solid pink, see
    // PageBodyBackground), regardless of `viewport-fit=cover`
    // (app/about/page.tsx's own `viewport` export) or how this photo
    // itself is positioned (`ios-about-hero-bleed` below) — neither of
    // those alone was enough, per direct follow-up reporting a persistent
    // pink margin at the very top of the screen even with both already in
    // place. A 1px nudge off the very top — imperceptible, and immediately
    // overwritten the moment the user does any real scrolling of their own
    // — is enough to make Safari start showing this photo's own real
    // pixels there instead of the fallback color.
    //
    // `CSS.supports("-webkit-touch-callout: none")` — per direct follow-up
    // that navigating to the PC About page now shifts the whole page up by
    // ~1px ("PCのAboutページに遷移したとき、1pxくらい上にページが動く"):
    // this whole nudge only ever needed to run on iOS Safari (the "at rest"
    // fallback-color quirk described above is real WebKit/iOS behavior, not
    // a Chrome/desktop one at all), but the effect itself had no platform
    // guard whatsoever, so it forced this exact same scrollTo(0, 1) on
    // *every* browser, including desktop Chrome — a real, visible 1px
    // upward jump there, not just an inert no-op. Same iOS-WebKit-only
    // feature-detection trick `ios-about-hero-bleed` below already uses in
    // globals.css (that CSS property only genuinely exists on iOS WebKit),
    // reused here in JS via `CSS.supports` instead of a UA string sniff, so
    // Chrome/desktop — which has no seam to paper over here at all — now
    // skips this entirely, matching that same file's own reasoning for why
    // its own CSS version is scoped the exact same way.
    if (!CSS.supports("-webkit-touch-callout: none")) return;

    // Guarded on `window.scrollY === 0` so this can never fight a real,
    // non-zero scroll position (e.g. browser back/forward restoring one) —
    // though smooth-scroll.tsx's own ScrollToTop already forces exactly 0 on
    // every fresh mount of this route, which is the only time this needs to
    // run.
    const frame = requestAnimationFrame(() => {
      if (window.scrollY === 0) {
        window.scrollTo(0, 1);
        lenis?.scrollTo(1, { immediate: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [lenis]);

  return (
    <div
      // ios-about-hero-bleed (see globals.css) — iOS Safari only, offsets
      // this wrapper's own `top` negative so the photo bleeds above its
      // normal position into the surrounding page, covering the seam its
      // dynamic toolbar (and the overscroll "rubber-band" region past the
      // very top of the document) can otherwise reveal. A plain `top`
      // offset, not a `transform: scale()` (an earlier version of this exact
      // fix) — that scale bled *horizontally* too (inset-x-0 spanning full
      // width, scaled up from center, pushed past the viewport's own right
      // edge), causing real horizontal overflow site-wide — reported as
      // stray whitespace on the page's own left/right edges. Adjusting
      // `top` alone only ever moves this wrapper vertically; `inset-x-0`
      // stays exactly 0/0, so there's no way for this to affect the page's
      // own horizontal extent at all.
      className="ios-about-hero-bleed pointer-events-none absolute inset-x-0 top-0 overflow-hidden"
      // No opacity/transition here anymore (was `opacity: revealed ? 1 : 0`)
      // — moved down to the innermost photo-only div below, per this
      // component's own top-level doc comment on the pink-flash fix: fading
      // *this whole* wrapper (which now also carries the neutral
      // `--color-background` fallback fill, see photoRef's own `backgroundColor`
      // comment below) meant that fallback fill was ALSO invisible for the
      // entire loading gap, defeating its own purpose — it needs to be
      // visible immediately, with only the actual photo fading in on top of
      // it once ready.
      style={{
        // No paddingBottom reservation here (an earlier version added one,
        // equal to the max parallax drift) — see IMAGE_BOTTOM_FADE_MASK's own
        // doc comment above for why that caused a real footer-gap regression,
        // and why baking the same safety margin into the mask itself instead
        // needs no extra box size at all.
      }}
      aria-hidden
    >
      <div
        ref={photoRef}
        // [--hero-enlarge:...] / lg:[--hero-enlarge:...] — switches which of
        // the two custom properties set below (--hero-enlarge-sp/-pc, the
        // actual IMAGE_ENLARGE_WIDTH_PERCENT_SP/_PC values) `--hero-enlarge`
        // itself resolves to, at the same `lg` breakpoint every other PC/SP
        // split in this codebase uses — see IMAGE_ENLARGE_WIDTH_PERCENT_SP's
        // own doc comment above for why this indirection (rather than two
        // plain inline `width` values) is what actually lets a single
        // `style` object vary by breakpoint at all.
        className="relative h-auto [--hero-enlarge:var(--hero-enlarge-sp)] lg:[--hero-enlarge:var(--hero-enlarge-pc)]"
        style={
          {
            "--hero-enlarge-sp": `${IMAGE_ENLARGE_WIDTH_PERCENT_SP}%`,
            "--hero-enlarge-pc": `${IMAGE_ENLARGE_WIDTH_PERCENT_PC}%`,
            // width/marginLeft — see IMAGE_ENLARGE_WIDTH_PERCENT_SP's own doc
            // comment above. Centers the enlarged box within the (100%-wide)
            // outer wrapper: marginLeft is exactly half the excess width, as
            // a negative offset, so it overflows evenly left and right
            // (clipped by the outer wrapper's own overflow-hidden), and
            // `h-auto` keeps the image's own aspect ratio, so this width
            // increase makes the whole box proportionally taller too, not
            // just wider.
            width: "var(--hero-enlarge)",
            marginLeft: "calc((100% - var(--hero-enlarge)) / 2)",
            // backgroundColor — per direct follow-up ("背景がピンクだとフェ
            // ードインがついてても一瞬ピンクがちらつくから、画像背面をトッ
            // プと同じ背景色にしてみて"): while the photo is still loading
            // (`revealed` false, see this component's own top-level doc
            // comment on that fade-on-load fix), what shows through here is
            // whatever's behind this element — previously nothing of its
            // own, so `#top`'s own flat pink background showed straight
            // through for that entire gap, a hard color mismatch against
            // Top's own neutral page background (`--color-background`,
            // globals.css) the user was just looking at before navigating in.
            // Filling this box itself with that same neutral color instead
            // means the backdrop stays visually continuous through the
            // navigation, with the photo (and eventually the page's own
            // pink, further down/later) only ever appearing on top of it —
            // `mask-image` below still applies to this fill too (an
            // element's mask affects everything it paints, background
            // included), so it fades out toward the bottom exactly in step
            // with the photo itself, never showing as a hard-edged block.
            backgroundColor: "var(--color-background)",
            maskImage: IMAGE_BOTTOM_FADE_MASK,
            WebkitMaskImage: IMAGE_BOTTOM_FADE_MASK,
          } as React.CSSProperties
        }
      >
        {/* Parallax drift's own `transform` lives on this *separate* inner
            div now, not the masked div above — per direct follow-up
            reporting a pink gradient appearing across the *top* of the
            photo specifically while scrolling ("スクロールすると画像の上の
            ほうにもピンクのグラデが乗るようになってる"), which was never
            the intent (IMAGE_BOTTOM_FADE_MASK only ever fades the *bottom*,
            black 0%..45%, fully opaque across the whole top). A single
            element carrying both `mask-image` *and* `transform` asks WebKit
            to keep recomputing the mask's own gradient against a box that's
            simultaneously being transformed — exactly the kind of
            real-device-only WebKit rendering interaction this codebase has
            hit before with masks/transforms/overflow-hidden combinations
            (see this component's own doc history above). Splitting them
            onto two different elements — an outer one that only ever masks
            (never moves), wrapping an inner one that only ever transforms
            (never masks) — means WebKit only ever has to solve one problem
            per element, never both at once. */}
        <div
          className="relative transition-opacity ease-out"
          style={{
            transform: `translateY(${parallaxY}px)`,
            // opacity/transitionDuration — moved here from the outer
            // `ios-about-hero-bleed` wrapper, see that element's own comment
            // for why: only the actual photo (this div and everything inside
            // it) should fade in on `revealed`; the neutral
            // `--color-background` fallback fill on the sibling `photoRef`
            // div needs to stay visible from the very first frame instead.
            opacity: revealed ? 1 : 0,
            transitionDuration: `${FADE_MS}ms`,
          }}
        >
          {/* width/height match this photo's own real 1372x2047 aspect ratio
              — briefly 1440x1920 when a different file was swapped in at the
              same path, reverted back to 1372x2047 per direct follow-up
              ("Aboutの背景画像と色を元に戻して", with the actual file itself
              being manually restored back too) — these props exist purely so
              the browser reserves the right box shape via an implicit
              aspect-ratio (this element is still actually sized by the
              `w-full h-auto` classes below); a mismatched ratio here would
              stretch/squash the rendered image relative to its real pixels. */}
          <Image
            ref={imgRef}
            src="/images/about/about-hero.jpg"
            alt=""
            width={1372}
            height={2047}
            priority
            className="h-auto w-full"
            onLoad={() => setRevealed(true)}
          />
          <div className="absolute inset-0 bg-white/35" />
        </div>
      </div>
    </div>
  );
}
