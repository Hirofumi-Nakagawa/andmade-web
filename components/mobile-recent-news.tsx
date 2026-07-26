"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { NewsItem } from "@/lib/news";

type MobileRecentNewsProps = {
  /** Mirrors mobile-home.tsx's own railRevealed — this reveals together with
   *  the Tx/Th rail it sits alongside, gated additionally by this
   *  component's own async data/measurement readiness (see the
   *  `contentRevealed` state below — `revealed` alone isn't sufficient to
   *  actually trigger a visible slide+fade). */
  revealed: boolean;
  /** Same value as the rail's own `top-[Npx]` — see this component's own doc
   *  comment below for why this is passed down as one shared value rather
   *  than a second, separately-maintained literal. */
  topPx: number;
  /** Fades this out (opacity only, no slide) — per direct request ("Th選択
   *  時はお知らせはフェードアウトで非表示にする"), matching PC's own
   *  recent-news.tsx identical `hidden` prop. */
  hidden?: boolean;
};

/**
 * SP counterpart to components/recent-news.tsx (Figma node 1021:215, "news")
 * — per "PC同様、SPにもお知らせを設置". Same data source (lib/news.ts via
 * /api/news) — text-[12px]/gap-[30px]/gap-[8px] match Figma's own SP spec
 * exactly, rather than reusing PC's 12px*--scale sizing.
 *
 * `position: relative; top: topPx` (not `sticky`) — per direct follow-up
 * re-asserting "お知らせは固定にしない". An intermediate version put this
 * inside the Tx/Th rail's own `sticky` wrapper instead, which kept the two
 * aligned at every scroll position but made news itself pin/stick too,
 * contradicting that same instruction. A sticky element behaves exactly like
 * a relatively-positioned one for as long as it hasn't yet reached its own
 * stuck threshold, so passing the rail's identical `topPx` here keeps the
 * two visually aligned near the top of the page — they only diverge once
 * you scroll far enough for the rail to actually freeze in place, which is
 * the accepted trade-off of staying non-sticky, not a bug to chase further.
 *
 * Positioned via `ml-auto` on an explicitly-sized block, not `absolute` +
 * `--edge-right-inset` like the PC version — SP has no such fluid-inset
 * variable, and `ml-auto` achieves the same "flush against the page's own
 * right margin" result within the shared `px-[8px]` content padding (see
 * mobile-home.tsx's own SP_GRID_MARGIN_PX).
 *
 * Rotated via `transform-origin: top left` + `translateX` (not flex
 * `items-center`/`justify-center` centering a pre-rotation box inside a
 * swap-sized wrapper) — same deterministic technique mobile-home.tsx's own
 * VerticalLabel switched to; see that component's own doc comment for the
 * full geometric reasoning.
 */
export function MobileRecentNews({ revealed, topPx, hidden = false }: MobileRecentNewsProps) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentSize, setContentSize] = useState<{ width: number; height: number } | null>(null);

  // The externally-supplied `revealed` prop alone isn't enough to actually
  // trigger the slide+fade — per direct follow-up ("PC,SPともにお知らせも
  // 下からスライド+フェードインで表示が反映されてない"): `revealed`
  // (mobile-home.tsx's own railRevealed) flips true almost immediately on
  // mount, typically *before* this component's own async /api/news fetch +
  // ResizeObserver measurement resolve `contentSize` and flip `visibility`
  // from "hidden" to "visible" below. So by the moment this actually first
  // becomes visible, the translate-y/opacity classes were already sitting
  // at their "revealed" end state with nothing left to transition from —
  // it just popped in instead of sliding/fading up. `contentRevealed` fixes
  // this the same way recent-news.tsx's own PC counterpart does: it only
  // flips true one rAF *after* both `revealed` is true AND `contentSize`
  // has resolved, guaranteeing at least one frame paints in the
  // not-yet-revealed state first.
  const [contentRevealed, setContentRevealed] = useState(false);
  useEffect(() => {
    if (!revealed || !contentSize) return;
    const frame = requestAnimationFrame(() => setContentRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, [revealed, contentSize]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/news", { cache: "no-store" });
        const data: NewsItem[] = await response.json();
        if (!cancelled) setItems(data);
      } catch {
        if (!cancelled) setItems([]);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // The ResizeObserver callback defers its own setContentSize to the next
  // animation frame rather than calling it synchronously — per direct
  // follow-up reporting a runtime error on both PC and SP ("PCでもSPでもエ
  // ラーが出てる"): see mobile-home.tsx's own VerticalLabel for the full
  // reasoning (both trees are always mounted together, and enough
  // synchronous observer→setState cycles in one frame trips the browser's
  // "ResizeObserver loop completed with undelivered notifications" error).
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    let frame: number | null = null;
    function update() {
      if (!el) return;
      setContentSize({ width: el.offsetWidth, height: el.offsetHeight });
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
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div
      className={`relative z-40 ml-auto flex-none mix-blend-exclusion transition-all duration-500 ease-out ${
        contentRevealed ? "translate-y-0" : "translate-y-[24px]"
      } ${contentRevealed && !hidden ? "opacity-100" : "opacity-0"}`}
      style={{
        top: topPx,
        // Swapped — see this component's own doc comment above.
        width: contentSize ? contentSize.height : undefined,
        height: contentSize ? contentSize.width : undefined,
        visibility: contentSize ? "visible" : "hidden",
        // 0.5px = the same -1.5px empirically-measured text-box-trim
        // correction as mobile-home.tsx's own VerticalLabel, shifted +2px
        // right per direct follow-up ("SPのお知らせを右に2px移動").
        transform: "translateX(0.5px)",
      }}
      data-name="news"
    >
      {/* The two entries form a single *row* pre-rotation (flex, gap-[30px]
          — not flex-col), per direct follow-up ("SPのお知らせはデザインに合
          わせて2つが1行で縦に並ぶようにして。その際のマージンは30px") and
          matching Figma's own "news" node exactly (`flex gap-[30px]`, not
          `flex-col`): rotating that row 90° turns the row into a top-to-
          bottom *column* of entries on screen — "2つが1行で" (two items
          forming one row) "縦に並ぶ" (arranged vertically) is describing the
          pre-/post-rotation shift, not a contradiction.
          transform-origin: top left + translateX (not centering — see this
          component's own doc comment above) places this row's own left edge
          flush with this wrapper's left edge deterministically. */}
      <div
        ref={contentRef}
        className="absolute top-0 left-0 flex-none"
        style={{
          transformOrigin: "top left",
          transform: contentSize ? `translateX(${contentSize.height}px) rotate(90deg)` : undefined,
        }}
      >
        <div className="flex gap-[30px] whitespace-nowrap text-[12px] leading-[1.5]">
          {/* gap 8px → 7px (date-to-body margin). Body text nudged 1px right
              via `marginLeft` — per direct follow-up ("SPのトップお知らせの
              本文を1px右に移動して日付とのマージンを詰めて") — then 1px up
              via `marginTop: -1` — per a later follow-up ("SPのお知らせ本文
              も1px上に移動"), matching PC's own recent-news.tsx identical
              nudge — then that `marginLeft` was reverted back to 0 (`up`
              only remains) per a still later follow-up noting it had likely
              drifted right unintentionally ("SPのお知らせ本文をさっき1px右
              に移動したと思うので、左に1px戻しておいて"). Given in this
              element's own pre-rotation/local space (this whole block is
              rotated 90°, see this component's own doc comment above),
              scoped to the body text element alone (the `<a>`/`<p>` below),
              not the date above it.
              `marginTop`, deliberately not `transform: translateY(...)` —
              an earlier version of the (now-reverted) rightward nudge used
              `transform: translateX(...)` and caused the underline to keep
              cutting off mid-word even after switching to underline-sweep,
              briefly rendering correctly then shrinking to a partial width
              moments later ("1px移動しただけなのになぜ？"): `transform` on a
              plain *inline* element (this `<a>`'s default display) is a
              well-known fragile combination in WebKit specifically when
              paired with a `position: absolute` pseudo-element for a
              containing block — this `<a>` already gets `position: relative`
              from `.underline-sweep` itself, and adding a *second*,
              independent reason (the transform) for this same inline box to
              also become a containing block for absolutely-positioned
              descendants is exactly the kind of redundant/conflicting setup
              real WebKit has been reported to mis-recompute after the
              element's first paint (matching the "briefly correct, then
              shrinks" symptom exactly — a stale vs. recomputed
              containing-block size disagreeing). A plain `marginTop` is an
              ordinary box-model property with no such WebKit-specific
              containing-block side effect at all, so the underline's own
              containing block stays unambiguous. */}
          {items.map((item) => (
            <div key={item.id} className="flex flex-col items-start gap-[7px]">
              <p className="font-(family-name:--font-courier) text-white/50 tracking-[-0.6px] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
                {item.date}
              </p>
              {item.url ? (
                // underline-sweep (app/globals.css), not the native `underline`
                // class this used before — per direct follow-up reporting the
                // underline visibly cutting off partway through a word on a
                // real device only, not in any browser preview ("実機だとお知
                // らせの下線が「~interview ~」のintervで途切れてる"): native
                // `text-decoration: underline` under a `rotate(90deg)` ancestor
                // (this whole news block is rotated — see this component's own
                // doc comment above) is exactly the kind of real-WebKit-only
                // rendering quirk this codebase has already worked around
                // elsewhere by switching to this class instead of chasing the
                // native property further (PC's own recent-news.tsx already
                // uses underline-sweep for this identical link, never plain
                // `underline` — this SP counterpart was the one remaining
                // exception). `.underline-sweep::after` draws a real,
                // explicitly-positioned `position: absolute` bar rather than
                // relying on the browser's own native decoration painting, so
                // it isn't subject to whatever WebKit-specific interaction
                // between rotation and native underline rendering was cutting
                // this one off.
                // --underline-offset: calc(-0.1em - 1px) — per direct
                // follow-up moving just this link's own underline down 1px
                // ("お知らせの下線テキストの下線位置を1px下げて"), without
                // touching .underline-sweep's own shared default (see that
                // rule's own doc comment in globals.css). Matches PC's own
                // recent-news.tsx identical override.
                // --underline-thickness: 0.6px — per a still later, SP-only
                // follow-up ("SPのお知らせ下線の太さを0.6pxにできる？"); PC's
                // own recent-news.tsx keeps the shared 1px default, since
                // this one wasn't asked to change.
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline-sweep font-normal text-white [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
                  style={
                    {
                      marginTop: -1,
                      "--underline-offset": "calc(-0.1em - 1px)",
                      "--underline-thickness": "0.5px",
                    } as React.CSSProperties
                  }
                >
                  {item.text}
                </a>
              ) : (
                <p
                  className="font-normal text-white [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
                  style={{ marginTop: -1 }}
                >
                  {item.text}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
