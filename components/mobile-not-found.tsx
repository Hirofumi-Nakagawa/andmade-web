import Link from "next/link";
import { ScrambleText } from "@/components/scramble-text";

/** Grid column 3 (margin + 2 columns) — same "margin + N columns" idiom used
 *  by scenic-map-background.tsx's own MobileScenicReadouts, which this
 *  page's own "404"/"Not Found" block shares a left edge with (Figma node
 *  1195:278: both sit at left:72px against its 400px reference canvas,
 *  8px margin + 2*32px columns = 72). Also shared by "ANDMADE Inc." below —
 *  per direct follow-up ("ANDMADE Inc.の左面を404などに合わせて"): an
 *  earlier version gave the header its own separate HEADER_LEFT (2 columns,
 *  no extra margin — matching mobile-home.tsx's own CONTENT_INDENT
 *  convention instead), which left it sitting 1 SP grid margin to the left
 *  of "404"/"Not Found"/"Sorry..." below it rather than flush with them. */
const TEXT_LEFT = "calc(var(--sp-grid-column-width) * 2 + var(--sp-grid-margin))";

/** Shared gap between every one of these three lines — "404"→"Not Found"
 *  and "Not Found"→"Sorry, an error has occured." both use this same value,
 *  per direct follow-up ("この3行の行間（マージン）が全て同じになるように
 *  調整して"), later refined to specifically use the "404"→"Not Found" gap
 *  as the reference ("「404」と「Not found」の間の行間を基準にして、「Not
 *  found」と「Sorry,〜」の間の行間もそれに揃えて") — both now literally the
 *  same flex `gap` (see the JSX below), not two independently-computed
 *  values, so they can't drift apart again. */
const LINE_GAP_PX = 12;
/** "404"/"Not Found"/"Sorry, an error has occured." block's own top offset —
 *  Figma's own position for the first line. All three now sit inside one
 *  flex column (see the JSX below), so this is the *only* manually-tracked
 *  vertical offset left; every gap between them is the real, browser-
 *  computed flex `gap`, not a hand-derived pixel sum.
 *
 *  An earlier version positioned "Sorry, an error has occured." separately,
 *  via a hand-computed `SORRY_TOP_PX = NOT_FOUND_TOP_PX +
 *  (16 + LINE_GAP_PX + 16) + LINE_GAP_PX` — assuming each line's own
 *  rendered height equals its 16px line-height. That assumption was wrong:
 *  `text-box-trim` shrinks each line's *actual* box down to the font's own
 *  cap-height-to-baseline distance (measured at ~11.3px here, well under
 *  16px), which the flex `gap` above already accounts for correctly (it
 *  measures real rendered boxes), but the hand-derived SORRY_TOP_PX did not
 *  — overshooting by exactly 2×(16 − 11.3) ≈ 9.4px and reproducing the same
 *  "the two gaps don't match" symptom this whole adjustment was meant to
 *  fix, confirmed by measuring the real rendered gaps directly (12px vs.
 *  ~21.4px) after an earlier, insufficient fix attempt here (matching this
 *  line's own `leading` to the other two — necessary for other reasons, but
 *  not what was actually causing the mismatch). Folding "Sorry..." into the
 *  same flex column removes the need for that arithmetic (and the class of
 *  bug it produced) entirely. */
const NOT_FOUND_TOP_PX = 201;

/**
 * SP counterpart of app/not-found.tsx (Figma node 1195:278, "sp_404") —
 * rendered as a sibling of that page's own PC-only tree (see that file's
 * `hidden lg:contents` wrapper), sharing the same root `h-screen` container
 * and ScenicMapBackground/dark-overlay layers rather than duplicating them
 * (ScenicMapBackground already splits its own bottom-of-screen readouts
 * into PC/SP variants internally — see that component's own
 * MobileScenicReadouts). This component only supplies the page-specific
 * text: the "ANDMADE Inc." header link, "404"/"Not Found", and "Sorry, an
 * error has occured." — no "Back to Home" link here, unlike PC: Figma's own
 * SP mockup has no such link, relying instead on the sitewide "MENU" pill
 * (components/mobile-menu.tsx), which is already mounted globally
 * (app/layout.tsx) and needs no per-page wiring here.
 *
 * No idle-fade here either (unlike PC's own 10s-mousemove-triggered fade) —
 * that behavior is inherently mouse-driven (a real, continuous `mousemove`
 * stream a desktop pointer produces just by sitting still with the cursor
 * over the page), which a touch device has no equivalent of; no other
 * Mobile* component in this codebase has an analogous idle-hide mechanic
 * either, so this stays simple and always-visible instead of inventing a
 * touch-specific idle heuristic Figma's own mockup gives no guidance for.
 *
 * Positions below are literal fixed-px offsets (matching Figma's own SP
 * export against its 668px reference canvas) rather than PC's
 * --scale/--grid-scale fluid system — consistent with every other Mobile*
 * component in this codebase, which use fixed unscaled pixel values for
 * vertical spacing throughout.
 */
/** PC側（not-found-view.tsx）と同文言の複製 — このコードベースの Mobile*
 *  コンポーネントのコピー複製規約どおり import はしない。タイミングだけは
 *  親の sorrySwapped prop で共有（PC/SP は CSS 分岐で同時マウントのため、
 *  タイマーを二重に持たない）。 */
const SORRY_TEXT = "Sorry, an error has occured.";
const SORRY_SWAP_TEXT = "But maybe you weren't looking for this.";

export function MobileNotFound({ sorrySwapped = false }: { sorrySwapped?: boolean }) {
  return (
    <div className="contents lg:hidden">
      <Link
        href="/"
        className="absolute block text-[15px] leading-[1.5] font-medium whitespace-nowrap text-white [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
        style={{ top: "50px", left: TEXT_LEFT }}
      >
        ANDMADE Inc.
      </Link>

      <div
        className="absolute flex flex-col items-start whitespace-nowrap text-[16px] leading-[16px] font-medium text-white tracking-[-0.36px]"
        style={{ top: NOT_FOUND_TOP_PX, left: TEXT_LEFT, gap: LINE_GAP_PX }}
      >
        <p className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
          <ScrambleText text="404" active />
        </p>
        <p className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
          <ScrambleText text="Not Found" active />
        </p>
        {/* Figma's own copy, kept verbatim ("occured", not "occurred") —
           same text PC's version uses. A third child of this same flex
           column (an earlier version positioned this separately via a
           hand-computed `top`, see NOT_FOUND_TOP_PX's own doc comment above
           for why that produced a visibly larger gap than the flex `gap`
           above the other two lines already gets right) — left-aligned with
           "404"/"Not Found" for the same reason those are (TEXT_LEFT, not
           the horizontally-centered translate-x-[-50%] Figma's own export
           literally gave), per direct follow-up ("404のSPの「Sorry, an
           error has occured.」の左面は404 Not foundと揃えて"). */}
        <p
          className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
          style={{ fontFeatureSettings: '"palt" 1' }}
        >
          <ScrambleText key={sorrySwapped ? "swap" : "sorry"} text={sorrySwapped ? SORRY_SWAP_TEXT : SORRY_TEXT} active />
        </p>
      </div>
    </div>
  );
}
