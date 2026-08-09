"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useLenis } from "lenis/react";
import { IdleDateTime } from "@/components/idle-datetime";
import { IdleNowPlaying } from "@/components/idle-now-playing";
import { VerticalLabel } from "@/components/vertical-label";
import { fetchTokyoTemperatureC, WEATHER_POLL_MS } from "@/lib/tokyo-weather";
import { withBasePath } from "@/lib/base-path";
import { isSamePath } from "@/lib/route-path";

/** How long with zero cursor movement / interaction before this shows —
 *  25s → 30s per direct follow-up ("PCともに秒数を25→30秒にして"). SP briefly
 *  had its own much shorter 1s wait for quick manual testing ("SPで1秒で表
 *  示するようにして"), then reverted back to matching PC's own 30s per a
 *  further direct follow-up ("SPも30秒でオーバーレイを表示する仕様にし
 *  て") — Shift+I (see below) already covers the "need it right now for
 *  testing" case without needing a separate, permanently-shorter production
 *  timer for SP. Back to one single shared constant. */
const IDLE_MS = 30_000;

/** Pages this overlay is allowed to appear on — mirrors NAV_ITEMS's own
 *  hrefs in site-header.tsx/header-summon.tsx. "/studies" was excluded while
 *  that page didn't exist yet (it 404'd too); now that it's built, it's
 *  included here per explicit request ("studiesページも25秒後に表示するやつ
 *  反映して"). Anything else, including the actual 404 page
 *  (app/not-found.tsx), is *not* a known route here — this overlay is
 *  mounted once in the root layout regardless of which page rendered, and
 *  app/not-found.tsx's own pathname is just whatever invalid path the
 *  visitor hit, not some special "/404" value, so there's no way to detect
 *  "this is the 404 page" other than checking against the actual set of real
 *  routes. Per explicit request ("25秒で表示されるやつは404ページでは無し")
 *  this overlay should never show there. */
const KNOWN_ROUTES = ["/", "/about", "/contact", "/studies"];
/** How long the whole overlay takes to fade out on dismiss (click, or
 *  moving the cursor while it's showing). */
const EXIT_FADE_MS = 300;

/** Same copy as site-intro.tsx's tagline (Figma reuses it here too). PC's
 *  own tagline (below) keeps this exact 3-line break; SP uses its own
 *  4-line break instead (SP_TAGLINE_LINES) — see that constant's own doc
 *  comment. */
const TAGLINE_LINES = [
  "ANDMADE is an independent design studio based in Tokyo,",
  "partnering with brands to create thoughtful experiences through",
  "art direction, graphic design, and digital design.",
];

/** SP-only line break for the same copy as TAGLINE_LINES above — per direct
 *  follow-up ("英字テキストは下記の改行で調整"), a dedicated 4-line break
 *  rather than reusing PC's 3-line one: SP's tagline reads top-to-bottom
 *  (VerticalLabel rotation) with its own font-size fit to the real viewport
 *  height (see taglineFontSizePx below), and this particular line break was
 *  specified directly rather than derived from PC's own wrapping. Left as a
 *  fully separate constant (not a `.flatMap` re-wrap of TAGLINE_LINES) so
 *  PC's own 3-line layout stays completely unaffected. */
const SP_TAGLINE_LINES = [
  "ANDMADE is an independent design studio",
  "based in Tokyo, partnering with brands to create",
  "thoughtful experiences through art direction,",
  "graphic design, and digital design.",
];

/** Matches site-intro.tsx's own per-line mask reveal exactly — same
 *  technique and timing, reused here for this overlay's own tagline
 *  ("上のテキストはイントロの文字の出方で" — explicit request to reuse it). */
const TAGLINE_EASE = "cubic-bezier(0.16, 1, 0.55, 1)";
const TAGLINE_REVEAL_MS = 700;
const TAGLINE_LINE_STAGGER_MS = 150;

/** When SP's own date/time block (see spDateTimeRevealed's own doc comment)
 *  starts its delayed fade-in — the instant SP's own tagline's (4 lines, see
 *  SP_TAGLINE_LINES) very *last* line starts moving (its own
 *  `transitionDelay`: index × TAGLINE_LINE_STAGGER_MS), not once that line's
 *  own reveal motion has fully *finished* (which would add a further
 *  TAGLINE_REVEAL_MS, 700ms, on top). 450ms → this — per two follow-ups in
 *  sequence: first adding this delay at all ("SPでオーバーレイの表示時も3行
 *  英字が表示されてから日付の列がフェードインで表示されるようにして"),
 *  originally waiting for the last line's full reveal to finish (1150ms
 *  total), then trimming it back per a further direct follow-up that that
 *  read as "one beat" too late ("日付列の表示がワンテンポ遅く感じるんだけ
 *  ど、3行英字が表示した瞬間フェードインで調整して" — confirmed specifically
 *  as "the moment the last line starts moving", not the tagline's overall
 *  start). PC's own date/time block (see the JSX below) is untouched — both
 *  follow-ups were specifically about SP. */
const SP_DATETIME_REVEAL_DELAY_MS = (SP_TAGLINE_LINES.length - 1) * TAGLINE_LINE_STAGGER_MS;

/** How long the pills + logo group takes to fade in (separate from the
 *  tagline's own per-line mask reveal above) when the overlay appears. */
const GROUP_FADE_IN_MS = 400;

/** Left-to-right on screen; Figma's own DOM order is left/right/center. */
const PILLS = [
  { label: "Designed with clarity", position: "left" },
  { label: "Built to last", position: "center" },
  { label: "Rooted in purpose", position: "right" },
] as const;

/** Below this window height, the overlay stops shrinking any further —
 *  same `max(100dvh, 750px)` freeze used on the Contact page (see
 *  app/contact/page.tsx's own PAGE_HEIGHT), applied here to this overlay's
 *  own inner content instead of the document, since this is a `fixed`
 *  layer rather than normal page flow.
 *
 *  `100dvh`, not `100vh` — per direct follow-up ("オーバーレイの縦幅もなが
 *  くなってる"): `100vh` on mobile Safari/Chrome resolves to the *largest*
 *  possible viewport (address bar fully collapsed), not the actually-visible
 *  one — so anything sized off it (this, plus every SP measurement below via
 *  spScale()/SP_DATETIME_WIDTH_CSS) was consistently taller than the real,
 *  currently-visible viewport whenever the browser's own UI chrome was
 *  showing, forcing this `overflow-y-auto` layer to scroll even though
 *  nothing was actually supposed to overflow. `100dvh` (dynamic viewport
 *  height) tracks the *real*, currently-visible viewport instead, shrinking/
 *  growing live as the browser chrome shows/hides. */
const COMPACT_MIN_HEIGHT_PX = 750;
const OVERLAY_HEIGHT = `max(100dvh, ${COMPACT_MIN_HEIGHT_PX}px)`;
/** SP's own inner-content height — deliberately plain `100dvh`, with no
 *  COMPACT_MIN_HEIGHT_PX floor — per direct follow-up ("まだオーバーレイの
 *  縦幅が長い"), still persisting even after the vh→dvh fix above: a real
 *  phone's own *visible* height (after browser chrome) commonly lands well
 *  under 750px, so that floor was unconditionally forcing this layer taller
 *  than the actual visible viewport on ordinary phones — not a vh-unit bug,
 *  a genuine forced-minimum that PC's own Contact-page-derived reasoning
 *  doesn't actually apply to SP's fully vh/dvh-scaled panel (see spScale()),
 *  which has no fixed reference content that needs a shrink floor the way
 *  PC's own literal-px layout does. */
const SP_OVERLAY_HEIGHT = "100dvh";

/** SP variant (Figma node 1100:384, "sp_") — per direct follow-up ("スマホで
 *  操作してないと表示される要素は下記のデザインで"): a genuinely different
 *  composition from the PC treatment above, not a responsive reskin of it —
 *  the actual SP page stays visible underneath (no full-page mix-blend-
 *  multiply wash), and instead a translucent white panel sits near the
 *  right side of the screen holding the tagline/date-time/logo/pills content
 *  rotated 90° (VerticalLabel — see that component's own doc comment on the
 *  rotation technique, extracted from mobile-home.tsx's own Tx/Th/"33 Cases"
 *  rail specifically so this could reuse it) so the long horizontal PC copy
 *  reads top-to-bottom instead, fitting a narrow portrait screen.
 *
 *  Unlike the rest of the SP tree (mobile-home.tsx/mobile-menu.tsx, which
 *  deliberately use literal fixed px throughout), every measurement below
 *  scales with the real device's own viewport height via spScale() — per
 *  direct follow-up ("ロゴと3要素は端末の画面サイズに応じて可変させて" /
 *  "英語テキストはどの端末でも縦幅いっぱいに収まるように文字サイズ調整し
 *  て" / "英字テキスト下の日付なども縦幅いっぱいに収まるように調整"): this
 *  overlay is a full-bleed "screensaver" panel meant to gracefully cover the
 *  *entire* screen on any phone, unlike the main scrollable page (which only
 *  ever needs to look right at ordinary phone widths, where fixed px is
 *  fine). See spScale()'s own doc comment for exactly how/why. SP_PANEL_
 *  MARGIN_PX is the one exception, deliberately left a literal, unscaled
 *  8px — per direct follow-up ("ロゴも画面左端から8pxの位置に" / "英字テキ
 *  ストは画面右端から8pxの位置に"), the content groups below sit flush
 *  (`left: 0` / `right: 0`) against this panel's own edges rather than
 *  adding a further scaled inset of their own, so they land at exactly this
 *  fixed 8px from the *true* screen edge on every device, not a value that
 *  drifts with viewport height.
 *
 *  Font sizes at the SP_REFERENCE_HEIGHT_PX reference: tagline 33px (was 53
 *  on PC), date/time 24px (was 30), pills 18px (was 30) — see IdleDateTime's/
 *  IdleNowPlaying's own `variant="sp"` prop for the Now Playing card's own
 *  matching size reduction (still fixed px — its own scaling wasn't part of
 *  this follow-up).
 *
 *  Split from the PC markup below via plain `hidden lg:block`/`lg:hidden`
 *  Tailwind classes — same convention as mobile-home.tsx's own PC/SP split
 *  (no JS viewport check, both trees always mounted, CSS alone decides which
 *  paints — avoids any hydration mismatch). */
// 8px → 6px — per direct follow-up ("Menu下面とオーバーレイの高さの下面が
// 揃ってないから、Menuの黒ベタが2pxくらいオーバーレイの下から見えてる
// から、オーバーレイの上下マージンを6pxにして"): mobile-menu.tsx's own
// closed-pill bottom margin (PANEL_BOTTOM_MARGIN_PX) sits closer to the true
// screen edge than this panel's own inset did, so the translucent panel
// (the only thing that actually covers whatever's behind it — see this
// component's own doc comment on why the *outer* fixed layer itself has no
// background) stopped 2px short of MENU's own bottom edge, leaving that
// sliver of MENU's black visible below the panel. Matching this margin to
// mobile-menu.tsx's own means the panel's bottom edge now reaches exactly as
// far down as MENU's own does.
const SP_PANEL_MARGIN_PX = 6;

/** The actual Figma frame height for node 1100:384 (400×863, confirmed via
 *  the Figma MCP's own get_screenshot — its `original_height`) — the
 *  reference canvas every SP_xxx_PX constant below was originally measured
 *  against. spScale() converts those literal reference numbers into
 *  vh-relative lengths: at a viewport exactly this tall, spScale(N) resolves
 *  to the identical Npx value (pixel-identical to the original fixed-px
 *  design); taller/shorter viewports grow/shrink it proportionally. */
const SP_REFERENCE_HEIGHT_PX = 863;

/** Converts a Npx-at-SP_REFERENCE_HEIGHT_PX reference measurement into a vh
 *  length. Deliberately scaled off viewport *height* (100vh), not width —
 *  every element below sits inside a VerticalLabel, which rotates its
 *  content 90° (see vertical-label.tsx): a block's visual on-screen
 *  *height* after that rotation is actually its own pre-rotation *width*
 *  (rotation swaps the two). So sizing these off 100vh is what actually
 *  keeps each block filling the same proportion of the real screen height
 *  it filled in the 863px-tall reference frame on any device — plain
 *  vw-based sizing wouldn't track that relationship at all, since these
 *  blocks' pre-rotation width has nothing to do with the viewport's width. */
function spScale(px: number): string {
  // dvh, not vh — see OVERLAY_HEIGHT's own doc comment above (the same
  // mobile-Safari-address-bar overflow bug applies to every one of these).
  return `${((px / SP_REFERENCE_HEIGHT_PX) * 100).toFixed(4)}dvh`;
}

const SP_TAGLINE_FONT_PX = 33;
const SP_TAGLINE_LETTER_SPACING_PX = -0.66;
// Literal, fixed 24px — per direct follow-up ("日付などの文字サイズを
// 24pxに"): previously run through spScale() like everything else in this
// panel (vh-relative, so it only actually rendered at 24px on a device
// exactly SP_REFERENCE_HEIGHT_PX tall), but the date/time line's own font
// size specifically is meant to just stay this literal number on every
// device now, matching the rest of the SP tree's own "fixed px" convention
// (mobile-home.tsx/mobile-menu.tsx) rather than scaling with viewport
// height. Only this line's font-size — its own letter-spacing/gap and
// everything else in this panel are unaffected.
const SP_DATETIME_FONT_PX = 24;
const SP_DATETIME_LETTER_SPACING_PX = -0.48;
const SP_DATETIME_GAP_PX = 6;
/** Independent top/bottom margin for the date/time line specifically — per
 *  direct follow-up ("SPの日付列の上下マージンを40pxにして"), decoupled from
 *  the shared SP_PANEL_MARGIN_PX (6px) the same way SP_LOGO_LEFT_PX and
 *  SP_TAGLINE_DATETIME_RIGHT_OFFSET_PX already decoupled their own
 *  offsets — this element simply wants a different margin than the shared
 *  panel default, not a second, independently-drifting copy of it. */
const SP_DATETIME_MARGIN_PX = 40;
/** Extra shrink on top of SP_DATETIME_MARGIN_PX's own top+bottom margin —
 *  per direct follow-up ("SPのオーバーレイに表示されている日付け部分の幅
 *  を、現在より40px縮めて"). Kept separate from SP_DATETIME_MARGIN_PX itself
 *  (rather than just bumping that constant by 20px on each side to the same
 *  net effect) since that constant's own meaning — the line's top/bottom
 *  margin — wasn't what was actually asked to change here, just the line's
 *  own total width. */
const SP_DATETIME_WIDTH_SHRINK_PX = 40;
/** Forces the date/time line's own pre-rotation width to fill the real
 *  viewport height minus SP_DATETIME_MARGIN_PX top and bottom (see that
 *  constant's own doc comment just above — originally derived from the
 *  shared SP_PANEL_MARGIN_PX, now its own dedicated value) and
 *  SP_DATETIME_WIDTH_SHRINK_PX on top of that: since this rotated line's
 *  *visual* on-screen height is really its own pre-rotation width (see
 *  spScale()'s own doc comment above), forcing that width to `100dvh` minus
 *  twice the margin (minus the extra shrink) is what actually stretches it
 *  to fill the screen's full vertical extent with that same margin at the
 *  true top and bottom edges — `dvh`, not `vh`, for the same mobile-Safari
 *  address-bar reason as OVERLAY_HEIGHT's own doc comment above. Passed via
 *  IdleDateTime's own `spSizeOverride.width` (see that component's own doc
 *  comment for why that also switches its items from a small fixed gap over
 *  to justify-between). */
const SP_DATETIME_WIDTH_CSS = `calc(100dvh - ${SP_DATETIME_MARGIN_PX * 2}px - ${SP_DATETIME_WIDTH_SHRINK_PX}px)`;
/** Gap between the tagline block and the date/time block — now that both
 *  sit together in one right-anchored flex row (see the JSX below) instead
 *  of two independently hand-tuned `right` offsets, a plain flex `gap` is
 *  what actually keeps this reliable regardless of either block's own
 *  rendered width. Per direct follow-up ("英字テキストと日付など要素の
 *  マージンは20px"). */
const SP_TAGLINE_DATETIME_GAP_PX = 20;
/** Shifts the tagline+date/time group 6px further right than its own
 *  flush-against-the-panel-edge resting position (`right: 0`) — per direct
 *  follow-up ("英字テキストと日付などを右に6px移動"). Negative, since
 *  `right` is a distance *from* the right edge: moving further right means
 *  a *smaller* (here, negative) right offset, overlapping slightly into
 *  SP_PANEL_MARGIN_PX's own margin strip. */
const SP_TAGLINE_DATETIME_RIGHT_OFFSET_PX = -6;
/** The logo(+pills) group's own left margin from the *true* screen edge —
 *  per direct follow-up ("ロゴの左マージンを8pxに"), now set independently
 *  from the shared SP_PANEL_MARGIN_PX (6px) rather than reusing it directly
 *  — see the JSX below's own doc comment for how. */
const SP_LOGO_LEFT_PX = 8;
// 18px → 20px, and literal/fixed (not spScale()'d) — per direct follow-up
// ("ロゴと3要素のマージンを20pxに"), same "stop scaling with viewport
// height, just stay this literal number" treatment as SP_DATETIME_FONT_PX
// above.
const SP_LOGO_PILLS_GAP_PX = 20;
/** How many SP grid columns the logo's own on-screen height should span —
 *  per direct follow-up ("グリッド2マス分の高さ（ANDMADEの縦の高さが2マ
 *  ス分）になるように調整して", reconfirmed after investigating a separate
 *  rendering bug: "2マス分" is the actual intended target, not a mistaken
 *  spec). Since this rotated element's *visual* on-screen height is really
 *  its own pre-rotation *width* (rotation swaps the two — see spScale()'s
 *  own doc comment above), this many columns' worth of grid-column-width is
 *  applied to the logo's own pre-rotation width below.
 *
 *  Computed in JS (spGridColumnWidthPx below), not read live from the
 *  `--sp-grid-column-width` CSS custom property via a `calc()` string —
 *  per direct follow-up ("ロゴがめっちゃ小さいままでデザイン通りになってな
 *  い"): an earlier version tried `calc(var(--sp-grid-column-width) * 2 *
 *  190 / 1410)` for the logo's own height, and even after fixing an earlier
 *  nested-calc() bug in that exact expression, it still wasn't rendering
 *  reliably. mobile-home.tsx already computes this exact same grid math in
 *  JS (see its own getSpGridColumnWidthPx()) for other purposes — mirroring
 *  that proven, already-working approach here (plain numbers passed to
 *  next/image's `style`, exactly like this logo's own original literal-px
 *  version did) sidesteps calc()-string reliability entirely. */
const SP_LOGO_HEIGHT_COLUMNS = 2;
/** Mirrors globals.css's own `--sp-grid-margin`/`--sp-grid-columns` (see
 *  mobile-home.tsx's own SP_GRID_MARGIN_PX/SP_GRID_COLUMNS for the same
 *  JS-side mirror it already keeps, used there for its own preview-rect
 *  placement math). */
const SP_GRID_MARGIN_PX = 8;
const SP_GRID_COLUMNS = 12;
const SP_PILL_FONT_PX = 18;
const SP_PILL_LETTER_SPACING_PX = -0.36;
const SP_PILL_GAP_PX = 6;
const SP_PILL_PADDING_X_PX = 14;
const SP_PILL_PADDING_Y_PX = 9;

/**
 * "Screensaver" overlay — Figma node 850:1723 ("index_放置してたら", i.e. "if
 * left idle"). Shows after IDLE_MS with no mouse movement/interaction —
 * dismissed (with a fade-out, not instantly) by either a click or simply
 * moving the cursor. Mounted once in the root layout so it can trigger over
 * whichever page is currently open. Does *not* trigger on returning from
 * another tab (an earlier version did; removed per explicit request:
 * "別タブから戻った時はなし").
 *
 * mix-blend-multiply is applied to this overlay's own outer `fixed` div (see
 * the `layerClassName`/`blend` usage below) — not to each blue element
 * individually — so the page underneath stays exactly as it was, with
 * everything in that layer stacked multiplicatively on top of it
 * (transparent areas have no effect, so only the blue shapes themselves
 * visibly blend). Putting it on individual descendants instead doesn't
 * reach the actual page: `position: fixed` unconditionally creates a new
 * stacking context, so a blend-mode set on something *inside* it only
 * blends against other siblings within that same fixed layer (i.e. against
 * nothing, since this overlay has no other background) — reported as
 * "ブレンドモードが効いてないっぽい". Set on the fixed element itself
 * instead, its blend-mode operates one level up, against its own parent's
 * stacking context (the actual page), which is what we want. The one
 * exception is the Contact page (dark olive #181609 background): multiplying
 * blue against it reads muddy/invisible, so blend mode is dropped entirely
 * there per explicit request ("contactページだけブレンドモードは無し"),
 * falling back to plain blue.
 *
 * The Now Playing card (see IdleNowPlaying below) needs to NOT blend even on
 * pages where everything else does (Figma's own version of that card has no
 * mix-blend-multiply, unlike its siblings) — since a descendant can't opt
 * out of an ancestor `fixed` div's own blend-mode (that div's whole subtree
 * is flattened together before the blend is applied against the page), this
 * overlay actually renders as *two* separate sibling `fixed` layers: one
 * blended (tagline/date-time/pills/logo), one not (just the Now Playing
 * card) — see the `return` below.
 *
 * The wordmark at the bottom is the actual Figma vector data (public/andmade-logo.svg,
 * user-provided — this environment can't fetch Figma's own exported asset
 * URLs directly, see andmade-mark.svg's history for the same constraint),
 * not a recreated approximation.
 */
export function IdleOverlay() {
  const pathname = usePathname();
  const isContact = isSamePath(pathname, "/contact");
  // includes(pathname) の生比較 → isSamePath — per direct follow-up
  // ("aboutでアイドルレイヤー発動しない？")。trailingSlash: true の本番では
  // usePathname() が "/about/"（末尾スラッシュ付き）を返すため、生比較だと
  // トップ（"/"）以外のページで一致せず、アイドルレイヤーが一切出なかった
  // （ナビの current 判定で直したのと同じクラスのバグ。dev では "/about" が
  // 返るので気づきにくい）。
  const isKnownRoute = KNOWN_ROUTES.some((route) => isSamePath(pathname, route));
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [revealed, setRevealed] = useState(false);
  // Drives the SP date/time block's own delayed fade-in (see
  // SP_DATETIME_REVEAL_DELAY_MS's own doc comment) — a dedicated state flipped
  // by a real `setTimeout` (below) rather than a plain CSS `transitionDelay`
  // on top of `revealed` directly, per direct follow-up that the CSS-delay
  // version wasn't visibly working ("SPで日付のフェードインが効いてないっぽ
  // い？パって表示されてる"): `transitionDelay` and the `opacity` value it's
  // supposed to delay were both changing in the exact same style update
  // (`revealed` flipping true drives both at once), which in principle is
  // still spec-correct — browsers are supposed to read the delay from the
  // *new* style at the moment of that change — but reportedly wasn't
  // producing a real, visible delayed fade in practice. Splitting the delay
  // out into its own explicit JS timer removes that reliance entirely: this
  // state stays `false` (opacity 0, no CSS delay needed at all) until a
  // plain `setTimeout` scheduled off `revealed` itself actually elapses, then
  // flips straight to `true`, letting a normal, undelayed `transition-
  // opacity` handle just the fade itself — the exact same "explicit JS timer
  // for critical sequencing, not a CSS transition-delay" approach this
  // file's own `dismiss`/exit-fade and site-intro.tsx's own
  // POST_REVEAL_DELAY_MS already use elsewhere.
  const [spDateTimeRevealed, setSpDateTimeRevealed] = useState(false);
  // Tokyo temperature — lifted up from idle-datetime.tsx (see that file's
  // own `temperatureC` prop doc comment) so both the PC and SP IdleDateTime
  // instances below share one fetch/poll instead of running one each, and so
  // `revealed`'s own effect further below can gate the *entire* overlay on
  // it, not just that one line — per direct follow-up ("数秒後に表示される
  // オーバーレイについて、気温の数値データを取得完了してから、オーバーレイ
  // の全要素を表示するように変更してください（データ取得前に要素が表示さ
  // れないようにする）").
  const [temperatureC, setTemperatureC] = useState<number | null>(null);
  // Flips true once the *first* weather fetch attempt has settled — whether
  // it actually succeeded (temperatureC gets a number) or failed
  // (temperatureC stays null, per fetchTokyoTemperatureC's own "just hide
  // it" convention) doesn't matter here; either way there's nothing left to
  // wait for, so the overlay can reveal with whatever it actually resolved
  // to. Not reset on subsequent WEATHER_POLL_MS re-fetches — only the very
  // first one gates the initial reveal; by the time a *later* idle timeout
  // fires, this is already true from the very first mount, so there's no
  // repeated wait on every subsequent appearance.
  const [weatherSettled, setWeatherSettled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const value = await fetchTokyoTemperatureC();
      if (!cancelled) {
        setTemperatureC(value);
        setWeatherSettled(true);
      }
    }
    poll();
    const interval = setInterval(poll, WEATHER_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);
  // Measures the actual gap between the tagline/date-time block and the
  // pills/logo group (see the effect below) so the Now Playing card can sit
  // exactly at its vertical midpoint, per explicit request ("再生中のカード
  // パネルの縦位置は、上の日付と下の3つの要素との中間に配置して") — neither
  // block's own rendered height is a fixed function of --scale alone (the
  // tagline reveals per-line but that doesn't change its box height; the
  // logo's height in particular follows the viewport's own width via its
  // aspect ratio), so this is measured from the real DOM rather than
  // computed via a static calc().
  const dateTimeWrapperRef = useRef<HTMLDivElement>(null);
  const pillsLogoRef = useRef<HTMLDivElement>(null);
  const [nowPlayingTop, setNowPlayingTop] = useState<number | null>(null);
  // Real SP grid column width, read from window.innerWidth directly (not a
  // CSS `calc()` string against `--sp-grid-column-width`) — see
  // SP_LOGO_HEIGHT_COLUMNS's own doc comment above for why. Re-measured on
  // resize so the logo stays grid-aligned across viewport-width changes
  // (rotation, foldables, devtools resize) the same way the live CSS
  // variable would have.
  const [spGridColumnWidthPx, setSpGridColumnWidthPx] = useState<number | null>(null);
  useEffect(() => {
    function update() {
      setSpGridColumnWidthPx((window.innerWidth - SP_GRID_MARGIN_PX * 2) / SP_GRID_COLUMNS);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  // Real visible viewport height, read via window.innerHeight (the JS
  // equivalent of 100dvh — both track the real, currently-visible viewport,
  // shrinking when the browser's own chrome is showing) — used below to fit
  // the tagline's own font-size to the available space. Re-measured on
  // resize (browser chrome show/hide fires this too, not just an actual
  // window resize).
  const [viewportHeightPx, setViewportHeightPx] = useState<number | null>(null);
  useEffect(() => {
    function update() {
      setViewportHeightPx(window.innerHeight);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  // Tagline's own natural (un-fitted) width at the fixed SP_TAGLINE_FONT_PX
  // reference size — measured from an invisible, permanently-reference-sized
  // clone (see the JSX below) rather than the *visible* tagline itself, so
  // adjusting the visible copy's own font-size below can never feed back
  // into this measurement and create a self-correcting-forever loop. Text
  // width scales linearly with font-size for a given piece of text, so one
  // measurement at a known size is enough to solve for the exact font-size
  // that makes the real width match taglineTargetPx below, in one step (no
  // iterative search needed).
  const taglineMeasureRef = useRef<HTMLDivElement>(null);
  const [taglineMeasuredWidthPx, setTaglineMeasuredWidthPx] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = taglineMeasureRef.current;
    if (!el) return;
    let frame: number | null = null;
    function update() {
      if (!el) return;
      setTaglineMeasuredWidthPx(el.offsetWidth);
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
  }, []);
  // Pills row's own natural (un-fitted) width at the fixed SP_PILL_FONT_PX
  // reference — same measure-at-a-known-size-then-scale technique as
  // taglineMeasureRef above, used to enlarge the 3 pills to match the
  // logo's own on-screen height per direct follow-up ("3要素はロゴの高さ
  // と同じに合わせて拡大").
  const pillsMeasureRef = useRef<HTMLDivElement>(null);
  const [pillsMeasuredWidthPx, setPillsMeasuredWidthPx] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = pillsMeasureRef.current;
    if (!el) return;
    let frame: number | null = null;
    function update() {
      if (!el) return;
      setPillsMeasuredWidthPx(el.offsetWidth);
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
  }, []);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitingRef = useRef(false);
  // Mirrors mobile-menu.tsx's own `open` state — see the effect below that
  // listens for MENU_OPEN_CHANGE_EVENT. A ref (not state) since it only ever
  // needs to be read synchronously from inside scheduleIdleTimeout/dismiss,
  // not to drive a render of its own.
  const menuOpenRef = useRef(false);

  const scheduleIdleTimeout = useCallback(() => {
    if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    // Never actually arms the timeout while the SP Menu panel is open — per
    // direct follow-up ("MENU開いてるときは25秒で表示するやつは無し").
    // Checked here (the single choke point every scheduling path already
    // funnels through) rather than in each individual caller.
    if (menuOpenRef.current) return;
    idleTimeoutRef.current = setTimeout(() => setVisible(true), IDLE_MS);
  }, []);

  // Fades the whole overlay out over EXIT_FADE_MS (rather than disappearing
  // instantly) before actually unmounting — used by both the click and
  // cursor-move dismiss paths below. Guarded by exitingRef (not state, so
  // it's readable synchronously) so a second dismiss trigger while already
  // fading out doesn't restart/duplicate the timeout.
  //
  // Accepts (and, if present, cancels) the triggering event — per direct
  // follow-up ("オーバーレイの状態で画面タップするとオーバーレイが消える
  // けど、タップした箇所にボタンなどのリンクエリアがあると遷移しちゃうの
  // で、オーバーレイ時に画面タップするとオーバーレイが消えるだけにして"):
  // IdleNowPlaying's own `<a href={nowPlaying.url}>` wraps its whole card
  // (see that file), which sits *inside* the Now Playing fixed layer whose
  // own onClick is this same `dismiss` (see the JSX below) — a tap directly
  // on that card bubbles up through the anchor and lands here, so without
  // event.preventDefault() the tap both dismissed the overlay *and* let the
  // anchor's own default action (navigating to Spotify) go through
  // underneath it. Calling preventDefault() here, during that same bubble
  // phase and before the browser processes the anchor's default action,
  // blocks the navigation regardless of which dismiss layer actually caught
  // the tap — every call site below (`onClick={dismiss}` on each fixed
  // layer, plus the mousemove/scroll dismiss path, which passes no event at
  // all) still works unchanged since the event is optional.
  const dismiss = useCallback((event?: { preventDefault?: () => void }) => {
    event?.preventDefault?.();
    if (exitingRef.current) return;
    exitingRef.current = true;
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      setExiting(false);
      exitingRef.current = false;
      scheduleIdleTimeout();
    }, EXIT_FADE_MS);
  }, [scheduleIdleTimeout]);

  // Restarts the tagline's mask reveal (see the JSX below) every time the
  // overlay actually shows — reset during render (comparing against a
  // tracked previous value) rather than inside an effect, matching the
  // pattern already established elsewhere in this codebase (e.g.
  // scramble-text.tsx's prevKey, project-view-toggle.tsx's prevShowImages).
  const [prevVisibleForReveal, setPrevVisibleForReveal] = useState(visible);
  if (visible !== prevVisibleForReveal) {
    setPrevVisibleForReveal(visible);
    if (!visible) {
      setRevealed(false);
      setSpDateTimeRevealed(false);
    }
  }

  // Forces the overlay back off the instant the route becomes the 404 page
  // (see KNOWN_ROUTES above) — same render-time-reset idiom as
  // prevVisibleForReveal just above, rather than a setState call inside an
  // effect body (that pattern trips react-hooks' set-state-in-effect rule,
  // and this one is simpler anyway: it only needs to run when isKnownRoute
  // itself flips, not on every render).
  const [prevIsKnownRoute, setPrevIsKnownRoute] = useState(isKnownRoute);
  if (isKnownRoute !== prevIsKnownRoute) {
    setPrevIsKnownRoute(isKnownRoute);
    if (!isKnownRoute) setVisible(false);
  }

  // Gated on `weatherSettled` too — see that state's own doc comment above.
  // Re-runs (cheaply — the rAF below is a no-op cost) whenever weatherSettled
  // itself flips true while the overlay is already `visible`, e.g. Shift+I
  // force-showing it before the very first fetch has resolved.
  useEffect(() => {
    if (!visible || !weatherSettled) return;
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, [visible, weatherSettled]);

  // See spDateTimeRevealed's own declaration above — a real timer, started
  // only once `revealed` itself actually flips true (i.e. right as the
  // tagline's own per-line reveal starts), so this always fires
  // SP_DATETIME_REVEAL_DELAY_MS after that same starting point regardless of
  // how `revealed` got set (the rAF above, or Shift+I forcing the overlay
  // open before the weather fetch settles).
  useEffect(() => {
    if (!revealed) return;
    const timeout = setTimeout(() => setSpDateTimeRevealed(true), SP_DATETIME_REVEAL_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [revealed]);

  // Measures the actual midpoint between the tagline/date-time block and
  // the pills/logo group (see nowPlayingTop's own declaration above) and
  // re-measures on resize, since the logo's own rendered height (and so the
  // pills/logo group's top edge) tracks the viewport's width.
  useEffect(() => {
    if (!visible) return;
    function measure() {
      const dateTimeEl = dateTimeWrapperRef.current;
      const pillsLogoEl = pillsLogoRef.current;
      if (!dateTimeEl || !pillsLogoEl) return;
      const dateTimeBottom = dateTimeEl.getBoundingClientRect().bottom;
      const pillsLogoTop = pillsLogoEl.getBoundingClientRect().top;
      setNowPlayingTop((dateTimeBottom + pillsLogoTop) / 2);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [visible]);

  // Mirrors `visible` into a ref so the event handlers below (registered
  // once, not re-attached on every `visible` change) can always read the
  // current value instead of a stale one from whenever they were attached.
  const visibleRef = useRef(visible);
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  // Listens for mobile-menu.tsx's own MENU_OPEN_CHANGE_EVENT — while the SP
  // Menu panel is open, this overlay must never appear (scheduleIdleTimeout
  // above already refuses to arm the timer whenever menuOpenRef.current is
  // true); if it happened to already be showing the instant the panel opens,
  // it's dismissed immediately (with its normal fade, via `dismiss`) rather
  // than left up underneath the panel. Not gated on isKnownRoute — the Menu
  // panel only ever exists on SP pages this overlay is already allowed on,
  // so there's nothing to guard against by skipping the listener elsewhere,
  // and keeping it unconditional means no route-change edge case can leave a
  // stale `true` behind in menuOpenRef.
  useEffect(() => {
    function handleMenuOpenChange(event: Event) {
      const menuOpen = (event as CustomEvent<{ open: boolean }>).detail.open;
      menuOpenRef.current = menuOpen;
      if (menuOpen) {
        if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
        if (visibleRef.current) dismiss();
      } else {
        scheduleIdleTimeout();
      }
    }
    window.addEventListener("andmade:menu-open-change", handleMenuOpenChange);
    return () => window.removeEventListener("andmade:menu-open-change", handleMenuOpenChange);
  }, [dismiss, scheduleIdleTimeout]);

  // Shift+I — force-shows the overlay immediately, bypassing the IDLE_MS
  // wait, for quick manual testing — same convention as grid-overlay.tsx's
  // own Shift+G toggle. Per direct follow-up ("すぐ確認できるようにオーバー
  // レイをすぐ表示して"). Gated on isKnownRoute the same way the real timer
  // already is, so this can't force the overlay onto a page it's not
  // supposed to appear on (e.g. the 404 page).
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!event.shiftKey || event.key.toLowerCase() !== "i" || !isKnownRoute) return;
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
      setVisible(true);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isKnownRoute]);

  useEffect(() => {
    // Never schedule/attach anything on the 404 page — see KNOWN_ROUTES
    // above (the render-time reset just above handles forcing any
    // already-visible overlay back off).
    if (!isKnownRoute) return;

    scheduleIdleTimeout();

    // Resets the idle clock — while already showing, does nothing (that
    // case is handled by handleMouseMove/the overlay's own onClick below).
    function resetIdleTimer() {
      if (!visibleRef.current) scheduleIdleTimeout();
    }

    // Moving the cursor or scrolling now also dismisses the overlay while
    // it's showing, not just an explicit click (per explicit request:
    // "クリックだけじゃなく、カーソルを動かした場合も要素を消すようにして",
    // later extended to scroll too: "カーソルとクリック、スクロールでも消え
    // るようにして"). Kept separate from the other activity events below —
    // mousedown (which precedes every click) intentionally still only
    // resets the idle clock rather than dismissing directly, so this
    // overlay doesn't unmount before the browser's own subsequent "click"
    // event fires; dismissing on mousedown would let that click fall
    // through and land on whatever's underneath instead of being consumed
    // by this overlay's own onClick (dismiss) below.
    function handleDismissingActivity() {
      if (visibleRef.current) {
        dismiss();
      } else {
        scheduleIdleTimeout();
      }
    }
    const dismissingEvents = ["mousemove", "scroll"] as const;
    dismissingEvents.forEach((event) => window.addEventListener(event, handleDismissingActivity, { passive: true }));

    const activityEvents = ["mousedown", "keydown", "wheel", "touchstart"] as const;
    activityEvents.forEach((event) => window.addEventListener(event, resetIdleTimer, { passive: true }));

    return () => {
      dismissingEvents.forEach((event) => window.removeEventListener(event, handleDismissingActivity));
      activityEvents.forEach((event) => window.removeEventListener(event, resetIdleTimer));
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    };
  }, [scheduleIdleTimeout, dismiss, isKnownRoute]);

  // Belt-and-suspenders alongside the effect above: effects run *after*
  // render, so without this, a route change straight onto the 404 page
  // while this was already visible would still paint one frame of it before
  // the effect's setVisible(false) above takes effect on the next render.
  //
  // No longer an early `return null` — per direct follow-up ("まだ上下見
  // 切れてる"): the tagline's own fit-to-height measuring clone (see
  // taglineMeasureRef below) needs to already be mounted and measured
  // *before* this overlay first becomes visible, not just once it already
  // is — an early return here meant the clone (previously nested inside the
  // exact same JSX this `return null` was blocking) could never actually
  // mount until `visible` was already true, so its one-shot mount effect
  // always measured against a null ref and taglineFontSizePx silently stayed
  // at its spScale() fallback forever, regardless of how correct that
  // fallback's own formula was. The clone below is now rendered
  // unconditionally; only the rest of the overlay's own visible content
  // stays gated on `showOverlay`.
  const showOverlay = visible && isKnownRoute;

  // SP では表示中ページのスクロールをロックする — per direct follow-up
  // ("spのstudiesとcontactでアイドルレイヤーが表示中に画面固定が効かなくて
  // スクロールできる状態になってる")。SP トップは仮想スクロール（transform
  // ベース）で素通しでも動かなかったが、Studies / Contact は文書そのものが
  // スクロールするため、fixed のこのレイヤー越しに背面が普通に流れていた。
  // 手法は mobile-menu.tsx のパネル開時と同じ実証済みの3層
  // （lenis.stop / html+body の overflow:hidden / capturing touchmove の
  // preventDefault — 各層単独では不十分だった経緯はそちらの doc comment
  // 参照）。PC には適用しない: PC は「スクロールしたら消える」仕様
  // （dismissingEvents の "scroll"）で、ロックすると消す手段そのものを
  // 塞いでしまう。SP の消し方はタップ（onClick の dismiss）のまま。
  // wheel はブロックしない — SP 想定の分岐であり、万一のマウス接続時も
  // wheel は上の dismissingEvents で overlay が消える方向に働くだけ。
  // touchmove は、丈の低い画面でレイヤー自身が持つ内部スクロール
  // （overflow-y-auto — SP_OVERLAY_HEIGHT が 100dvh を超えるとき）だけは
  // 通す: 対象がレイヤー内で、かつ実際にはみ出している場合は既定動作の
  // まま。それ以外（背面ページへ抜ける動き）だけを止める。
  const lenis = useLenis();
  useEffect(() => {
    if (!showOverlay) return;
    // lg 未満 = SP/タブレット。効果の実行時点で一度だけ判定する（表示中に
    // 境界をまたぐリサイズは、次の表示から正しくなれば十分）。
    if (window.innerWidth >= 1024) return;

    lenis?.stop();
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    function blockTouchScroll(event: TouchEvent) {
      const target = event.target;
      if (target instanceof Element) {
        const layer = target.closest<HTMLElement>("[data-idle-overlay-sp-layer]");
        if (layer && layer.scrollHeight > layer.clientHeight) return;
      }
      event.preventDefault();
    }
    window.addEventListener("touchmove", blockTouchScroll, { passive: false });

    return () => {
      lenis?.start();
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener("touchmove", blockTouchScroll);
    };
  }, [showOverlay, lenis]);

  // konami-glitch-no-blend — エッグ実行中はブレンドを外す（globals.css）
  // per direct follow-up ("エッグ時に30秒後に表示されるレイヤーはブレンド
  // モードは無しにして")。エッグの全面反転（difference）の上に multiply が
  // 重なると、青要素が反転背景と掛け合わさって意図しない色になっていた。
  // ここで JS 的にエッグの状態を持つより、html.konami-glitch を起点に CSS で
  // 上書きするほうが、エッグの ON/OFF と確実に同期する。
  const blend = isContact ? "" : "mix-blend-multiply konami-glitch-no-blend";
  // text-box-trim removes the font's own half-leading above/below the
  // glyphs, so the 16px/20px padding below renders as an accurate literal
  // gap from the actual letter shapes instead of including extra
  // unaccounted-for line-height space on top of it (same convention used
  // site-wide — see e.g. app/contact/page.tsx).
  const pillClass =
    "whitespace-nowrap rounded-[30px] border border-[#0022ff] text-center font-medium text-[#0022ff] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]";
  const pillStyle = {
    fontSize: "calc(30px * var(--scale))",
    lineHeight: 1.05,
    letterSpacing: "calc(-0.6px * var(--scale))",
    padding: "calc(12px * var(--scale)) calc(20px * var(--scale))",
  } as const;
  const left = PILLS[0];
  const center = PILLS[1];
  const right = PILLS[2];
  // SP logo's own pre-rotation width/height — see SP_LOGO_HEIGHT_COLUMNS's
  // own doc comment above for why this is computed from spGridColumnWidthPx
  // (a JS-measured number) rather than a CSS calc() string. undefined until
  // the first measurement resolves, same as every other JS-measured size in
  // this file (nowPlayingTop, panelHeight elsewhere) — the logo just stays
  // at its own intrinsic size for that one frame, same as before.
  //
  // "2 grid columns tall" means the logo's *pre-rotation* (0°, normal
  // reading orientation) height — per direct follow-up ("この場合の高さっ
  // ていうのは90°回転してるからANDMADEを0°で見たときの高さのことを言って
  // る"). An earlier version had this backwards (tied the *on-screen*,
  // post-rotation height to 2 columns instead, which meant setting the
  // *pre-rotation width* to 2 columns) — since rotation swaps width/height,
  // that produced a logo roughly 1410/190 ≈ 7.4× too small on screen. Fixed
  // by computing pre-rotation height first, then deriving pre-rotation width
  // from andmade-logo.svg's own aspect ratio (1410:190) — after rotation,
  // that pre-rotation *width* becomes the on-screen height (the tall,
  // prominent wordmark in the reference screenshot), while the pre-rotation
  // *height* (2 grid columns) becomes the on-screen *width* — i.e. the
  // rotated band's own thickness lands exactly on the grid, matching that
  // screenshot's own grid-aligned logo width.
  const spLogoHeightPx =
    spGridColumnWidthPx != null ? spGridColumnWidthPx * SP_LOGO_HEIGHT_COLUMNS : undefined;
  const spLogoWidthPx = spLogoHeightPx != null ? (spLogoHeightPx * 1410) / 190 : undefined;
  // Explicit px-suffixed strings (not raw numbers) for the wrapper div below
  // — undefined stays undefined (no style rule at all, same "keep its own
  // intrinsic size for one frame" fallback as before) rather than ever
  // serializing to the literal invalid string "undefinedpx".
  const spLogoWidthCss = spLogoWidthPx != null ? `${spLogoWidthPx}px` : undefined;
  const spLogoHeightCss = spLogoHeightPx != null ? `${spLogoHeightPx}px` : undefined;

  // Same target the date/time line's own SP_DATETIME_WIDTH_CSS uses (100dvh
  // minus SP_PANEL_MARGIN_PX top+bottom) — since datetime and tagline sit
  // *side by side* in an unrotated flex row (not stacked), each
  // independently targets this same full height, not a split/shared budget.
  const taglineTargetPx = viewportHeightPx != null ? viewportHeightPx - SP_PANEL_MARGIN_PX * 2 : undefined;
  // Fitted font-size — per direct follow-up ("まだ添付のようにテキスト上下
  // が見切れてる。テキストサイズを縦幅に合わせて調整して"): the tagline's
  // on-screen height (after VerticalLabel's rotation) is its own
  // pre-rotation *width*, and that width previously came from spScale()'s
  // flat vh-based font-size with no regard for how wide the actual 3-line
  // copy naturally renders at that size — the longest line easily exceeded
  // the available viewport height, overflowing past the top and bottom
  // edges (exactly what the screenshot showed). Since text width scales
  // linearly with font-size, `taglineMeasuredWidthPx` (measured at the
  // fixed SP_TAGLINE_FONT_PX reference — see that ref's own doc comment)
  // gives an exact scale factor: solving `measuredWidth / referenceSize
  // = taglineTargetPx / fittedSize` for fittedSize.
  // > 0 (not just != null) on the measured width — a defensive belt-and-
  // suspenders guard against ever dividing by zero into Infinity/NaN again,
  // on top of the actual fix (the measuring clone no longer being
  // `display:none`-able) above.
  const taglineFontSizePx =
    taglineMeasuredWidthPx != null && taglineMeasuredWidthPx > 0 && taglineTargetPx != null
      ? SP_TAGLINE_FONT_PX * (taglineTargetPx / taglineMeasuredWidthPx)
      : undefined;
  const taglineLetterSpacingPx =
    taglineFontSizePx != null
      ? SP_TAGLINE_LETTER_SPACING_PX * (taglineFontSizePx / SP_TAGLINE_FONT_PX)
      : undefined;

  // Pills — enlarged so the pills row's own on-screen height (its
  // pre-rotation *width*, same swap logic as everything else here) matches
  // the logo's own on-screen height (spLogoWidthPx) exactly, per direct
  // follow-up ("3要素はロゴの高さと同じに合わせて拡大"). Same
  // measure-at-a-reference-size-then-scale technique as the tagline above:
  // `pillsMeasuredWidthPx` (measured at the fixed SP_PILL_FONT_PX reference)
  // gives one exact scale factor, applied uniformly to font-size,
  // letter-spacing, gap, and padding so the row's whole proportions (not
  // just its text) grow together.
  // > 0 for the same divide-by-zero defensive reason as taglineFontSizePx
  // above.
  const pillsScale =
    pillsMeasuredWidthPx != null && pillsMeasuredWidthPx > 0 && spLogoWidthPx != null
      ? spLogoWidthPx / pillsMeasuredWidthPx
      : undefined;
  const pillFontSizePx = pillsScale != null ? SP_PILL_FONT_PX * pillsScale : undefined;
  const pillLetterSpacingPx = pillsScale != null ? SP_PILL_LETTER_SPACING_PX * pillsScale : undefined;
  const pillGapPx = pillsScale != null ? SP_PILL_GAP_PX * pillsScale : undefined;
  const pillPaddingXPx = pillsScale != null ? SP_PILL_PADDING_X_PX * pillsScale : undefined;
  const pillPaddingYPx = pillsScale != null ? SP_PILL_PADDING_Y_PX * pillsScale : undefined;
  // Gates the logo+pills group's own fade-in on its async size measurements
  // actually being ready — per direct follow-up ("SPのときもロゴと3要素も
  // フェードインで表示"): both the logo's own size (spLogoWidthPx, from
  // spGridColumnWidthPx) and the pills' own fitted size (pillFontSizePx,
  // from pillsMeasuredWidthPx *and* spLogoWidthPx) resolve asynchronously
  // (window-measured / ResizeObserver-measured), so without this the group
  // could start (or even finish) its opacity transition while still showing
  // an intrinsic/wrong size, then visibly snap once the real numbers
  // resolved — same "wait for the async dependency before fading in"
  // treatment `revealed` itself now gives the weather fetch above.
  const logoPillsReady = spLogoWidthPx != null && pillFontSizePx != null;

  // Shared by both fixed layers below (blended content, and the unblended
  // Now Playing card) — overflow-y-auto + the inner OVERLAY_HEIGHT div in
  // each: below COMPACT_MIN_HEIGHT_PX this overlay stops shrinking and
  // instead shows its own scrollbar, same as the Contact page's own height
  // freeze — but applied to this `fixed` layer's own scroll, not the
  // document's (this being `fixed`, the page underneath can't supply the
  // scrollbar). Fades out over EXIT_FADE_MS on dismiss rather than
  // disappearing instantly (see the `dismiss` callback above).
  //
  // Deliberately NOT pointer-events-none while exiting (previously was, to
  // let clicks/mousemove pass straight through to the page during the fade)
  // — per direct follow-up ("オーバーレイの状態で画面タップしたとき、タッ
  // プした箇所にリンクボタンなどがあると、オーバーレイが消えた瞬間ボタン
  // が反応する挙動があるので、反応しないようにして"): the same tap that
  // dismisses the overlay can generate a second, slightly-delayed native
  // click/touch event targeting whatever the browser resolves at that
  // screen position *at dispatch time* (a well-known mobile Safari
  // touch-to-click retargeting quirk) — if this layer had already gone
  // pointer-events-none by then, that delayed event fell straight through
  // to a link/button underneath and fired it, reading as "the button
  // reacts the instant the overlay disappears". Keeping this layer fully
  // interactive (blocking) for its whole EXIT_FADE_MS fade — it only
  // actually stops intercepting once truly unmounted (`visible` → false at
  // the end of that timeout) — closes that window entirely, at the cost of
  // a barely-perceptible 300ms delay before the page underneath becomes
  // tappable again.
  const layerClassName = `fixed inset-0 z-[150] overflow-y-auto transition-opacity ease-out`;
  const layerStyle = { opacity: exiting ? 0 : 1, transitionDuration: `${EXIT_FADE_MS}ms` } as const;

  return (
    // Two separate `position: fixed` layers rather than one — mix-blend-mode
    // has to be set on the element that itself creates the new stacking
    // context (here, each `fixed` div) for it to blend against the actual
    // page; setting it on a mere *descendant* of a `fixed` div only blends
    // within that div's own already-isolated stacking context, against
    // nothing (see this component's own doc comment above — this is
    // literally the bug that comment describes). Since the Now Playing card
    // below needs to NOT blend while everything else DOES, it can't just be
    // an unblended descendant *inside* the same blended fixed div; it needs
    // its own separate fixed layer instead. Both share the exact same
    // dismiss/exit-fade behavior (layerClassName/layerStyle above) — being
    // siblings rather than ancestor/descendant, a click on either only
    // bubbles through its own subtree, so both independently calling
    // dismiss() on click is safe (dismiss() itself is idempotent while
    // already exiting).
    <>
      {/* Invisible, permanently-reference-sized (SP_TAGLINE_FONT_PX, never
          the fitted size) tagline measuring clone — rendered unconditionally
          (not gated on showOverlay) specifically so it's already mounted and
          measured well *before* this overlay first becomes visible; see
          showOverlay's own doc comment above for why that matters. left:
          -99999 (not display:none/visibility:hidden) keeps it laid out (so
          offsetWidth is real) while placing it fully off-screen; aria-hidden
          + pointer-events-none keep it invisible to assistive tech and
          clicks.

          Deliberately *not* `lg:hidden` (unlike the real SP tagline this
          feeds) — per the console error this caused on PC ("`Infinity` is
          an invalid value for the `fontSize` css style property"):
          `lg:hidden` is `display:none` at PC widths, and a `display:none`
          element's own `offsetWidth` always measures 0, not its real
          content width. On PC that fed `taglineMeasuredWidthPx = 0` straight
          into `SP_TAGLINE_FONT_PX * (taglineTargetPx / taglineMeasuredWidthPx)`
          → a divide-by-zero → `Infinity`, which React then tried (and
          rightly refused) to set as `fontSize` on the real (also PC-hidden,
          but still DOM-present and still styled) SP tagline. Staying
          unconditionally laid out — it was already fully off-screen and
          invisible regardless — keeps the measurement valid on every
          viewport width, whether or not the SP tree it feeds is currently
          the one actually painting. */}
      <div
        ref={taglineMeasureRef}
        aria-hidden
        className="pointer-events-none fixed text-center font-medium whitespace-nowrap"
        style={{
          left: -99999,
          top: 0,
          fontSize: SP_TAGLINE_FONT_PX,
          lineHeight: 1.05,
          letterSpacing: SP_TAGLINE_LETTER_SPACING_PX,
        }}
      >
        {SP_TAGLINE_LINES.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>

      {/* Same purpose/rationale as the tagline measuring clone just above
          — including *not* being `lg:hidden`, for the exact same
          divide-by-zero-on-PC reason — for the pills row instead; see
          pillsScale's own doc comment. */}
      <div
        ref={pillsMeasureRef}
        aria-hidden
        className="pointer-events-none fixed flex items-center"
        style={{ left: -99999, top: 0, gap: SP_PILL_GAP_PX }}
      >
        {PILLS.map((pill) => (
          <div
            key={pill.label}
            className={pillClass}
            style={{
              fontSize: SP_PILL_FONT_PX,
              lineHeight: 1.05,
              letterSpacing: SP_PILL_LETTER_SPACING_PX,
              padding: `${SP_PILL_PADDING_Y_PX}px ${SP_PILL_PADDING_X_PX}px`,
            }}
          >
            {pill.label}
          </div>
        ))}
      </div>

      {showOverlay && (
        <>
          {/* hidden lg:block — PC only now; see SP_PANEL_MARGIN_PX's own doc
              comment above for the parallel SP tree below (Figma node
              1100:384), split via this same plain CSS convention mobile-home.tsx
              already established for its own PC/SP trees. */}
          <div
            className={`hidden lg:block ${layerClassName} ${blend}`}
            style={layerStyle}
            onClick={dismiss}
            role="presentation"
          >
        <div className="relative w-full" style={{ height: OVERLAY_HEIGHT }}>
          {/* Tagline — top margin 5px (moved up another 10px from the
              original 15px), horizontally centered via text-center within
              this now-full-width wrapper (rather than the old
              nowrap-shrink-to-fit + translate-x-1/2 trick) — both produce
              the same visual centering, but this way the date/time line
              below can share the same wrapper and just needs a plain
              margin-top, no manual height math. Reveals line by line via
              the same overflow-hidden/translateY mask technique as
              site-intro.tsx's own tagline, matching its exact timing/easing
              (TAGLINE_EASE/TAGLINE_REVEAL_MS/TAGLINE_LINE_STAGGER_MS) per
              explicit request ("上のテキストはイントロの文字の出方で"). */}
          <div
            ref={dateTimeWrapperRef}
            className="absolute inset-x-0"
            style={{
              top: "calc(5px * var(--scale))",
              paddingLeft: "calc(20px * var(--scale))",
              paddingRight: "calc(20px * var(--scale))",
            }}
          >
            {/* w-fit + mx-auto (rather than just relying on text-center in a
                full-width parent) restores the exact shrink-to-fit sizing
                the old nowrap-shrink-to-fit + translate-x-1/2 approach had:
                each line's own overflow-hidden mask below is only as wide as
                *this* box, so at full parent width, the box was wide enough
                that "through" (the widest line) could actually overflow it
                — and being wider than its own mask, its own right edge got
                clipped by that mask (reported as "「through」のhが少しマス
                クで切れてる", specifically the right side of the "h", not
                top/bottom). w-fit sizes this back down to its own widest
                line's natural width (same shrink-to-fit sizing as before),
                so the mask is never narrower than the text it's supposed to
                just reveal/hide vertically. */}
            <div
              className="w-fit mx-auto whitespace-nowrap text-center font-medium text-[#0022ff]"
              style={{
                fontSize: "calc(53px * var(--scale))",
                lineHeight: 1.05,
                letterSpacing: "calc(-1.06px * var(--scale))",
              }}
            >
              {TAGLINE_LINES.map((line, i) => (
                // Wrapper is 1.3em tall (rather than the <p>'s own tight
                // lineHeight:1.05 box) so descenders like the "g" in
                // "design"/"digital"/"Tokyo" aren't clipped by this mask
                // (reported as "下が一部見切れてる") — but marginBottom of
                // -0.25em (the exact 1.3em - 1.05em delta) cancels that extra
                // height back out of the document flow, so the *next* line's
                // wrapper still starts exactly 1.05em down from this one's,
                // matching Figma's leading-1.05 spacing exactly (the taller box
                // only adds slack *within* this line's own mask, not extra
                // distance to the next line — the widened gap was reported as
                // "行間が広がったから、デザインに準拠して").
                <div key={line} className="overflow-hidden" style={{ height: "1.3em", marginBottom: "-0.25em" }}>
                  <p
                    className="mb-0"
                    style={{
                      transform: revealed ? "translateY(0)" : "translateY(100%)",
                      transitionProperty: "transform",
                      transitionDuration: `${TAGLINE_REVEAL_MS}ms`,
                      transitionDelay: revealed ? `${i * TAGLINE_LINE_STAGGER_MS}ms` : "0ms",
                      transitionTimingFunction: TAGLINE_EASE,
                    }}
                  >
                    {line}
                  </p>
                </div>
              ))}
            </div>

            {/* Year / date / weekday / time — Figma node 905:2091, originally
                40px below the tagline above per explicit request ("3行テキス
                ト下マージン40pxの位置に年、日付、曜日、時間を追加"), then
                moved up 10px per a later request (now 30px). Fades in via
                this same wrapping opacity div, exactly matching the pills/
                logo group and Now Playing card just above/below — per direct
                follow-up ("日付の列もフェードインで表示されるようにしてくだ
                さい"): an earlier version had IdleDateTime drive its own,
                separate opacity transition internally instead, which reused
                the identical `revealed`-gated timing but, structurally
                separate from every other group's fade here, wasn't reliably
                producing a visible fade in practice. */}
            <div
              className="transition-opacity ease-out"
              style={{
                marginTop: "calc(30px * var(--scale))",
                opacity: revealed ? 1 : 0,
                transitionDuration: `${GROUP_FADE_IN_MS}ms`,
              }}
            >
              <IdleDateTime temperatureC={temperatureC} />
            </div>
          </div>

          {/* Pills + logo group — shared 20px left/right margin via padding on
              this one container (rather than repeating the inset on each
              element), bottom margin 20px (moved down 5px from the original
              25px per explicit request), and a 40px gap between the pills
              row and the logo via a plain margin-top on the logo — that stays
              exactly 40px regardless of the logo's own rendered height (which
              itself varies with viewport width, following the SVG's aspect
              ratio), rather than a height-dependent absolute offset. Fades in
              as one unit (separate from the tagline's own per-line mask
              reveal above) when the overlay appears. */}
          <div
            ref={pillsLogoRef}
            className="absolute inset-x-0 flex flex-col items-stretch transition-opacity ease-out"
            style={{
              bottom: "calc(20px * var(--scale))",
              paddingLeft: "calc(20px * var(--scale))",
              paddingRight: "calc(20px * var(--scale))",
              opacity: revealed ? 1 : 0,
              transitionDuration: `${GROUP_FADE_IN_MS}ms`,
            }}
          >
            {/* Left/right pills are normal flex children (defining the row's
                own height); the center one is absolutely centered within
                this same relatively-positioned row so it always sits at
                exactly the row's horizontal midpoint, matching Figma's own
                `left: calc(50% + 0.5px)` — flexbox's justify-between doesn't
                guarantee that for a 3rd item whose width differs from the
                other two. */}
            <div className="relative flex items-center justify-between">
              <div className={pillClass} style={pillStyle}>
                {left.label}
              </div>
              <div className={pillClass} style={pillStyle}>
                {right.label}
              </div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className={pillClass} style={pillStyle}>
                  {center.label}
                </div>
              </div>
            </div>

            <Image
              src={withBasePath("/andmade-logo.svg")}
              alt=""
              width={1410}
              height={188}
              className="block h-auto w-full"
              style={{ marginTop: "calc(40px * var(--scale))" }}
            />
          </div>
        </div>
      </div>

      {/* Now Playing card — its own separate fixed layer (see the comment
          above on why), deliberately not blended (Figma node 905:2094 has no
          mix-blend-multiply, unlike its siblings in the layer above).
          Horizontally centered same as Figma's own `left: 50%`; vertically
          sat at the measured midpoint between the date-time block and the
          pills/logo group (nowPlayingTop above) per explicit request
          ("再生中のカードパネルの縦位置は、上の日付と下の3つの要素との中間
          に配置して") rather than Figma's own literal `top: calc(50% - 35px)`
          — falls back to plain 50% until that measurement actually runs.
          Fades in the same simple way as the pills/logo group there. */}
      {/* konami-glitch-no-blend — こちらのレイヤーはブレンド自体を持たないが、
          エッグ中は z-index を反転レイヤーの上に上げる必要があるのは同じ
          （globals.css の同クラスのコメント参照）。 */}
      <div className={`hidden lg:block ${layerClassName} konami-glitch-no-blend`} style={layerStyle} onClick={dismiss} role="presentation">
        <div className="relative w-full" style={{ height: OVERLAY_HEIGHT }}>
          <div
            className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity ease-out"
            style={{
              top: nowPlayingTop !== null ? `${nowPlayingTop}px` : "50%",
              opacity: revealed ? 1 : 0,
              transitionDuration: `${GROUP_FADE_IN_MS}ms`,
            }}
          >
            <IdleNowPlaying />
          </div>
        </div>
      </div>

      {/* ============ SP variant (Figma node 1100:384) ============ —
          see SP_PANEL_MARGIN_PX's own doc comment above for the full
          rationale. Two fixed layers again, same reasoning as the PC pair
          above (the Now Playing card stays unblended while everything else
          is mix-blend-multiply'd), sharing the exact same
          layerClassName/layerStyle dismiss/exit-fade mechanics — only
          `lg:hidden` differs.
          `blend` now applies here unconditionally (PC's own main layer uses
          the exact same variable, mix-blend-multiply dropped only for
          Contact) — per three direct follow-ups in sequence: first stripping
          this layer's own translucent white panel down to nothing on every
          route *except* Top ("SPのトップページ以外のページ...背景の白色透
          過をなくして", then clarifying to remove the panel outright rather
          than just making it opaque), then applying `blend` to those same
          non-Top routes so they weren't left with zero dimming at all
          ("...PC版と同じブレンドモードを適用して"), and finally this same
          treatment for Top too ("SPのトップページのオーバーレイについて
          も、他のページと同様に背景の白透過をなくして...白背景自体を消す対
          応で") — Top no longer gets any special-cased panel/blend
          treatment; every route (bar Contact) now shares this one path. */}
      <div data-idle-overlay-sp-layer className={`lg:hidden ${layerClassName} ${blend}`} style={layerStyle} onClick={dismiss} role="presentation">
        <div className="relative w-full" style={{ height: SP_OVERLAY_HEIGHT }}>
          {/* No panel/fill of any kind here anymore (see this file's own
              top-level history just above) — `blend` on the fixed layer
              above is what dims things now, on every route, so the
              overlay's own blue text/pills blend directly against the real
              page with nothing behind them. */}
          <div className="absolute" style={{ inset: SP_PANEL_MARGIN_PX }}>
            {/* Tagline + date/time — sit together in one right-anchored,
                unrotated flex row (each wrapped in its own VerticalLabel —
                same "flatten into individually-rotated siblings" pattern as
                the logo/pills group below), rather than two independently
                `right`-positioned elements: a flex `gap` is what actually
                keeps SP_TAGLINE_DATETIME_GAP_PX reliable regardless of
                either block's own rendered size. `right: 0` sits this whole
                group flush against the panel's own right edge — combined
                with SP_PANEL_MARGIN_PX (unscaled), that lands it exactly
                SP_PANEL_MARGIN_PX from the *true* screen edge per direct
                follow-up ("英字テキストは画面右端から8pxの位置に", margin
                since revised to 6px). Date/time comes
                first in DOM order (the *left* item in this unrotated row)
                so the tagline — last in DOM order — ends up flush against
                the row's own right edge, i.e. closest to the panel's right
                edge once rotated, matching Figma (tagline nearest the edge,
                date/time further from it). mix-blend-multiply sits on this
                shared container rather than each child individually — it
                only needs to reach the panel/page beneath, and nothing
                between here and there creates its own blend/stacking
                context, so one shared declaration blends both. */}
            <div
              className="absolute flex items-center mix-blend-multiply"
              style={{
                right: SP_TAGLINE_DATETIME_RIGHT_OFFSET_PX,
                top: "50%",
                transform: "translateY(-50%)",
                gap: spScale(SP_TAGLINE_DATETIME_GAP_PX),
              }}
            >
              {/* Fades in via this same wrapping opacity div — see the PC
                  call site's own doc comment above for why (an earlier
                  version had IdleDateTime drive its own separate opacity
                  transition instead). `flex-none` here since this div is now
                  what actually sits as the flex item in the row above
                  (VerticalLabel's own identical class no longer matters once
                  it's nested one level deeper).

                  Gated on `spDateTimeRevealed`, not `revealed` directly — see
                  that state's own declaration above for why (a real JS timer,
                  not a same-frame CSS `transitionDelay`, actually delays this
                  until the tagline's own per-line reveal below has finished;
                  PC's own equivalent date/time block still fades in together
                  with `revealed` itself — this delay is SP-only). */}
              <div
                className="flex-none transition-opacity ease-out"
                style={{
                  opacity: spDateTimeRevealed ? 1 : 0,
                  transitionDuration: `${GROUP_FADE_IN_MS}ms`,
                }}
              >
                <VerticalLabel>
                  <IdleDateTime
                    variant="sp"
                    temperatureC={temperatureC}
                    spSizeOverride={{
                      fontSize: `${SP_DATETIME_FONT_PX}px`,
                      letterSpacing: spScale(SP_DATETIME_LETTER_SPACING_PX),
                      gap: spScale(SP_DATETIME_GAP_PX),
                      width: SP_DATETIME_WIDTH_CSS,
                    }}
                  />
                </VerticalLabel>
              </div>

              {/* Same per-line mask reveal as the PC tagline above, sized to
                  taglineFontSizePx (falls back to spScale() until that
                  measurement resolves — see its own doc comment above for
                  why a flat spScale() alone wasn't enough) and wrapped in
                  VerticalLabel afterward — the mask technique doesn't care
                  that its own container ends up rotated 90° by an ancestor. */}
              <VerticalLabel>
                <div
                  className="text-center font-medium text-[#0022ff]"
                  style={{
                    fontSize: taglineFontSizePx ?? spScale(SP_TAGLINE_FONT_PX),
                    lineHeight: 1.05,
                    letterSpacing: taglineLetterSpacingPx ?? spScale(SP_TAGLINE_LETTER_SPACING_PX),
                  }}
                >
                  {SP_TAGLINE_LINES.map((line, i) => (
                    <div key={line} className="overflow-hidden" style={{ height: "1.3em", marginBottom: "-0.25em" }}>
                      <p
                        className="mb-0 whitespace-nowrap"
                        style={{
                          transform: revealed ? "translateY(0)" : "translateY(100%)",
                          transitionProperty: "transform",
                          transitionDuration: `${TAGLINE_REVEAL_MS}ms`,
                          transitionDelay: revealed ? `${i * TAGLINE_LINE_STAGGER_MS}ms` : "0ms",
                          transitionTimingFunction: TAGLINE_EASE,
                        }}
                      >
                        {line}
                      </p>
                    </div>
                  ))}
                </div>
              </VerticalLabel>
            </div>

            {/* Logo + pills — left-anchored (opposite side of the panel from
                the tagline/date-time above), vertically centered against the
                *screen's* own height (top: 50% + translateY(-50%), same
                treatment as the tagline/date-time group) rather than a fixed
                offset from the top — per direct follow-up ("画面の高さに対
                して中央配置にして"). `left: SP_LOGO_LEFT_PX - SP_PANEL_MARGIN_PX`
                (not a flat `0`, unlike before) — per direct follow-up
                ("ロゴの左マージンを8pxに"): the logo's own left margin is
                now a distinct, independently-set value from the shared
                panel margin (6px) rather than reusing it directly, the same
                way SP_TAGLINE_DATETIME_RIGHT_OFFSET_PX already decoupled the
                tagline/date-time group's own right offset from it. Computed
                relative to SP_PANEL_MARGIN_PX (not a second, independently-
                hardcoded literal) so it stays exactly SP_LOGO_LEFT_PX from
                the *true* screen edge even if the shared panel margin
                changes again later. Each of logo/pills is its *own*
                independent VerticalLabel (not one shared rotation) laid out
                side by side via a plain, unrotated flex row — same "flatten
                into individually-rotated siblings inside a shared unrotated
                flex container" pattern mobile-home.tsx's own Tx/divider/Th
                group already uses, matching Figma's own identical structure
                here (node 1100:626). */}
            <div
              className="absolute flex items-center transition-opacity ease-out"
              style={{
                left: SP_LOGO_LEFT_PX - SP_PANEL_MARGIN_PX,
                top: "50%",
                transform: "translateY(-50%)",
                gap: SP_LOGO_PILLS_GAP_PX,
                opacity: revealed && logoPillsReady ? 1 : 0,
                transitionDuration: `${GROUP_FADE_IN_MS}ms`,
              }}
            >
              {/* No brightness-0 — andmade-logo.svg's own path fills are
                  already the brand blue (#0022FF), matching Figma directly
                  once mix-blend-multiply (on this VerticalLabel wrapper)
                  blends it against the panel/page, same as the PC logo
                  above (which relies on the same already-blue source file). */}
              {/* The size actually being measured (VerticalLabel's own
                  ResizeObserver, see that component's own doc comment) is
                  this plain wrapper div's — not the <Image>'s own — box.
                  Next.js's <Image> merges its own internal style/attribute
                  handling with whatever `style` is passed to it, which
                  turned out not to reliably win out over its own `width={1410}
                  height={190}` props in every case (the logo staying wrong
                  size across multiple otherwise-correct formulas is what
                  finally pointed at this). A plain div with explicit px
                  strings has no such ambiguity — it measures exactly what's
                  set — and the Image simply fills it via w-full h-full
                  (percentage-based, not fighting over its own props). */}
              <VerticalLabel className="mix-blend-multiply">
                <div style={{ width: spLogoWidthCss, height: spLogoHeightCss }}>
                  <Image src={withBasePath("/andmade-logo.svg")} alt="" width={1410} height={190} className="block h-full w-full" />
                </div>
              </VerticalLabel>
              <VerticalLabel>
                <div className="flex items-center" style={{ gap: pillGapPx ?? spScale(SP_PILL_GAP_PX) }}>
                  {PILLS.map((pill) => (
                    <div
                      key={pill.label}
                      className="mix-blend-multiply [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] rounded-[30px] border border-[#0022ff] text-center font-medium whitespace-nowrap text-[#0022ff]"
                      style={{
                        fontSize: pillFontSizePx ?? spScale(SP_PILL_FONT_PX),
                        lineHeight: 1.05,
                        letterSpacing: pillLetterSpacingPx ?? spScale(SP_PILL_LETTER_SPACING_PX),
                        padding:
                          pillPaddingYPx != null && pillPaddingXPx != null
                            ? `${pillPaddingYPx}px ${pillPaddingXPx}px`
                            : `${spScale(SP_PILL_PADDING_Y_PX)} ${spScale(SP_PILL_PADDING_X_PX)}`,
                      }}
                    >
                      {pill.label}
                    </div>
                  ))}
                </div>
              </VerticalLabel>
            </div>
          </div>
        </div>
      </div>

      {/* SP Now Playing — its own separate, unblended layer (same reasoning
          as the PC one above), simply centered within the panel per Figma
          (no measured-midpoint logic needed here — Figma just centers it,
          unlike PC's own "midpoint between the two other groups" spec). */}
      <div data-idle-overlay-sp-layer className={`lg:hidden ${layerClassName}`} style={layerStyle} onClick={dismiss} role="presentation">
        <div className="relative w-full" style={{ height: SP_OVERLAY_HEIGHT }}>
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity ease-out"
            style={{ opacity: revealed ? 1 : 0, transitionDuration: `${GROUP_FADE_IN_MS}ms` }}
          >
            <IdleNowPlaying variant="sp" />
          </div>
        </div>
      </div>
        </>
      )}
    </>
  );
}
