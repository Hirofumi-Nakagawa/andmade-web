"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getFooterReady, getFooterReadyServerSnapshot, subscribeFooterReady } from "@/lib/footer-mode-store";

/**
 * Overrides the real `<html>`/`<body>` background color for as long as this
 * is mounted, restoring whatever was there before on unmount — per direct
 * follow-up reporting the browser's own chrome (the translucent bottom
 * toolbar's backdrop on real iOS Safari, which shows through to whatever
 * color the document itself resolves to underneath it) reading as flat white
 * at the very bottom of app/about/page.tsx, instead of that page's own
 * `#DD82A3` ("Aboutページでフッターまでいったとき...ブラウザエリアの背景が
 * 白にならないようにページの背景色と同じピンクにしておいて").
 *
 * app/layout.tsx's own `<body>` only ever sets a single, site-wide
 * `bg-(--color-background)` (`#f6f4f0`, globals.css) — every page's own
 * *content* can freely paint a different color over that (app/about/page.tsx
 * already does, via its own root `#top` div's `bg-[#DD82A3]`), but the real
 * `<body>`/`<html>` background underneath is what iOS Safari's own chrome
 * (and the native rubber-band overscroll region past the true bottom/top of
 * the document) actually samples — a page-local div's own background color
 * never reaches that, regardless of how tall or opaque it is. No existing
 * mechanism in this codebase covers that gap (every other per-page
 * background override, e.g. app/contact/page.tsx's own `#000`, is scoped the
 * same page-local way and would show this identical seam if scrolled far
 * enough on a real device) — this is a small, page-mountable fix for
 * whichever page needs its own color to reach all the way out to the actual
 * document background, not a global rework of every page at once.
 *
 * Gated on `footerReady` by default (see below) — per direct follow-up
 * ("背景色無しにして、フッターまでいくと背景色をピンクにしてみて"): About
 * page's own real
 * `<body>`/`<html>` background was forced pink for the *entire* time the page
 * is mounted, which turned out to also be exactly what iOS Safari's status
 * bar / top safe area samples as its own fallback color while the page is
 * scrolled to rest at the very top — reading as a persistent pink margin
 * there no repositioning of AboutBackground's own photo could override (that
 * fallback-color mechanism only ever samples a flat document background
 * color, never live page content, in an ordinary Safari tab). Gating this
 * color behind the *same* footerReady signal MobileMenu's own `footerMode`
 * already reads (see lib/footer-mode-store.ts) restores this component to
 * only doing its originally-intended job — covering the real bottom-of-page
 * overscroll seam — while leaving the top of the page at whatever `<body>`'s
 * own site-wide default already is the rest of the time, matching Safari's
 * own top-of-page fallback default rather than fighting it.
 *
 * Defaults to reading `footerReady` off the same shared store MobileMenu's
 * own `footerMode` already subscribes to (lib/footer-mode-store.ts) rather
 * than always-on — an explicit `active` prop can still override this for any
 * future caller that genuinely wants the old always-on behavior instead.
 */
export function PageBodyBackground({ color, active }: { color: string; active?: boolean }) {
  const footerReady = useSyncExternalStore(subscribeFooterReady, getFooterReady, getFooterReadyServerSnapshot);
  const isActive = active ?? footerReady;

  useEffect(() => {
    if (!isActive) return;
    const { documentElement, body } = document;
    const previousHtmlColor = documentElement.style.backgroundColor;
    const previousBodyColor = body.style.backgroundColor;
    documentElement.style.backgroundColor = color;
    body.style.backgroundColor = color;
    return () => {
      documentElement.style.backgroundColor = previousHtmlColor;
      body.style.backgroundColor = previousBodyColor;
    };
  }, [color, isActive]);

  return null;
}
