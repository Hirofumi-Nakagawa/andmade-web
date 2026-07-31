"use client";

import { useEffect } from "react";
import { withBasePath } from "@/lib/base-path";

/** Served from public/ (not app/favicon.ico's own Next.js-managed static
 *  route) since this needs a plain URL this component can swap a <link>'s
 *  href to at runtime — Next's file-convention favicon is baked into the
 *  build as the *default* icon link, not something JS can pick "the other
 *  one" from. withBasePath() for exactly that reason too: a raw href string
 *  is not something Next rewrites (see lib/base-path.ts). */
const INACTIVE_FAVICON_HREF = withBasePath("/favicon-inactive-3.ico");

/**
 * Swaps every <link rel="icon"> to a distinct alternate icon while this tab
 * is in the background, restoring the original(s) the moment it's active
 * again — per direct follow-up ("別タブを見ているとき、faviconを変更するこ
 * とって可能？" → "別の画像に差し替え"). Same technique Gmail/Slack use for
 * their own unread-badge favicon swap.
 *
 * Reads each matching <link>'s *current* href on the very first swap (not a
 * hardcoded "/favicon.ico" guess) and restores exactly that, so this doesn't
 * assume anything about how many icon links Next.js's own app/favicon.ico
 * convention happens to render or at what sizes.
 *
 * Mounted once in the root layout — same "no visual output, just a global
 * side effect" pattern as DisablePinchZoom/LenisRouteResize.
 */
export function TabFaviconSwap() {
  useEffect(() => {
    const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
    if (links.length === 0) return;
    const originalHrefs = links.map((link) => link.href);

    function applyHref(href: string) {
      links.forEach((link) => {
        link.href = href;
      });
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        applyHref(INACTIVE_FAVICON_HREF);
      } else {
        links.forEach((link, i) => {
          link.href = originalHrefs[i];
        });
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      // Restores on unmount too, in case this ever stops being mounted while
      // the tab happens to be backgrounded.
      links.forEach((link, i) => {
        link.href = originalHrefs[i];
      });
    };
  }, []);

  return null;
}
