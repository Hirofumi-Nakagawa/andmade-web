import { createClient } from "microcms-js-sdk";

/**
 * Returns a configured microCMS client, or `null` if MICROCMS_SERVICE_DOMAIN/
 * MICROCMS_API_KEY aren't set yet (see .env.local.example) — callers should
 * treat a `null` return the same as "this content type is empty," never
 * throw. An earlier version threw immediately at *import* time if either was
 * missing, which meant simply importing this module anywhere — regardless of
 * whether the code path that actually needed it ran — would crash the whole
 * app/build until both were configured. That was harmless only because
 * nothing imported this module at all yet; the moment a real feature (e.g.
 * lib/news.ts, wired to a future microCMS "news" endpoint) needs to import
 * it, that throw-on-import behavior would break the entire site for every
 * visitor, not just leave that one feature gracefully empty. Mirrors
 * lib/spotify.ts's own getNowPlaying() convention (return a safe fallback,
 * never throw, when a third-party integration isn't configured).
 */
export function getMicrocmsClient() {
  const serviceDomain = process.env.MICROCMS_SERVICE_DOMAIN;
  const apiKey = process.env.MICROCMS_API_KEY;
  if (!serviceDomain || !apiKey) return null;
  return createClient({ serviceDomain, apiKey });
}

/**
 * Appends microCMS's own image API query params (imgix-based) to a real
 * microCMS asset URL: microCMS serves the exact original
 * upload byte-for-byte unless these query params are added, so a
 * full-resolution JPEG/PNG straight out of the CMS would otherwise ship to
 * every visitor regardless of how small its actual on-page box is.
 *
 * `fm=webp` alone typically shaves 25-35% off a same-quality JPEG and far
 * more off a PNG; pairing it with `w`/`h`/`q` matters more for actual
 * savings, since it also stops shipping resolution nobody's box ever
 * displays.
 *
 * `w`+`h`+`fit=max` together (rather than `w` alone): imgix's `w` param
 * constrains *only* the width, so a portrait photo with just `w` set would
 * still ship at whatever height that implies. `fit=max` instead fits the
 * image within the `maxWidth`×`maxHeight` box, aspect ratio preserved, and
 * never upscales an image that's already smaller than that box on either
 * dimension. `maxWidth`/`maxHeight` default to 2560×1920 and `quality` to 80.
 *
 * Only ever called on real CMS-sourced URLs (content.image?.url) — never on
 * the bundled /public/images/... placeholder samples, which aren't served
 * through microCMS's own image pipeline at all and would 404 with these
 * params appended.
 */
export function microcmsImageUrl(url: string, maxWidth = 2560, maxHeight = 1920, quality = 80): string {
  const separator = url.includes("?") ? "&" : "?";
  const params = new URLSearchParams({
    fm: "webp",
    fit: "max",
    w: String(maxWidth),
    h: String(maxHeight),
    q: String(quality),
  });
  return `${url}${separator}${params.toString()}`;
}

/** Widths (px) offered in microcmsImageSrcSet() below. Spans the real range
 *  an image is ever displayed at across this site: ~400 covers an SP box at
 *  DPR 1, 1280/1920 the common SP-at-DPR-3 and PC cases, 2560 the same cap
 *  microcmsImageUrl() defaults to (a large monitor at DPR 2). `fit=max`
 *  never upscales, so a candidate wider than the original simply resolves to
 *  the original's own size — harmless, just a duplicate entry the browser
 *  picks between on file size. */
const SRCSET_WIDTHS = [400, 800, 1280, 1920, 2560];

/**
 * Builds a `srcset` string of the same image at several widths, so the
 * browser downloads the one that actually fits the box it's rendering into
 * rather than one fixed, largest-case size.
 *
 * Nothing is re-uploaded or re-exported to make this work: microCMS's image
 * API generates each width on demand from the one original upload (same
 * mechanism microcmsImageUrl() above already relies on) and caches it at
 * their CDN.
 *
 * This matters most on SP, where a full-width zoomed image is ~400 CSS px —
 * roughly 1200 device px at DPR 3 — while the plain microcmsImageUrl()
 * default ships up to 2560px wide. Beyond the download itself, the oversized
 * version has to be decoded and then resampled down on every frame of an
 * animation that resizes its box, which is exactly what the Studies zoom
 * does.
 *
 * Pair with a `sizes` attribute describing the box's real CSS width at each
 * breakpoint — without one, the browser assumes `100vw` and will happily
 * pick a far larger candidate than needed.
 *
 * Same "CMS URLs only" caveat as microcmsImageUrl() above.
 */
export function microcmsImageSrcSet(url: string, quality = 80): string {
  return SRCSET_WIDTHS.map((width) => {
    const separator = url.includes("?") ? "&" : "?";
    const params = new URLSearchParams({
      fm: "webp",
      fit: "max",
      w: String(width),
      q: String(quality),
    });
    return `${url}${separator}${params.toString()} ${width}w`;
  }).join(", ");
}

/**
 * Drops every candidate wider than `maxWidth` from a srcset built above.
 *
 * This is a deliberate cap on effective device-pixel-ratio for large,
 * decorative imagery — not a `sizes` correction. The two do different jobs:
 * `sizes` tells the browser how wide the box is, and the browser then
 * multiplies by the screen's DPR. On a DPR-2 display an 80vw box at a 1440px
 * viewport asks for ~2330 device pixels and so picks the 2560 candidate, no
 * matter how honest `sizes` is. Capping the list is the only way to say "this
 * one is allowed to render below 2x".
 *
 * Worth it specifically for the top page's hover/scroll previews: they're
 * photographs shown behind and around text, they change on every hover, and
 * they're now prefetched for every project up front
 * (components/preload-project-previews.tsx) — 25 of them at 2560 measured
 * 7.3MB. At the 1920 cap the same set is a little over half that, for a box
 * rendering at roughly 0.8x device pixels on a retina screen.
 *
 * Not applied to the detail pages' own hero/gallery images, which are the
 * actual work being presented and stay at full 2x.
 */
export function limitSrcSetWidth(srcSet: string | undefined, maxWidth: number): string | undefined {
  if (!srcSet) return srcSet;
  const kept = srcSet
    .split(",")
    .map((candidate) => candidate.trim())
    .filter((candidate) => {
      const descriptor = candidate.match(/(\d+)w$/);
      // A candidate with no width descriptor isn't something this can reason
      // about, so it's kept rather than silently dropped.
      return !descriptor || Number(descriptor[1]) <= maxWidth;
    });
  // Never return an empty srcset — that would leave the browser with `src`
  // alone, which is the full-size URL and the opposite of the intent.
  return kept.length > 0 ? kept.join(", ") : srcSet;
}
