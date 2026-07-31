import { limitSrcSetWidth } from "@/lib/microcms";

/**
 * Shared sizing rules for the top page's project preview images — the PC
 * hover preview (components/project-hover-preview.tsx), the SP scroll
 * preview (components/mobile-home.tsx) and the prefetch that warms both
 * (components/preload-project-previews.tsx).
 *
 * These live together in one module on purpose. The prefetch only produces a
 * cache hit if it resolves to the *same* candidate the real <img> later asks
 * for, and candidate selection depends on both `sizes` and the srcset's
 * contents. Three copies of these numbers would be three chances for the
 * prefetch to quietly start downloading a second file nobody displays.
 */

/** Widest the PC hover preview can ever be, as a share of the viewport.
 *
 *  Derived, not guessed: home-view.tsx places it on a 24-column grid whose
 *  column width scales with the viewport, and allows at most
 *  `GRID_COLUMN_COUNT - PREVIEW_START_COLUMN` = 20 columns of 58px at
 *  --grid-scale. 20 x 58 / 1440 = 80.6% of the viewport, and because the grid
 *  scales proportionally that ratio holds at every PC width (verified by
 *  computing it at 1024/1280/1440/1680/1920/2560 — 80.6vw throughout).
 *  Rounded up by a fraction for safety. */
export const PC_PREVIEW_SIZES = "81vw";

/** Same for the SP preview: at most 11 of 12 fluid columns plus one 8px
 *  margin (mobile-home.tsx's own placementOptions), which works out to
 *  ~90.1vw across the usual phone widths (375-430). */
export const SP_PREVIEW_SIZES = "91vw";

/** Effective-resolution cap for previews — see limitSrcSetWidth's own doc
 *  comment for why a `sizes` value alone can't achieve this, and for the
 *  quality trade-off being accepted. */
const PREVIEW_MAX_SRCSET_WIDTH = 1920;

/** The srcset a preview should use: the project's own candidates minus the
 *  ones past the cap. */
export function previewSrcSet(srcSet: string | undefined): string | undefined {
  return limitSrcSetWidth(srcSet, PREVIEW_MAX_SRCSET_WIDTH);
}
