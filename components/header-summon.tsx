"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NowPlayingTicker } from "@/components/now-playing-ticker";
import { useNowPlaying } from "@/components/now-playing-provider";

const NAV_ITEMS = [
  { label: "Projects", href: "/" },
  { label: "About", href: "/about" },
  { label: "Studies", href: "/studies" },
  { label: "Contact", href: "/contact" },
];

/** Cursor within this many px of the top of the viewport summons the header,
 *  once it's scrolled far enough down (see SiteHeader — its own copy stays
 *  in normal flow at the top of the page, always visible, no fade). */
const SUMMON_ZONE_PX = 80;
/** Summoning only kicks in once scrolled past this many px — below it, the
 *  default header (SiteHeader) is either already visible or about to be, so
 *  this stays hidden well before that point to avoid the two ever being
 *  visible at once. */
const MIN_SCROLL_PX = 100;
/** Fade in/out duration. */
const FADE_MS = 300;

/**
 * A duplicate of SiteHeader's content, pinned to the viewport, shown while
 * scrolled down past MIN_SCROLL_PX (no upper limit — works no matter how
 * far down the page you are) *and* the cursor is near the top of the
 * screen — hidden again the moment scrolling back up crosses MIN_SCROLL_PX,
 * well before the default header (SiteHeader) would come into view, so the
 * two are never visible at the same time. Kept as a wholly separate
 * component from SiteHeader (rather than folding this into it) so that
 * component's simple, always-visible, no-fade rendering stays untouched.
 *
 * `position: fixed` *and* `position: sticky` both unconditionally create
 * their own stacking context, regardless of z-index (true since Chrome 22,
 * in 2012 — see
 * https://developer.chrome.com/blog/stacking-changes-coming-to-position-fixed-elements).
 * An earlier version of this component applied `mix-blend-exclusion` to
 * each *child* text element individually (matching how the always-in-flow
 * SiteHeader does it, where that's fine — position:relative without
 * z-index doesn't force an isolated stacking context). Nested inside an
 * isolated fixed/sticky stacking context, though, each child's blend only
 * mixes against *other siblings inside that same isolated group* (i.e.
 * nothing, since there's no other content there) — the whole group then
 * just composites normally on top of the real page, which is exactly the
 * "stays plain white, never inverts" symptom this had. Applying
 * `mix-blend-exclusion` to the sticky/fixed element itself — the stacking
 * context root — makes the *entire* group's flattened result blend against
 * whatever's actually behind it once composited back into the page.
 *
 * The album art photo, though, needs to *not* blend (like SiteHeader's own
 * copy, where it's a plain sibling untouched by any ancestor's blend-mode).
 * There's no CSS-only way to exempt one descendant from an *ancestor's own*
 * mix-blend-mode once that ancestor's whole subtree is being flattened for
 * blending (unlike `isolation: isolate`, which only contains blending
 * *happening within* a subtree — it doesn't protect that subtree from an
 * ancestor's blend). So the image is rendered as a sibling of `<header>`
 * entirely, outside its blend-mode subtree, in its own small sticky wrapper
 * (mirroring `<header>`'s own top/left/width approach, rather than relying
 * on `right` directly on a sticky element, which was unreliable elsewhere
 * in this codebase) with hover tracked in React state instead of the
 * NowPlayingTicker's usual CSS group-hover, since the trigger and the image
 * are no longer DOM siblings sharing a `group` ancestor.
 *
 * Uses `position: sticky` wrapped in a full-height `absolute inset-0`
 * container (matching project-view-toggle.tsx's Txt/Img switch) so it has
 * room to actually stick throughout the relevant scroll range.
 *
 * IMPORTANT — mount this as the LAST child of its positioned ancestor
 * (see app/projects/[slug]/page.tsx's own call site for why). An earlier
 * version instead mounted it right after SiteHeader and gave this wrapper an
 * explicit `z-50` to fix a page with heavy image content painting over the
 * summoned header ("ヘッダーが画像背面に隠れてる"). That fix worked for
 * paint order but broke blending ("表示ヘッダーにブレンドモードが効いてな
 * い"): z-index (with position) forces its own stacking context exactly like
 * position:fixed/sticky does (see above) — wrapping this component in one
 * traps `<header>`'s mix-blend-exclusion inside that ancestor's own isolated
 * compositing group, the same "blends against nothing, composites normally
 * on top" symptom described above, just one level further out. Plain DOM
 * order needs no z-index at all: an element with no explicit stacking
 * priority still paints above earlier siblings by default, so mounting this
 * last (rather than first) solves the original paint-order bug without
 * reintroducing the blend-mode one.
 */
type HeaderSummonProps = {
  /** Skips this summoned header's own mix-blend-exclusion — per direct
   *  follow-up ("contactページのヘッダー要素にブレンドモード付いてる？付
   *  いてたらブレンドモードは無しにして"): unlike SiteHeader (which already
   *  had a `contact` prop wired up to skip blending), this component had no
   *  such prop at all, so it kept blending unconditionally even on the
   *  Contact page — its own black (#000) background sits outside any
   *  mix-blend-exclusion ancestor, same reasoning as SiteHeader's own
   *  `noBlend`/`dark`/`contact` props. Defaults to false (blend applied,
   *  unchanged on every other page). */
  noBlend?: boolean;
  /** Renders in plain black text instead of white — per direct follow-up
   *  ("ヘッダー・フッターの色は実績ごとに#000か#fffを管理画面で選択可能にす
   *  る"), mirroring SiteHeader's own `dark` prop (kept in sync for the same
   *  reason as `currentHref`/`currentHrefClickable` below). Defaults to
   *  false (plain white text, unchanged everywhere else). */
  dark?: boolean;
  /** Same override as SiteHeader's own `currentHref` prop (see that
   *  component's own doc comment) — kept in sync since this component
   *  duplicates SiteHeader's nav markup rather than reusing it directly. */
  currentHref?: string;
  /** Same as SiteHeader's own `currentHrefClickable` prop (see that
   *  component's own doc comment) — kept in sync for the same reason. */
  currentHrefClickable?: boolean;
};

export function HeaderSummon({
  noBlend = false,
  dark = false,
  currentHref,
  currentHrefClickable = false,
}: HeaderSummonProps) {
  const pathname = usePathname();
  const nowPlaying = useNowPlaying();
  const [cursorNearTop, setCursorNearTop] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [tickerHovered, setTickerHovered] = useState(false);
  const text = dark ? "text-black" : "text-white";
  const textMuted = dark ? "text-black/50" : "text-white/50";
  const hoverMuted = dark ? "hover:text-black/50" : "hover:text-white/50";
  const hoverFull = dark ? "hover:text-black" : "hover:text-white";

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      setCursorNearTop(e.clientY <= SUMMON_ZONE_PX);
    }
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    function checkScrollY() {
      setScrollY(window.scrollY);
    }
    checkScrollY();
    window.addEventListener("scroll", checkScrollY, { passive: true });
    return () => window.removeEventListener("scroll", checkScrollY);
  }, []);

  const summoned = scrollY >= MIN_SCROLL_PX && cursorNearTop;
  const showAlbumArt = summoned && tickerHovered && nowPlaying.isPlaying && !!nowPlaying.albumImageUrl;

  return (
    // Full-height + absolute so this takes no space in normal flow, giving
    // the sticky elements below room to actually stick throughout the
    // relevant scroll range. pointer-events-none because this spans the
    // *entire* page height — without it, this box (mostly invisible) would
    // silently swallow clicks everywhere on the page. The header (and the
    // album art trigger) re-enable pointer-events on themselves only while
    // actually summoned.
    //
    // No z-index — see this component's own top-level doc comment for why
    // that was tried and reverted (fixed one paint-order bug, broke this
    // header's own blend mode). Callers must instead mount this component as
    // the LAST child of its positioned ancestor so plain DOM order alone
    // puts it above everything else.
    <div className="pointer-events-none absolute inset-0">
      <header
        aria-hidden
        className={`sticky top-[24px] ml-[calc(198px*var(--grid-scale))] h-[calc(14px*var(--scale))] w-[var(--content-width-fluid)] ${
          noBlend || dark ? "" : "mix-blend-exclusion"
        } ${summoned ? "pointer-events-auto" : "pointer-events-none"}`}
        style={{
          opacity: summoned ? 1 : 0,
          transitionProperty: "opacity",
          transitionDuration: `${FADE_MS}ms`,
          transitionTimingFunction: "ease-out",
        }}
        data-name="hd-summon"
      >
        <Link
          href="/"
          className={`absolute left-0 top-0 whitespace-nowrap text-[length:calc(14px*var(--scale))] leading-[1.5] font-medium ${text} [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]`}
        >
          ANDMADE Inc.
        </Link>

        <nav
          aria-label="Primary"
          className="absolute left-[calc(348px*var(--grid-scale))] top-0 flex items-center gap-[calc(5px*var(--scale))] whitespace-nowrap text-[length:calc(14px*var(--scale))] leading-[1.5] font-medium"
        >
          {NAV_ITEMS.map((item, i) => {
            const isCurrent = currentHref !== undefined ? item.href === currentHref : pathname === item.href;
            const isClickableCurrent = isCurrent && currentHref !== undefined && currentHrefClickable;
            return (
              <Fragment key={item.label}>
                {isClickableCurrent ? (
                  <Link
                    href={item.href}
                    aria-current="page"
                    className={`${textMuted} transition-colors ${hoverFull} [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]`}
                  >
                    {item.label}
                  </Link>
                ) : isCurrent ? (
                  <span
                    aria-current="page"
                    className={`${textMuted} [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]`}
                  >
                    {item.label}
                  </span>
                ) : (
                  <Link
                    href={item.href}
                    className={`${text} transition-colors ${hoverMuted} [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]`}
                  >
                    {item.label}
                  </Link>
                )}
                {i < NAV_ITEMS.length - 1 && (
                  <span className={`${text} [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]`}>,</span>
                )}
              </Fragment>
            );
          })}
        </nav>

        {nowPlaying.isPlaying ? (
          <div
            className="absolute top-0 flex h-[calc(11px*var(--scale))] items-start gap-[calc(10px*var(--scale))]"
            style={{ right: "var(--edge-right-inset)" }}
            onMouseEnter={() => setTickerHovered(true)}
            onMouseLeave={() => setTickerHovered(false)}
          >
            <p className={`whitespace-nowrap text-[length:calc(12px*var(--scale))] leading-[1.5] font-medium ${textMuted} [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]`}>
              Playing
            </p>
            <NowPlayingTicker
              text={`${nowPlaying.artist} - ${nowPlaying.title}`}
              url={nowPlaying.url}
              albumImageUrl={nowPlaying.albumImageUrl}
              showAlbumArt={false}
            />
          </div>
        ) : (
          <p
            className={`absolute top-0 whitespace-nowrap text-right text-[length:calc(12px*var(--scale))] leading-[1.5] font-medium ${textMuted} [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]`}
            style={{ right: "var(--edge-right-inset)" }}
          >
            No music playing.
          </p>
        )}
      </header>

      {/* Album art — a plain sibling of <header>, entirely outside its
          mix-blend-exclusion subtree, so the photo itself renders normally
          (unblended) like it does in SiteHeader's own copy. Positioned to
          sit right below where the ticker is, mirroring <header>'s own
          top/left/width sticky approach rather than relying on `right`
          directly on a sticky element. */}
      {nowPlaying.isPlaying && nowPlaying.albumImageUrl && (
        <div
          className="sticky top-[calc(24px+11px*var(--scale)+8px)] ml-[calc(198px*var(--grid-scale))] h-0 w-[var(--content-width-fluid)]"
          aria-hidden
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- external, dynamic Spotify CDN URL */}
          <img
            src={nowPlaying.albumImageUrl}
            alt=""
            className="pointer-events-none absolute top-0 h-[calc(110px*var(--scale))] w-[calc(110px*var(--scale))] object-cover shadow-lg transition-opacity duration-300 ease-out"
            style={{ right: "var(--edge-right-inset)", opacity: showAlbumArt ? 1 : 0 }}
          />
        </div>
      )}
    </div>
  );
}
