"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLenis } from "lenis/react";
import { CopyrightYear } from "@/components/copyright-year";
import { NowPlayingTicker } from "@/components/now-playing-ticker";
import { useNowPlaying } from "@/components/now-playing-provider";
import { willIntroShow } from "@/components/site-intro";
import { NAV_ITEMS } from "@/components/site-header";
import { getFooterReady, getFooterReadyServerSnapshot, subscribeFooterReady } from "@/lib/footer-mode-store";
import { getLightMenuPill, getLightMenuPillServerSnapshot, subscribeLightMenuPill } from "@/lib/menu-theme-store";

/** Back-to-top start/end — dispatched by handleBackToTop below, listened to
 *  by mobile-home.tsx (to suppress its own project-preview image while
 *  smooth-scrolling back up through the list — see that component's own
 *  handleBackToTopStart/End). Window events rather than direct props for the
 *  same reason footerMode is now a store, not a prop — see this file's own
 *  top-level doc comment: this component mounts once, persistently, in
 *  app/layout.tsx, with no stable prop-passing relationship to whichever
 *  page happens to be mounted underneath it at the moment a tap fires. */
const BACK_TO_TOP_START_EVENT = "andmade:back-to-top-start";
const BACK_TO_TOP_END_EVENT = "andmade:back-to-top-end";

/** Fires on every `expanded` change (open OR footerMode — see useFooterMode
 *  below) — idle-overlay.tsx listens for this so the 25s idle "screensaver"
 *  never appears (or gets dismissed) while this panel is expanded in either
 *  form, per direct follow-up ("MENU開いてるときは25秒で表示するやつは
 *  無し"). Both are mounted from app/layout.tsx (see that file), so a window
 *  event is still the simplest way to connect them — same convention as
 *  "andmade:intro-complete" elsewhere in this codebase. */
const MENU_OPEN_CHANGE_EVENT = "andmade:menu-open-change";

/** True once the user has scrolled (near) all the way to the bottom of
 *  whichever page is currently mounted — auto-expands this same pill into
 *  this same panel, exactly like a tap does, but showing footer-equivalent
 *  content instead (no Close button; a Back to top button in its place) —
 *  There is no longer a separate SP footer component now that this
 *  component absorbs its role — this pill *is* the
 *  footer once scrolled down, rather than a separate card it hands off to.
 *  Scrolling back away from the bottom flips this back to false,
 *  auto-shrinking back into the plain closed MENU pill, per the same
 *  follow-up ("上にスクロールしたら、フッターが縮小してMENUに変わる仕様に
 *  して"). Read from lib/footer-mode-store.ts (see that file's own doc
 *  comment) rather than a prop — this component mounts once, persistently,
 *  in app/layout.tsx (see this file's own top-level doc comment), so there's
 *  no stable page component above it to prop-drill this from; each page
 *  writes its own value into that store instead. */
function useFooterMode() {
  return useSyncExternalStore(subscribeFooterReady, getFooterReady, getFooterReadyServerSnapshot);
}

/** See lib/menu-theme-store.ts's own doc comment — whether the *closed*
 *  pill should render white/black instead of the usual black/white. */
function useLightMenuPill() {
  return useSyncExternalStore(subscribeLightMenuPill, getLightMenuPill, getLightMenuPillServerSnapshot);
}

/** Pill's own resting height/radius — matches the pre-redesign MENU button
 *  exactly (height 30, rounded-full ⇒ radius 15 at that height). Also reused
 *  by the panel's own Close/Back-to-top button (see below) so it matches the
 *  MENU pill's own closed height exactly, per direct follow-up ("Closeボタン
 *  はMENUボタンと高さ合わせて、幅も8マス分に"). Briefly tried at 4px, then
 *  6px, then 10px across three direct follow-ups, reverted back to this
 *  original 15 per a further direct follow-up asking to undo that whole
 *  round of adjustment ("変更前の元の値に戻してください"). */
const CLOSED_HEIGHT_PX = 30;
const CLOSED_RADIUS_PX = 15;
/** Figma node 1052:877 ("menu")'s own literal radius once open. */
const OPEN_RADIUS_PX = 20;
/** Inner content width — 10 of the panel's own 12 grid columns, centered,
 *  per direct follow-up ("中の要素はグリッド10マス分に合わせる"), leaving a
 *  1-column inset on each side instead of the previous flat px-[24px]
 *  padding. */
const CONTENT_COLUMNS = 10;
/** Bottom button's own width (Close while tap-opened, Back to top while
 *  footerMode — see BOTTOM_BUTTON's own doc comment below) — 10 grid columns
 *  (was 8), matching CONTENT_COLUMNS exactly, per direct follow-up ("CLOSE
 *  ボタンの幅は10マス分に"). */
const CLOSE_BUTTON_COLUMNS = 10;
/** Outer panel's own resting distance from the screen's bottom edge (was 14,
 *  then 6) — 6 → 8, then 8 → 10, both per direct follow-up ("SPのMenuを全
 *  ページ2px上に移動" ×2 — the second one explicitly confirmed as a further,
 *  cumulative 2px on top of the first, not a duplicate of it), moving the
 *  sitewide MENU pill (and, since CLOSE's own vertical position is
 *  deliberately pinned to match it — see the follow-up below — the panel's
 *  own CLOSE button too) up 2px each time, 4px total. The inner content
 *  wrapper's own bottom padding below the bottom button (was 24, now 6) —
 *  per direct follow-up ("メニューの下マージンを6px、padding-bottomを6px
 *  にして"). The two stack: PANEL_BOTTOM_MARGIN_PX (this panel's own gap
 *  from the screen) + CONTENT_BOTTOM_PADDING_PX (the gap from the panel's
 *  own bottom edge to the button's bottom edge) — originally tuned to 12px
 *  total per a related follow-up ("CLOSEボタンの縦位置はMENUと同じ下マージ
 *  ン12pxの位置に配置したい"), now 16px total after these two 2px moves. */
const PANEL_BOTTOM_MARGIN_PX = 10;
const CONTENT_BOTTOM_PADDING_PX = 6;
/** Now Playing card's own height while it *is* shown. Originally kept
 *  reserved/constant even while nothing was playing (per an earlier direct
 *  follow-up, "再生中の曲が無くても開いたときの高さは同じにして", with a
 *  "No music playing." placeholder filling the same space) — reversed by a
 *  later, further direct follow-up ("再生中の曲が無い場合は、再生中エリア
 *  はトリでメニューの高さもその分短くする仕様にしてみて"): the whole card
 *  (and the placeholder) is now omitted entirely whenever nothing's playing,
 *  and the panel's own measured open height shrinks by this much to match —
 *  see the Now Playing block's own conditional render below. */
const NOW_PLAYING_HEIGHT_PX = 150;

/** Two-phase "grow" sequence for the panel's own outer shape when opening —
 *  per direct follow-up ("開くときのアニメーションは、まず横に広がってから
 *  上に伸びる"): width animates first, then height starts only once the
 *  width transition finishes (via a transitionDelay of EXPAND_WIDTH_MS on
 *  the height property itself — see the outer wrapper's own inline
 *  `transition` below), rather than the previous single transition-all
 *  animating both simultaneously. border-radius runs across the whole
 *  combined duration so the corners straighten out gradually across both
 *  phases instead of snapping partway through. Closing still animates every
 *  shape property back down together (CLOSE_SHAPE_MS) — reversing the
 *  sequence for closing wasn't asked for, and a simple simultaneous shrink
 *  reads fine there. Tuned faster than the original flat 500ms across the
 *  board per a further direct follow-up ("表示速度ももう少し速く気持ち良い
 *  動きにして"), then EXPAND_HEIGHT_MS specifically slowed back down a
 *  little (200→280) per a still further direct follow-up ("もう少し上に伸
 *  びるときの速度落としてみて") — only the vertical phase, not the width
 *  one, since that's the one called out. Both the tap-triggered `open` and
 *  the scroll-triggered `footerMode` reuse this exact same sequence (see
 *  `expanded` below) — the whole point of the footer-merge follow-up was
 *  that scrolling to the bottom should look like "the same thing MENU does
 *  when tapped". */
const EXPAND_WIDTH_MS = 180;
const EXPAND_HEIGHT_MS = 280;
const EXPAND_TOTAL_MS = EXPAND_WIDTH_MS + EXPAND_HEIGHT_MS;
/** Closing shape duration — 350 → 300 (a small nudge, not a full retune) per
 *  direct follow-up ("CLOSEで閉じるとき...ほんの少しだけ速度を速くして
 *  イージングを付けて閉じるようにして"), which also asked for the same
 *  pronounced MENU_EASE curve used on open (see the outer wrapper's own
 *  `transition` style below) rather than the plain `ease-out` this used
 *  before — closing previously read as slightly flatter/more mechanical
 *  than opening as a direct result of that difference. */
const CLOSE_SHAPE_MS = 300;
/** Stronger deceleration curve — per direct follow-up ("メニューが開くとき
 *  の速度にもう少しイージングを強めて気持ちいい動きにしてみて。現状だと
 *  ちょっとキュキュっ！って感じがする"): plain `ease-out` reads as a stiff,
 *  mechanical snap at this short a duration. Same curve as idle-overlay.tsx's
 *  own TAGLINE_EASE (a pronounced, fast-start/soft-land "ease out" already
 *  established elsewhere in this codebase for a satisfying reveal feel),
 *  defined separately here since the two files don't share constants.
 *  Originally only applied to the open direction (closing kept plain
 *  `ease-out`), now also applied to closing's own shape shrink — see
 *  CLOSE_SHAPE_MS's own doc comment above. */
const MENU_EASE = "cubic-bezier(0.16, 1, 0.55, 1)";

/** Content reveal — once the shape has *finished* growing (EXPAND_TOTAL_MS),
 *  the bottom button (Close or Back to top) appears first, then the rest of
 *  the panel's content fades in top to bottom after it — per direct
 *  follow-up ("完全に伸びたらまずCLOSEボタンが表示されて、次に上から順に
 *  表示"), inverting the previous order (which faded in strictly top to
 *  bottom, with that button appearing dead last). Each section's own fade
 *  duration/stagger was first tightened alongside EXPAND_WIDTH_MS/
 *  EXPAND_HEIGHT_MS above for a "faster, snappier" follow-up, then eased
 *  back up slightly (200→260) per a still further direct follow-up ("メニュ
 *  ー内の要素が表示されるとき、もう少しだけフェードインをゆっくりにして")
 *  — the stagger gap between sections (CONTENT_STAGGER_MS) is unchanged;
 *  only each section's own fade got more gradual. Bumped once more
 *  (260→320) alongside adding a small translateY rise
 *  (CONTENT_REVEAL_OFFSET_PX) to each section, per a further direct
 *  follow-up asking for the reveal to be more noticeable ("各要素のフェード
 *  インももう少しわかるようにして") — a longer opacity fade alone was still
 *  easy to miss amid the staggered timing; pairing it with actual motion
 *  reads as a much clearer "this just appeared" cue. Only applies to the
 *  *reveal* (opening) direction now — per direct follow-up ("CLOSEを押した
 *  瞬間要素は消して"), every section below reads its own transitionDuration
 *  as `expanded ? CONTENT_FADE_MS : 0`, so closing snaps every section to
 *  hidden instantly the moment Close is pressed rather than fading them out
 *  gradually. */
const CONTENT_FADE_MS = 320;
const CONTENT_STAGGER_MS = 70;
const CONTENT_REVEAL_OFFSET_PX = 8;
const CLOSE_REVEAL_DELAY_MS = EXPAND_TOTAL_MS;
const NAV_REVEAL_DELAY_MS = EXPAND_TOTAL_MS + CONTENT_STAGGER_MS;
const NOW_PLAYING_REVEAL_DELAY_MS = EXPAND_TOTAL_MS + CONTENT_STAGGER_MS * 2;
const INFO_ROW_REVEAL_DELAY_MS = EXPAND_TOTAL_MS + CONTENT_STAGGER_MS * 3;
const COPYRIGHT_REVEAL_DELAY_MS = EXPAND_TOTAL_MS + CONTENT_STAGGER_MS * 4;

/** How long the closed MENU pill's own initial reveal waits beyond mount
 *  before starting its fade-in — per direct follow-up ("Menuが表示される
 *  タイミングを一覧などが表示されて1秒後にフェードインで表示する仕様に
 *  してみて", then clarified further: "一覧表示後1秒後じゃなくて、トップ
 *  が表示して1秒後にして", then retimed: "0.5秒にして"): exactly 0.5s after
 *  the *top page itself* becomes visible — not tied to the list's own
 *  reveal animation actually finishing (that stays independently, staggered
 *  per row; MENU doesn't wait on it). This component's own mount is what
 *  that delay is measured from, and mobile-home.tsx's own
 *  `key={introReplayGeneration}` on this component (see that prop's own doc
 *  comment there) is what keeps "this component's mount" and "the top page
 *  becoming visible" the same moment even when SiteIntro's opaque splash is
 *  involved — otherwise this would mount (and start counting) the instant
 *  the page's own DOM exists, well before the user can actually see it. See
 *  the `mounted` state's own doc comment below for why a flat timer like
 *  this is what's actually wanted here, rather than gating on any kind of
 *  page-readiness signal. */
const MENU_REVEAL_DELAY_MS = 500;

/**
 * Module-level (not React state) — true once the closed pill's own initial
 * reveal has genuinely played once this browser session. Per direct
 * follow-up ("404に遷移時にMenuを一度消してフェードイン表示させずに、ここ
 * もシームレスにして"): navigating to the 404 page was observed to make
 * this pill disappear and replay its whole fade-in from scratch, meaning
 * *something* about landing there remounts this component fresh (this
 * file's own "mounted once per session, in app/layout.tsx" design assumes
 * ordinary client-side navigation never tears this down — an unmatched
 * route apparently isn't quite "ordinary" in that sense, e.g. a real hard
 * navigation/reload straight to a broken link). Rather than chase exactly
 * why that one route remounts things, this flag makes a fresh mount
 * *itself* resilient to it: once revealed for real, any later mount
 * (however it came about) starts already "mounted" below — no re-triggered
 * delay, no re-played fade — instead of blindly restarting the same
 * first-ever-load choreography every time. A plain module-level `let`
 * (rather than another lib/*-store.ts) is enough here — nothing needs to
 * *subscribe* to this changing, only read its current value once at mount.
 */
let hasRevealedMenuOnce = false;

/** Extends the closed pill's own *tap* area by this many px above and below
 *  its visible bounds — per direct follow-up ("MENUのタップが反応するエリ
 *  アを上下5px増やして"), then doubled per a further direct follow-up
 *  ("MENUのタップ可能エリアを上下5px→10pxに変更してみて"). Can't just
 *  enlarge the existing inset-0 button
 *  inside the pill itself: that button's ancestor (the pill div below) is
 *  `overflow-hidden` (needed to clip the always-mounted, still-closed panel
 *  content), which also clips/hit-tests away anything positioned outside its
 *  own box. Handled instead via a separate invisible sibling button (see
 *  below) sized to the pill's own footprint plus this margin on each edge,
 *  sitting *behind* the real pill in DOM order (both share z-50, and same
 *  stacking level falls back to DOM order) so the visible pill's own inner
 *  button still wins hit-testing within its actual bounds — this sibling
 *  only ever actually receives clicks that land in the extra margin ring
 *  where the real pill isn't present to intercept them. */
const TAP_AREA_EXTRA_PX = 10;

/**
 * SP "Menu" — redesigned per Figma node 1052:660 ("sp_index_menu") /
 * 1052:877 ("menu"), replacing the previous plain full-screen nav overlay
 * entirely, per explicit spec: tapping the pill grows it in place into a
 * black, rounded panel (12 grid columns wide, corners animating from the
 * pill's own rounded-full to a flat 20px) containing, top to bottom: the
 * primary nav row, a "Now Playing" card (reusing the same Spotify polling
 * PC's own SiteHeader already runs — see now-playing-provider.tsx — SP
 * simply hadn't surfaced it before), Inquiries/Social, copyright + logo, and
 * a dedicated bottom button. The outer shape grows in two phases (width,
 * then height — see EXPAND_WIDTH_MS below), and once it's fully grown,
 * content fades in with its own staggered delay: the bottom button first,
 * then the rest top to bottom — see CLOSE_REVEAL_DELAY_MS below.
 *
 * This same panel now also absorbs what used to be a separate SP footer
 * card: scrolling to (near) the very bottom of the page grows
 * this exact pill into this exact panel automatically — no tap needed — with
 * the only differences being no Close button (there's nothing to "close":
 * scrolling back up is what shrinks it back down) and a Back to top button
 * in its place. `open` (tap-triggered) and `footerMode` (scroll-triggered)
 * are combined into a single `expanded` flag below that drives every visual
 * aspect of the grow/shrink and content reveal identically either way; only
 * the handful of behaviors that are genuinely tap-specific (outside-tap-to-
 * close, scroll-locking while open, which bottom button renders) still
 * branch on `open` alone.
 *
 * Grow target height is *measured*, not a guessed literal copied from
 * Figma's own 453px (a fixed reference-canvas number that would drift out
 * of sync with real content/viewport width) — see `panelRef` below, same
 * measure-then-animate convention as mobile-home.tsx's own VerticalLabel.
 * The measured inner content wrapper is kept at a *fixed*, always-fully-open
 * width (not the outer pill's own animating width) specifically so that
 * measurement reflects the text's real wrapped-at-full-width height even
 * while the outer shape is still animating through its own narrower,
 * pill-width states — otherwise the content would measure taller (more
 * wrapping) at the pill's own narrow width and that wrong number would get
 * baked in as the "open" target.
 *
 * Mounted exactly once, persistently, as a sibling of `{children}` inside
 * SmoothScroll in app/layout.tsx (see that file) — not per-page inside
 * mobile-home.tsx/mobile-about.tsx like it originally was. Per direct
 * follow-up reporting two symptoms that repeated timing patches kept failing
 * to actually fix ("まだアニメーションがスムーズじゃない" /
 * "トップにもどったときにまだすぐにボタン類が押せない"): with the old
 * per-page approach, every client-side navigation genuinely unmounted this
 * whole component and mounted a brand-new instance under the next page,
 * which is a real structural cause for exactly those two symptoms —
 * animation interrupted mid-flight by the very unmount handleNavClick below
 * was trying to give time to finish, and a fresh instance's own effects
 * (scroll-lock, panel-height measurement, the reveal timer) all re-running
 * from scratch on every single page load. Hoisting this to the layout
 * removes that whole unmount/remount cycle by construction: the exact same
 * component instance now persists across every client-side navigation, so
 * there's nothing left to interrupt an in-flight close animation and no
 * fresh-mount setup cost paid on returning to a page. `open` is now local
 * state (nothing outside this component ever needed to control it), and
 * `footerMode`/back-to-top notifications, which genuinely do need to come
 * from whichever page is currently mounted, go through
 * lib/footer-mode-store.ts and window events respectively instead of props
 * — see useFooterMode's own doc comment and BACK_TO_TOP_START_EVENT above.
 */
export function MobileMenu() {
  const lenis = useLenis();
  const pathname = usePathname();
  const router = useRouter();
  const nowPlaying = useNowPlaying();
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const footerMode = useFooterMode();
  const lightPill = useLightMenuPill();
  // Shared by every text color inside the expanded panel below (nav, Now
  // Playing card, Inquiries/Social, copyright) — see this component's own
  // doc comment on the outer pill's `bg-white`/`bg-black` swap above for why
  // this needs to invert too, not just the closed pill's own label.
  const panelText = lightPill ? "text-black" : "text-white";
  const panelMuted = lightPill ? "text-black/50" : "text-white/50";

  // Intercepts plain Next <Link> navigation so the panel shrinks via the
  // same `setOpen(false)` transition the Close button itself triggers,
  // rather than just popping shut instantly when the page unmounts — per
  // direct follow-up ("MenuでトップからAbout、Aboutからトップに移動する際、
  // MenuのCloseを押したときと同じように閉じてほしい。現状だとパっと閉じて
  // る印象").
  //
  // Two earlier versions of this handler (a full CLOSE_SHAPE_MS wait before
  // navigating, then a double-requestAnimationFrame-deferred navigate) both
  // existed only to protect this shrink transition from a real risk at the
  // time: MobileMenu used to live *inside* each page's own component tree
  // (mobile-home.tsx/mobile-about.tsx), so `router.push` swapping the page
  // also unmounted MobileMenu itself mid-shrink, cutting the CSS transition
  // off before the browser ever got to paint it. Neither timing tweak fully
  // resolved the underlying feel (see this file's own top-level doc comment
  // on the persistence refactor this was ultimately traced to). Now that
  // MobileMenu is mounted once, persistently, in app/layout.tsx — never
  // torn down by a page-level navigation at all — that risk is gone by
  // construction: this transition plays out on its own uninterrupted
  // timeline regardless of when `router.push` actually swaps the page
  // underneath it, so navigating in the very same tick `setOpen(false)`
  // fires is no longer just safe, it's simplest.
  function handleNavClick(href: string) {
    return (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      setOpen(false);
      router.push(href);
    };
  }

  // Whether the panel should currently be grown open, whichever of the two
  // ways triggered it — see useFooterMode's own doc comment above for why
  // these two are unified into one flag for almost everything below.
  const expanded = open || footerMode;

  // Starts hidden and only reveals once mounted client-side -- per direct
  // follow-up ("リフレッシュしたときにMENUが一瞬表示される" / "トップが表
  // 示されてからMENUが押せるようになるまで一瞬時間がかかる"): this
  // component (like the rest of the SP tree) renders on the server and
  // paints on the client a moment before React finishes hydrating, so
  // without this gate the closed pill flashed fully visible before
  // site-intro.tsx's own separate mount effect got a chance to cover it
  // with its opaque splash.
  //
  // `mounted` flips MENU_REVEAL_DELAY_MS (0.5s) after mount, rAF-deferred so
  // the pre-reveal state definitely paints first -- a plain, flat timer. An
  // intermediate version instead waited on both this timer *and* the
  // browser's own `load` event (plus requestIdleCallback) before revealing,
  // on the theory that a real device's main thread might not have caught up
  // on hydration/other handlers by the time a fixed delay alone would
  // suggest -- chasing a real-device report of MENU (and the project list)
  // not responding to a tap right after the page displayed. A dedicated
  // on-device investigation (a temporary tap-diagnostic overlay, since
  // removed) traced that report to something else entirely: rapid,
  // closely-spaced re-taps -- the natural reaction to *not* seeing an
  // immediate visual response -- getting bundled by iOS's own native
  // gesture recognition into a single delayed tap, rather than any one tap
  // actually failing to register. A single, deliberately-paced tap
  // succeeded instantly every time, confirming this wasn't a page-readiness
  // problem at all. With the real cause identified as unrelated to page
  // load, the extra load/idle-callback machinery wasn't fixing anything it
  // was added for, so it's gone -- back to the plain timer this started as.
  //
  // Since this component now mounts exactly once per browser session (see
  // this file's own top-level doc comment on the persistence refactor),
  // "this component's mount" and "the top page's own intro splash, if any"
  // need to be reconciled without the old key={introReplayGeneration}
  // remount trick mobile-home.tsx used to force on this component (that
  // trick doesn't make sense anymore now that MobileMenu isn't rendered
  // from mobile-home.tsx at all): if the *very first* page this session
  // happens to be "/", site-intro.tsx's own splash may cover the screen for
  // a while after this component has already mounted underneath it, so the
  // timer instead waits for that component's own "andmade:intro-complete"
  // event before starting — matching the old key trick's effect without
  // depending on a remount to get it. `willIntroShow` mirrors site-intro.tsx's
  // own mount-time show/skip check exactly (see that function's own doc
  // comment) so this can tell, without waiting for the event to definitely
  // decide not to fire, whether SiteIntro is even going to show anything to
  // wait for at all (e.g. the first page this session is any route other
  // than "/", or it's "/" but SiteIntro's own one-shown-per-day check has
  // already been satisfied) — in either of those cases the timer just
  // starts immediately from this component's own mount, exactly like it
  // always did on any non-"/" route before this refactor.
  //
  // hasRevealedMenuOnce (module-level, declared above this component, NOT
  // React state) — see its own doc comment above for why. */
  const [mounted, setMounted] = useState(hasRevealedMenuOnce);

  useEffect(() => {
    if (hasRevealedMenuOnce) return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cleanupFrame: (() => void) | null = null;

    function reveal() {
      hasRevealedMenuOnce = true;
      setMounted(true);
    }

    function startTimer() {
      timeoutId = setTimeout(() => {
        const frame = requestAnimationFrame(reveal);
        cleanupFrame = () => cancelAnimationFrame(frame);
      }, MENU_REVEAL_DELAY_MS);
    }

    if (willIntroShow(pathname)) {
      window.addEventListener("andmade:intro-complete", startTimer, { once: true });
      return () => {
        window.removeEventListener("andmade:intro-complete", startTimer);
        if (timeoutId) clearTimeout(timeoutId);
        cleanupFrame?.();
      };
    }

    startTimer();
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      cleanupFrame?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately mount-only: `pathname` is intentionally only read at its initial value, matching site-intro.tsx's own identical mount-only pathname check (see willIntroShow's own doc comment) — this component now mounts exactly once per session, so there's no later navigation this should re-run for.
  }, []);


  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    let frame: number | null = null;
    function update() {
      if (!el) return;
      setPanelHeight(el.offsetHeight);
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
  }, [nowPlaying.isPlaying]);

  // Locks scrolling for the duration the panel is *tap-opened* — per
  // explicit spec ("メニュー表示中はスワイプやスクロールはできなくする").
  // Deliberately keyed on `open` alone, not `expanded`: locking scroll while
  // footerMode is active would trap the user at the bottom of the page with
  // no way to scroll back up, which is the one and only thing that's
  // supposed to shrink it back down again. Three layers, verified live one
  // at a time since each one alone turned out insufficient on its own: (1)
  // `lenis?.stop()` — but Lenis intercepting wheel/touch input to drive its
  // own smooth-scroll apparently means `.stop()` just stops it from
  // *animating* the scroll, not from moving it at all (the background list
  // still visibly scrolled, just as an instant jump instead of a smooth
  // one). (2) `overflow: hidden` on both `<html>` and `<body>` — the page's
  // own scrolling box is the root `<html>` element, not `<body>`, in
  // standards mode, so both need it, but even both together still didn't
  // stop `window.scrollY` from moving. (3) A direct, capturing
  // `wheel`/`touchmove` listener that calls `preventDefault()` outright —
  // the only layer that actually blocked it in testing. Kept all three
  // rather than only the third: the first two are also what make PC's own
  // header dropdowns/overlays behave, and removing them risked masking a
  // real bug there instead of just this panel's own scroll lock.
  useEffect(() => {
    if (!open) return;
    lenis?.stop();
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    function blockScroll(event: Event) {
      event.preventDefault();
    }
    window.addEventListener("wheel", blockScroll, { passive: false });
    window.addEventListener("touchmove", blockScroll, { passive: false });

    return () => {
      lenis?.start();
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener("wheel", blockScroll);
      window.removeEventListener("touchmove", blockScroll);
    };
  }, [open, lenis]);

  // Broadcasts `expanded` to anything listening — see MENU_OPEN_CHANGE_EVENT's
  // own doc comment above (currently just idle-overlay.tsx).
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(MENU_OPEN_CHANGE_EVENT, { detail: { open: expanded } }));
  }, [expanded]);

  const openHeight = panelHeight ?? CLOSED_HEIGHT_PX;

  function handleBackToTop() {
    window.dispatchEvent(new Event(BACK_TO_TOP_START_EVENT));
    // Falls back to a plain native smooth-scroll if the Lenis instance
    // isn't available for any reason — matches the former SP footer's own
    // former implementation of this exact button.
    if (lenis) {
      lenis.scrollTo(0, { onComplete: () => window.dispatchEvent(new Event(BACK_TO_TOP_END_EVENT)) });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => window.dispatchEvent(new Event(BACK_TO_TOP_END_EVENT)), 1000);
    }
  }

  return (
    <>
      {/* Outside-tap-to-close catcher — per explicit spec ("メニュー外の上
          エリアをタップしてもCloseする仕様"). Scoped to `open` alone (not
          `expanded`): there's no tap-to-dismiss for footerMode, only
          scrolling back up — see useFooterMode's own doc comment above.
          Covers the *entire* viewport at a lower z-index than
          the panel itself, so taps anywhere the panel doesn't actually
          occupy fall through to this and close it, while taps on the
          panel's own content are captured by the panel (on top) first and
          never reach here. lg:hidden on every one of this component's own
          top-level elements individually (not a single shared
          `display:contents` wrapper around all three, which this used
          briefly during the MobileMenu persistence refactor — see this
          file's own top-level doc comment): `display: contents` removing an
          ancestor's own box while its `position: fixed` children still need
          correct hit-testing/touch dispatch against the viewport is a real,
          inconsistent WebKit behavior on iOS Safari specifically, never
          reproduced in desktop devtools emulation — a plausible cause for a
          real-device-only "still not tappable" report right after that
          wrapper was introduced. */}
      {open && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Invisible, oversized tap catcher — see TAP_AREA_EXTRA_PX's own doc
          comment above. Only present while fully closed (matching the real
          pill's own pointer-events-none there — no point catching taps for a
          trigger that isn't visually present, including while footerMode has
          it grown into footer content). Purely a hit target: not in the tab
          order and hidden from assistive tech, since the real, accessible
          "Menu" button below already covers its own footprint and remains
          the actual focusable control. */}
      {!expanded && mounted && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-hidden
          tabIndex={-1}
          className="fixed left-1/2 z-50 -translate-x-1/2 cursor-pointer lg:hidden"
          style={{
            // calc(...) + env(safe-area-inset-bottom) — see the real panel's
            // own identical `bottom` doc comment below.
            bottom: `calc(${PANEL_BOTTOM_MARGIN_PX - TAP_AREA_EXTRA_PX}px + env(safe-area-inset-bottom))`,
            height: CLOSED_HEIGHT_PX + TAP_AREA_EXTRA_PX * 2,
            width: `calc(var(--sp-grid-column-width) * 8)`,
            // touch-action: manipulation — per direct follow-up ("スマホで
            // 見るとまだ反応鈍い"): with the default `touch-action: auto`,
            // real touch browsers can hold a tap for a moment while they
            // decide whether it's the start of a double-tap-to-zoom or pan
            // gesture before actually firing `click` — a delay that never
            // reproduces with devtools' own mouse-driven touch emulation,
            // only on genuine touch hardware. `manipulation` tells the
            // browser this element is a plain tap target (no
            // double-tap-zoom, no need to wait), skipping that
            // disambiguation delay entirely.
            touchAction: "manipulation",
          }}
        />
      )}

      <div
        className={`fixed left-1/2 z-50 -translate-x-1/2 overflow-hidden lg:hidden ${
          // Inverted while expanded too (was `lightPill && !expanded`) — per
          // direct follow-up ("Menuを開いたときも白黒反転させて"): the whole
          // grown panel (nav/Now Playing/Inquiries/Social/copyright/Close —
          // see each one's own `lightPill`-conditional class below) flips to
          // black-on-white on the 404 page, not just the closed pill.
          lightPill ? "bg-white" : "bg-black"
        } ${!mounted && !expanded ? "pointer-events-none opacity-0" : "scale-100 opacity-100"}`}
        style={{
          // calc(...) + env(safe-area-inset-bottom) — this component is a
          // persistent, all-routes singleton (app/layout.tsx), but
          // app/about/page.tsx alone now sets `viewport-fit=cover` (see that
          // file's own `viewport` export doc comment), which also extends
          // *this* page's own bottom coordinate space to include the
          // home-indicator safe area — without this, this fixed `bottom`
          // offset would shift that many px closer to the true bottom edge
          // specifically while on /about, crowding the home-indicator
          // gesture area. `env(safe-area-inset-bottom)` resolves to 0 on
          // every route without `viewport-fit=cover`, so this is a no-op
          // everywhere else.
          bottom: `calc(${PANEL_BOTTOM_MARGIN_PX}px + env(safe-area-inset-bottom))`,
          width: expanded ? `calc(var(--sp-grid-column-width) * 12)` : `calc(var(--sp-grid-column-width) * 8)`,
          height: expanded ? openHeight : CLOSED_HEIGHT_PX,
          borderRadius: expanded ? OPEN_RADIUS_PX : CLOSED_RADIUS_PX,
          transformOrigin: "center bottom",
          // touch-action: manipulation — see the tap-catcher's own identical
          // doc comment above (skips the browser's tap-vs-gesture
          // disambiguation delay on real touch hardware).
          //
          // willChange: transform — per direct follow-up ("検証ツールだと
          // 問題なさそうなんだけど、スマホで見るとまだ反応鈍い"): this
          // element's own `transform` and shape both animate via CSS
          // transitions, and real mobile browsers are known (in this exact
          // codebase — see mobile-home.tsx's own willChange usage and its
          // doc comment on a different, but analogous, real-device-only
          // compositing bug) to promote/demote a `fixed` element to/from its
          // own GPU layer on the fly far more aggressively than desktop
          // Chrome's own compositor, which desktop devtools' emulation never
          // reproduces since it's still fundamentally desktop Chrome
          // underneath. Declaring `willChange` up front asks the browser to
          // keep this on a dedicated layer persistently instead of
          // promoting it right as a tap comes in, which is the same class
          // of real-device-only lag already fixed for scroll compositing
          // elsewhere in this codebase.
          touchAction: "manipulation",
          willChange: "transform",
          // Width-then-height sequencing on open, simultaneous on close —
          // see EXPAND_WIDTH_MS's own doc comment above. Driven by
          // `expanded` so footerMode reuses the exact same grow/shrink
          // choreography as a tap-triggered open. Close now shares the same
          // MENU_EASE curve as open (was plain `ease-out`) — see
          // CLOSE_SHAPE_MS's own doc comment above.
          //
          // background-color 300ms — per direct follow-up ("SPの実績詳細で
          // Next ProjectまでスクロールしてMenuの色が変わるのを、フェードで
          // 変わるようにして"): `lightPill`'s own bg-white/bg-black class
          // swap above previously had no transition at all, so scrolling
          // into/out of the Next Project zone (see mobile-project-detail
          // .tsx's own nextProjectRef) snapped this pill's base color
          // instantly instead of easing between the two.
          transition: expanded
            ? `width ${EXPAND_WIDTH_MS}ms ${MENU_EASE}, height ${EXPAND_HEIGHT_MS}ms ${MENU_EASE} ${EXPAND_WIDTH_MS}ms, border-radius ${EXPAND_TOTAL_MS}ms ${MENU_EASE}, transform 500ms ease-out, opacity 500ms ease-out, background-color 300ms ease-out`
            : `width ${CLOSE_SHAPE_MS}ms ${MENU_EASE}, height ${CLOSE_SHAPE_MS}ms ${MENU_EASE}, border-radius ${CLOSE_SHAPE_MS}ms ${MENU_EASE}, transform 500ms ease-out, opacity 500ms ease-out, background-color 300ms ease-out`,
        }}
      >
        {/* Collapsed "Menu" label/trigger — fades out immediately as the
            panel starts opening (no delay needed there), but fades back in
            only *after* the shrink finishes when closing (transitionDelay:
            CLOSE_SHAPE_MS) rather than simultaneously with it — per direct
            follow-up ("CLOSEを押したとき、縮んでからMENUの文字を表示させ
            て"): fading it in while the pill was still visibly shrinking
            read as the label overlapping/fighting with the shape animation
            instead of a clean handoff. Driven by `expanded` so it hides the
            same way whether footerMode or a tap grew the panel. */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-hidden={expanded}
          tabIndex={expanded ? -1 : 0}
          className={`absolute inset-0 flex cursor-pointer items-center justify-center text-[12px] font-medium transition-all duration-300 ease-out ${
            lightPill && !expanded ? "text-black" : "text-white"
          } ${expanded ? "pointer-events-none opacity-0" : "opacity-100"}`}
          style={{ transitionDelay: expanded ? "0ms" : `${CLOSE_SHAPE_MS}ms`, touchAction: "manipulation" }}
        >
          Menu
        </button>

        {/* Panel content — always mounted (so `panelRef` can measure its
            true natural height even while visually closed/clipped), fixed
            at the fully-open width regardless of the outer shape's own
            current animated width (see this component's own doc comment
            above for why), only interactive once expanded. The actual
            content below is nested one level further in, constrained to
            CONTENT_COLUMNS (10 of these 12) and centered via mx-auto — per
            direct follow-up ("中の要素はグリッド10マス分に合わせる") —
            replacing the previous flat px-[24px] padding. */}
        <div
          ref={panelRef}
          aria-hidden={!expanded}
          className={`pt-[32px] ${lightPill ? "text-black" : "text-white"}`}
          style={{ width: `calc(var(--sp-grid-column-width) * 12)`, paddingBottom: CONTENT_BOTTOM_PADDING_PX }}
        >
          <div className="mx-auto" style={{ width: `calc(var(--sp-grid-column-width) * ${CONTENT_COLUMNS})` }}>
            {/* justify-between across every individual token (label, comma,
                label, comma, ...) — not just the four label+comma groups as
                justify-between originally was, and not a flat fixed gap
                either (a later revision briefly tried gap-[6px] here, but
                that stopped the row from spanning the full content width,
                leaving "Contact" — the last token, with no trailing comma —
                landing wherever the row's own natural content width happened
                to end rather than flush with the grid's own right edge, per
                direct follow-up "Contactの右面がグリッドに沿ってない"). With
                every token (not just each label+comma pair) as a direct
                flex-between sibling, CSS's own space-between guarantees every
                gap — label-to-comma and comma-to-next-label alike — gets the
                exact same literal free-space value (per the earlier direct
                follow-up "「Projects , About , Studies, Contact」のマージンは
                ,含め均等にして"), while the first token (Projects) still
                starts flush left and the last (Contact) still ends flush
                right against this row's own full width — CONTENT_COLUMNS'
                own grid-aligned right edge. */}
            <nav
              aria-label="Primary"
              className="flex items-center justify-between text-[20px] leading-[1.05] font-medium ease-out"
              style={{
                opacity: expanded ? 1 : 0,
                transform: expanded ? "translateY(0)" : `translateY(${CONTENT_REVEAL_OFFSET_PX}px)`,
                transitionProperty: "opacity, transform",
                transitionDuration: expanded ? `${CONTENT_FADE_MS}ms` : "0ms",
                transitionDelay: expanded ? `${NAV_REVEAL_DELAY_MS}ms` : "0ms",
              }}
            >
              {NAV_ITEMS.map((item, i) => {
                const isCurrent = pathname === item.href;
                return (
                  <Fragment key={item.label}>
                    {isCurrent ? (
                      <span aria-current="page" className={`${panelMuted} [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]`}>
                        {item.label}
                      </span>
                    ) : (
                      <Link
                        href={item.href}
                        onClick={handleNavClick(item.href)}
                        className={`${panelText} [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]`}
                        tabIndex={expanded ? 0 : -1}
                      >
                        {item.label}
                      </Link>
                    )}
                    {i < NAV_ITEMS.length - 1 && (
                      <span className={`${panelText} [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]`}>,</span>
                    )}
                  </Fragment>
                );
              })}
            </nav>

            {/* Now Playing — omitted entirely (no reserved height either)
                whenever nothing's playing, per direct follow-up ("再生中の
                曲が無い場合は、再生中エリアはトリでメニューの高さもその分
                短くする仕様にしてみて"), reversing an earlier version that
                always reserved NOW_PLAYING_HEIGHT_PX and showed a "No music
                playing." placeholder in its place — panelRef's own
                ResizeObserver (see its `[nowPlaying.isPlaying]` dependency
                above) picks up the resulting shorter/taller measured height
                automatically. No rounded corners on the background (was
                rounded-[12px]) per a further direct follow-up ("再生中エリ
                アの背景は角丸にしない"). Track name uses the same sliding
                NowPlayingTicker PC's own SiteHeader already shows, per a
                further direct follow-up ("曲名とか入らない場合は、他で実装
                してるのと同様に文字がスライドする仕様に") — noBlend since
                this panel is a plain opaque black card, not blended against
                the page like SiteHeader's own text layer. centerWhenFits —
                see that prop's own doc comment in now-playing-ticker.tsx —
                per a later, separate follow-up scoped specifically to this
                SP menu display, unlike SiteHeader's own unchanged
                always-left-aligned default.

                The whole card (label, album art, and ticker text together)
                is now one single tappable link out to the track on Spotify
                whenever a URL is present — per direct follow-up ("SPで再生
                中の曲をタップでもspotifyに飛べるようにして"): previously
                only NowPlayingTicker's own internal `<a>` wrapped just the
                sliding track-name text (matching PC's own SiteHeader usage,
                which never renders album art there at all), so tapping the
                album art or the "Now Playing" label specifically did
                nothing. `url` is no longer passed to NowPlayingTicker itself
                here — real `<a>` elements can never nest inside one another,
                so with this outer link now covering the whole card,
                NowPlayingTicker's own would-be inner `<a>` has to stay off. */}
            {nowPlaying.isPlaying && (
              <div
                className="mt-[40px] ease-out"
                style={{
                  height: NOW_PLAYING_HEIGHT_PX,
                  opacity: expanded ? 1 : 0,
                  transform: expanded ? "translateY(0)" : `translateY(${CONTENT_REVEAL_OFFSET_PX}px)`,
                  transitionProperty: "opacity, transform",
                  transitionDuration: expanded ? `${CONTENT_FADE_MS}ms` : "0ms",
                  transitionDelay: expanded ? `${NOW_PLAYING_REVEAL_DELAY_MS}ms` : "0ms",
                }}
              >
                {nowPlaying.url ? (
                  <a
                    href={nowPlaying.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`mx-auto flex h-full w-fit flex-col items-center justify-center gap-[12px] px-[20px] ${lightPill ? "bg-black/15" : "bg-white/15"}`}
                  >
                    <p className={`text-[12px] font-medium [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${panelText}`}>Now Playing</p>
                    {nowPlaying.albumImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- external, dynamic Spotify CDN URL
                      <img src={nowPlaying.albumImageUrl} alt="" className="h-[62px] w-[62px] object-cover" />
                    ) : (
                      <div className="h-[62px] w-[62px] bg-[#d9d9d9]" />
                    )}
                    <NowPlayingTicker
                      text={`${nowPlaying.artist} - ${nowPlaying.title}`}
                      albumImageUrl={null}
                      noBlend
                      dark={lightPill}
                      centerWhenFits
                    />
                  </a>
                ) : (
                  <div
                    className={`mx-auto flex h-full w-fit flex-col items-center justify-center gap-[12px] px-[20px] ${lightPill ? "bg-black/15" : "bg-white/15"}`}
                  >
                    <p className={`text-[12px] font-medium [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${panelText}`}>Now Playing</p>
                    {nowPlaying.albumImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- external, dynamic Spotify CDN URL
                      <img src={nowPlaying.albumImageUrl} alt="" className="h-[62px] w-[62px] object-cover" />
                    ) : (
                      <div className="h-[62px] w-[62px] bg-[#d9d9d9]" />
                    )}
                    <NowPlayingTicker
                      text={`${nowPlaying.artist} - ${nowPlaying.title}`}
                      albumImageUrl={null}
                      noBlend
                      dark={lightPill}
                      centerWhenFits
                    />
                  </div>
                )}
              </div>
            )}

            {/* Inquiries/Social — each column center-aligned internally (was
                items-start), and Social moved to the row's own right edge as
                a direct justify-between sibling of Inquiries (was nested
                together inside a shared `flex gap-[30px]` wrapper, which left
                justify-between with nothing else to push against) — per
                direct follow-up ("InquiriesとInfo@、SocialとInstagram , Xは
                それぞれ中央揃えにして" / "Socialはメニューエリア内の右に配
                置"). */}
            <div
              className="mt-[40px] flex items-end justify-between text-[12px] leading-[1.4] ease-out"
              style={{
                opacity: expanded ? 1 : 0,
                transform: expanded ? "translateY(0)" : `translateY(${CONTENT_REVEAL_OFFSET_PX}px)`,
                transitionProperty: "opacity, transform",
                transitionDuration: expanded ? `${CONTENT_FADE_MS}ms` : "0ms",
                transitionDelay: expanded ? `${INFO_ROW_REVEAL_DELAY_MS}ms` : "0ms",
              }}
            >
              <div className="flex flex-col items-center gap-[12px] whitespace-nowrap">
                <p className={`font-(family-name:--font-courier) tracking-[-0.7px] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${panelMuted}`}>
                  Inquiries
                </p>
                <a
                  href="mailto:info@andmade.jp"
                  className={`font-medium underline [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${panelText}`}
                  tabIndex={expanded ? 0 : -1}
                >
                  info@andmade.jp
                </a>
              </div>
              <div className="flex flex-col items-center gap-[12px] whitespace-nowrap">
                <p className={`font-(family-name:--font-courier) tracking-[-0.7px] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${panelMuted}`}>
                  Social
                </p>
                <div className={`flex items-center gap-[2px] font-medium ${panelText}`}>
                  <a
                    href="https://www.instagram.com/andmade_inc"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
                    tabIndex={expanded ? 0 : -1}
                  >
                    Instagram
                  </a>
                  <span className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">,</span>
                  <a
                    href="https://x.com/ANDMADE_jp"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
                    tabIndex={expanded ? 0 : -1}
                  >
                    X
                  </a>
                </div>
              </div>
            </div>

            <div
              className="mt-[40px] flex items-end justify-between ease-out"
              style={{
                opacity: expanded ? 1 : 0,
                transform: expanded ? "translateY(0)" : `translateY(${CONTENT_REVEAL_OFFSET_PX}px)`,
                transitionProperty: "opacity, transform",
                transitionDuration: expanded ? `${CONTENT_FADE_MS}ms` : "0ms",
                transitionDelay: expanded ? `${COPYRIGHT_REVEAL_DELAY_MS}ms` : "0ms",
              }}
            >
              <div className={`text-[22px] leading-[1.05] font-medium [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${panelText}`}>
                <p className="mb-0">
                  ©<CopyrightYear />
                </p>
                <p>ANDMADE Inc.</p>
              </div>
              <Link href="/" onClick={handleNavClick("/")} className="h-[40px] w-[40px] shrink-0" tabIndex={expanded ? 0 : -1}>
                {/* andmade-mark-black.svg — a solid-black-fill twin of the
                    original solid-white-fill andmade-mark.svg (baked-in SVG
                    fill colors, not overridable via currentColor from an
                    <img>/<Image> src reference) — per this panel's own
                    invert-on-404 follow-up: the white mark would otherwise
                    disappear against this panel's own inverted white
                    background. */}
                <Image
                  src={lightPill ? "/andmade-mark-black.svg" : "/andmade-mark.svg"}
                  alt="ANDMADE"
                  width={40}
                  height={40}
                  className="h-full w-full"
                />
              </Link>
            </div>

            {/* Bottom button — height: CLOSED_HEIGHT_PX / width:
                CLOSE_BUTTON_COLUMNS grid columns (was w-full, py-[11px]; the
                column count itself was later bumped from 8 to 10 — "CLOSEボ
                タンの幅は10マス分に" — now equal to CONTENT_COLUMNS, so
                mx-auto is a no-op today but kept in case that ever changes
                again). rounded-[15px] still matches CLOSED_RADIUS_PX exactly
                (a 30px-tall fully-rounded pill), same shape as the MENU
                pill's own resting state. mt-[30px] (was 24) per direct
                follow-up ("CLOSEボタン上マージンは30px"). Reveals *first* —
                CLOSE_REVEAL_DELAY_MS, right as the shape finishes growing —
                rather than last, per direct follow-up ("完全に伸びたらまず
                CLOSEボタンが表示されて、次に上から順に表示"); see
                CLOSE_REVEAL_DELAY_MS's own doc comment above. Swaps between
                Close (tap-opened) and Back to top (footerMode) — per direct
                follow-up ("フッター要素はCLOSEボタンが無いのとback to top
                ボタンが追加になってる以外、マージンや開き方などすべて同じ
                にして"): same slot, same size, same reveal timing, only the
                label and the tap action itself differ. `open` (not
                `expanded`) picks which one renders — footerMode alone
                (open === false) always gets Back to top; the only way
                Close ever shows is a genuine tap-open.

                bg-white/text-black — briefly tried bg-white/25 + text-white
                per a direct follow-up, reverted back to the original
                bg-white/text-black on a further direct follow-up ("やっぱ
                りCloseボタンとback to topの色を元に戻して"). */}
            {open ? (
              <button
                type="button"
                onClick={() => setOpen(false)}
                tabIndex={expanded ? 0 : -1}
                className={`mx-auto mt-[30px] flex cursor-pointer items-center justify-center rounded-[15px] text-[12px] font-medium ease-out ${
                  lightPill ? "bg-black text-white" : "bg-white text-black"
                } ${expanded ? "" : "pointer-events-none"}`}
                style={{
                  width: `calc(var(--sp-grid-column-width) * ${CLOSE_BUTTON_COLUMNS})`,
                  height: CLOSED_HEIGHT_PX,
                  opacity: expanded ? 1 : 0,
                  transform: expanded ? "translateY(0)" : `translateY(${CONTENT_REVEAL_OFFSET_PX}px)`,
                  transitionProperty: "opacity, transform",
                  transitionDuration: expanded ? `${CONTENT_FADE_MS}ms` : "0ms",
                  transitionDelay: expanded ? `${CLOSE_REVEAL_DELAY_MS}ms` : "0ms",
                }}
              >
                Close
              </button>
            ) : (
              <button
                type="button"
                onClick={handleBackToTop}
                tabIndex={expanded ? 0 : -1}
                className={`mx-auto mt-[30px] flex cursor-pointer items-center justify-center rounded-[15px] text-[12px] font-medium ease-out ${
                  lightPill ? "bg-black text-white" : "bg-white text-black"
                } ${expanded ? "" : "pointer-events-none"}`}
                style={{
                  width: `calc(var(--sp-grid-column-width) * ${CLOSE_BUTTON_COLUMNS})`,
                  height: CLOSED_HEIGHT_PX,
                  opacity: expanded ? 1 : 0,
                  transform: expanded ? "translateY(0)" : `translateY(${CONTENT_REVEAL_OFFSET_PX}px)`,
                  transitionProperty: "opacity, transform",
                  transitionDuration: expanded ? `${CONTENT_FADE_MS}ms` : "0ms",
                  transitionDelay: expanded ? `${CLOSE_REVEAL_DELAY_MS}ms` : "0ms",
                }}
              >
                Back to Top
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
