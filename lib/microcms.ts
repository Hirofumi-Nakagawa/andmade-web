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
