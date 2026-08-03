"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NowPlayingTicker } from "@/components/now-playing-ticker";
import { useNowPlaying } from "@/components/now-playing-provider";
import { introDefinitelyWontShow, willIntroShow } from "@/components/site-intro";
import { isSamePath } from "@/lib/route-path";

/** fadeIn's own fade-in duration — see that prop's own doc comment. */
const FADE_IN_MS = 500;

// Exported so mobile-home.tsx's own full-screen nav overlay (SP's "Menu"
// button) can reuse the exact same items instead of duplicating this list.
export const NAV_ITEMS = [
  { label: "Projects", href: "/" },
  { label: "About", href: "/about" },
  { label: "Studies", href: "/studies" },
  { label: "Contact", href: "/contact" },
];

type SiteHeaderProps = {
  /** Skips this header's usual mix-blend-exclusion, on both its own text and
   *  NowPlayingTicker's inner container — used on the 404 page (Figma node
   *  923:171), whose own spec renders this exact same header in plain white
   *  with no blend mode at all, unlike every other page it appears on. */
  noBlend?: boolean;
  /** Skips rendering the "ANDMADE Inc." link — used on the 404 page, which
   *  renders its own persistent copy of it separately, outside this
   *  header's own idle-fade wrapper (per explicit request: "ANDMADE Inc.も
   *  表示されたままにしておいて"), so it isn't duplicated underneath. */
  hideBrand?: boolean;
  /** Renders in plain black text with no blend mode at all — used by the
   *  Studies page (Figma node 934:540), whose cream (#f6f4f0) background
   *  sits outside any mix-blend-exclusion ancestor (unlike Home/About, which
   *  blend this same white header against their own light backgrounds).
   *  Mirrors SiteFooter's own `theme: "dark"` treatment. Implies `noBlend`
   *  (a blended *black* header would just invert back to white against a
   *  light backdrop, so blending only ever makes sense for the white text). */
  dark?: boolean;
  /** Renders with no blend mode, same as `dark` — used on the Contact page,
   *  whose black (#000) background sits outside any mix-blend-exclusion
   *  ancestor (like `dark`, a blended white header would just invert back to
   *  white against a dark backdrop, so blending never applies here). Text
   *  itself is now plain white (#fff) — same hex as the non-contact `text`
   *  branch below — per direct follow-up ("contactページの背景色は#000に、
   *  文字はすべて#fffに"); kept as its own branch (not folded into the
   *  default) since `contact` still needs to skip blending, unlike the
   *  default white-on-blend case. */
  contact?: boolean;
  /** Fades in instead of rendering instantly visible — per direct follow-up
   *  asking specifically for this ("PC,SPのトップページが表示されるとき、
   *  ヘッダーもフェードインで表示するようにして。そしたらリロードした際に
   *  alpha0%のヘッダーはイントロが表示される瞬間に一瞬見える現象はなくなる
   *  はず"), which also doubles as a fix for a separate real-device report:
   *  with this header's own default/first-painted state now genuinely
   *  invisible (opacity 0) rather than instantly fully opaque, even the
   *  unavoidable pre-hydration server paint (see site-intro.tsx's own
   *  useLayoutEffect doc comment on why that specific gap can't be closed
   *  from client-side React state alone) shows nothing here to flash.
   *
   *  Waits for site-intro.tsx's own "andmade:intro-complete" event before
   *  actually fading in, rather than starting the fade immediately on mount
   *  — per direct follow-up ("ヘッダーはイントロからトップに切り替わってか
   *  らフェードインするようにして"): an immediate mount-time fade would just
   *  finish silently *underneath* the still-opaque intro overlay whenever the
   *  intro is going to play at all, with nothing left to actually see once it
   *  disappears — same `willIntroShow`/`andmade:intro-complete` pairing
   *  mobile-menu.tsx's own reveal-timing already uses for exactly this
   *  reason. On any visit where the intro *isn't* going to show at all
   *  (`willIntroShow` false), there's nothing to wait for, so this just fades
   *  in immediately on mount instead, same as before.
   *
   *  Only Home (app/page.tsx) passes this; every other page keeps rendering
   *  this header instantly, unchanged. */
  fadeIn?: boolean;
  /** Overrides which NAV_ITEMS entry renders as "current" (muted, non-link)
   *  instead of the usual `pathname === item.href` check — used by
   *  app/projects/[slug]/page.tsx (per direct follow-up "ヘッダーメニューの
   *  Projectをcurrent表示に"): a project detail page's own pathname is
   *  `/projects/[slug]`, which never matches "/" (Projects' own href), so
   *  without this override "Projects" would render as a plain link there
   *  even though a project detail page is conceptually still part of the
   *  Projects section. Pass the *href* of the item that should show as
   *  current (e.g. `"/"`) — undefined (default) keeps every other page's
   *  existing pathname-based behavior unchanged. */
  currentHref?: string;
  /** Renders the `currentHref`-matched item as a real (still muted-looking)
   *  Link instead of a non-interactive `<span>` — per direct follow-up on
   *  app/projects/[slug]/page.tsx ("ヘッダーのcurrentのProjectsは実績詳細
   *  ページでは押してトップへ戻れるようにして"): unlike the plain
   *  pathname-based "current" case (you're already ON that exact page, so a
   *  link back to itself would be pointless), a project detail page is only
   *  *conceptually* part of the Projects section — "Projects" showing as
   *  current there is a section indicator, not literally "you are here",
   *  so it still makes sense as a real link back to "/". Only takes effect
   *  together with `currentHref`; ignored for the ordinary pathname-based
   *  branch. */
  currentHrefClickable?: boolean;
};

export function SiteHeader({
  noBlend = false,
  hideBrand = false,
  dark = false,
  contact = false,
  fadeIn = false,
  currentHref,
  currentHrefClickable = false,
}: SiteHeaderProps) {
  const pathname = usePathname();
  const nowPlaying = useNowPlaying();
  // transform-gpu (translateZ(0)) appended alongside mix-blend-exclusion —
  // per direct follow-up ("pcのsafariで見たとき、トップのTxt時にホバーで背
  // 景イメージが表示される際、ヘッダーが白文字の状態になってブレンドモード
  // が効いてない状態になる"). An earlier attempt instead promoted the
  // *interfering* fixed-position hover-preview image onto its own GPU layer
  // (project-hover-preview.tsx, confirmed NOT to fix it, reverted — see that
  // file's own doc comment). This is the complementary direction: forcing
  // the actually-blended elements themselves onto their own compositing
  // layer — a known workaround for the general class of Safari/WebKit bug
  // where mix-blend-mode silently stops compositing against the true page
  // backdrop near other GPU-layer-promoting siblings (here, home-view.tsx's
  // `position: fixed` hover-preview images). Confirmed fixed by the user on
  // real Safari ("OKいけた").
  const blend = noBlend || dark || contact ? "" : "mix-blend-exclusion transform-gpu";
  const text = dark ? "text-black" : contact ? "text-[#fff]" : "text-white";
  const textMuted = dark ? "text-black/50" : contact ? "text-[#fff]/50" : "text-white/50";
  const hoverMuted = dark ? "hover:text-black/50" : contact ? "hover:text-[#fff]/50" : "hover:text-white/50";
  // Reverse of hoverMuted — a complete literal per branch (not built by
  // concatenating "hover:" with `text` at runtime, which Tailwind's JIT
  // compiler wouldn't recognize as a real class) — used only by the
  // clickable-current nav item below, so it brightens on hover instead of
  // muting further, signaling it's interactive despite looking "current".
  const hoverFull = dark ? "hover:text-black" : contact ? "hover:text-[#fff]" : "hover:text-white";

  // Starts already-revealed (no fade) unless `fadeIn` is set *and* the splash
  // is actually still outstanding at this very mount — every other call site
  // (fadeIn unset) keeps today's instant-visible behavior byte-for-byte.
  //
  // The `introDefinitelyWontShow()` half of this — per direct follow-up
  // asking specifically to drop the fade when there's no splash to wait for
  // ("下層からトップに戻るときはヘッダーはフェードインつけないで"): every
  // navigation *back* to "/" within the same session (the splash only ever
  // plays once per session at most — see site-intro.tsx's own
  // `introDecision` doc comment) used to still start hidden here and fade in
  // a moment later via the effect's own event-listener branch below, reading
  // as an unwanted, unnecessary fade on every return trip instead of only on
  // the one genuine first-load-with-intro case. Computed via a lazy
  // initializer (not a plain `useState(!fadeIn)` + effect) so it's decided
  // once, up front, before the first paint.
  //
  // `introDefinitelyWontShow()` specifically, *not* `!willIntroShow(pathname)`
  // — an earlier version used the latter and caused a real hydration
  // mismatch (Next's dev overlay reported it directly: server rendered this
  // header pre-revealed, `opacity: 1`, while the client's first hydration
  // pass computed `opacity: 0`): `willIntroShow`'s own SSR branch returns
  // `false` (nothing decided yet server-side), which reads as "won't show"
  // to a plain `!` negation even on a genuine fresh "/" load where the intro
  // *is* about to play once hydrated — see `introDefinitelyWontShow`'s own
  // doc comment (site-intro.tsx) for exactly why it stays safely `false`
  // (matching the server's own render) through both SSR and the client's own
  // first hydration pass, only ever turning `true` on a later, purely
  // client-side mount — i.e. exactly the "returning to '/' from elsewhere"
  // case this was actually meant to fix.
  const [revealed, setRevealed] = useState(() => !fadeIn || introDefinitelyWontShow());

  useEffect(() => {
    if (!fadeIn || !willIntroShow(pathname)) return;

    function handleIntroComplete() {
      setRevealed(true);
    }
    window.addEventListener("andmade:intro-complete", handleIntroComplete, { once: true });
    return () => window.removeEventListener("andmade:intro-complete", handleIntroComplete);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately mount-only: `pathname` is intentionally only read at its initial value, matching mobile-menu.tsx's own identical `willIntroShow(pathname)` convention (see that file's own doc comment).
  }, [fadeIn]);

  // Applied directly on each individually mix-blend-exclusion'd element below
  // — never on this shared <header> itself — per direct follow-up that the
  // fade briefly showed plain white text flipping to black right as it
  // finished ("pcのとき一瞬白文字の状態から黒文字に変わる挙動になってる"):
  // any CSS `opacity` below 1 forces its element into a new, *isolated*
  // stacking context (a hard CSS rule, unrelated to blend-mode itself) — had
  // this stayed on the shared header (an ancestor of several *separately*
  // mix-blend-exclusion'd children: the brand link, `<nav>`, "Playing"/
  // NowPlayingTicker, "No music playing."), every one of them would blend
  // only against each other inside that one isolated group for as long as
  // the header's own opacity was below 1, not against the site's real
  // background behind it — reading as flat, unblended white — and only
  // resume blending against the *real* backdrop the instant opacity finally
  // reached exactly 1, which is exactly the reported white→black snap.
  // Setting `opacity`/`mix-blend-mode` on the *same* single element instead
  // doesn't have this problem: that element's own content still isolates as
  // a group first, but the group's *result* then blends via its own
  // mix-blend-mode against the true backdrop the whole time, at any opacity,
  // including mid-fade — so each piece below carries its own opacity instead
  // of inheriting one shared value from this header.
  const revealStyle = { opacity: revealed ? 1 : 0, transitionDuration: `${FADE_IN_MS}ms` };

  return (
    <header
      className="relative mt-[24px] ml-[calc(198px*var(--grid-scale))] h-[calc(14px*var(--scale))] w-[var(--content-width-fluid)]"
      data-name="hd"
    >
      {!hideBrand && (
        <Link
          href="/"
          className={`absolute left-0 top-0 whitespace-nowrap text-[length:calc(14px*var(--scale))] leading-[1.5] font-medium ${text} transition-opacity ease-out [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${blend}`}
          style={revealStyle}
        >
          ANDMADE Inc.
        </Link>
      )}

      <nav
        aria-label="Primary"
        className={`absolute left-[calc(348px*var(--grid-scale))] top-0 flex items-center gap-[calc(5px*var(--scale))] whitespace-nowrap text-[length:calc(14px*var(--scale))] leading-[1.5] font-medium transition-opacity ease-out ${blend}`}
        style={revealStyle}
      >
        {NAV_ITEMS.map((item, i) => {
          const isCurrent =
            currentHref !== undefined ? isSamePath(item.href, currentHref) : isSamePath(pathname, item.href);
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
        // No opacity/transition here — same "never on a shared ancestor of
        // multiple separately-blended elements" reasoning as revealStyle's
        // own doc comment above; this div itself carries no blend-mode, but
        // both children below do, each independently.
        <div
          className="absolute top-0 flex h-[calc(11px*var(--scale))] items-start gap-[calc(10px*var(--scale))]"
          style={{ right: "var(--edge-right-inset)" }}
        >
          <p
            className={`whitespace-nowrap text-[length:calc(12px*var(--scale))] leading-[1.5] font-medium ${textMuted} transition-opacity ease-out [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${blend}`}
            style={revealStyle}
          >
            Playing
          </p>
          <NowPlayingTicker
            text={`${nowPlaying.artist} - ${nowPlaying.title}`}
            url={nowPlaying.url}
            albumImageUrl={nowPlaying.albumImageUrl}
            noBlend={noBlend || dark || contact}
            dark={dark}
            contact={contact}
            revealed={revealed}
          />
        </div>
      ) : (
        <p
          className={`absolute top-0 whitespace-nowrap text-right text-[length:calc(12px*var(--scale))] leading-[1.5] font-medium ${textMuted} transition-opacity ease-out [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${blend}`}
          style={{ right: "var(--edge-right-inset)", ...revealStyle }}
        >
          No music playing.
        </p>
      )}
    </header>
  );
}
