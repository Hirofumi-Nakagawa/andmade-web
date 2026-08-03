/**
 * Site-wide constants shared across every metadata-related file
 * (app/layout.tsx, app/robots.ts, app/sitemap.ts, and the Organization JSON-LD
 * rendered from app/layout.tsx) — centralized here (unlike most of this
 * codebase's usual "duplicate a small constant per file with its own doc
 * comment" convention) specifically because a *production domain* has to
 * stay byte-for-byte identical everywhere it's used: robots.ts/sitemap.ts
 * both need to emit URLs that exactly match what layout.tsx's own
 * `metadataBase` resolves relative paths against, and any drift between
 * copies would silently produce mismatched/incorrect URLs rather than a
 * loud, obvious error.
 */

/** Real production domain — no trailing slash, so every consumer below can
 *  safely append its own leading "/" without producing a doubled "//". */
export const SITE_URL = "https://andmade.jp";

export const SITE_NAME = "ANDMADE Inc.";

export const SITE_DESCRIPTION =
  "ANDMADE Inc.は、クライアントと共にモノづくりをする共創のスタンスで、ウェブ、CI・VI、ビジュアルに関わるグラフィックまで、包括的にアートディレクションとデザインを行っているデザインスタジオです。";

/** components/mobile-menu.tsx's own Social links — reused here rather than a
 *  second independent copy of the same handle. */
export const TWITTER_HANDLE = "@ANDMADE_jp";
export const INSTAGRAM_URL = "https://www.instagram.com/andmade_inc";
export const X_URL = "https://x.com/ANDMADE_jp";

/** Every real, indexable route on this site — the single source of truth
 *  for app/sitemap.ts below. app/not-found.tsx (the 404 catch-all) is
 *  deliberately excluded: it isn't a real route to link to or index.
 *
 *  末尾スラッシュ付き — next.config.ts の `trailingSlash: true` に合わせる
 *  （実際に配信されるURLが /about/ なので、sitemap がスラッシュ無しだと
 *  クローラが毎回301を踏むことになる）。各ページの alternates.canonical も
 *  同じ形に揃えてある。 */
export const SITE_ROUTES = ["/", "/about/", "/contact/", "/studies/"] as const;
