"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLenis } from "lenis/react";
import type Lenis from "lenis";

/** Shrinks the rendered display box's own height a little, PC and SP alike —
 *  per direct follow-up ("実績詳細のHeroの表示エリアの高さをpc,spともに少し
 *  狭めて"). Multiplies the incoming `aspect` (width/height) rather than
 *  touching each project's own registered aspect value directly (that's real
 *  per-project photo-crop data from microCMS, see ProjectDetail's own doc
 *  comment) — a *larger* aspect number means a *shorter* box at the same
 *  width (height = width / aspect), so every project's own box ends up this
 *  same 8% shorter than its registered aspect alone would render, while each
 *  project's own relative portrait/landscape-ness is still preserved. 1.08
 *  chosen as a modest ("少し") reduction — see this file's own top-level
 *  doc comment for the worked-example px numbers this produces. */
const HERO_HEIGHT_SHRINK = 1.08;
/** Total extra height the image carries beyond the visible box — was 100px
 *  above + 100px below (200 total) per direct follow-up ("kvのパララックス
 *  は表示エリアより200px"), replacing the earlier percentage-based `scale()`
 *  overscan with this literal, fluid-scaled px budget. Narrowed to 150 (75 +
 *  75) alongside HERO_HEIGHT_SHRINK above — per the same follow-up asking to
 *  also tone down the resulting image enlargement ("パララックスさせる際の
 *  画像拡大を少しだけ抑える"): object-cover has to scale the photo up enough
 *  to cover this overscan-inflated box, so a *shorter* box alone (from
 *  HERO_HEIGHT_SHRINK, holding this constant fixed) would actually have
 *  *increased* that required enlargement, not reduced it, since the same
 *  200px would then be a bigger fraction of a smaller box. Worked example
 *  (Yatsumonji Gakuen 70th's own registered PC hero, 1392×815, the only
 *  project with a real detail page authored so far):
 *    - box height, before either change: 815px. Enlargement needed to cover
 *      the old 200px overscan: (815+200)/815 ≈ 124.5% (up from a 100%
 *      "exact fit, no overscan" baseline).
 *    - box height, after HERO_HEIGHT_SHRINK alone: 815/1.08 ≈ 754.6px.
 *    - box height *and* this narrowed 150px overscan together: enlargement
 *      = (754.6+150)/754.6 ≈ 119.9% — down from ≈124.5% to ≈119.9%.
 *  SP's own reference hero (400×500, fluid=false so this budget applies as
 *  flat, unscaled px there): 500 → 500/1.08 ≈ 463.0px box height;
 *  enlargement (463.0+150)/463.0 ≈ 132.4%, down from (500+200)/500 = 140%. */
const PARALLAX_OVERSCAN_PX = 150;
/** Hard px ceiling on the drift — half of PARALLAX_OVERSCAN_PX, i.e. exactly
 *  the top-side overscan budget, so translateY can never drift far enough to
 *  expose the container's own background color at the top edge. Left as a
 *  flat, unscaled number (not wrapped in var(--scale)) since this feeds a
 *  runtime `translateY(...)`, which has no access to the CSS custom property
 *  at that point — same reasoning this constant's earlier version relied on. */
const PARALLAX_MAX_PX = PARALLAX_OVERSCAN_PX / 2;
/** How much of the viewport's own height the KV should still occupy once the
 *  drift finishes ramping up to PARALLAX_MAX_PX — 0 (per direct follow-up
 *  "PC,SPともにKVのパララックスはページ上までパララックスする仕様にする"):
 *  the ramp now spans the KV's entire scroll-through range, all the way until
 *  its own bottom edge passes the top of the viewport, rather than stopping
 *  early once it shrinks to some fraction of viewport height (1/3, this
 *  constant's earlier value) — see measureStopScrollY below. */
const STOP_AT_VIEWPORT_FRACTION = 0;

/**
 * KV (hero) parallax wrapper for app/projects/[slug]/page.tsx — per direct
 * follow-up ("kvをパララックスさせて"). A small, standalone client component
 * (rather than inlining hooks into that page directly) since the page itself
 * is an async Server Component. Same `useLenis` scroll-tracking technique as
 * about-background.tsx's own hero photo.
 */
export function ProjectHeroParallax({
  image,
  imageSrcSet,
  aspect,
  mask,
  alt = "",
  fluid = true,
}: {
  image?: string;
  /** Responsive candidates for `image` (lib/projects.ts's own
   *  ProjectGalleryImage.imageSrcSet). */
  imageSrcSet?: string;
  aspect: number;
  mask?: string;
  alt?: string;
  /** Whether the top/bottom overscan offset scales with PC's own
   *  var(--scale) fluid-sizing variable — true (default) for PC, this
   *  component's original caller; pass false for SP (mobile-project-detail
   *  .tsx's own KV, per direct follow-up "SPのKVもパララックスさせる"), which
   *  has no such variable and uses flat px throughout instead — leaving this
   *  true there would produce an invalid calc() (undefined custom property)
   *  and silently drop the offset entirely. */
  fluid?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // The page-scrollY at which the KV's own remaining visible height on
  // screen drops to STOP_AT_VIEWPORT_FRACTION of the viewport — a ref (not
  // state) since it's only ever read inside the scroll callback below, never
  // rendered directly; recomputed on resize since both the KV's own rendered
  // height (fluid layout) and the viewport height can change independently.
  const stopScrollYRef = useRef(0);
  const [parallaxY, setParallaxY] = useState(0);
  // Slide-in + fade-in entrance — per direct follow-up ("実績詳細ページの
  // Hero画像はスライドイン+フェードインを付けて"). This page has no
  // site-intro splash gating to wait on (unlike the top page's own
  // CaseCounter/SiteHeader — see those components' own `revealed` doc
  // comments), so this just reveals once on mount: a single rAF after mount
  // (rather than flipping synchronously) still guarantees at least one frame
  // paints in the not-yet-revealed state first, so the transition actually
  // has something to animate from instead of snapping straight to its end
  // state. Same 24px/500ms/ease-out convention as this site's other
  // entrance reveals (e.g. project-card.tsx's own ProjectCard).
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  // Separate fade specifically for the actual photo's own load completion —
  // per direct follow-up ("Hero画像が読み込みできてないときに、少し遅れて表
  // 示されたときパッと表示させずに画像だけフェードインをつけてほしい"):
  // `revealed` above only covers this whole box's own *mount-time* entrance
  // (it flips true almost immediately, well before a slow network actually
  // finishes fetching the real photo), so on a slow connection the box itself
  // had already finished sliding/fading in against its own transparent/gray
  // background, then the photo would simply pop in the instant it decoded —
  // exactly the "パッと表示" this asks to avoid. `imageLoaded` tracks the
  // <img>'s own real `onLoad` instead, independent of `revealed`, so the
  // photo gets its own opacity fade in whenever it actually finishes loading,
  // whether that's immediate (already cached) or delayed.
  //
  // The effect below reads `.complete` rather than relying on `onLoad` alone,
  // which is load-bearing on a plain <img>: the browser starts fetching from
  // the server-rendered markup immediately, so on a reload (image already in
  // cache) the load finishes *before* React hydrates and attaches its own
  // onLoad handler — that event is then simply never seen, `imageLoaded`
  // stays false forever, and the photo sits at opacity-0 permanently. This
  // didn't happen while this was a next/image, which handles the
  // already-complete case internally. Same `.complete` check
  // mobile-home.tsx's own PreviewImage already uses for the same reason.
  const imgRef = useRef<HTMLImageElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  useEffect(() => {
    const el = imgRef.current;
    // Also resets the fade whenever `image` itself changes to a different
    // source, rather than staying true from the previous photo's own load.
    setImageLoaded(el?.complete === true && el.naturalWidth > 0);
  }, [image]);

  useEffect(() => {
    function measureStopScrollY() {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // documentTop — the KV's own absolute offset from the top of the
      // document, independent of current scroll position (this box scrolls
      // 1:1 with the page; only the photo *inside* it drifts).
      const documentTop = rect.top + window.scrollY;
      // The page-scrollY at which the KV's own remaining visible height on
      // screen (documentTop + rect.height - scrollY) equals exactly
      // STOP_AT_VIEWPORT_FRACTION of the viewport height.
      stopScrollYRef.current = documentTop + rect.height - window.innerHeight * STOP_AT_VIEWPORT_FRACTION;
    }
    measureStopScrollY();
    window.addEventListener("resize", measureStopScrollY);
    return () => window.removeEventListener("resize", measureStopScrollY);
  }, [aspect]);

  // useCallback — a fresh function reference every render would re-fire
  // lenis-react's own effect (and so this callback) on every render, not
  // just real scroll ticks — same reasoning as about-background.tsx's own
  // handleLenisScroll.
  const handleLenisScroll = useCallback((lenis: Lenis) => {
    const stopScrollY = stopScrollYRef.current;
    const ratio = stopScrollY > 0 ? Math.min(lenis.scroll / stopScrollY, 1) : 0;
    setParallaxY(ratio * PARALLAX_MAX_PX);
  }, []);
  useLenis(handleLenisScroll);

  return (
    <div
      ref={containerRef}
      // No background fill at all — not behind a real photo (where it would
      // show through a transparent PNG's own transparent areas and read as
      // opaque gray) and not as a stand-in while no photo is set yet, where
      // the box now simply renders empty instead of as a gray rectangle.
      // transition-all/translate-y/opacity — this box's own slide-in +
      // fade-in entrance, see `revealed`'s own doc comment above.
      className={`relative w-full overflow-hidden transition-all duration-500 ease-out ${
        revealed ? "translate-y-0 opacity-100" : "translate-y-[24px] opacity-0"
      }`}
      style={{
        aspectRatio: aspect * HERO_HEIGHT_SHRINK,
        ...(mask
          ? {
              maskImage: `url(${mask})`,
              WebkitMaskImage: `url(${mask})`,
              maskSize: "cover",
              WebkitMaskSize: "cover",
            }
          : {}),
      }}
    >
      {image && (
        <div
          className="absolute left-0 right-0"
          style={{
            top: fluid ? `calc(-${PARALLAX_OVERSCAN_PX / 2}px * var(--scale))` : `-${PARALLAX_OVERSCAN_PX / 2}px`,
            bottom: fluid ? `calc(-${PARALLAX_OVERSCAN_PX / 2}px * var(--scale))` : `-${PARALLAX_OVERSCAN_PX / 2}px`,
            transform: `translateY(${parallaxY}px)`,
          }}
        >
          {/* A plain <img>, not next/image. Every CMS URL is `http`-prefixed,
             so the previous `unoptimized={image.startsWith("http")}` meant
             next/image was bypassed for *all* real content anyway — it
             generated no srcset and simply passed the one fixed 2560px-wide
             URL straight through. Going to a plain <img> with microCMS's own
             responsive candidates gives the browser a real choice of sizes
             instead, at no build/serving cost (microCMS generates each width
             on demand). `absolute inset-0 h-full w-full` reproduces exactly
             what next/image's own `fill` was doing. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
          <img
            ref={imgRef}
            src={image}
            srcSet={imageSrcSet}
            sizes="100vw"
            alt={alt}
            onLoad={() => setImageLoaded(true)}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ease-out ${imageLoaded ? "opacity-100" : "opacity-0"}`}
          />
        </div>
      )}
    </div>
  );
}
