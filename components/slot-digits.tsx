"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Ease-out curve reused site-wide for this kind of "settle" motion (see
 *  e.g. site-intro.tsx's own TAGLINE_EASE). */
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

type SlotDigitProps = {
  /** 0-9 — the digit this one column should currently show. */
  digit: number;
  /** Extra full 0→9 revolutions added on top of the minimal forward
   *  distance needed to reach `digit`, purely for flourish. */
  extraSpins: number;
  durationMs: number;
  /** Pixel height of the clipping window and every stacked row — see
   *  SlotDigits' own comment for how this is measured. */
  itemHeightPx: number;
};

/**
 * A single odometer/slot-machine digit column — an `overflow-hidden` window
 * exactly one item tall, over a vertical strip of stacked digits that
 * slides up past it. Used by SlotDigits below, one instance per digit
 * position.
 *
 * `text-box-trim` only crops a box's own *auto*-computed leading — forcing
 * an explicit height on the trimmed glyph itself would defeat that (the box
 * can no longer shrink to the cap-height→baseline extent trim asks for, so
 * the glyph keeps rendering at its plain, untrimmed line-height position
 * instead, which is what caused this to visibly sit off from the
 * "10"/"Cases" text it needs to match: "左の01の縦位置がズレてる", "下面が
 * ズレてる"). So each row does NOT force a height on the trimmed glyph
 * directly — it's a `flex`, `items-end`-aligned box: the *row* (and the
 * window) get a forced, uniform `itemHeightPx` (for driftless stacking —
 * every stacked row is identical, so N of them is always exactly `N *
 * itemHeightPx` with zero drift), and the *glyph* inside each row stays
 * auto-sized/trimmed and simply gets pinned flush to the row's own bottom
 * edge by flexbox. Since the window itself is an `overflow-hidden`
 * inline-block — whose own alignment baseline is, per CSS, its bottom
 * margin edge, not whatever's inside it — pinning the glyph flush to the
 * bottom of the row this way puts it exactly where a real trimmed
 * sibling's baseline sits, *regardless* of how much taller than the glyph
 * `itemHeightPx` actually is (that's what makes it safe to size
 * `itemHeightPx` generously — see SlotDigits' own comment for why it's
 * instead sized as tightly as possible without clipping, per follow-up
 * "スロットのマスクを狭めて（数字がきれないように）").
 *
 * The strip only ever moves *forward* (0→1→...→9→0→...), even when the new
 * digit is numerically smaller than the last one (e.g. 9→2 spins forward
 * through 9,0,1,2 rather than jumping backward) — tracked via
 * `totalStepsRef`, a running total that only ever increases. Trade-off: the
 * rendered strip (`Array.from({ length: totalSteps + 1 })`) therefore grows
 * for this column's whole mounted lifetime rather than periodically
 * rebasing back down by multiples of 10 (which would keep it bounded) — for
 * how few times any of this site's own counters actually change per
 * session, that's an irrelevant amount of extra DOM, not worth the added
 * complexity of a bounded/rebasing version.
 *
 * On this column's very first mount, the initial state (translateY(0), i.e.
 * showing "0", with no transition-worthy history yet) needs to actually
 * paint before the spin-up starts, or the browser can coalesce both states
 * into one paint and skip the transition entirely (the same reason
 * reveal-on-mount.tsx/site-intro.tsx defer their own first reveal by one
 * rAF rather than flipping straight to the revealed state during the
 * mounting render) — see the `requestAnimationFrame` used only for that
 * specific first-mount case below.
 *
 * That deferral is also why `prevDigitRef.current` is only ever written
 * *inside* the (possibly-deferred) update, never synchronously before it's
 * scheduled: React's dev-mode Strict Mode invokes this effect mount →
 * cleanup → mount, and the cleanup cancels that first rAF before it ever
 * fires. Marking "handled" synchronously up front made the second
 * (surviving) invocation see `prevDigitRef.current` already matching
 * `digit` and bail out early via the guard above it — so the cancelled
 * frame's update never happened and the real, surviving invocation never
 * retried it either, i.e. the digit silently never moved at all
 * ("33 casesがカウントアップされない"). Writing the ref only once the update
 * actually commits means a cancelled first attempt leaves it untouched, so
 * the second invocation still sees "first mount" and reschedules — mirrors
 * the same no-synchronous-guard philosophy case-counter.tsx's own doc
 * comment already spells out for exactly this Strict Mode gotcha.
 */
function SlotDigit({ digit, extraSpins, durationMs, itemHeightPx }: SlotDigitProps) {
  const totalStepsRef = useRef(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const prevDigitRef = useRef<number | null>(null);

  useEffect(() => {
    const isFirstMount = prevDigitRef.current === null;
    if (!isFirstMount && prevDigitRef.current === digit) return;

    const currentDigit = totalStepsRef.current % 10;
    const forward = isFirstMount ? digit : (digit - currentDigit + 10) % 10;
    const next = totalStepsRef.current + forward + extraSpins * 10;

    if (!isFirstMount) {
      prevDigitRef.current = digit;
      totalStepsRef.current = next;
      setTotalSteps(next);
      return;
    }
    const frame = requestAnimationFrame(() => {
      prevDigitRef.current = digit;
      totalStepsRef.current = next;
      setTotalSteps(next);
    });
    return () => cancelAnimationFrame(frame);
  }, [digit, extraSpins]);

  return (
    <span
      className="relative inline-block w-[1ch] overflow-hidden align-baseline tabular-nums"
      style={{ height: itemHeightPx }}
    >
      <span
        className="block"
        style={{
          transform: `translateY(-${totalSteps * itemHeightPx}px)`,
          transitionProperty: "transform",
          transitionDuration: `${durationMs}ms`,
          transitionTimingFunction: EASE,
        }}
      >
        {Array.from({ length: totalSteps + 1 }, (_, i) => (
          <span key={i} className="flex items-end justify-center" style={{ height: itemHeightPx }}>
            <span className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">{i % 10}</span>
          </span>
        ))}
      </span>
    </span>
  );
}

export type SlotDigitsProps = {
  /** The number to display, zero-padded to `digits` places. */
  value: number;
  /** How many digit columns to render. */
  digits: number;
  /** Extra full revolutions per column on every change — 0 feels snappy/
   *  responsive (good for a value that changes often, e.g. live navigation),
   *  a few feels like a proper "slot pull" (good for a rare, deliberate
   *  reveal). Defaults to 0. */
  extraSpins?: number;
  /** Transition duration for each digit's own spin. */
  durationMs?: number;
  className?: string;
};

/**
 * Odometer/slot-machine-style number display — each digit position spins
 * forward on its own to land on the new value, per explicit spec
 * ("数字の切り替わりをスロットにできる"). Stateless from the outside: just
 * render with a new `value` and it animates there on its own; mount a fresh
 * instance (bump its `key`) to force a full replay from scratch (see
 * case-counter.tsx's own use of this for its "replay on intro-complete"
 * behavior).
 *
 * Renders one hidden, `aria-hidden` reference glyph — trimmed identically
 * to the real digits — purely to measure, via ResizeObserver, how tall a
 * single trimmed digit actually renders at. That measured height (rounded
 * *up* with `Math.ceil`, not to nearest, so it's never a hair short of the
 * real glyph — see SlotDigit's own comment for why coming up short would
 * mean clipping into the digit itself) is what every column's window/rows
 * get sized to: tight enough that the mask visibly hugs the digit rather
 * than framing it with a lot of empty headroom ("スロットのマスクを狭めて
 * （数字がきれないように）"), while still guaranteed not to clip it. An
 * earlier version just used a generous flat `1lh` for this (no measurement
 * needed at all, since SlotDigit's flush-bottom trick works at *any* height
 * ≥ the glyph's own) — correct but visibly loose; measuring gets it tight
 * without giving up that same correctness. Renders nothing until the first
 * measurement resolves (one synchronous layout-effect pass, before the
 * browser's first paint — no visible flash).
 */
export function SlotDigits({ value, digits, extraSpins = 0, durationMs = 500, className }: SlotDigitsProps) {
  const measureRef = useRef<HTMLSpanElement>(null);
  const [itemHeightPx, setItemHeightPx] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    function update() {
      if (!el) return;
      // offsetHeight (a layout property), not getBoundingClientRect().height
      // (a post-transform paint property) — SlotDigits is used inside a
      // `rotate(90deg)` ancestor for the SP top page's "33 Cases" counter
      // (mobile-home.tsx), and getBoundingClientRect() reports the element's
      // bounding box *after* every ancestor transform, which swaps width and
      // height under a 90° rotation: this read back the reference glyph's
      // narrow *width* as its "height," producing a near-zero window and
      // silently collapsing every digit to nothing (reported as "33が消え
      // てる"). offsetHeight ignores transforms entirely, so it stays
      // correct regardless of what any ancestor's CSS does to the element on
      // screen.
      setItemHeightPx(Math.ceil(el.offsetHeight));
    }
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const padded = String(Math.max(0, Math.round(value))).padStart(digits, "0");

  return (
    <span className={className} style={{ position: "relative" }}>
      <span
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute tabular-nums [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
      >
        0
      </span>
      {itemHeightPx !== null &&
        Array.from(padded, (char, i) => (
          <SlotDigit key={i} digit={Number(char)} extraSpins={extraSpins} durationMs={durationMs} itemHeightPx={itemHeightPx} />
        ))}
    </span>
  );
}
