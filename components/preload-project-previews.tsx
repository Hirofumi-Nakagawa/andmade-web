"use client";

import { useEffect } from "react";
import { PC_PREVIEW_SIZES, previewSrcSet, SP_PREVIEW_SIZES } from "@/lib/preview-image";
import { getProjectImageSrc, getProjectImageSrcSet, type Project } from "@/lib/projects";

/** The breakpoint the whole site splits its PC/SP trees on. */
const PC_MEDIA_QUERY = "(min-width: 1024px)";

/** How many previews are fetched at once. Sequential (1) leaves the tail of a
 *  long list still unwarmed by the time someone reaches it; wide-open
 *  parallel fetches would contend with the page's own first paint. Three is
 *  enough to get through ~25 projects well inside the intro's own runtime
 *  while never occupying more than a fraction of the connection. */
const CONCURRENCY = 3;

/**
 * Warms the browser cache with the top page's hover/scroll preview images
 * while the intro is still playing, so the first hover doesn't have to wait
 * on a network round trip.
 *
 * Per direct follow-up ("トップでホバー時にサムネが表示されるまで少し待つこ
 * とがあるので、イントロ時からイメージを読み込むようにしてほしい（pcのとき
 * はPCの画像だけ、SPの時はspの画像だけ読み込むようにする）").
 *
 * On the PC/SP split: the top page's previews aren't separate PC and SP
 * assets — each project has one image (Project.imageSrc) plus microCMS's
 * responsive candidates for it (Project.imageSrcSet). What differs by
 * platform is *which candidate* gets fetched, and how wide the box claims to
 * be. So rather than picking a width here, each preload is handed the exact
 * `srcset` and `sizes` the real <img> will use — PC_PREVIEW_SIZES for a
 * desktop viewport, SP_PREVIEW_SIZES below it, both through previewSrcSet
 * (lib/preview-image.ts, shared with those elements precisely so the two can
 * never disagree). The browser then runs its ordinary candidate selection
 * against the current viewport and DPR, so a desktop warms the desktop file,
 * a phone warms the phone one, neither downloads the other's, and what's
 * warmed is what actually gets requested later.
 *
 * Mounted once, above both the PC and SP trees, precisely so this can't run
 * twice: both trees render on every viewport (they're shown and hidden with
 * `lg:` classes, not conditionally mounted), so putting this inside either
 * one would warm both platforms' candidates on both platforms.
 *
 * Deliberately quiet about failures and deliberately low-priority: nothing
 * here affects what renders, so a preload that 404s or is dropped by the
 * browser under memory pressure just means the old behaviour — the image
 * loads on demand — for that one project.
 */
export function PreloadProjectPreviews({ projects }: { projects: Project[] }) {
  useEffect(() => {
    if (projects.length === 0) return;

    // Respect an explicit "don't spend my data" signal — this is speculative
    // traffic for something the visitor may never hover.
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    if (connection?.saveData) return;

    // Matched once, not per image: the viewport can only be on one side of
    // the breakpoint at a time, and warming the wrong platform's candidate is
    // exactly what this is supposed to avoid. A resize across the breakpoint
    // mid-warm just means the remainder is fetched for the new one.
    const sizes = window.matchMedia(PC_MEDIA_QUERY).matches ? PC_PREVIEW_SIZES : SP_PREVIEW_SIZES;

    const sources = projects.map((project) => ({
      src: getProjectImageSrc(project),
      srcSet: previewSrcSet(getProjectImageSrcSet(project)),
    }));

    let cancelled = false;
    let next = 0;
    const pending = new Set<HTMLImageElement>();

    function startNext() {
      if (cancelled || next >= sources.length) return;
      const { src, srcSet } = sources[next];
      next += 1;

      const image = new Image();
      pending.add(image);
      // Nothing on screen is waiting for these, so they should always yield
      // to the real page.
      image.fetchPriority = "low";
      // sizes/srcset before src: the candidate is chosen when `src` is
      // assigned, so setting them afterwards would pick against an empty
      // `sizes` (and so against the fallback width) instead.
      image.sizes = sizes;
      if (srcSet) image.srcset = srcSet;
      image.src = src;

      const done = () => {
        pending.delete(image);
        startNext();
      };
      image.addEventListener("load", done, { once: true });
      image.addEventListener("error", done, { once: true });
    }

    // Starts after the browser has finished the work it already had queued,
    // so the intro's own first frames are never competing with this.
    const idle = window.requestIdleCallback?.bind(window) ?? ((cb: () => void) => window.setTimeout(cb, 300));
    const handle = idle(() => {
      for (let i = 0; i < CONCURRENCY; i += 1) startNext();
    });

    return () => {
      cancelled = true;
      if (window.cancelIdleCallback && typeof handle === "number") window.cancelIdleCallback(handle);
      // Dropping `src` aborts anything still in flight, so navigating away
      // mid-warm doesn't keep the connection busy for a page nobody is on.
      for (const image of pending) image.src = "";
      pending.clear();
    };
  }, [projects]);

  return null;
}
