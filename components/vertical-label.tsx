"use client";

import { useLayoutEffect, useRef, useState } from "react";

type VerticalLabelProps = {
  children: React.ReactNode;
  className?: string;
};

/**
 * Rotates its content 90° in place — extracted from mobile-home.tsx (see
 * that file's own git history for the original follow-ups this technique was
 * built against: "tx-thと33casesをそれぞれ180°回転させて" / "tx-th 33が
 * まだグリッドに沿ってない") so idle-overlay.tsx's own SP variant (Figma
 * node 1100:384) can reuse the exact same rotation geometry for its own
 * rotated tagline/date/logo/pills column, rather than re-deriving it.
 *
 * Sized via the pre-rotation content's own *measured* natural size (width/
 * height swapped), not a guessed flat box. Positioned via
 * `transform-origin: top left` + `translateX(measuredHeight)`: rotating
 * around the content's own top-left corner (a fixed, unambiguous anchor —
 * that corner doesn't move under rotation around itself) and then
 * translating the whole rotated result by its own measured height is a
 * direct, deterministic placement — the rotated content's own left edge
 * lands exactly on the wrapper's left edge, with no separate centering step
 * whose precision this would otherwise depend on.
 *
 * The ResizeObserver callback defers its own `setSize` to the next animation
 * frame (`requestAnimationFrame`) rather than calling it synchronously —
 * several of these can be mounted at once (mobile-home.tsx's own Tx/Th/
 * "33 Cases", now also idle-overlay.tsx's SP content), and calling setState
 * synchronously from inside a ResizeObserver callback is exactly what trips
 * the browser's own "ResizeObserver loop completed with undelivered
 * notifications" error when several fire in the same frame. Deferring the
 * state update by one frame breaks that synchronous loop.
 */
export function VerticalLabel({ children, className = "" }: VerticalLabelProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    let frame: number | null = null;
    function update() {
      if (!el) return;
      setSize({ width: el.offsetWidth, height: el.offsetHeight });
    }
    update();
    const observer = new ResizeObserver(() => {
      if (frame != null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    });
    observer.observe(el);
    return () => {
      if (frame != null) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [children]);

  return (
    <div
      className={`relative flex-none ${className}`}
      style={{
        // Swapped — see this component's own doc comment above.
        width: size ? size.height : undefined,
        height: size ? size.width : undefined,
        visibility: size ? "visible" : "hidden",
        // -1.5px — a direct live-DevTools measurement (real Chrome, real
        // 400px viewport) on mobile-home.tsx's own Tx/Th/"33 Cases" found
        // them consistently landing 1.5px right of the true grid margin with
        // this component's plain offsetWidth/offsetHeight measurement below
        // — a small residual from text-box-trim visually cropping the inner
        // span's glyph without fully shrinking this wrapper *div*'s own
        // layout box to match. A flat, empirically-measured correction here
        // is more stable than trying to compute it more "principledly" (see
        // mobile-home.tsx's own doc comment on the alternatives already
        // tried and rejected there).
        transform: "translateX(-1.5px)",
      }}
    >
      <div
        ref={contentRef}
        className="absolute top-0 left-0 flex-none whitespace-nowrap"
        style={{
          transformOrigin: "top left",
          // translateX listed *before* rotate — CSS applies the rightmost
          // function first, so this rotates around the top-left origin
          // first, then shifts the already-rotated result rightward by its
          // own pre-rotation height in the final (screen) coordinate space.
          // See this component's own doc comment above for the full
          // geometry.
          transform: size ? `translateX(${size.height}px) rotate(90deg)` : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
