"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CurtainRevealLines } from "@/components/curtain-reveal-lines";
import { MobileNotFound } from "@/components/mobile-not-found";
import { ScenicMapBackground } from "@/components/scenic-map-background";
import { ScrambleText } from "@/components/scramble-text";
import { SiteHeader } from "@/components/site-header";
import { setLightMenuPill } from "@/lib/menu-theme-store";
import { setScrollGaugeSuppressed } from "@/lib/scroll-gauge-store";
import { StatusBarMaskColor } from "@/components/status-bar-mask";
import { withBasePath } from "@/lib/base-path";

/** How long with zero cursor movement / click before the header + center
 *  row fade out, leaving only ScenicMapBackground's own bottom-of-screen
 *  coordinates/Google Maps text showing (per explicit request: "10秒経過
 *  したら...フェードアウトさせて...カーソルを動かすかクリックで再表示"). */
const IDLE_MS = 10_000;
/** Fade duration, both directions — matches the site's other 300ms fades
 *  (idle-overlay.tsx/site-intro.tsx's own EXIT_FADE_MS, header-summon.tsx's
 *  own FADE_MS). */
const FADE_MS = 300;

/** Shared by "404" and "Not Found" (Figma nodes 924:218, 924:220) — 20px,
 *  medium, -0.4px tracking, a literal 16px line-height (tighter than the
 *  font size itself, per spec) rather than a unitless ratio. Both sit on
 *  the exact same vertical line as "Sorry, an error has occured." and
 *  "Back to Home" below (ROW_TOP), which share this position but not this
 *  exact tracking/leading combination. */
const ROW_TEXT_CLASS =
  "absolute text-[length:calc(20px*var(--scale))] leading-[calc(16px*var(--scale))] font-medium whitespace-nowrap text-white tracking-[calc(-0.4px*var(--scale))] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]";
/** Figma's own `top-[calc(50%-7px)]` for that same row — the -7px nudge
 *  itself scaled too (calc()'s multiplication binds tighter than the
 *  subtraction, so this reads as "50% minus (7px * scale)", not
 *  "(50% - 7px) * scale"). */
const ROW_TOP = "calc(50% - 7px * var(--scale))";

/** Logo/tagline lockup shown *in place of* the default header/404 content
 *  once idle — per explicit follow-up spec ("デフォルトは元の状態でよくて、
 *  数秒したら、ヘッダーと404などがフェードアウトして、ロゴと英字を代わりに
 *  表示する仕様にしてほしい"): the default (not-idle) look stays exactly as
 *  it always was (see the restored persistent-look "ANDMADE Inc." Link
 *  below), and this lockup only fades in once idle, crossfading against
 *  `contentFadeStyle`'s own fade-out via the separate `idleContentFadeStyle`
 *  below — not shown, and not part of, the default content group. Logo
 *  asset/size and tagline copy/size are the exact same as site-intro.tsx's
 *  own splash (LOGO_WIDTH_PX/LOGO_HEIGHT_PX/TAGLINE_LINES there — not
 *  imported, since that file doesn't export them; duplicated here per this
 *  codebase's own convention for small page-specific reveal content, same
 *  as e.g. mobile-studies.tsx's own INTRO_TEXT_LINES). Left edge matches
 *  ROW's own `calc(198px * var(--grid-scale))` margin — per direct
 *  follow-up ("左面は座標の情報と揃える"), the exact same left value
 *  ScenicMapBackground's own CoordinatesReadout/LocationNameReadout use at
 *  the bottom of the screen. */
const LOGO_WIDTH_PX = 160;
const LOGO_HEIGHT_PX = 22;
const BRAND_TAGLINE_LINES = [
  "ANDMADE is an independent design studio based in Tokyo,",
  "partnering with brands to create thoughtful experiences through",
  "art direction, graphic design, and digital design.",
];
/** Gap between the logo and the tagline below it — matches site-intro.tsx's
 *  own GROUP_GAP_PX (15px, tuned there via "マージンをさらに5px詰めて"). */
const BRAND_LOGO_TAGLINE_GAP_PX = 15;

/** Konami easter-egg hint, shown with the idle logo/tagline swap — per
 *  direct follow-up ("404ページで数秒後に切り替わる際、下記テキストを画面
 *  中央に配置して（左面はNot Foundの位置に合わせる）"): screen-centred
 *  vertically on the same ROW_TOP line the (now faded-out) "Not Found" sat
 *  on, left edge on that text's own 198px grid margin. "Home only" because
 *  the egg itself is scoped to "/" (see components/konami-glitch.tsx). */
const KONAMI_HINT_TEXT = "Dark mode (Home only): ↑↑↓↓←→←→BA";
/** How long the hint stays up before fading back out — per the same
 *  follow-up ("このテキストは5秒表示したらフェードアウトで消して"). */
const KONAMI_HINT_VISIBLE_MS = 5_000;

/**
 * 404 page (Figma node 923:2) — single-viewport, full-bleed satellite photo
 * background (ScenicMapBackground — see that component for the cycling/
 * crossfade/pan logic) behind a grid-aligned row of text, matching the
 * design exactly: "404" sits on the outer 24-column grid's very first
 * column (left edge, grid-scaled — not the page's raw literal edge), "Not
 * Found" and the coordinates readout sit on that same grid's 3rd column
 * (== the standard 198px content margin used site-wide), "Sorry, an error
 * has occured." sits on the 9th column, and "Back to Home" is right-aligned
 * flush with the grid's own 24px right margin — all four on one shared
 * vertical line (ROW_TOP above).
 *
 * SiteHeader renders with `noBlend` here (per explicit request: "ヘッダー
 * はブレンドモード無し") — Figma's own export for this page's header (node
 * 923:171) has no mix-blend-exclusion anywhere, unlike every other page it
 * appears on.
 *
 * A flat `bg-black/45` sits between the photo and all the text/header so
 * the row stays reliably legible no matter which of the curated locations
 * happens to be showing.
 *
 * A client component (rather than the plain Server Component it started as)
 * specifically for the idle-fade behavior below: after IDLE_MS with no
 * mousemove/click, the header + center row (everything wrapped by
 * `contentFadeStyle`) fades out, leaving only ScenicMapBackground's own
 * bottom-of-screen coordinates/"Google Maps" text visible — moving the
 * cursor or clicking anywhere fades it back in and resets the timer.
 * `pointerEvents: "none"` while faded out keeps the (now invisible) header
 * nav / "Back to Home" link from swallowing that first wake-up click, same
 * reasoning as idle-overlay.tsx's own dismiss-vs-reset event handling.
 */
/** "Sorry, an error has occured."（Figma原文ママ）を3秒後に差し替える先の
 *  文言と、その待ち時間 — per direct follow-up ("Sorry~の英文を、3秒経過
 *  したら下記にスクランブルテキストで差し替えて")。差し替えは ScrambleText
 *  の key を変えての再マウントで、登場時と同じスクランブル演出が走る。
 *  SP（mobile-not-found.tsx）へも sorrySwapped prop で同じタイミングを渡す。 */
const SORRY_TEXT = "Sorry, an error has occured.";
const SORRY_SWAP_TEXT = "But maybe you weren't looking for this.";
const SORRY_SWAP_DELAY_MS = 3_000;

export function NotFoundView() {
  const [idle, setIdle] = useState(false);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Whether the Konami hint is currently up — true for the first
   *  KONAMI_HINT_VISIBLE_MS of each idle period, false otherwise (see the
   *  effect below). Its own state rather than derived from `idle` because it
   *  changes *within* a single idle period. */
  const [konamiHintVisible, setKonamiHintVisible] = useState(false);
  /** Sorry文言の差し替え済みフラグ — SORRY_SWAP_TEXT 参照。一方向
   *  （false→true のみ、ページ滞在中に戻らない）。 */
  const [sorrySwapped, setSorrySwapped] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSorrySwapped(true), SORRY_SWAP_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // Shows the hint for its 5 seconds each time the idle swap happens, and
  // resets when activity ends the idle period — so it replays on the next
  // one rather than being once-per-visit.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- not derivable during render: "visible for the first 5s of an idle period" is a time-driven progression only an effect owning a timer can express (same shape as revealedIndices in project-thumbnail-grid.tsx).
    setKonamiHintVisible(idle);
    if (!idle) return;
    const timer = setTimeout(() => setKonamiHintVisible(false), KONAMI_HINT_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [idle]);

  // See lib/menu-theme-store.ts's own doc comment — this is the one page
  // whose closed SP "Menu" pill should read white bg/black text instead of
  // the sitewide black bg/white text, per direct follow-up ("404ページの
  // Menuの黒ベタは#fffにしてテキストは#000にして"). Reset on unmount so
  // navigating away doesn't leave the light pill active elsewhere.
  useEffect(() => {
    setLightMenuPill(true);
    return () => setLightMenuPill(false);
  }, []);

  // No scroll-progress gauge here — per direct follow-up ("404も無しで").
  // Signalled through a store rather than being recognised by pathname,
  // because a 404 doesn't have one: Next.js renders this component for
  // whatever URL was requested, so a mistyped project slug arrives as
  // `/projects/…` and would otherwise match the gauge's own allowlist. See
  // lib/scroll-gauge-store.ts.
  useEffect(() => {
    setScrollGaugeSuppressed(true);
    return () => setScrollGaugeSuppressed(false);
  }, []);

  useEffect(() => {
    function scheduleIdle() {
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = setTimeout(() => setIdle(true), IDLE_MS);
    }
    function handleActivity() {
      setIdle(false);
      scheduleIdle();
    }
    scheduleIdle();
    window.addEventListener("mousemove", handleActivity, { passive: true });
    window.addEventListener("click", handleActivity);
    return () => {
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("click", handleActivity);
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    };
  }, []);

  const contentFadeStyle = {
    opacity: idle ? 0 : 1,
    pointerEvents: idle ? "none" : "auto",
    transitionProperty: "opacity",
    transitionDuration: `${FADE_MS}ms`,
    transitionTimingFunction: "ease-out",
  } as const;

  /** Inverse of contentFadeStyle above — per direct follow-up ("デフォルト
   *  は元の状態でよくて、数秒したら、ヘッダーと404などがフェードアウトし
   *  て、ロゴと英字を代わりに表示する仕様にしてほしい"): the logo/tagline
   *  lockup starts hidden (matching the page's *original* default look,
   *  before any of this idle-swap behavior existed) and only fades in once
   *  idle, crossfading with contentFadeStyle's own fade-out rather than both
   *  being visible at once. `pointerEvents` also inverts so this invisible-
   *  while-not-idle block never swallows clicks meant for the real "ANDMADE
   *  Inc." link/header sitting at the same position underneath it. */
  const idleContentFadeStyle = {
    opacity: idle ? 1 : 0,
    pointerEvents: idle ? "auto" : "none",
    transitionProperty: "opacity",
    transitionDuration: `${FADE_MS}ms`,
    transitionTimingFunction: "ease-out",
  } as const;

  return (
    // h-[100dvh] (was h-screen, i.e. 100vh) — per direct follow-up
    // ("スクロールが出ないように画面の高さは端末の画面高さに合わせる"):
    // mobile browsers' address bar/toolbar can show or hide as the page
    // settles, and 100vh is defined against the *largest* possible viewport
    // (toolbars hidden) — on a device where they're still visible at first
    // paint, a 100vh-tall page is taller than what's actually visible,
    // producing a tiny scrollable overshoot despite `overflow-hidden` here
    // (that only clips content *within* this box, it doesn't shrink the box
    // itself). 100dvh continuously tracks the *actual current* visible
    // viewport instead, so this box's height always exactly matches what's
    // really on screen, with nothing left to scroll.
    <div className="relative h-[100dvh] w-full overflow-hidden bg-black">
      {/* iOS status-bar mask follows this page's own black/photo backdrop —
         see components/status-bar-mask.tsx. */}
      <StatusBarMaskColor color="#000" />
      <ScenicMapBackground />
      <div className="absolute inset-0 bg-black/45" aria-hidden />

      {/* PC-only tree, split from SP's own (mobile-not-found.tsx) at
          Tailwind's default `lg` breakpoint (1024px) — same plain-CSS split
          as app/page.tsx's own PC/MobileHome pairing (see that file's own
          doc comment for why). ScenicMapBackground/the dark overlay above
          stay outside this split — shared unconditionally between both
          trees, since that component already splits its own bottom-of-
          screen readouts into PC/SP variants internally. */}
      <div className="hidden lg:contents">
      {/* No `position` set on this wrapper — `opacity` alone doesn't
         establish a new containing block (unlike `transform`/`filter`), so
         each child below still resolves its own `position: absolute`
         top/left/right against the true page-level `relative` div above,
         completely unaffected by this fade wrapper sitting in between. */}
      <div style={contentFadeStyle}>
        <SiteHeader noBlend hideBrand />

        {/* Persistent-look "ANDMADE Inc." — restored here (rendered right
           after SiteHeader, both inside this same fade wrapper, so it paints
           on top of SiteHeader's own now-empty (`hideBrand`) header box in
           DOM order — same click-swallow fix as this file's own earlier
           doc comment described) after a brief detour where it was replaced
           outright by the logo/tagline lockup below. Per direct follow-up
           ("デフォルトは元の状態でよくて"): the *default* look should stay
           exactly as it always was — this text visible, logo/tagline
           nowhere in sight — with the swap only happening once idle (see
           idleContentFadeStyle's own doc comment above). */}
        <Link
          href="/"
          className="absolute whitespace-nowrap text-[length:calc(14px*var(--scale))] leading-[1.5] font-medium text-white [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
          style={{ top: "24px", left: "calc(198px * var(--grid-scale))" }}
        >
          ANDMADE Inc.
        </Link>

        {/* ScrambleText below (404 / Not Found / Sorry...) — the same
           scramble-reveal effect used for the home page's project titles
           (project-card.tsx) and the Contact page's "Get in touch."
           (contact-hero.tsx): each character flickers through a couple of
           random glyphs before settling into place, left to right, per
           explicit request ("下記はランダムアニメーションで一文字ずつ表示
           させて" / "上記文字はトップの下線タイトルと同じ演出で表示").
           `active` (no value = `active={true}`) starts it immediately on
           mount, same as contact-hero.tsx's own usage — default
           stepMs/jitterMs/flickers/flickerMs (unspecified here) match that
           same convention too, rather than inventing new timing. */}
        <p className={ROW_TEXT_CLASS} style={{ left: "calc(24px * var(--grid-scale))", top: ROW_TOP }}>
          <ScrambleText text="404" active />
        </p>

        <p className={ROW_TEXT_CLASS} style={{ left: "calc(198px * var(--grid-scale))", top: ROW_TOP }}>
          <ScrambleText text="Not Found" active />
        </p>

        {/* Figma's own copy, kept verbatim ("occured", not "occurred") —
           this one line uses a unitless 1.2 leading rather than the row's
           shared literal-16px one, and adds the "palt" (proportional
           alternate widths) font feature per spec. */}
        <p
          className="absolute text-[length:calc(20px*var(--scale))] leading-[1.2] font-medium whitespace-nowrap text-white tracking-[calc(-0.4px*var(--scale))] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
          style={{ left: "calc(546px * var(--grid-scale))", top: ROW_TOP, fontFeatureSettings: '"palt" 1' }}
        >
          <ScrambleText key={sorrySwapped ? "swap" : "sorry"} text={sorrySwapped ? SORRY_SWAP_TEXT : SORRY_TEXT} active />
        </p>

        {/* right: calc(24px * var(--grid-scale)) — the mirror-image of
           "404"'s own left: calc(24px * var(--grid-scale)) above, i.e. this
           grid's uniform 24px margin, applied from the right instead.
           Deliberately NOT var(--edge-right-inset): that variable's own
           formula only resolves correctly for an element nested inside a
           wrapper that itself starts at ml-[calc(198px*var(--grid-scale))]
           and is exactly var(--content-width-fluid) wide (see
           app/contact/page.tsx's own comment on it) — this Link sits
           directly in the page's full-width root instead, so reusing that
           formula here produced the wrong offset.

           `position: "absolute"` is forced via inline style rather than
           relying on the Tailwind `absolute` class — globals.css's own
           `.underline-sweep { position: relative; ... }` is *unlayered*
           CSS, which in Tailwind v4's cascade-layer setup outranks every
           Tailwind utility (including `.absolute`) regardless of class
           order in the `className` string, silently demoting this Link
           back to position:relative/in-flow. An inline `style` always wins
           over any stylesheet rule regardless of layers, so this overrides
           that reliably. `position: absolute` still counts as "positioned"
           for `.underline-sweep::after`'s own need of a positioned
           ancestor, so the hover-sweep underline itself is unaffected. */}
        <Link
          href="/"
          className="underline-sweep text-[length:calc(16px*var(--scale))] leading-[calc(16px*var(--scale))] font-medium whitespace-nowrap text-white tracking-[calc(-0.32px*var(--scale))] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
          style={{ position: "absolute", right: "calc(24px * var(--grid-scale))", top: ROW_TOP }}
        >
          Back to Home
        </Link>
      </div>

      {/* Logo/tagline lockup, shown only once idle — crossfades in as
         contentFadeStyle's own group fades out (see idleContentFadeStyle's
         own doc comment above). `brightness(0) invert(1)`: the source SVG's
         own path fills are the brand blue (#0022FF, see idle-overlay.tsx's
         own doc comment on this same file) — brightness(0) crushes that to
         solid black regardless of hue, then invert(1) flips it to solid
         white, matching this page's white text/photo-backdrop treatment
         (site-intro.tsx instead uses plain brightness(0) alone, since its
         own background is light). Left edge matches ROW's own `calc(198px *
         var(--grid-scale))` margin — per direct follow-up ("左面は座標の情
         報と揃える"), the exact same left value ScenicMapBackground's own
         CoordinatesReadout/LocationNameReadout use at the bottom of the
         screen. */}
      <div style={idleContentFadeStyle}>
        <div
          className="absolute flex flex-col items-start"
          style={{ top: "24px", left: "calc(198px * var(--grid-scale))" }}
        >
          <Link href="/" className="block shrink-0">
            <Image
              src={withBasePath("/andmade-logo.svg")}
              alt="ANDMADE"
              width={LOGO_WIDTH_PX}
              height={LOGO_HEIGHT_PX}
              className="block"
              style={{ filter: "brightness(0) invert(1)" }}
            />
          </Link>
          {/* Curtain-reveal (not a plain fade) per direct follow-up ("404の
             切り替わる際の3行英字もカーテンリビールで表示して") — `active`
             passed explicitly as `idle` itself (rather than left to
             CurtainRevealLines' own default "reveal once on mount"
             behavior), since this can toggle idle → not-idle → idle
             repeatedly across a single page visit and should curtain-reveal
             again every time, not just the first. The logo above keeps its
             own plain opacity fade (via the ancestor idleContentFadeStyle) —
             only this text gets the curtain treatment. */}
          <CurtainRevealLines
            lines={BRAND_TAGLINE_LINES}
            active={idle}
            className="text-left text-[14px] leading-[1.25] font-medium text-white"
            style={{ marginTop: BRAND_LOGO_TAGLINE_GAP_PX }}
          />
        </div>

        {/* Konami hint — see KONAMI_HINT_TEXT's own doc comment. Same
           text treatment and ROW_TOP/198px position as the "Not Found" it
           stands in for. Its own opacity fade layers *inside* the group's
           idle crossfade: the group fades the hint in with everything else,
           then this fades it back out alone after 5 seconds while the
           logo/tagline stay. pointer-events-none so an invisible (or
           fading) hint never swallows clicks aimed at the map behind it. */}
        <p
          className={`${ROW_TEXT_CLASS} pointer-events-none`}
          style={{
            left: "calc(198px * var(--grid-scale))",
            top: ROW_TOP,
            opacity: konamiHintVisible ? 1 : 0,
            transitionProperty: "opacity",
            transitionDuration: `${FADE_MS}ms`,
            transitionTimingFunction: "ease-out",
          }}
        >
          {KONAMI_HINT_TEXT}
        </p>
      </div>
      </div>

      <MobileNotFound sorrySwapped={sorrySwapped} />
    </div>
  );
}
