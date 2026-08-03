"use client";

import { useEffect, useState } from "react";
import type { Study } from "@/lib/studies";

/** Eagerly warms the browser's own image cache/decode pipeline for every
 *  study's photo, once, the first time this component ever mounts — per
 *  direct real-device-only bug report ("実機でスワイプ or 左サムネを選択す
 *  ると、イメージが一瞬白くなって次のイメージが表示される挙動がある...検証
 *  ツールでは問題無し"). Root cause: the "top" layer below mounts a fresh
 *  `<img src=...>` and starts its own reveal (.studies-mask-reveal, a
 *  clip-path animation) *immediately*, with no guarantee the image has
 *  actually finished decoding yet. Desktop devtools' own mobile-viewport
 *  emulation still runs on the same fast desktop GPU/decode pipeline
 *  regardless of viewport size, so a brief decode race there is over before
 *  a single frame paints — invisible there, exactly matching "検証ツールで
 *  は問題無し". Real mobile GPUs decode/upload textures more slowly, and
 *  several WebKit/Blink mobile compositors are documented to paint a newly-
 *  promoted compositing layer (which starting a clip-path/transform
 *  animation on a fresh element forces) as blank *white* for a frame or two
 *  while that decode is still in flight — exactly the reported "一瞬白くな
 *  って". This is worse on SP specifically now that the swipe/rail can cycle
 *  through many studies in quick succession (see mobile-studies.tsx's own
 *  PC-parity swipe rewrite), each switch mounting a brand-new `<img>` that
 *  might not have been decoded before. STUDIES is a small, fully-known,
 *  fixed set (10 entries) — preloading every one of them up front (rather
 *  than only the currently-visible study) means that by the time the user
 *  actually swipes/taps to any of them, the browser already has it decoded
 *  and cached, so the reveal animation's very first frame already has real
 *  pixels to show instead of racing a still-in-flight decode. Shared by both
 *  PC (studies-gallery.tsx) and SP (mobile-studies.tsx), since both render
 *  this exact component — fixing it once here covers both. */
function usePreloadStudyImages(studies: Study[]) {
  useEffect(() => {
    studies.forEach((study) => {
      const preload = new window.Image();
      // srcset/sizes are set *before* `src`, and match the real <img> below
      // exactly. Without them this warmed the cache with a different (much
      // larger) resource than the one actually rendered: the browser picks a
      // candidate per element, so a bare `.src` preload fetches and decodes
      // the full-size original while the real element then goes and fetches
      // its own, correctly-sized candidate separately — paying for both, and
      // holding a decoded bitmap of the largest one for nothing. On a phone
      // that is the difference between warming ten ~400px-class images and
      // ten 2560x1920 ones (~20MB of decoded bitmap each), which is enough
      // to push iOS Safari into evicting and re-decoding them under memory
      // pressure — the opposite of what this preload is for.
      if (study.imageSrcSet) {
        preload.srcset = study.imageSrcSet;
        preload.sizes = CENTER_IMAGE_SIZES;
      }
      preload.src = study.imageSrc;
      // `.decode()` resolves only once the image is fully decoded and ready
      // to paint — a stronger guarantee than just setting `.src` (which only
      // promises the *fetch* has started, not that decoding has actually
      // finished), added because the white flash was still happening with
      // the plain-preload version. Errors (unsupported browsers, a genuinely
      // broken image) are swallowed — this is best-effort warming, not a
      // hard requirement, and the reveal itself still has to work even if
      // this rejects.
      preload.decode?.().catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-only (studies is a stable server-fetched array for this page's lifetime, not something that should re-trigger preloading on every re-render).
  }, []);
}

type StudiesCenterImageProps = {
  /** Forwarded straight from studies-gallery.tsx's own `studies` prop. */
  studies: Study[];
  /** Which study is currently active — a plain 0..N-1 index (unlike the
   *  rail's own cumulative `stepCount`; this component only ever needs to
   *  know *what* to show, not *how far* the rail has scrolled to get there). */
  activeIndex: number;
  /** True once the mount-time intro has finished — per explicit spec
   *  ("最初表示時にアニメーションするとき、中央の画像のサイズはグリッドに沿
   *  うサイズで現状より一回り縮小してにして / アニメーションが止まったら現
   *  状のサイズに拡大"): while this is false, the whole component renders at
   *  a smaller, grid-aligned size (SMALL_SCALE); the instant it flips true,
   *  it eases up to its normal full size (.studies-image-expand in
   *  globals.css) — see EXPAND_MASK_* below. The *parent* wrapper
   *  (studies-gallery.tsx's own `centerImageStyle`) also keys its own
   *  width/height off this same `introDone` value: while it's false, that
   *  wrapper is pinned to a fixed portrait 3:4 shape regardless of this
   *  study's real orientation, and — per explicit follow-up correction
   *  ("100%拡大時も横画像は縦4:3のままで、zoomで横画像もしくは正方形になる")
   *  — stays that same fixed portrait shape even once `expanded`/settled;
   *  only the separate click-to-zoom feature ever reveals a study's real
   *  orientation. */
  expanded: boolean;
  /** 初回の登場マスク。false の間は中央で完全に閉じた状態（inset 50%）で、
   *  true になると `expanded` 前の通常サイズ（MASK_INSET_PERCENT）まで
   *  中央から広がる — per direct follow-up ("最初にサムネが表示されるときも、
   *  パッと表示させずに中央からマスクが広がって表示されるようにして")。
   *  それまでは呼び出し側が opacity を 0/1 で切り替えていたため、サムネが
   *  そのまま現れていた。
   *
   *  既定は true（＝この段階を持たない）。指定しない呼び出し側の見た目は
   *  従来どおり変わらない。 */
  revealed?: boolean;
  /** `revealed` が false → true になるときのマスクの所要時間とイージング。
   *  `expanded` 側（expandDurationMs/expandEase）とは別物で、こちらは
   *  「無 → 縮小サイズ」、あちらは「縮小サイズ → 実サイズ」。 */
  revealDurationMs?: number;
  revealEase?: string;
  /** Overrides this component's own default expand duration/ease
   *  (EXPAND_MASK_DURATION_MS/EASE above, ~900ms/cubic-bezier(0.16, 1, 0.3,
   *  1)) — per direct real-device follow-up on SP specifically ("最初のパラ
   *  パラアニメーション後に右にスライドする際、拡大しながら移動してるので、
   *  少し曲線を描きながら右にスライドしてるように見えてる"): mobile-
   *  studies.tsx additionally slides this whole component's *parent* wrapper
   *  from screen-center over to its resting position the instant `expanded`
   *  flips true (its own INTRO_SLIDE_DURATION_MS/EASE) — PC (studies-
   *  gallery.tsx) has no equivalent parent slide at all, its wrapper sits at
   *  one fixed position throughout. Running that outer position slide and
   *  this component's own inner scale-up/mask-reveal on two different
   *  durations/easing curves means the two motions fall out of step with
   *  each other moment-to-moment; since the visible photo is always centered
   *  within its (moving) parent box, the sum of "parent sliding over" and
   *  "photo growing outward from the box's own center" traces a visibly
   *  curved path whenever those two eased schedules disagree — even though
   *  the parent's own left/top slide is, on its own, a perfectly straight
   *  line. Passing SP's own already-tuned slide duration/ease straight
   *  through here (rather than retuning the slide to match this component's
   *  default instead) keeps both halves of that SP-only motion mathematically
   *  in lockstep — same normalized progress at every instant — which
   *  collapses the combined path back to a straight line. Left undefined
   *  (falling back to the defaults above) at every other call site, so PC's
   *  own reveal — which has no parent slide to stay in sync with — is
   *  untouched. */
  expandDurationMs?: number;
  expandEase?: string;
};

/** "One size smaller, grid-aligned" — per follow-up request ("イントロ中は
 *  4グリッド分にしてみて"), 4 grid columns (232px) instead of the full 6
 *  (348px, i.e. two columns narrower — down from an initial 5-column/290px
 *  try), expressed as a scale factor (232/348) applied via
 *  `transform: scale()` rather than recomputing literal width/height —
 *  simpler to keep centered (a transform scales around the element's own
 *  center for free) and cheaper to animate than animating width/height
 *  directly. */
const SMALL_SCALE = 232 / 348;
/** How much the outer mask is inset (per side) at the small/intro size —
 *  chosen to match SMALL_SCALE's own shrink amount, so the mask and the
 *  image visually agree on "how much smaller" at the instant the expansion
 *  begins, before their two speeds below start to diverge. A same-progress
 *  animated clip-path (see the outer container below) was briefly removed
 *  entirely — mathematically redundant with the image's own scale-up, so in
 *  theory a no-op — per a real-device clip-path jank report, but reverted
 *  right back per direct follow-up that the resulting reveal looked "変"
 *  (off) without it ("マスクアニメーションが変だから、元のほうが良い"): real
 *  browser rendering apparently didn't match that idealized math (e.g. the
 *  clip-path's hard-edged crop and the scaled image's own filtered/
 *  antialiased edge are not actually pixel-identical in practice), so this
 *  animated mask is back exactly as it was. */
const MASK_INSET_PERCENT = ((1 - SMALL_SCALE) / 2) * 100;

/** The mask's own expansion duration — an earlier version deliberately ran
 *  this *faster* than the image's own scale-up (.studies-image-expand in
 *  globals.css) for a parallax feel ("画像の拡大とマスクの拡大速度に差を付
 *  けることで視差効果を付けたい"). Reverted per repeated bug reports of a
 *  perceived "bounce" right at the end of the intro expand ("まだ画像の跳ね
 *  返りが少しだけある"): with the mask fully open well before the image
 *  finished growing, the still-growing image was clearly visible inside an
 *  already-fully-open frame for the last ~300ms, reading as an extra, late
 *  settle/"bounce" even though neither animation's own value ever actually
 *  overshot 100%. Now matches .studies-image-expand's own duration/easing
 *  exactly, so both finish in lockstep with no residual motion visible after
 *  the frame appears "done". This mask animation only ever plays once, at
 *  that intro-to-expanded moment — every *subsequent* per-image switch
 *  leaves this outer mask alone entirely (per explicit spec: "マスクは100%
 *  のまま"). These are the *default* duration/ease — overridable via
 *  `expandDurationMs`/`expandEase` props below (see their own doc comment on
 *  `StudiesCenterImageProps` for why SP needs a different pair than this
 *  default). */
const EXPAND_MASK_DURATION_MS = 900;
const EXPAND_MASK_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

/**
 * The large center image (Figma node 934:312, 348x464 at rest). Two stacked
 * layers: a "backdrop" showing whichever single study was active right
 * *before* the current one, and a "top" layer showing the current one.
 *
 * Per explicit spec ("次の画像に切り替わるとき、表示中の画像はマスク内で
 * 120%に拡大（マスクは100%のまま）中央から次の画像が拡大して表示"): the
 * moment a study stops being active, it's demoted into the backdrop slot and
 * scales up to 120% there (.studies-backdrop-settle in globals.css) — cropped
 * by the fixed-size frame around it, so it reads as a tighter, cropped-in
 * zoom rather than the frame itself growing (the frame/mask only ever
 * animates once, during the mount-time intro — see EXPAND_MASK_* above).
 * Meanwhile the new "top" layer reveals via a rectangle expanding out from
 * its own center (.studies-mask-reveal), per the confirmed "中心から矩形が
 * 拡大" answer.
 *
 * An earlier version tried keeping *every* non-active study permanently
 * stacked at `inset-0` underneath (not just this single immediately-previous
 * one), each desaturated/faded to read as an ambient background — reverted
 * down to nothing but opacity/scale, then reverted entirely per bug report
 * ("表示中の画像が切り替わる瞬間別の画像になって、画面中央から次の画像が表
 * 示されちゃってる"): once opacity and grayscale were both stripped from
 * that stack (per "それはなしで" / "透過10%もなし"), every non-active entry
 * sat at full, equal opacity, so plain DOM stacking order meant only the
 * array's *last* non-active entry was ever actually visible through the
 * others — not necessarily the one that had just stopped being active —
 * which is exactly what read as "suddenly a different image". A single
 * dedicated backdrop slot has no such ambiguity: there's only ever one study
 * back there, and it's always the right one — this is also, per explicit
 * confirmation, the same backdrop+top layering approved earlier ("画像の重
 * なり的には...良い見た目になってる").
 *
 * `lastIndex`/`backdropIndex` both start `null` (not the first real
 * activeIndex) specifically so the *very first* image shown also gets a
 * proper reveal — per explicit spec ("中央画像は何もない状態からマスクア
 * ニメーションで中央から表示"): the backdrop starts as nothing (`null` → no
 * `backgroundColor`/image at all) rather than pre-filled with the first
 * study, so that first image's own reveal genuinely plays over emptiness
 * instead of over an already-shown backdrop.
 *
 * `activeIndex` changing is compared *during render* (not in an effect) to
 * decide whether to promote the current "top" into the new "backdrop" — the
 * same pattern scramble-text.tsx's own `prevKey` and now-playing-ticker.tsx's
 * own `prevText` use, and for the same reason: it avoids an extra, avoidable
 * render that a `useEffect`-driven setState would otherwise cause. Both the
 * "backdrop" and "top" layers are remounted (via `key={backdropKey}`/
 * `key={topKey}`) each time so their own animations always play fresh from a
 * real DOM mount, exactly like `.char-reveal`/`.underline-sweep-play`
 * elsewhere in this codebase.
 *
 * `expanded` (see its own prop doc) adds two *additional*, independently
 * nested layers around all of the above: an outer "mask" div (a plain
 * clip-path transition, the one-time intro reveal window) wrapping an inner
 * "image" div (`.studies-image-expand`, a keyframe-based scale-up, see
 * globals.css) — kept as two separate elements specifically so they can
 * animate independently without fighting over the same CSS property (the
 * backdrop/top layers above stay untouched either way, nested safely inside
 * both, and never re-trigger this outer mask on their own).
 */

/**
 * One backdrop/top layer's actual visible media — plain `<img>` for
 * `mediaType: "image"` studies (the common case, unchanged from before), or
 * `<video>` for `mediaType: "video"` ones, per direct follow-up ("Studies
 * に動画も登録できるようにして"). `autoPlay`/`loop`/`muted` per that same
 * follow-up's own explicit choice ("ミュートで自動ループ再生") — reads the
 * same as an image (no controls, no sound, just plays) rather than a normal
 * video player. `playsInline` is required for autoplay to actually work on
 * iOS Safari at all (without it, iOS forces fullscreen playback instead of
 * inline, which would never even start automatically). `muted` is also load-
 * bearing beyond just the spec: browsers (mobile Safari/Chrome alike) refuse
 * autoplay on any video that isn't muted, regardless of this `autoPlay`
 * attribute. No `poster` — the thumbnail rail (a separate component,
 * studies-thumbnail-rail.tsx/mobile-studies-thumbnail-rail.tsx) already
 * covers the "static preview" need via `imageSrc`, and this component only
 * ever renders once actually in view (backdrop/top layer), so there's no
 * meaningful "before it loads" window worth a separate poster frame for.
 */
/**
 * `sizes` for the center image — the real CSS width of this box at each
 * breakpoint, which is what lets the browser pick a sensibly-sized candidate
 * out of `study.imageSrcSet` instead of assuming the `100vw` default and
 * over-fetching.
 *
 * SP (below the `lg` breakpoint this codebase uses everywhere, 1024px): the
 * box is at most the full viewport width — that's the widest zoom state
 * (mobile-studies.tsx's own full-width landscape/square zoom); the unzoomed
 * and portrait-zoom states are narrower, so `100vw` is a safe upper bound.
 *
 * PC: the widest this ever gets is the zoomed landscape/wide box, 16 grid
 * columns at 58px each (studies-gallery.tsx's own ZOOM_WIDTH_COLUMNS/
 * GRID_COLUMN_PX) = 928px at the 1440px reference, scaling with
 * `--grid-scale` above that. `calc(928px * ...)` isn't allowed in `sizes`
 * (it can't reference custom properties), so this states the reference width
 * directly and lets the DPR multiplier in the browser's own candidate
 * selection cover the rest.
 */
const CENTER_IMAGE_SIZES = "(min-width: 1024px) 928px, 100vw";

function StudyMedia({ study }: { study: Study }) {
  if (study.mediaType === "video" && study.videoSrc) {
    return (
      <video
        src={study.videoSrc}
        autoPlay
        loop
        muted
        playsInline
        className="h-full w-full object-cover"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fluidly-sized box (--scale/--grid-scale calc()), same reasoning as project-hover-preview.tsx's own plain <img>.
    <img
      src={study.imageSrc}
      srcSet={study.imageSrcSet}
      sizes={CENTER_IMAGE_SIZES}
      alt=""
      className="h-full w-full object-cover"
    />
  );
}

/** `revealed` の既定の所要時間／イージング。EXPAND_MASK_* より短くしてある
 *  — こちらは「出現」で、パラパラが始まる直前のわずかな間に収める必要がある
 *  （呼び出し側の INTRO_THUMBNAIL_LEAD_MS）。 */
const REVEAL_MASK_DURATION_MS = 500;
const REVEAL_MASK_EASE = "cubic-bezier(0.16, 1, 0.55, 1)";

export function StudiesCenterImage({
  studies,
  activeIndex,
  expanded,
  expandDurationMs = EXPAND_MASK_DURATION_MS,
  expandEase = EXPAND_MASK_EASE,
  revealed = true,
  revealDurationMs = REVEAL_MASK_DURATION_MS,
  revealEase = REVEAL_MASK_EASE,
}: StudiesCenterImageProps) {
  usePreloadStudyImages(studies);

  const [state, setState] = useState<{
    backdropIndex: number | null;
    backdropKey: number;
    topKey: number;
    lastIndex: number | null;
  }>({
    backdropIndex: null,
    backdropKey: 0,
    topKey: 0,
    lastIndex: null,
  });

  if (activeIndex !== state.lastIndex) {
    setState((current) => ({
      backdropIndex: current.lastIndex,
      backdropKey: current.backdropKey + 1,
      topKey: current.topKey + 1,
      lastIndex: activeIndex,
    }));
  }

  // `backdropKey`/`topKey` are bumped together every single time, so their
  // raw numeric values are always identical (0,0 → 1,1 → 2,2 → ...) — used
  // directly as each element's own React `key` below, that caused a real
  // "Encountered two children with the same key" console error (they're
  // siblings, so key uniqueness is required between them too). Prefixing
  // each with its own layer name below keeps them numerically in lockstep
  // (still useful for reasoning about "which switch number is this") while
  // guaranteeing they never collide as actual key strings.

  const backdropStudy = state.backdropIndex !== null ? studies[state.backdropIndex] : null;
  const topStudy = studies[activeIndex];

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{
        // 3段階: 閉（inset 50%）→ 縮小サイズ（MASK_INSET_PERCENT）→ 実サイズ
        // （0%）。duration/ease を式で切り替えているのは、変化が起きる瞬間の
        // 値がそのままトランジションに使われるため — `revealed` が立つ
        // 瞬間は expanded がまだ false なので reveal 側、`expanded` が立つ
        // 瞬間は expand 側が選ばれる。
        clipPath: expanded ? "inset(0%)" : revealed ? `inset(${MASK_INSET_PERCENT}%)` : "inset(50%)",
        transitionProperty: "clip-path",
        transitionDuration: `${revealed && !expanded ? revealDurationMs : expandDurationMs}ms`,
        transitionTimingFunction: revealed && !expanded ? revealEase : expandEase,
        // Forces this layer to be promoted to its own GPU compositing layer
        // ahead of time, rather than right as the clip-path first starts
        // animating — per direct real-device white-flash follow-up ("白フラ
        // ッシュはまだ起こるけど、調整できないかな？"). Several WebKit/Blink
        // mobile compositors are documented to paint a *freshly*-promoted
        // layer's own backing store as blank white for a frame before its
        // real content composites in; `will-change` is the standard signal
        // to promote the layer proactively (during idle time, well before
        // any animation actually starts) instead of reactively at the exact
        // moment clip-path first changes, when there's real content already
        // ready to go from frame one.
        willChange: "clip-path",
        // Scopes this element's own repaint cost to just its own subtree —
        // per direct follow-up trying to ease this mask's real-device jank
        // without changing anything visible ("マスクアニメーションはコマ落
        // ちしてる感じなのかな。調整むずかしそう？" → "やってみて"): unlike
        // `transform`/`opacity`, `clip-path` isn't guaranteed to run purely on
        // the compositor, so some mobile browsers repaint this element on
        // every frame of the transition — `contain: paint` tells the browser
        // this element's own painting can never affect anything outside its
        // own box (nothing here ever needs to), so each of those repaints
        // only has to consider this subtree, not risk invalidating/
        // re-checking anything else on the page. Purely a rendering-cost
        // hint — doesn't change layout or appearance.
        contain: "paint",
      }}
    >
      <div
        className={`absolute inset-0 ${expanded ? "studies-image-expand" : ""}`}
        style={
          expanded
            ? // Longhand overrides beat .studies-image-expand's own `animation`
              // shorthand (globals.css) regardless of the class rule's own
              // specificity — inline `style` always wins. Only ever differs
              // from that class's own built-in 900ms/cubic-bezier(0.16, 1,
              // 0.3, 1) when a call site passes expandDurationMs/expandEase
              // (see that prop's own doc comment above) — every other prop
              // omits them, so this is a no-op there.
              //
              // will-change: transform — added alongside the parent's own
              // will-change: clip-path (same follow-up as above): this scale
              // animation was already relying on `.studies-image-expand`
              // itself to trigger layer promotion reactively, right as the
              // animation starts, rather than proactively ahead of time the
              // way the parent's own clip-path layer already was — the same
              // late-promotion gap the parent's own will-change doc comment
              // describes fixing for clip-path (a freshly-promoted layer can
              // paint blank for a frame on some mobile compositors). Giving
              // this element the same proactive treatment closes that gap
              // here too.
              { animationDuration: `${expandDurationMs}ms`, animationTimingFunction: expandEase, willChange: "transform" }
            : { transform: `scale(${SMALL_SCALE})` }
        }
      >
        <div
          key={`backdrop-${state.backdropKey}`}
          className={`absolute inset-0 ${backdropStudy ? "studies-backdrop-settle" : ""}`}
          style={{ backgroundColor: backdropStudy?.color }}
          aria-hidden
        >
          {backdropStudy && <StudyMedia study={backdropStudy} />}
        </div>
        <div
          key={`top-${state.topKey}`}
          className="studies-mask-reveal absolute inset-0"
          style={{ backgroundColor: topStudy.color }}
          aria-hidden
        >
          <StudyMedia study={topStudy} />
        </div>
      </div>
    </div>
  );
}
