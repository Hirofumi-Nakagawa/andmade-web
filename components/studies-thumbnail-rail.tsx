"use client";

import { useEffect, useRef, useState } from "react";
import { mod, type Study } from "@/lib/studies";

/** How many slots to render on each side of the active one — comfortably
 *  more than however many thumbnails actually fit in the visible rail
 *  height, so nothing visibly pops in/out mid-viewport during a fast scroll. */
const RENDER_RADIUS = 10;
/** How far the inner content wrapper starts below its natural resting
 *  position on mount (see this file's own doc comment above on why this
 *  lives on an inner wrapper, not the outer clipping box). A moderate fixed
 *  distance rather than a full container height. */
const ENTRANCE_TRANSLATE_PX = 160;
type StudiesThumbnailRailProps = {
  /** Forwarded straight from studies-gallery.tsx's own `studies` prop. */
  studies: Study[];
  /** Continuous scroll position, in item-units — a plain integer while
   *  settled, fractional while scrolling/gliding (see studies-gallery.tsx,
   *  which now drives every frame of every motion — intro, raw scroll,
   *  momentum settle, and click-to-select — via requestAnimationFrame, so
   *  this component itself needs no CSS transition of its own; it always
   *  just renders whatever `position` currently is). Slot
   *  `Math.round(position)` is the one centered in the rail's own
   *  viewport. */
  position: number;
  /** Fires with a thumbnail's own absolute `slot` number when clicked — see
   *  studies-gallery.tsx's own handleThumbnailSelect, which glides that
   *  exact slot to center (per explicit request: "選択したサムネは中央まで
   *  スライド"). Deliberately the raw `slot`, not `mod(slot, N)` — the same
   *  underlying study can be rendered at several different slots at once
   *  (the loop wrapping around), and gliding to the *specific* one that was
   *  actually clicked (rather than always some canonical instance) keeps
   *  the motion short and in the direction the user would expect. */
  onSelect: (slot: number) => void;
};

/**
 * Left-edge vertical thumbnail rail (Figma node 934:312's own left column,
 * 82x110 items stacked with zero gap) — slides in real time with the user's
 * own scroll input, looping endlessly in either direction. Each thumbnail is
 * also clickable, gliding straight to center (see `onSelect` above).
 *
 * Each rendered item is keyed by its own absolute `slot` number
 * (Math.round(position) ± RENDER_RADIUS), not by its array position — so an
 * item that used to sit at (say) slot 42 keeps that same React key and DOM
 * node across re-renders, just recomputing its own `offset` (slot -
 * position) and therefore its own `translateY`.
 *
 * No per-thumbnail mount-time reveal animation on these individual items
 * anymore (an earlier version had a left-to-right `.studies-thumb-reveal`
 * wipe, removed per explicit request: "左からのマスクアニメーション無しに
 * して") — they just render plainly. Instead, the whole rail slides up into
 * place as one unit on mount (per explicit spec: "左サムネはページ下から
 * スライドして表示").
 *
 * That slide is deliberately split across *two* nested elements rather than
 * one: the OUTER div below (`overflow-hidden`, full page height, no
 * transform of its own, ever) stays exactly matching the real visible
 * viewport window at all times, so its permanent clipping of far-off-center
 * slots (the ones beyond RENDER_RADIUS's own visible cluster) always looks
 * identical to the settled state. The entrance's own `translateY` instead
 * lives on the INNER wrapper (holding the actual slots) one level down.
 *
 * An earlier version put the translateY directly on this same outer,
 * clipping div (100% of its own full-page height, i.e. slid from fully off
 * the bottom of the page up to its natural position). That produced exactly
 * the bug reported ("左サムネのスライドしてくるとき、サムネの列上のほうが
 * マスクで隠れちゃってるね"): because the clipping box and the sliding
 * content were one and the same rigid unit, the box's own clip edge swept
 * across the viewport *while* still translating, so at any mid-transition
 * moment only a partial, moving sliver of the column was ever inside both
 * "on-screen" and "inside the box's own bounds" at once — the top of the
 * column (which ends up settled near the top of the viewport) stayed
 * incompletely revealed until the very last moment, reading as if a mask
 * were still sweeping over it. Keeping the outer clip box static and
 * translating only the inner content avoids that entirely: the clip window
 * never moves, so it always shows exactly the same region it would when
 * settled, and the slots simply slide up into that fixed window like a
 * normal reveal — no edge-of-clip-box artifact possible. The distance is
 * also a moderate fixed amount now (ENTRANCE_TRANSLATE_PX below) rather than
 * a full page height, paired with an opacity fade for extra smoothness
 * (matching reveal-on-mount.tsx's own translate+fade combo elsewhere on this
 * page) — a full page height of travel was both unnecessarily far for what
 * reads as "sliding up from just below" and was what made the old bug's
 * mid-transition sliver so visually obvious in the first place.
 *
 * Item height is measured from a real rendered thumbnail (via ref) rather
 * than hardcoded, since it scales with `--scale` and that scale factor isn't
 * something plain JS can read out of a CSS calc() expression directly.
 */
export function StudiesThumbnailRail({ studies, position, onSelect }: StudiesThumbnailRailProps) {
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const [itemHeight, setItemHeight] = useState(0);
  const [entranceRevealed, setEntranceRevealed] = useState(false);

  useEffect(() => {
    function measure() {
      if (firstItemRef.current) setItemHeight(firstItemRef.current.getBoundingClientRect().height);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntranceRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Non-active thumbnails are a plain opacity fade (40%, down from an
  // earlier 50%) plus full grayscale — per explicit follow-up spec
  // ("選択中以外のサムネを透過40%のまま彩度を0にしてみて"). Briefly also had
  // `mix-blend-mode: multiply` layered on top, and the rail briefly had its
  // own solid background color — both removed per an even earlier follow-up
  // ("サムネ一覧の背景色は無しにして"): back to a transparent rail (the
  // Studies page's own background/noise shows through), now distinguishing
  // active from inactive via opacity *and* grayscale together.
  //
  // Each item's own `backgroundColor: study.color` (below, on the button
  // itself) is a *separate* thing from that rail-wide background — it sat
  // directly behind the 40%-opacity image, at full opacity, on every single
  // thumbnail permanently, which collectively read as exactly the same
  // "the list has a background color" complaint again, just per-item rather
  // than rail-wide — removed per direct follow-up ("左サムネの一覧背景色は
  // 無しで、非選択中サムネの透過を40%に"). With it gone, an inactive
  // thumbnail's own 40%-opacity image is the *only* thing painting there, so
  // the page's own background genuinely shows through at 60% strength,
  // rather than being masked by this solid full-opacity color underneath.

  // Per explicit spec ("左端のサムネは横長、正方形でも現状のサムネのサイズ
  // でトリミングして表示する"): each item below is a fixed 82x110 box
  // regardless of the underlying study's own `orientation` — unlike the
  // center display (studies-gallery.tsx/studies-center-image.tsx), which
  // resizes itself to match each study's real aspect ratio, this rail never
  // reads `orientation` at all. Each `<img>` below fills that fixed box via
  // `object-cover`, so a landscape or square photo is simply center-cropped
  // to fit rather than distorted or letterboxed — "trim to the current
  // thumbnail size" satisfied by that one CSS property, regardless of the
  // source photo's own real dimensions.

  const center = Math.round(position);
  const windowStart = center - RENDER_RADIUS;
  const slots = Array.from({ length: RENDER_RADIUS * 2 + 1 }, (_, i) => windowStart + i);

  return (
    <div className="absolute top-0 left-0 h-full w-[calc(82px*var(--grid-scale))] overflow-hidden">
      <div
        className="relative h-full w-full"
        style={{
          transform: entranceRevealed
            ? "translateY(0)"
            : `translateY(calc(${ENTRANCE_TRANSLATE_PX}px * var(--scale)))`,
          opacity: entranceRevealed ? 1 : 0,
          transitionProperty: "transform, opacity",
          transitionDuration: "700ms",
          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {slots.map((slot, i) => {
          const studyNumber = mod(slot, studies.length) + 1;
          const study = studies[studyNumber - 1];
          const offset = slot - position;
          const isActive = center === slot;
          return (
            <button
              key={slot}
              type="button"
              ref={i === 0 ? firstItemRef : undefined}
              onClick={() => onSelect(slot)}
              aria-label={`Study ${String(studyNumber).padStart(2, "0")}`}
              className="group absolute top-1/2 left-0 h-[calc(110px*var(--scale))] w-[calc(82px*var(--grid-scale))] cursor-pointer overflow-hidden"
              style={{ transform: `translateY(calc(${offset} * ${itemHeight}px - 50%))` }}
            >
              {/* Base image — opacity/grayscale moved here (off the button
                 itself) so the hover-reveal overlay below, a sibling rather
                 than a child of this dimmed layer, can stay full-color/full-
                 opacity regardless of this thumbnail's active state. */}
              <div
                className="absolute inset-0"
                style={{ opacity: isActive ? 1 : 0.4, filter: isActive ? "none" : "grayscale(1)" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- fixed-position box, fluidly sized via --scale/--grid-scale calc(), same reasoning as project-hover-preview.tsx's own plain <img>. */}
                <img src={study.imageSrc} alt="" className="h-full w-full object-cover" />
              </div>

              {/* Hover reveal — per explicit spec ("サムネホバーで、サムネ
                 中央からカラーのサムネがマスクアニメーションで表示される演
                 出をくわえて"): a full-color copy of the same image, clipped
                 down to a zero-size point at its own center at rest and
                 growing out to fill the thumbnail on hover — the same
                 "rectangle expanding from center" language as
                 .studies-mask-reveal/.studies-top-reveal elsewhere on this
                 page, but done as a plain, reversible CSS transition (via
                 Tailwind's `group`/`group-hover:`) rather than a one-shot
                 keyframe, since this needs to play forward on hover-in *and*
                 back on hover-out, not just once per mount. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 [clip-path:inset(50%)] transition-[clip-path] duration-300 ease-out group-hover:[clip-path:inset(0%)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- see the base image's own comment above. */}
                <img src={study.imageSrc} alt="" className="h-full w-full object-cover" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
