"use client";

import { useEffect, useRef, useState } from "react";

/** Wait this long after the text changes before checking whether to start ticking. */
const TICKER_DELAY_MS = 2500;
/** Constant scroll speed so longer titles don't feel rushed or short ones sluggish. */
const TICKER_SPEED_PX_PER_SEC = 26;
/** Gap between the end of one loop and the start of the next. */
const TICKER_GAP_PX = 32;
/** Per-character delay for the initial left-to-right reveal. */
const CHAR_REVEAL_STAGGER_MS = 25;

type NowPlayingTickerProps = {
  text: string;
  /** Spotify track URL — wraps the text in a link when present. */
  url?: string | null;
  /** Album artwork — fades in below the text on hover when present. */
  albumImageUrl?: string | null;
  /** Set to false to skip rendering the album art image entirely, even if
   *  `albumImageUrl` is given. Needed when this ticker is nested inside an
   *  ancestor that applies mix-blend-mode to *itself* rather than
   *  per-text-element (header-summon.tsx — position:fixed/sticky elements
   *  always form their own stacking context, so the whole subtree gets
   *  flattened and blended as one unit): the album photo got swept into
   *  that blend too and had its colors inverted, and there's no CSS-only
   *  way to exempt one descendant from an ancestor's own blend-mode.
   *  Defaults to true (SiteHeader's own copy, which blends per-element and
   *  isn't affected, still shows it normally). */
  showAlbumArt?: boolean;
  /** Skips this ticker's own inner-container mix-blend-exclusion — needed
   *  wherever the ancestor header itself is rendered without blend mode
   *  (see site-header.tsx's own `noBlend` prop, used on the 404 page).
   *  Defaults to false (blend applied), unchanged everywhere else. */
  noBlend?: boolean;
  /** Renders both text copies (the real one and the aria-hidden looped
   *  duplicate) in black instead of white — see site-header.tsx's own
   *  `dark` prop (Studies page). Defaults to false. */
  dark?: boolean;
  /** Renders both text copies in the #fff used elsewhere on the Contact
   *  page (same hex as plain white, kept as its own branch to mirror
   *  site-header.tsx's own `contact` prop). Defaults to false. */
  contact?: boolean;
  /** Fades this ticker's own blend-mode container in/out via opacity, applied
   *  directly on that same element rather than by wrapping it externally —
   *  per site-header.tsx's own `revealStyle` doc comment for why an ancestor
   *  is never safe here: this component already applies mix-blend-exclusion
   *  to its own inner container (`containerRef` below) when `noBlend` is
   *  false, and any external wrapper toggling opacity around it would
   *  isolate that blend against nothing useful for as long as it's below 1.
   *  Defaults to true (already fully revealed) — every existing call site
   *  keeps rendering at full opacity, unchanged, unless it opts in. */
  revealed?: boolean;
  /** Centers the text whenever it fits (not ticking) — defaults to false,
   *  keeping SiteHeader's own explicit always-left-aligned behavior (see the
   *  `isTicking` div below's own doc comment, "pcの画面右上の...は中央配置
   *  にしないで左詰めで表示"). mobile-menu.tsx opts into this per a further,
   *  later direct follow-up scoped specifically to the SP menu's own Now
   *  Playing display ("SPのメニュー内のアーティスト・曲名は...幅より短い場
   *  合は中央配置で...長い場合は左詰め表示"), matching idle-now-playing.tsx's
   *  own identical `justify-center`-when-not-ticking treatment rather than
   *  changing this component's own PC-header default. */
  centerWhenFits?: boolean;
};

/**
 * Fixed-width "now playing" display (120px at the 1440px canvas, scales with
 * --scale). Text reveals left-to-right, one character at a time, whenever it
 * changes. If it fits, it just sits still afterwards. If it overflows, it
 * waits 2.5s then scrolls left on a seamless loop — masked by the
 * container's overflow-clip — with a second copy following behind so it
 * loops with no gap. Links out to the track on Spotify when a URL is given.
 * Album artwork, if given, fades in below the text on hover.
 */
export function NowPlayingTicker({
  text,
  url,
  albumImageUrl,
  showAlbumArt = true,
  noBlend = false,
  dark = false,
  contact = false,
  revealed = true,
  centerWhenFits = false,
}: NowPlayingTickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [loopDistance, setLoopDistance] = useState<number | null>(null);
  // Whether the text overflows its container at all — measured immediately
  // (next frame), independent of `loopDistance`/TICKER_DELAY_MS's own 2.5s
  // pause-before-scrolling delay. Per direct follow-up reporting long text
  // not actually reading as left-aligned ("幅より長いとき左詰めで表示され
  // ないんだけど"): `centerWhenFits` below previously kept centering text
  // for that entire 2.5s window even when it was *already* known to
  // overflow (only `isTicking`, true after the delay, ever turned centering
  // off) — for overflowing text, `justify-center` on something wider than
  // its own container clips evenly off *both* sides, hiding the very start
  // of the text the whole time, reading as "not left-aligned" long before
  // the delay was even up. Deciding alignment off this separate, immediate
  // `overflows` flag instead means overflowing text is left-aligned (start
  // always visible) from the first frame, while `isTicking`/`loopDistance`
  // still solely control *when the sliding animation itself* starts.
  const [overflows, setOverflows] = useState(false);
  const [prevText, setPrevText] = useState(text);

  // Reset the moment `text` itself changes, during render rather than in an
  // effect (React's recommended pattern for this — see scramble-text.tsx's
  // identical prevKey convention, and https://react.dev/learn/you-might-not-need-an-effect).
  // Calling setState synchronously inside an effect body causes an extra,
  // avoidable render on every text change; comparing during render doesn't.
  if (text !== prevText) {
    setPrevText(text);
    setLoopDistance(null);
    setOverflows(false);
  }

  // Measures `overflows` right away (next frame, after this render's own
  // layout has committed) — see `overflows`' own doc comment above for why
  // this can't just reuse `isTicking`/TICKER_DELAY_MS's delayed measurement.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const container = containerRef.current;
      const textEl = textRef.current;
      if (!container || !textEl) return;
      setOverflows(textEl.scrollWidth > container.clientWidth);
    });
    return () => cancelAnimationFrame(frame);
  }, [text]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const container = containerRef.current;
      const textEl = textRef.current;
      if (!container || !textEl) return;
      if (textEl.scrollWidth > container.clientWidth) {
        setLoopDistance(textEl.scrollWidth + TICKER_GAP_PX);
      }
    }, TICKER_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [text]);

  const isTicking = loopDistance !== null;
  const chars = Array.from(text);

  const body = (
    // -mt-[2px] counteracting the container's own +2px growth below — per
    // direct follow-up ("PCの右上のアーティスト名、曲名が数px下にズレてる
    // っぽい"): site-header.tsx/header-summon.tsx both lay this component
    // out as an `items-start` flex sibling of a plain "Playing" label that
    // has no such padding, so growing *this* component's own box downward
    // by 2px (see below) shifted its rendered text 2px lower than "Playing"
    // — visible as exactly the reported few-px vertical mismatch. Applying
    // the same 2px in the opposite direction here, on the outer wrapper,
    // moves the whole box (text + album art together) back up to where it
    // sat before that padding was added, restoring alignment with
    // "Playing" while leaving the padding-top fix itself (see below) intact.
    <div className="group relative -mt-[calc(2px*var(--scale))]">
      <div
        ref={containerRef}
        // pt-[2px] (with the container itself grown by the same 2px so the
        // text's own bottom edge doesn't move) — per direct follow-up
        // ("オーバーレイとSPのメニュー内のアーティスト・曲名の上が少しマス
        // クで切れてる"): text-box-trim:trim-both below sizes the line box
        // tightly from cap-height to the alphabetic baseline, but some
        // glyphs' actual ink (accented capitals, certain numerals) overshoots
        // the nominal cap-height metric slightly — with zero clearance above,
        // this overflow-clip container was clipping just the very top of
        // those glyphs. The trimmed text sits flush at this container's own
        // top edge by default, so the fix needs padding-top specifically
        // (simply growing the container's height only adds room *below*).
        // opacity/transition applied directly here (not on the outer "group
        // relative" wrapper above) — see `revealed`'s own doc comment for why
        // it has to sit on this exact element, the one that actually carries
        // mix-blend-exclusion.
        // transform-gpu — see site-header.tsx's own identical addition
        // alongside its `blend` variable for why (Safari hover-preview
        // blend-mode fix, confirmed working).
        className={`h-[calc(13px*var(--scale))] w-[calc(120px*var(--scale))] overflow-clip pt-[calc(2px*var(--scale))] transition-opacity ease-out ${noBlend ? "" : "mix-blend-exclusion transform-gpu"}`}
        style={{ opacity: revealed ? 1 : 0, transitionDuration: "500ms" }}
      >
        {/* Left-aligned (flex's default justify-start) regardless of
            overflow state, unless `centerWhenFits` opts in — per direct
            follow-up ("pcの画面右上のアーティスト名と曲名は中央配置にしな
            いで左詰めで表示"), reverting an earlier request that centered
            short titles ("再生中の曲は長さが短いときは中央揃えにして").
            `centerWhenFits` (see this component's own props doc comment)
            brings that centered treatment back for callers that explicitly
            want it, without touching SiteHeader's own unchanged default.
            Keyed off `overflows`, not `isTicking` — see `overflows`' own
            doc comment above for why. */}
        <div
          className={`flex whitespace-nowrap ${!overflows && centerWhenFits ? "justify-center" : ""}`}
          style={
            isTicking
              ? ({
                  gap: `${TICKER_GAP_PX}px`,
                  animation: `now-playing-ticker ${loopDistance / TICKER_SPEED_PX_PER_SEC}s linear infinite`,
                  "--ticker-distance": `${loopDistance}px`,
                } as React.CSSProperties)
              : undefined
          }
        >
          <span
            ref={textRef}
            className={`whitespace-nowrap text-[length:calc(12px*var(--scale))] leading-[1.5] font-normal ${dark ? "text-black" : contact ? "text-[#fff]" : "text-white"} [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]`}
          >
            {chars.map((char, i) => (
              <span
                key={`${text}-${i}`}
                className="char-reveal"
                style={{ animationDelay: `${i * CHAR_REVEAL_STAGGER_MS}ms` }}
              >
                {/* A regular space alone inside its own inline-block collapses to zero width
                    (treated as being at the start of its own inline formatting context) —
                    a non-breaking space isn't collapsible, so it always keeps its width. */}
                {char === " " ? " " : char}
              </span>
            ))}
          </span>
          {isTicking && (
            <span
              aria-hidden
              className={`whitespace-nowrap text-[length:calc(12px*var(--scale))] leading-[1.5] font-normal ${dark ? "text-black" : contact ? "text-[#fff]" : "text-white"} [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]`}
            >
              {text}
            </span>
          )}
        </div>
      </div>

      {albumImageUrl && showAlbumArt && (
        // eslint-disable-next-line @next/next/no-img-element -- external, dynamic Spotify CDN URL
        <img
          src={albumImageUrl}
          alt=""
          className="pointer-events-none absolute top-[calc(100%+8px)] right-0 h-[calc(110px*var(--scale))] w-[calc(110px*var(--scale))] object-cover opacity-0 shadow-lg transition-opacity duration-300 ease-out group-hover:opacity-100"
        />
      )}
    </div>
  );

  if (!url) return body;

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="contents">
      {body}
    </a>
  );
}
