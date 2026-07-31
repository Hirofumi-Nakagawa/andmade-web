"use client";

import { useEffect, useState } from "react";
import { mod, type Study } from "@/lib/studies";

/** How many slots to render on each side of the active one — same reasoning
 *  as studies-thumbnail-rail.tsx's own RENDER_RADIUS (comfortably more than
 *  whatever fits on screen, so nothing pops in/out mid-viewport). */
const RENDER_RADIUS = 10;
/** How many thumbnails should exactly fill the rail's own full viewport
 *  height, on any device — per direct follow-up ("左サムネの数は8件がぴった
 *  り収まるようにして"), replacing an earlier version that divided by the
 *  studies array's own length (10) instead. Deliberately its own constant
 *  rather than reusing that length directly — this is a purely visual "how many rows
 *  fit on screen" spec, independent of however many real studies end up in
 *  that array (today 10, but per lib/studies.ts's own CMS-readiness note,
 *  that count is meant to grow once a real Studies CMS endpoint exists). */
const VISIBLE_ITEM_COUNT = 8;
/** Item box width — per explicit spec ("左のサムネの横幅は1マス+余白（8px）"),
 *  exactly 1 SP grid column plus the grid's own outer margin (40px at the
 *  400px Figma reference canvas, node 1070:928's own "Frame 122") — kept as
 *  the live grid formula (not a literal 40px) so it stays correct as the
 *  viewport narrows/widens, same as every other `--sp-grid-column-width`
 *  consumer in this codebase. Height is *not* a fixed constant (see
 *  FALLBACK_ITEM_HEIGHT_PX and the live `itemHeightPx` state below) — per
 *  direct follow-up ("サムネの高さは、どんな高さの端末でもサムネが[N]件並
 *  ぶようにサムネの高さが可変するように調整して"), each item's real height
 *  is computed from the viewport's own height so exactly VISIBLE_ITEM_COUNT
 *  items fill it vertically on any device, rather than a literal px value
 *  that only happened to fit some particular screen height. */
const ITEM_WIDTH = "calc(var(--sp-grid-column-width) + var(--sp-grid-margin))";
/** First-paint/SSR fallback only — real height is recomputed from
 *  `window.innerHeight` the moment this mounts (see the `itemHeightPx` state
 *  below), same "start with a plausible constant, correct it in an effect
 *  once real viewport info exists" convention as mobile-studies.tsx's own
 *  zoomedSizePx. */
const FALLBACK_ITEM_HEIGHT_PX = 80;
/** Entrance slide-in distance (px) — mirrors studies-thumbnail-rail.tsx's own
 *  ENTRANCE_TRANSLATE_PX/opacity-fade combo (per "動きや演出はPCと同じ"),
 *  just without the --scale multiplier for the same reason as above. */
const ENTRANCE_TRANSLATE_PX = 120;

type MobileStudiesThumbnailRailProps = {
  /** Forwarded straight from mobile-studies.tsx's own `studies` prop. */
  studies: Study[];
  /** Continuous scroll position, in item-units — see mobile-studies.tsx's
   *  own swipe/glide state, which drives every frame of motion (intro, live
   *  drag, settle-glide, auto-advance) the same way studies-gallery.tsx's
   *  `position` does for PC. */
  position: number;
  /** Fires with a thumbnail's own absolute `slot` number when tapped — see
   *  studies-thumbnail-rail.tsx's own `onSelect` doc comment for why this is
   *  the raw `slot`, not `mod(slot, N)`. */
  onSelect: (slot: number) => void;
};

/**
 * Left-edge vertical thumbnail rail, SP counterpart of
 * components/studies-thumbnail-rail.tsx (Figma node 1070:928's own "Frame
 * 122") — same real-time-follows-`position`, endlessly-looping rendering
 * technique, resized to this page's own 40px-wide/viewport-driven-height SP
 * thumbnail spec and with no hover-reveal mask (a touch device has no hover
 * state to trigger it; PC's own `.group-hover:` treatment simply has nothing
 * to key off here).
 */
// This rail's own solid `backgroundColor: "#F6F6F4"` (previously on the outer
// clipping div below) removed per direct follow-up ("左サムネの一覧背景色
// は無しで、非選択中サムネの透過を40%に"), matching PC's own already-
// transparent rail (studies-thumbnail-rail.tsx) — the Studies page's own
// background/noise shows through directly now. Each item's own 40%-opacity
// (isActive ? 1 : 0.4 below) already matched the "非選択中サムネの透過を
// 40%に" half of that same request, so nothing else needed changing there.
export function MobileStudiesThumbnailRail({ studies, position, onSelect }: MobileStudiesThumbnailRailProps) {
  const [entranceRevealed, setEntranceRevealed] = useState(false);
  // Real per-item height, in px — `window.innerHeight / VISIBLE_ITEM_COUNT`
  // so exactly VISIBLE_ITEM_COUNT items always fill the rail's own
  // full-height column regardless of the device's real viewport height, per
  // direct follow-up ("左サムネの数は8件がぴったり収まるようにして").
  // Starts at FALLBACK_ITEM_HEIGHT_PX (matching server-rendered HTML) and is
  // corrected the moment this mounts client-side, same "start with a
  // plausible constant, correct once real viewport info exists" convention
  // as mobile-studies.tsx's own zoomedSizePx/useLayoutEffect pairing.
  const [itemHeightPx, setItemHeightPx] = useState(FALLBACK_ITEM_HEIGHT_PX);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntranceRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function recompute() {
      setItemHeightPx(window.innerHeight / VISIBLE_ITEM_COUNT);
    }
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, []);

  const center = Math.round(position);
  const windowStart = center - RENDER_RADIUS;
  const slots = Array.from({ length: RENDER_RADIUS * 2 + 1 }, (_, i) => windowStart + i);

  return (
    <div className="absolute top-0 left-0 h-full overflow-hidden" style={{ width: ITEM_WIDTH }}>
      <div
        className="relative h-full w-full"
        style={{
          transform: entranceRevealed ? "translateY(0)" : `translateY(${ENTRANCE_TRANSLATE_PX}px)`,
          opacity: entranceRevealed ? 1 : 0,
          transitionProperty: "transform, opacity",
          transitionDuration: "700ms",
          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {slots.map((slot) => {
          const studyNumber = mod(slot, studies.length) + 1;
          const study = studies[studyNumber - 1];
          const offset = slot - position;
          const isActive = center === slot;
          return (
            <button
              key={slot}
              type="button"
              onClick={() => onSelect(slot)}
              aria-label={`Study ${String(studyNumber).padStart(2, "0")}`}
              className="absolute top-1/2 left-0 cursor-pointer overflow-hidden"
              style={{
                width: ITEM_WIDTH,
                height: itemHeightPx,
                transform: `translateY(calc(${offset} * ${itemHeightPx}px - 50%))`,
              }}
            >
              <div
                className="absolute inset-0"
                style={{ opacity: isActive ? 1 : 0.4, filter: isActive ? "none" : "grayscale(1)" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size box, same reasoning as studies-thumbnail-rail.tsx's own plain <img>. */}
                <img
                  src={study.imageSrc}
                  srcSet={study.imageSrcSet}
                  // One SP grid column plus a margin (see ITEM_WIDTH) — well
                  // under 100px on any phone, so this keeps the browser from
                  // assuming the `100vw` default for a thumbnail this small.
                  sizes="60px"
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
