"use client";

import { useEffect, useRef, useState } from "react";
import { useNowPlaying } from "@/components/now-playing-provider";

/** Same mechanism as now-playing-ticker.tsx (shared `now-playing-ticker`
 *  keyframe / `.char-reveal` class in globals.css), reused here per explicit
 *  request ("右上の情報のようにティッカーで横スライドさせる" /
 *  "文字表示時も右上同様一文字づつ表示させて") — just restyled for this
 *  widget's own translucent white card (centered, blue text, no
 *  mix-blend-exclusion) rather than SiteHeader's dark, left-aligned one, so
 *  it's a small dedicated component instead of overloading that one with
 *  conditional styling. */
const TICKER_DELAY_MS = 2500;
const TICKER_SPEED_PX_PER_SEC = 26;
const TICKER_GAP_PX = 32;
const CHAR_REVEAL_STAGGER_MS = 25;

/** Figma node 905:2094 ("Now Playing" card) — fixed square, originally 230px
 *  per explicit request ("縦横230px、padding30px"), then 220px, with padding
 *  adjusted to 25px and the album art enlarged by 10px along the way. Unlike
 *  the tagline/pills/logo elsewhere in idle-overlay.tsx, this card has no
 *  mix-blend-multiply in Figma — rendered here as a plain sibling outside
 *  that blended wrapper (see idle-overlay.tsx's own layout) rather than
 *  nested inside it, since a descendant can't opt out of an ancestor's own
 *  mix-blend-mode (the ancestor's whole subtree is flattened before that
 *  blend is applied — there's no per-descendant exemption). */
const BOX_SIZE_PX = 220;
const BOX_PADDING_PX = 25;
const GAP_PX = 16;
const ART_SIZE_PX = 105;

/** SP variant's own literal sizing — Figma node 1100:384 (idle-overlay.tsx's
 *  own SP redesign) uses a distinctly smaller card than the PC one above
 *  (152/20/12/62 vs 220/25/16/105), not just a scaled-down version of it —
 *  see idle-overlay.tsx's own doc comment on why the SP variant is a
 *  parallel design rather than a fluid resize of the PC one. Text sizes
 *  (both the "Now Playing" label and the track ticker) are 12px here, vs
 *  16px/16px on PC. */
const SP_BOX_SIZE_PX = 152;
const SP_BOX_PADDING_PX = 20;
const SP_GAP_PX = 12;
const SP_ART_SIZE_PX = 62;

type IdleNowPlayingProps = {
  /** "pc" (default, unchanged) uses the original 220px card above. "sp" uses
   *  the smaller SP-specific numbers just above. */
  variant?: "pc" | "sp";
};

/**
 * "Now Playing" card for the idle/screensaver overlay (Figma node
 * 905:2094 for PC, 1100:384 for SP) — shows nothing when Spotify isn't
 * currently playing anything, same as SiteHeader's own now-playing display.
 */
export function IdleNowPlaying({ variant = "pc" }: IdleNowPlayingProps) {
  const nowPlaying = useNowPlaying();
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [loopDistance, setLoopDistance] = useState<number | null>(null);
  // Whether the text overflows its container at all — measured immediately
  // (next frame), independent of `loopDistance`/TICKER_DELAY_MS's own 2.5s
  // pause-before-scrolling delay. Same fix as now-playing-ticker.tsx's own
  // identical `overflows` state (see its doc comment): keying centering off
  // `isTicking` alone left overflowing text sitting centered — clipped
  // evenly off *both* sides, hiding its own start — for the whole 2.5s
  // before ticking kicks in, reading as "not left-aligned" per direct
  // follow-up ("幅より長いとき左詰めで表示されないんだけど").
  const [overflows, setOverflows] = useState(false);

  const text = nowPlaying.isPlaying ? `${nowPlaying.artist} - ${nowPlaying.title}` : "";

  // Reset the moment the track itself changes, during render rather than in
  // an effect — same prevText convention as now-playing-ticker.tsx.
  const [prevText, setPrevText] = useState(text);
  if (text !== prevText) {
    setPrevText(text);
    setLoopDistance(null);
    setOverflows(false);
  }

  // Measures `overflows` right away (next frame) — see its own doc comment
  // above for why this can't just reuse `isTicking`'s delayed measurement.
  useEffect(() => {
    if (!text) return;
    const frame = requestAnimationFrame(() => {
      const container = containerRef.current;
      const textEl = textRef.current;
      if (!container || !textEl) return;
      setOverflows(textEl.scrollWidth > container.clientWidth);
    });
    return () => cancelAnimationFrame(frame);
  }, [text]);

  useEffect(() => {
    if (!text) return;
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

  if (!nowPlaying.isPlaying) return null;

  const isTicking = loopDistance !== null;
  const chars = Array.from(text);
  const trackTextClass =
    "whitespace-nowrap font-medium text-[#0022ff] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]";
  const isSp = variant === "sp";
  const trackFontSize = isSp ? 12 : "calc(16px * var(--scale))";
  const trackTextStyle = { fontSize: trackFontSize, lineHeight: 1.2 } as const;
  const boxSize = isSp ? SP_BOX_SIZE_PX : `calc(${BOX_SIZE_PX}px * var(--scale))`;
  const boxPadding = isSp ? SP_BOX_PADDING_PX : `calc(${BOX_PADDING_PX}px * var(--scale))`;
  const boxGap = isSp ? SP_GAP_PX : `calc(${GAP_PX}px * var(--scale))`;
  const artSize = isSp ? SP_ART_SIZE_PX : `calc(${ART_SIZE_PX}px * var(--scale))`;

  const body = (
    <div
      className="flex flex-col items-center justify-center bg-[rgba(255,255,255,0.85)]"
      style={{
        width: boxSize,
        height: boxSize,
        padding: boxPadding,
        gap: boxGap,
      }}
    >
      <p
        className="whitespace-nowrap text-center font-medium text-[#0022ff] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
        style={{ fontSize: trackFontSize, lineHeight: 1.5 }}
      >
        Now Playing
      </p>

      <div
        className="shrink-0 bg-[#d9d9d9]"
        style={{
          width: artSize,
          height: artSize,
        }}
      >
        {nowPlaying.albumImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- external, dynamic Spotify CDN URL
          <img src={nowPlaying.albumImageUrl} alt="" className="h-full w-full object-cover" />
        )}
      </div>

      {/* 1.3em-tall mask (not just the trimmed text's own tight line box) —
          same technique (and same reasoning) as site-intro.tsx's/
          idle-overlay.tsx's own tagline masks: trackTextClass's own
          text-box-trim shrinks the inner <span>'s line box down to
          cap-height→baseline, which left descenders (g/y/p/j/q — e.g. an
          artist or track name containing one) clipped by this container's
          own `overflow-clip` (reported as "下が見切れてる"). No compensating
          negative margin needed here (unlike those other two spots) since
          this is the last child of a `justify-center` flex column inside a
          *fixed*-height card — the couple of extra px this adds just get
          absorbed by that centering, not pushed into any following sibling.
          paddingTop 0.15em — per a later, separate follow-up ("オーバーレイ
          とSPのメニュー内のアーティスト・曲名の上が少しマスクで切れてる"):
          the trimmed text sits flush at this container's own top edge by
          default, and some glyphs' actual ink (accented capitals, certain
          numerals) overshoots the nominal cap-height metric slightly — with
          zero clearance above, the mask clipped just the very top of those
          glyphs. Height grown by the same 0.15em so the text's own bottom
          edge (and the descender clearance above) doesn't move. */}
      <div
        ref={containerRef}
        className="w-full overflow-clip"
        style={{ height: "1.45em", paddingTop: "0.15em", fontSize: trackFontSize }}
      >
        <div
          className={`flex whitespace-nowrap ${overflows ? "" : "justify-center"}`}
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
          <span ref={textRef} className={trackTextClass} style={trackTextStyle}>
            {chars.map((char, i) => (
              <span
                key={`${text}-${i}`}
                className="char-reveal"
                style={{ animationDelay: `${i * CHAR_REVEAL_STAGGER_MS}ms` }}
              >
                {/* Non-breaking space — see now-playing-ticker.tsx's own
                    identical comment: a plain space alone inside its own
                    inline-block collapses to zero width. */}
                {char === " " ? " " : char}
              </span>
            ))}
          </span>
          {isTicking && (
            <span aria-hidden className={trackTextClass} style={trackTextStyle}>
              {text}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  if (!nowPlaying.url) return body;

  return (
    <a href={nowPlaying.url} target="_blank" rel="noopener noreferrer" className="contents">
      {body}
    </a>
  );
}
