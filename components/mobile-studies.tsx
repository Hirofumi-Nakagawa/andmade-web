"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { mod, ORIENTATION_ASPECT_RATIO, type Study, type StudyOrientation } from "@/lib/studies";
import { ScrambleText } from "@/components/scramble-text";
import { SlotDigits } from "@/components/slot-digits";
import { StudiesCenterImage } from "@/components/studies-center-image";
import { STUDIES_BACKGROUND_FADE_MS } from "@/components/studies-background";
import { MobileStudiesThumbnailRail } from "@/components/mobile-studies-thumbnail-rail";

/** パラパラ表示（イントロ）を始めるまでの待ち時間。
 *
 *  背景（StudiesBackground）のフェードインぶん + 150ms。
 *  フェード直後に始めるとまだ背景の余韻と重なって見えたため、ひと呼吸
 *  置いてから始める — per direct follow-up ("Studiesのパラパラの表示
 *  タイミングをもうワンテンポ遅らせて" で +350、その後 "パラパラが始まるのを
 *  もうワンテンポ速くして" で +150)。この 150ms が、サムネが出てから
 *  動き出すまでの間（INTRO_THUMBNAIL_DELAY_MS が背景フェード完了に張り付いて
 *  いるため）にもなっている。前段の指示（"背景がフェードイン
 *  する前にパラパラが始まってる"）で入れた待ちの延長なので、背景の
 *  フェード時間を足す形は崩さずに追加ぶんだけ持たせている。 */
const INTRO_START_DELAY_MS = STUDIES_BACKGROUND_FADE_MS + 150;

/** サムネを出してからパラパラを始めるまでのリード時間。
 *
 *  per direct follow-up ("サムネが表示されるタイミングをもう少し速くして"、
 *  その後 "さらにワンテンポ速くして" で 200 → 550)。
 *  直前の指示でサムネの表示とパラパラの開始を同時にしたが、それだとサムネが
 *  出た瞬間にもう動き出していて出現が認識しづらい。パラパラの開始
 *  （INTRO_START_DELAY_MS）はそのままに、サムネだけこのぶん先に出す。 */
const INTRO_THUMBNAIL_LEAD_MS = 550;

/** サムネを実際に出す時刻。
 *
 *  INTRO_START_DELAY_MS - INTRO_THUMBNAIL_LEAD_MS をそのまま使うと、リード時間を
 *  伸ばしたぶんだけ背景のフェードイン中に食い込む（550ms に上げた時点で 250ms に
 *  なり、"studiesのパラパラのアニメーション開始が先祖返りしてない？" と指摘された
 *  状態＝背景が出揃う前にサムネが現れる、に戻っていた）。
 *  背景のフェード完了を下限にして、リードを伸ばしてもそこより前には出ないようにする。 */
const INTRO_THUMBNAIL_DELAY_MS = Math.max(
  STUDIES_BACKGROUND_FADE_MS,
  INTRO_START_DELAY_MS - INTRO_THUMBNAIL_LEAD_MS,
);

/** Same "margin + N columns" idiom every other Mobile* component uses (see
 *  mobile-not-found.tsx's own TEXT_LEFT) — grid column 3 (margin + 2
 *  columns), matching Figma node 1070:928's own "ANDMADE Inc."/intro-text/
 *  study-title left edge (72px at the 400px SP reference canvas). */
const TEXT_LEFT = "calc(var(--sp-grid-column-width) * 2 + var(--sp-grid-margin))";
/** Left thumbnail rail width (1 grid column + the grid's own outer margin,
 *  per explicit spec "左のサムネの横幅は1マス+余白（8px）") lives in
 *  mobile-studies-thumbnail-rail.tsx's own ITEM_WIDTH — nothing here needs
 *  that value directly, since this file never positions anything relative to
 *  the rail's own right edge.
 * Center image's own left edge — margin + 4 columns (136px at the 400px
 *  reference canvas, Figma node 1140:681). Fixed in both the unzoomed and
 *  zoomed states is *not* true here, unlike PC (components/studies-gallery.tsx's
 *  own CENTER_LEFT_PX) — per explicit spec the SP zoomed image instead
 *  recenters on screen (see computeZoomedStyle below). */
const CENTER_LEFT = "calc(var(--sp-grid-column-width) * 4 + var(--sp-grid-margin))";
/** Center image's own unzoomed width — 7 grid columns (224px at the 400px
 *  reference canvas), Figma node 1140:681. Height always follows the fixed
 *  portrait ratio below, regardless of this study's own real orientation —
 *  same convention as PC's own unzoomedHeightRefPx (studies-gallery.tsx). */
const CENTER_WIDTH = "calc(var(--sp-grid-column-width) * 7)";
/** Center image's own unzoomed height — always the fixed portrait 3:4 ratio
 *  (regardless of this study's own real orientation), derived from
 *  CENTER_WIDTH the same way PC's own unzoomedHeightRefPx is. Kept as its own
 *  constant (rather than inlined) so COUNTER_TOP below can reuse it. */
const CENTER_HEIGHT = `calc(${CENTER_WIDTH} / ${ORIENTATION_ASPECT_RATIO.portrait})`;
/** Vertical offset applied to every element positioned below "ANDMADE Inc."
 *  (the intro paragraph, center image, and everything anchored off the
 *  center image's own top edge — vertical title, counter, "Tap to zoom.")
 *  — per direct follow-up ("ANDMADE Inc.下の要素を30px下に下げて"). The rail
 *  and the sitewide MENU pill aren't part of this group (the rail spans the
 *  full screen height independently; MENU is a separate, globally-mounted
 *  component), so neither reads this constant. */
const BELOW_HEADER_OFFSET_PX = 30;
/** Center image's own top offset — a literal fixed px value (Figma's own SP
 *  export, minus that export's 53px fake-status-bar chrome), matching every
 *  other Mobile* component's fixed-px-from-top convention rather than PC's
 *  viewport-centered `top: 50%`. 201 → 191 → 186 — per direct follow-up
 *  ("SPのstudiesのイメージの位置を10px上に上げる"、その後 "SPのstudiesの
 *  添付箇所を5px上に上げて" で添付のイメージ＋縦書きタイトル＋"01-09/Tap to
 *  zoom." のブロックをさらに5px): every other element anchored off this same
 *  constant (the rotated "Study NN"/title block, the "01 - 10"/"Tap to zoom."
 *  row below the image) moves up together with it, preserving their own tuned
 *  gaps/alignment to the image's edges. 上の英字イントロ文だけは
 *  INTRO_TEXT_TOP_PX で独立しているので動かない（＝イントロ文との間隔が
 *  そのぶん広がる）。 */
const CENTER_TOP_PX = 186 + BELOW_HEADER_OFFSET_PX;
/** Gap between the center image's own bottom edge and the "01 - 10"/"Tap to
 *  zoom." row below it — 25px per direct follow-up ("イメージと01-10、Tap to
 *  zoomのマージンは25pxに"), tightened 5px per a later follow-up ("SPの
 *  01-10とtap to zoomの上マージンを5px詰めて"). Derived as
 *  `${CENTER_TOP_PX}px + CENTER_HEIGHT + 20px` (a calc(), not a literal top
 *  value) since CENTER_HEIGHT itself is fluid (tracks --sp-grid-column-width
 *  as the viewport narrows/widens) — a hardcoded literal would drift out of
 *  sync with the image's own real bottom edge at any width other than the
 *  400px reference canvas. */
const IMAGE_TO_COUNTER_GAP_PX = 20;

/** Intro paragraph's own top offset — 101px (Figma's own SP export, minus
 *  its 53px fake-status-bar chrome) minus a further 10px per direct follow-up
 *  ("英字テキストとイメージのマージンを現状より10px広げて"): moving the text
 *  itself up (rather than pushing the image/rail/counter/title system down)
 *  widens the gap without disturbing every other element's already-tuned
 *  vertical rhythm, all of which anchor off CENTER_TOP_PX instead. Minus a
 *  further 10px per direct follow-up ("SPのStudiesの英字4行を14pxにして上に
 *  10px移動"). */
const INTRO_TEXT_TOP_PX = 101 - 10 - 10 + BELOW_HEADER_OFFSET_PX;
/** Intro paragraph copy — explicit manual line breaks per direct follow-up
 *  ("英字の改行は下記で"), replacing an earlier auto-wrapped (width-
 *  constrained) version. */
const INTRO_TEXT_LINES = [
  "Where ideas are explored before they become",
  "outcomes. A collection of studies, experiments,",
  "and works in progress that shape our",
  "design practice.",
];
/**
 * 縦に余裕のある端末では、英字リード文〜"Tap to zoom." のブロックを
 * 「ANDMADE Inc. の下」から「MENU ピルの上端」までの範囲の縦中央に置く
 * — per direct follow-up ("縦が長い端末の場合は、英語リード文以下のエリアの
 * 高さに対して、縦位置中央配置にできる？" → 当初はリード文を含めず範囲の
 * 起点にしていたが、"リード文も含め中央配置にして" で対象に含めた)。
 *
 * 動くのはリード文・イメージ・回転タイトル・カウンター行の4点。いずれも
 * GROUP_TOP を基準にした相対位置なので、互いの間隔は従来のまま一緒に下がる。
 *
 * すべて CSS の calc()/max() で書いてあり JS の計測を挟まない。高さの要素が
 * どれも既知だから成立している:
 *   - リード文の上端からイメージ上端まで = CENTER_TOP_PX - INTRO_TEXT_TOP_PX
 *   - イメージ = CENTER_HEIGHT（--sp-grid-column-width 追従）
 *   - カウンター行 = 12px × leading 1.5 = 18px、その上に 20px
 *   - 下端 = 画面下から MENU ピルのぶん（mobile-menu.tsx の
 *     PANEL_BOTTOM_MARGIN_PX 10 + CLOSED_HEIGHT_PX 30）
 * `100dvh` を使うのは MENU ピルが position: fixed で可視ビューポート基準に
 * 出ているため（lib/viewport-height.ts の実測値はツールバー背面まで覆う
 * 用途のもので、ここでは逆に合わない）。
 *
 * max() の第1項が従来の INTRO_TEXT_TOP_PX なので、縦に余裕が無い端末では
 * これまでと1pxも変わらない。余った高さぶんだけ下がる。
 */
/** カウンター行（"01 - 09" / "Tap to zoom."）の行ボックス高さ。12px × 1.5。 */
const COUNTER_ROW_HEIGHT_PX = 18;
/** "ANDMADE Inc." の下端 — top 50px + cap height（16px × 約0.72）。
 *  中央寄せの範囲の上端。 */
const HEADER_BOTTOM_PX = 62;
/** 画面下端から MENU ピルの上端まで — mobile-menu.tsx の
 *  PANEL_BOTTOM_MARGIN_PX(10) + CLOSED_HEIGHT_PX(30)。あちらを動かしたら
 *  ここも合わせること。 */
const MENU_PILL_RESERVE_PX = 40;
/** リード文の上端からイメージの上端までの距離。従来の2つの定数の差そのもの
 *  なので、どちらかを調整すれば自動で追従する。 */
const INTRO_TEXT_TO_CENTER_PX = CENTER_TOP_PX - INTRO_TEXT_TOP_PX;
/** 中央寄せの対象ブロック（リード文の上端〜カウンター行の下端）の高さ。 */
const GROUP_HEIGHT = `calc(${INTRO_TEXT_TO_CENTER_PX}px + ${CENTER_HEIGHT} + ${IMAGE_TO_COUNTER_GAP_PX}px + ${COUNTER_ROW_HEIGHT_PX}px)`;
/** ブロック全体の微調整（負で上へ）。BELOW_HEADER_OFFSET_PX を減らす形に
 *  しないのは、縦に余裕のある端末では下の max() が中央寄せ側に倒れていて
 *  あちらの値が効かないため。ここで足せば、詰まっている端末でも中央寄せの
 *  端末でも同じだけ動く。左のサムネのレール（rail）はこの系統ではないので
 *  影響しない。 */
const GROUP_NUDGE_Y_PX = -10;
/** ブロックの実際の上端（= リード文の上端）。 */
const GROUP_TOP = `calc(max(${INTRO_TEXT_TOP_PX}px, calc(${HEADER_BOTTOM_PX}px + (100dvh - ${MENU_PILL_RESERVE_PX}px - ${HEADER_BOTTOM_PX}px - ${GROUP_HEIGHT}) / 2)) + ${GROUP_NUDGE_Y_PX}px)`;
/** イメージの上端。以降、位置指定はこれを使う（CENTER_TOP_PX /
 *  INTRO_TEXT_TOP_PX は「詰まっているときの下限値」として上の式の中にだけ
 *  残る）。 */
const CENTER_TOP = `calc(${GROUP_TOP} + ${INTRO_TEXT_TO_CENTER_PX}px)`;
/** パラパラ中だけイメージを持ち上げる量 — per direct follow-up ("パラパラ時の
 *  サムネの縦位置をもう少し上にして")。introDone の瞬間に定位置（CENTER_TOP）
 *  まで下りてくる。X は動かないので、この移動は真っ直ぐ縦だけ
 *  （以前 "中央→定位置の動きがカーブして見える" と指摘された斜め移動には
 *  ならない）。タイミングは既存の INTRO_SLIDE_* がそのまま効く。 */
const INTRO_CENTER_RISE_PX = 20;

/** カウンター行の上端 — イメージの下端 + 20px。 */
const COUNTER_TOP = `calc(${CENTER_TOP} + ${CENTER_HEIGHT} + ${IMAGE_TO_COUNTER_GAP_PX}px)`;

/** Curtain-reveal timing for INTRO_TEXT_LINES — the exact same values as
 *  studies-gallery.tsx's own INTRO_TEXT_EASE/INTRO_TEXT_REVEAL_MS/
 *  INTRO_TEXT_LINE_STAGGER_MS, per direct follow-up ("4行の英字テキストを
 *  PCと同じようにイメージのパラパラアニメーションが終わってからカーテン
 *  リビールで表示して") — this paragraph previously had no reveal at all
 *  (always visible from first paint), unlike PC's own version, which reveals
 *  each line via a mask-curtain slide (an `overflow-hidden` wrapper around a
 *  `translateY(100%)→0` inner `<p>`) staggered line by line, gated on
 *  `introDone` — the same flag that gates everything else tied to "the
 *  mount-time parapara image intro has finished" throughout this file. Not
 *  imported directly from studies-gallery.tsx (that file doesn't export
 *  them) — duplicated here rather than adding exports PC itself has no use
 *  for, same convention as this file's own INTRO_STEPS/INTRO_DURATION_MS/
 *  AUTO_ADVANCE_MS above. */
const INTRO_TEXT_EASE = "cubic-bezier(0.16, 1, 0.55, 1)";
const INTRO_TEXT_REVEAL_MS = 700;
const INTRO_TEXT_LINE_STAGGER_MS = 150;

/** Zoomed width, in grid columns, for portrait studies — per explicit spec
 *  ("縦画像をタップした時は横幅10マス分まで拡大"), then raised per a further
 *  direct follow-up ("SPのStudiesのzoom時の縦長画像の横幅を11マスに") — 11.
 *  Landscape studies instead zoom to the full viewport width (see
 *  computeZoomedBoxPx below, "横画像の場合は横幅いっぱいまで拡大"), and
 *  square now does too (see that constant's own doc comment right below). */
const ZOOM_WIDTH_COLUMNS_PORTRAIT = 11;
/** Square studies used to zoom to their own fixed grid-column width (12,
 *  before that a shared value with portrait) — per direct follow-up
 *  ("squareの横幅を端末幅いっぱいにして"), square now zooms to the full
 *  viewport width instead, exactly like landscape (see computeZoomedBoxPx
 *  below and centerImageStyle's own `isFullWidthZoom` branch). No grid-
 *  column constant needed anymore for this orientation. */
const SP_GRID_MARGIN_PX = 8;
const SP_GRID_COLUMNS = 12;
const ZOOM_TRANSITION_MS = 550;
const ZOOM_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
/** "Tap to return"'s own fade-in duration once it starts (see
 *  returnLabelVisible's own doc comment) — deliberately shorter than
 *  ZOOM_TRANSITION_MS per direct follow-up ("tap to returnのフェードイン速
 *  度を少し速く"): the delay before it starts is still tied to the zoom
 *  motion's own duration, but the fade itself doesn't need to match that
 *  same, comparatively slow pace. */
const RETURN_LABEL_FADE_MS = 250;

/** One-time duration/ease for the intro's own centered → CENTER_LEFT/
 *  CENTER_TOP_PX slide (see centerImageStyle's own `introSlideSettled` branch
 *  below) — went through three rounds per repeated direct follow-up:
 *  1. Reused ZOOM_EASE directly — read as a sudden lurch right at the start
 *     ("急な動き過ぎる").
 *  2. Kept ZOOM_EASE's own (0.16, 1) opening control point but softened its
 *     third one (0.3 → 0.55) — still too abrupt ("まだ足らない"): every
 *     "ease out" curve in this codebase shares that same (0.16, 1) opening
 *     point, which front-loads ~100% of the travel into the first ~16% of
 *     the duration regardless of what follows it — the wrong half to change.
 *  3. Switched to a true, symmetric ease-in-out (0.65, 0, 0.35, 1) at 1400ms
 *     — fixed the abrupt start, but its own slow, lingering tail now read as
 *     *too* soft/mushy ("最後のほうがヌルっとし過ぎてる... もうちょい小気味
 *     良いほうが良さそう").
 *  Now: Material Design's own well-known "standard" easing (0.4, 0, 0.2, 1)
 *  — still a genuinely gentle, non-abrupt onset (unlike every (0.16, 1)-based
 *  curve above), but transitions to a decisive, crisp finish rather than
 *  continuing to slow-crawl all the way in — paired with a shorter duration
 *  (750ms, down from 1400ms) since the previous long duration compounded that
 *  lingering-tail feel on top of the curve shape itself. */
const INTRO_SLIDE_DURATION_MS = 750;
const INTRO_SLIDE_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

/** Mirrors studies-gallery.tsx's own INTRO_DURATION_MS/AUTO_ADVANCE_MS
 *  exactly, per explicit spec that SP's motion should match PC's ("動きや演
 *  出はPCと同じ"). Not imported directly since PC's own file doesn't export
 *  them — duplicated here rather than adding exports PC itself has no use
 *  for. (The intro *distance*, formerly a module-level INTRO_STEPS constant
 *  off STUDIES.length, is now computed inline off the `studies` prop's own
 *  length instead — see introEnd's own computation below.) */
const INTRO_DURATION_MS = 2200;
const AUTO_ADVANCE_MS = 5000;

/** Critically-damped glide constants — same formula/values as
 *  studies-gallery.tsx's own startGlideToTarget (see that file's own doc
 *  comment for the closed-form derivation). Unlike an earlier version of
 *  this file, `v0` here now *does* carry real trailing swipe velocity (see
 *  handleTouchMove below) — this file's touch handling was rewritten to
 *  mirror PC's own wheel/glide interplay directly, per direct follow-up
 *  ("PCで見てるときと同じくらいスルスル〜って感じが理想"). */
const GLIDE_DECAY_RATE = 0.01;
const GLIDE_FINISH_EPSILON = 0.01;
const GLIDE_SAFETY_MAX_MS = 1500;

/** How much vertical drag (px) equals one full item-unit of travel — directly
 *  1:1 (no clamp, no rubber-band), matching PC's own WHEEL_PX_PER_ITEM
 *  (studies-gallery.tsx) in spirit: this file went through two rounds of a
 *  deliberately *restrained* clamped/rubber-banded drag first (per the
 *  original spec, "スワイプでスライドが動きすぎないように"), but repeated
 *  direct follow-up feedback ("スワイプの挙動がまだ全然突っかかってる...
 *  PCで見てるときと同じくらいスルスル〜って感じが理想") made clear the
 *  user now wants PC's own free, direct-tracking feel specifically — so this
 *  file's whole touch handler was rewritten to mirror PC's handleWheel/
 *  startGlideToTarget interplay exactly (see handleTouchMove below): no
 *  cap on live position tracking, continuously re-targeting the nearest
 *  neighbor *ahead* in the current direction on every move event, carrying
 *  real trailing velocity into the glide. A swipe gesture is inherently
 *  bounded by how far a thumb can physically travel on one drag anyway, so
 *  removing the artificial clamp doesn't reintroduce runaway scrolling the
 *  way an uncapped mouse wheel might. */
const SWIPE_PX_PER_ITEM = 150;
/** Guards target-rounding against floating-point noise — same purpose as
 *  PC's own SNAP_EPSILON (studies-gallery.tsx). */
const SNAP_EPSILON = 0.001;
/** Smoothing weight for the live drag-velocity estimate (see handleTouchMove)
 *  — same 0.4/0.6 exponential-moving-average split PC's own wheel handler
 *  uses, so a real stop reflects quickly without one noisy touchmove event
 *  dominating. */
const VELOCITY_SMOOTHING = 0.6;
/** Below this many px of frame-to-frame movement, a touchmove is treated as
 *  sensor noise (a resting finger on glass rarely reports *exactly* zero
 *  movement) rather than real navigational intent — skipped entirely rather
 *  than feeding startGlideToTarget a fresh (effectively-zero-progress) target
 *  every such event. A physical mouse/trackpad wheel has no equivalent
 *  "holding contact but not really moving" event stream (it simply stops
 *  emitting events the instant the hand stops), so PC's own handleWheel
 *  never needed this — but on a touchscreen, without it, `settled` could
 *  keep getting reset back to false by pure jitter for as long as a finger
 *  merely rests on the glass, which may be part of why the settle/gauge
 *  reveal reads as less responsive than PC's own. */
const TOUCH_JITTER_DEADBAND_PX = 1;

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

/** Full width of the "01 - 10" gauge fill, once fully grown. */
const GAUGE_WIDTH_PX = 45;

/**
 * The "01 - 10" counter's gauge fill (Figma-inspired, mirrors PC's own
 * studies-gallery.tsx) — grows linearly from 0 to GAUGE_WIDTH_PX over
 * `durationMs`, timed to finish exactly when the real auto-advance fires.
 *
 * Deliberately a plain CSS *transition* (width 0 → GAUGE_WIDTH_PX, flipped
 * one frame after mount via `grown`) rather than PC's own `@keyframes`-based
 * animation — per direct real-device bug report ("ゲージの伸びる黒い線が表
 * 示されてない"): PC's technique splits the animation across a CSS class
 * (animation-name/timing-function/fill-mode) and an inline
 * `animation-duration`, remounted via a `key` bump. That's a known source of
 * first-mount quirks on some mobile WebKit/Blink builds — the animation
 * quietly never visibly starts unless something else forces a reflow first.
 * A transition triggered by a rAF-deferred state flip is the same reveal-
 * on-mount technique already used elsewhere in this codebase (e.g.
 * mobile-studies-thumbnail-rail.tsx's own entrance slide) and doesn't depend
 * on the animation engine picking up longhand properties split across two
 * different sources — a strictly simpler, more broadly reliable mechanism
 * for this exact "grow one property linearly over a fixed duration" case.
 * The parent still remounts this via `key={autoAdvanceGeneration}` exactly
 * like before, so a fresh instance (starting back at `grown = false`) mounts
 * every time a new countdown window actually begins.
 */
function GaugeFillSP({ durationMs, opacity }: { durationMs: number; opacity: number }) {
  const [grown, setGrown] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      aria-hidden
      className="absolute inset-y-0 left-0 bg-black"
      style={{
        width: grown ? `${GAUGE_WIDTH_PX}px` : "0px",
        opacity,
        transitionProperty: "width",
        transitionDuration: `${durationMs}ms`,
        transitionTimingFunction: "linear",
      }}
    />
  );
}

/**
 * The zoomed center image's real on-screen px size — landscape studies zoom
 * to the full viewport width ("横画像の場合は横幅いっぱいまで拡大"), and
 * square studies now do too (per direct follow-up "squareの横幅を端末幅
 * いっぱいにして" — previously its own fixed 12 grid columns). `wide` (8:5,
 * per direct follow-up "動画比率が8:5の場合があるんだけど、それ用に
 * orientationにも追加必要？" → "追加で") joins them too — it's an even more
 * horizontal shape than `landscape`, so the same full-width treatment fits.
 * Portrait alone still zooms to a fixed grid-column width
 * (ZOOM_WIDTH_COLUMNS_PORTRAIT, 11). Height always follows from that width
 * and this study's own real aspect ratio, so the zoomed box never distorts
 * the source photo. Unlike PC (studies-gallery.tsx's own computeZoomedBoxPx),
 * there's no viewport-height clamp here — SP's own spec has no equivalent
 * margin requirement, so this stays simple.
 */
function computeZoomedBoxPx(orientation: StudyOrientation, aspectRatio: number, viewportWidth: number) {
  if (orientation === "landscape" || orientation === "square" || orientation === "wide") {
    const widthPx = viewportWidth;
    return { widthPx, heightPx: widthPx / aspectRatio };
  }
  const columnWidthPx = (viewportWidth - SP_GRID_MARGIN_PX * 2) / SP_GRID_COLUMNS;
  const widthPx = columnWidthPx * ZOOM_WIDTH_COLUMNS_PORTRAIT;
  return { widthPx, heightPx: widthPx / aspectRatio };
}

/**
 * SP counterpart of components/studies-gallery.tsx (Figma node 1070:928,
 * "sp_studies") — same orchestration of a shared `position` (a continuous,
 * ever-growing/shrinking scroll position in item-units) driving both the
 * left thumbnail rail and the large center image, the same intro glide /
 * auto-advance / settle-triggered title-and-counter reveal PC uses (per
 * explicit spec: "動きや演出はPCと同じ（コードなど使い回せるものは使い回
 * す）") — StudiesCenterImage itself is reused verbatim, unchanged, since it
 * already renders at whatever size its own parent wrapper gives it.
 *
 * Two real behavioral differences from PC, both per explicit SP-specific
 * spec:
 * 1. Navigation is vertical touch swipe instead of mouse wheel — but per
 *    direct follow-up asking for PC's own feel specifically ("PCで見てる
 *    ときと同じくらいスルスル〜って感じが理想"), handleTouchMove below
 *    mirrors PC's own handleWheel/startGlideToTarget interplay almost
 *    exactly (direct 1:1 position tracking, continuously re-targeting the
 *    nearest neighbor ahead in the current direction, carrying real trailing
 *    velocity into the glide) rather than the more artificially restrained,
 *    clamped "one discrete step per gesture" version this file started with.
 * 2. Tap-to-zoom recenters the image on screen (computeZoomedBoxPx above),
 *    rather than PC's own "grow rightward from a fixed left edge, no
 *    recenter" treatment — and shows a static "Tap to return" label at the
 *    zoomed image's own bottom-right corner instead of PC's cursor-follow
 *    "Zoom"/"Zoom Out" label (a touch device has no cursor to follow).
 */
export function MobileStudies({ studies }: { studies: Study[] }) {
  // Starts `null` so the server-rendered HTML and React's first client
  // render match exactly — see studies-gallery.tsx's own identical comment.
  const [position, setPosition] = useState<number | null>(null);
  const [thumbnailShown, setThumbnailShown] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  // Flips true once, INTRO_SLIDE_DURATION_MS after `introDone` itself first
  // becomes true — distinguishes "the one-time intro center→CENTER_LEFT
  // slide" from every *later* left-position change (zooming in/out), which
  // also renders through this exact same unzoomed style branch once
  // `introDone` is (permanently) true. Without this, the slower/softer
  // INTRO_SLIDE_* timing below would keep applying to every future zoom
  // toggle too, not just this one intro moment. See centerImageStyle's own
  // comment further below for how this actually gets used.
  const [introSlideSettled, setIntroSlideSettled] = useState(false);
  const [settled, setSettled] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [zoomedSizePx, setZoomedSizePx] = useState<{ widthPx: number; heightPx: number } | null>(null);
  // "Tap to return" only fades in once the zoom-in motion has actually
  // finished — per direct follow-up ("tap to returnはzoom完了後に右下に
  // フェードインで表示"), see that element's own render below for the full
  // reasoning. `false` whenever not zoomed so the very next zoom-in always
  // starts hidden again.
  const [returnLabelVisible, setReturnLabelVisible] = useState(false);
  const [autoAdvanceGeneration, setAutoAdvanceGeneration] = useState(0);

  const positionRef = useRef<number | null>(null);
  const glideFrameRef = useRef<number | null>(null);
  const autoAdvanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Live touch-drag bookkeeping — null whenever no drag is in flight. See
  // handleTouchStart/Move/End below. `moved` tracks whether any touchmove
  // this gesture actually got past TOUCH_JITTER_DEADBAND_PX — see
  // handleTouchEnd's own doc comment for why this matters (distinguishing a
  // genuine swipe from a plain tap-to-zoom).
  const dragRef = useRef<{ lastY: number; lastTime: number; moved: boolean } | null>(null);
  // Smoothed trailing swipe velocity, in item-units per ms — same role as
  // PC's own velocityRef (studies-gallery.tsx).
  const velocityRef = useRef(0);
  // The sign of the most recent motion — same role as PC's own
  // lastDirectionRef, deciding *which* neighboring whole item counts as
  // "ahead" so a settle only ever continues forward in the direction the
  // user was already swiping, never backward.
  const lastDirectionRef = useRef(1);

  function updatePosition(value: number) {
    positionRef.current = value;
    setPosition(value);
  }

  function cancelGlide() {
    if (glideFrameRef.current !== null) {
      cancelAnimationFrame(glideFrameRef.current);
      glideFrameRef.current = null;
    }
  }

  function scheduleAutoAdvance() {
    if (autoAdvanceTimeoutRef.current) clearTimeout(autoAdvanceTimeoutRef.current);
    setAutoAdvanceGeneration((g) => g + 1);
    autoAdvanceTimeoutRef.current = setTimeout(() => {
      const target = Math.round(positionRef.current ?? 0) + 1;
      startGlideToTarget(target, 0);
      scheduleAutoAdvance();
    }, AUTO_ADVANCE_MS);
  }

  // Same closed-form critically-damped glide as studies-gallery.tsx's own
  // startGlideToTarget — see that file's own doc comment for the derivation.
  function startGlideToTarget(target: number, v0: number) {
    cancelGlide();
    setSettled(false);
    const p0 = positionRef.current ?? 0;
    const startTime = performance.now();

    function tick(now: number) {
      const t = now - startTime;
      const decay = Math.exp(-GLIDE_DECAY_RATE * t);
      const x = target + ((p0 - target) + (v0 + GLIDE_DECAY_RATE * (p0 - target)) * t) * decay;
      const remaining = Math.abs(target - x);

      if (remaining < GLIDE_FINISH_EPSILON || t > GLIDE_SAFETY_MAX_MS) {
        updatePosition(target);
        glideFrameRef.current = null;
        setSettled(true);
        return;
      }
      updatePosition(x);
      glideFrameRef.current = requestAnimationFrame(tick);
    }
    glideFrameRef.current = requestAnimationFrame(tick);
  }

  // 背景（StudiesBackground）のフェードインが終わってから、さらにひと呼吸
  // 置いて始める — INTRO_START_DELAY_MS の doc comment 参照。
  // ここで position が null から実値になった瞬間にイントロのグライドが
  // 走り出す（下の effect）ので、その起点を遅らせるのが一番素直。
  // rAF ではなく setTimeout なのは待ち時間そのものが目的のため
  // （set-state-in-effect の回避という意味では rAF と同じく effect 本体の
  // 外で setState することになるので条件は満たしている）。
  useEffect(() => {
    const thumbnailTimer = setTimeout(() => setThumbnailShown(true), INTRO_THUMBNAIL_DELAY_MS);
    const timer = setTimeout(() => {
      const start = Math.floor(Math.random() * studies.length);
      updatePosition(start);
    }, INTRO_START_DELAY_MS);
    return () => {
      clearTimeout(thumbnailTimer);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-only (studies is a stable server-fetched array for this page's lifetime).
  }, []);

  useEffect(() => {
    if (position === null) return;
    const introStart = position;
    const introEnd = introStart + studies.length;
    const startTime = performance.now();
    let frame: number;

    function tick(now: number) {
      const t = Math.min(1, (now - startTime) / INTRO_DURATION_MS);
      const next = introStart + (introEnd - introStart) * easeOutCubic(t);
      updatePosition(next);

      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setIntroDone(true);
        setSettled(true);
        scheduleAutoAdvance();
      }
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed off position's null-ness, not its value — see studies-gallery.tsx's own identical comment.
  }, [position === null]);

  useEffect(() => {
    return () => {
      cancelGlide();
      if (autoAdvanceTimeoutRef.current) clearTimeout(autoAdvanceTimeoutRef.current);
    };
  }, []);

  // Arms the one-time switch-back to ZOOM_TRANSITION_MS/ZOOM_EASE (see
  // introSlideSettled's own doc comment above) the moment introDone's own
  // center→CENTER_LEFT slide has had time to actually finish.
  useEffect(() => {
    if (!introDone) return;
    const timeout = setTimeout(() => setIntroSlideSettled(true), INTRO_SLIDE_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [introDone]);

  // Direct 1:1 drag tracking, mirroring PC's own handleWheel exactly (see
  // that function's own doc comment in studies-gallery.tsx) — per direct
  // follow-up asking for PC's own smoothness specifically ("PCで見てるとき
  // と同じくらいスルスル〜って感じが理想"). Every touchmove both moves
  // `position` by its own raw delta *and* (re)starts a physically-modeled
  // glide toward whichever whole item is nearest ahead, carrying the swipe's
  // own real trailing velocity — while more touchmove events keep arriving,
  // each new one immediately supersedes the last glide before it can
  // meaningfully diverge, so the drag still feels like direct tracking; the
  // moment the finger lifts, whichever glide was most recently started just
  // keeps running on its own (handleTouchEnd does nothing but clear the drag
  // ref — there's no separate "snap" logic to run).
  function handleTouchStart(event: React.TouchEvent) {
    if (!introDone) return;
    // `cancelGlide()` deliberately does NOT happen here anymore — see
    // `handleTouchMove`'s own doc comment below for why moving it there was
    // a real bug fix, not just a refactor.
    const touch = event.touches[0];
    velocityRef.current = 0;
    dragRef.current = { lastY: touch.clientY, lastTime: performance.now(), moved: false };
  }

  function handleTouchMove(event: React.TouchEvent) {
    if (!dragRef.current) return;
    const touch = event.touches[0];

    // Swiping up (finger moves toward the top, i.e. clientY decreases) reads
    // as "advance forward" — the same direction PC's own positive deltaY
    // (scrolling down) advances in.
    const framePx = dragRef.current.lastY - touch.clientY;
    // Ignore sub-deadband jitter entirely (see TOUCH_JITTER_DEADBAND_PX's own
    // doc comment) — `lastY`/`lastTime` deliberately aren't updated here, so
    // the next real move is still measured from the same last-genuine
    // position instead of losing that tiny bit of travel.
    if (Math.abs(framePx) < TOUCH_JITTER_DEADBAND_PX) return;

    // `cancelGlide()` moved here from `handleTouchStart` — per direct
    // follow-up ("タイトルが表示される前にzoomしてzoom outするとタイトルが
    // 表示されてない"): `handleTouchStart` used to cancel any in-flight
    // glide (e.g. auto-advance still coasting toward its target, `settled`
    // still false, title/count still fading in) on *every* touch, including
    // a plain tap-to-zoom that never moves past the jitter deadband at all.
    // `cancelGlide()` only stops the glide's own rAF loop — it never sets
    // `settled` back to true, and a plain tap's own `handleTouchEnd` "does
    // nothing but clear the drag ref" (see this function's own top doc
    // comment), so nothing else was left to ever complete that interrupted
    // glide. `position` was left sitting wherever the glide happened to be
    // cancelled mid-flight, `settled` stayed permanently false for that
    // resting spot, and the title/count (both gated on `settled`) stayed
    // blank until some *later*, unrelated glide finally completed one. Only
    // cancelling here, once real movement is confirmed past the deadband,
    // means a tap that never becomes a genuine drag never touches the glide
    // at all — it's left free to run to completion and settle normally.
    cancelGlide();
    dragRef.current.moved = true;
    if (!zoomed) scheduleAutoAdvance();
    const now = performance.now();
    const deltaPosition = framePx / SWIPE_PX_PER_ITEM;
    if (deltaPosition !== 0) lastDirectionRef.current = deltaPosition > 0 ? 1 : -1;

    const dt = Math.min(100, Math.max(4, now - dragRef.current.lastTime));
    const instantVelocity = deltaPosition / dt;
    velocityRef.current = velocityRef.current * (1 - VELOCITY_SMOOTHING) + instantVelocity * VELOCITY_SMOOTHING;

    dragRef.current.lastY = touch.clientY;
    dragRef.current.lastTime = now;

    const next = (positionRef.current ?? 0) + deltaPosition;
    updatePosition(next);

    // Rounds in the direction already being swiped — same reasoning as PC's
    // own handleWheel (studies-gallery.tsx): plain rounding could pick the
    // item *behind* wherever the drag has already carried past.
    const target =
      lastDirectionRef.current >= 0 ? Math.ceil(next - SNAP_EPSILON) : Math.floor(next + SNAP_EPSILON);
    startGlideToTarget(target, velocityRef.current);
  }

  // On release, re-targets toward a *momentum-projected* stopping point
  // rather than just wherever the drag's own last touchmove happened to be
  // nearest to — per direct follow-up ("強くスワイプしたらスルスルーっとい
  // く感じ"): during the drag itself, every touchmove already retargets to
  // the single nearest neighbor ahead (matching PC's own direct-tracking
  // feel), but a real momentum "flick" — fast, but covering little actual
  // finger travel — barely moves `position` during the drag itself, so
  // without this, releasing one would just settle on the very next item
  // regardless of how hard the flick was, never reading as "swipe hard,
  // travel further". `v0/GLIDE_DECAY_RATE` is this same critically-damped
  // system's own natural coast distance at velocity `v0`: integrating
  // v0*exp(-k t) from 0 to infinity gives exactly v0/k, so projecting the
  // target that far ahead and gliding there with that same real v0 traces
  // out precisely the motion this system would follow if it simply coasted
  // to a stop on its own, just landing exactly on a whole item instead of
  // wherever the raw decay happens to end. A slow/negligible-velocity
  // release still projects to essentially the same spot it's already at, so
  // gentle swipes are unaffected.
  //
  // Skips all of the above entirely for a plain tap (no real movement ever
  // got past TOUCH_JITTER_DEADBAND_PX in handleTouchMove, so `moved` is still
  // false) — per direct real-device report that tapping the center image to
  // zoom it replayed "Study01"'s scramble-text reveal ("SPでイメージをzoom
  // したとき、Study01がスクランブルテキストのアニメーションが走るけど無し
  // で"): every touch on this whole gallery (including a tap on the image,
  // which bubbles up to this same handler) used to call startGlideToTarget
  // unconditionally, and startGlideToTarget always flips `settled` false then
  // back to true (see its own doc comment) — ScrambleText's `active` prop is
  // wired to `settled`, so that brief false→true blip restarted its reveal
  // from scratch even though `activeIndex`/the displayed study never actually
  // changed. A tap-to-zoom is already exactly at rest at a whole item
  // (nothing dragged it away), so there's nothing to glide toward or settle
  // in the first place — bailing out here leaves `settled` (and so the
  // scramble text) untouched, while genuine swipes/flicks (which do set
  // `moved`) keep gliding/settling exactly as before.
  function handleTouchEnd() {
    const wasMoved = dragRef.current?.moved ?? false;
    dragRef.current = null;
    if (!wasMoved) return;
    const v0 = velocityRef.current;
    const p0 = positionRef.current ?? 0;
    const projected = p0 + v0 / GLIDE_DECAY_RATE;
    const target =
      lastDirectionRef.current >= 0 ? Math.ceil(projected - SNAP_EPSILON) : Math.floor(projected + SNAP_EPSILON);
    startGlideToTarget(target, v0);
  }

  function handleThumbnailSelect(slot: number) {
    if (!introDone) return;
    if (!zoomed) scheduleAutoAdvance();
    startGlideToTarget(slot, 0);
  }

  const resolvedPosition = position ?? 0;
  const activeIndex = mod(Math.round(resolvedPosition), studies.length);
  const active = studies[activeIndex];
  const aspectRatio = ORIENTATION_ASPECT_RATIO[active.orientation];

  // The rotated "Study NN"/title block below (unlike the center image/rail
  // above) must NOT track `activeIndex` live — same fix, and same reason, as
  // studies-gallery.tsx's own `displayedIndexRef` (per direct follow-up:
  // "画像が切り替わる瞬間、次のテキストが一瞬表示される"). See that file's
  // own doc comment for the full explanation.
  const displayedIndexRef = useRef(activeIndex);
  if (settled) displayedIndexRef.current = activeIndex;
  const displayedIndex = displayedIndexRef.current;
  const displayed = studies[displayedIndex];

  useLayoutEffect(() => {
    if (!zoomed) return;
    function recompute() {
      setZoomedSizePx(computeZoomedBoxPx(active.orientation, aspectRatio, window.innerWidth));
    }
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [zoomed, active.orientation, aspectRatio]);

  useEffect(() => {
    if (zoomed) {
      if (autoAdvanceTimeoutRef.current) clearTimeout(autoAdvanceTimeoutRef.current);
    } else if (introDone) {
      scheduleAutoAdvance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scheduleAutoAdvance reads refs/state at call time; depending on it would re-trigger this every render.
  }, [zoomed, introDone]);

  // "Tap to return" fades in only once the zoom-in motion has actually
  // settled — per direct follow-up ("tap to returnはzoom完了後に右下に
  // フェードインで表示"), instead of appearing instantly the moment `zoomed`
  // flips true (this element's own render below is still gated on `zoomed`
  // alone, so it mounts right away — this timer only controls its opacity,
  // giving it something to fade *from*). Hides again immediately on
  // zoom-out (no matching delay needed there — it's already covered by
  // `{zoomed && (...)}` unmounting it outright). Reuses the same duration
  // this box's own zoom transition always uses (ZOOM_TRANSITION_MS, or the
  // softer INTRO_SLIDE_DURATION_MS on the one-off chance this page's very
  // first zoom happens to race the intro slide — matches centerImageStyle's
  // own `introSlideSettled` branching for the same reason).
  useEffect(() => {
    if (!zoomed) return;
    const durationMs = introSlideSettled ? ZOOM_TRANSITION_MS : INTRO_SLIDE_DURATION_MS;
    const timeout = setTimeout(() => setReturnLabelVisible(true), durationMs);
    // Cleanup (not the effect body itself) is what resets this back to
    // false — fires on zoom-out (deps change) as well as unmount, so the
    // *next* zoom-in always starts hidden again without a synchronous
    // setState call in the effect body itself.
    return () => {
      clearTimeout(timeout);
      setReturnLabelVisible(false);
    };
  }, [zoomed, introSlideSettled]);

  function handleImageClick(event: React.MouseEvent) {
    if (!introDone) return;
    event.stopPropagation();
    setZoomed((current) => !current);
  }

  function handleGalleryClick() {
    if (zoomed) setZoomed(false);
  }

  // `left`/`top` are a permanent `0`/`0` in every branch below — all real
  // positioning (unzoomed rest, the one-time intro slide, and zoom in/out in
  // every orientation) instead lives in `transform: translate()`, with
  // `width`/`height` the only other properties that ever actually change.
  //
  // This box's motion went through several real-device-tested rounds, each
  // per direct follow-up bug report:
  // 1. `left`/`top: 50%` + `transform: translate(-50%, -50%)` self-centering
  //    for the zoomed portrait/square box — the translate's percentages
  //    resolve against the element's *own* (simultaneously shrinking-on-
  //    zoom-out) border box every frame, decoupling from `left`/`top`'s own
  //    container-relative animation and producing a lopsided, top-left-
  //    leaning motion ("イメージが左上に移動してから縮小するような挙動があ
  //    る").
  // 2. Fixed *that* by computing `left`/`top` as real container-relative
  //    `calc(50% - halfSizePx)` px instead — correct motion, but real
  //    per-frame layout/reflow cost (`left`/`top` *and* `width`/`height` all
  //    genuinely animating together), reported as "ガタガタする" real-device
  //    judder.
  // 3. Moved `left`/`top` permanently to `0`/`0`, all positioning onto
  //    `transform: translate()` (compositor-only) — fixed bug 1 outright,
  //    but `width`/`height` alone were apparently still enough real layout
  //    cost to keep judder visible ("まだガタガタしてる").
  // 4. Tried a full FLIP (First-Last-Invert-Play) rewrite — animating this
  //    box's own geometry *instantly*, no CSS transition at all, and instead
  //    imperatively writing a compensating `transform` directly via a ref in
  //    a `useLayoutEffect` to fake the smooth motion purely on the
  //    compositor. Reverted per a *worse* real-device bug report ("一瞬めっ
  //    ちゃ大きくなる", the image flashing to an enormous size for an
  //    instant): Next.js dev mode runs React StrictMode, which deliberately
  //    double-invokes effects — since that version wrote directly to
  //    `el.style` (a real side effect, not React-state-driven), the second,
  //    StrictMode-only invocation re-measured the box *while the first
  //    invocation's own inverse transform was still applied*, compounding
  //    into a wildly exaggerated scale. A plain CSS-driven `transition` (as
  //    below) has no such risk — it's declarative, so React re-rendering it
  //    twice is always idempotent.
  // Back to plain CSS transitions on `transform`/`width`/`height` (bug 3's
  // baseline) is the most *reliable* of the versions tried, even though it
  // isn't quite as buttery-smooth on real hardware as a correctly-implemented
  // FLIP would be — the zoom-*in* direction always used this same mechanism
  // from the very start of this feature and was never itself reported as
  // broken, only zoom-*out* specifically (bug 2, since fixed) and, before
  // that, the intro slide specifically (a separate, already-solved judder —
  // see CENTER_LEFT's own transform-only treatment above).
  //
  // `zIndex` only rises while zoomed — per direct follow-up ("タップで拡大し
  // たときは、テキスト要素よりも前面にして"): the counter/title/intro-text
  // elements below all render later in DOM order, so without an explicit
  // z-index the expanded image would paint *underneath* them wherever they
  // happen to overlap.
  // Square now spans the full viewport width horizontally, same as landscape
  // (per direct follow-up "squareの横幅を端末幅いっぱいにして", see
  // computeZoomedBoxPx above) — used below for the shared `left:0`/width/
  // tap-to-return-margin treatment. It does NOT share landscape's *vertical*
  // treatment though (see the square-specific branch below): a first version
  // did lump square into the exact same branch as landscape (fixed
  // `translateY(CENTER_TOP_PX)`, no recentering), but per direct follow-up
  // ("SPのsquareのzoom時が画面下のほうに表示される") that read as sitting too
  // low — landscape's short zoomed height happens to still look fine at that
  // fixed Y (it matches the unzoomed resting position, avoiding a vertical
  // jump), but square's zoomed height is `viewportWidth` (i.e. as tall as the
  // screen is wide), so anchoring it at that same, comparatively high-up Y
  // pushed its bottom edge well down the screen instead of reading as
  // centered. Square keeps the full-width horizontal treatment but goes back
  // to vertically centering itself, same mechanism portrait's own branch
  // below already uses.
  // `wide` (8:5, per direct follow-up "動画比率が8:5の場合があるんだけど、
  // それ用にorientationにも追加必要？" → "追加で") joins the *landscape*
  // side of this split, not square's — its zoomed height (viewportWidth /
  // 1.6) is shorter than landscape's own (viewportWidth / 1.333), so the
  // same "fixed Y, no recentering" treatment that already suits landscape's
  // short zoomed height suits `wide` too, for the same reason.
  const isFullWidthZoom =
    zoomed && (active.orientation === "landscape" || active.orientation === "square" || active.orientation === "wide");
  const isSquareZoom = zoomed && active.orientation === "square";
  const centerImageStyle: React.CSSProperties =
    zoomed && zoomedSizePx
      ? isSquareZoom
        ? {
            // Full width horizontally (left:0, no X offset needed — see
            // isFullWidthZoom's own doc comment above), but vertically
            // centered on screen rather than landscape's fixed Y — see this
            // section's own doc comment above for why.
            left: 0,
            top: 0,
            width: `${zoomedSizePx.widthPx}px`,
            height: `${zoomedSizePx.heightPx}px`,
            zIndex: 30,
            // willChange — see this ternary's own trailing doc comment
            // (right after its closing brace) for why.
            willChange: "width, height",
            transform: `translateY(${(window.innerHeight - zoomedSizePx.heightPx) / 2}px)`,
            transitionProperty: "transform, width, height",
            transitionDuration: `${ZOOM_TRANSITION_MS}ms`,
            transitionTimingFunction: ZOOM_EASE,
          }
        : isFullWidthZoom
          ? {
              // Already spans edge to edge horizontally, so no X offset is
              // needed — `top`'s translateY below matches the unzoomed
              // branch's own exactly, so it never visibly moves when
              // toggling zoom on a landscape study.
              left: 0,
              top: 0,
              width: `${zoomedSizePx.widthPx}px`,
              height: `${zoomedSizePx.heightPx}px`,
              zIndex: 30,
              willChange: "width, height",
              transform: `translateY(${CENTER_TOP})`,
              transitionProperty: "transform, width, height",
              transitionDuration: `${ZOOM_TRANSITION_MS}ms`,
              transitionTimingFunction: ZOOM_EASE,
            }
          : {
              // Recenters on screen — per explicit SP-specific spec ("画面中央
              // 配置"), unlike PC's own fixed-left-edge growth. Reading
              // `window.inner*` directly here (not just inside an effect) is
              // safe: this branch only ever evaluates once `zoomed` is true,
              // which only ever happens client-side after a real tap — the
              // initial (and only ever server-rendered) state has `zoomed`
              // false, so this line never runs during SSR/hydration.
              left: 0,
              top: 0,
              width: `${zoomedSizePx.widthPx}px`,
              height: `${zoomedSizePx.heightPx}px`,
              zIndex: 30,
              willChange: "width, height",
              transform: `translate(${(window.innerWidth - zoomedSizePx.widthPx) / 2}px, ${(window.innerHeight - zoomedSizePx.heightPx) / 2}px)`,
              transitionProperty: "transform, width, height",
              transitionDuration: `${ZOOM_TRANSITION_MS}ms`,
              transitionTimingFunction: ZOOM_EASE,
            }
      : {
          // マウント時のパラパラ表示（`!introDone` — StudiesCenterImage が
          // 同じフラグを `expanded` で受けてマスク／スケールのリビールを
          // 出している間）も、この箱は最終的な定位置に置いたままにする —
          // per direct follow-up（"最初にサムネがパラパラ表示されるときの
          // 表示位置を fix 時の位置に対して中央になるように合わせて"、
          // 選択肢としては「fix位置で再生（スライド無し）」）。
          //
          // 経緯: 元は X だけ画面中央（50vw - CENTER_WIDTH/2）に置き、
          // introDone の瞬間に CENTER_LEFT へ横スライドさせていた。さらに
          // その前は縦も画面中央にしていたが、X と Y が同時に動くせいで
          // 斜めに滑って見え（"まだ中央→定位置の動きがカーブしてるように
          // 見える。右に直線で動いてるようにしたい"）、Y を定位置に固定して
          // 横移動だけにした経緯がある。今回その横移動自体を無くしたので、
          // パラパラ表示は最初から最後まで定位置。パラパラ中に見えている
          // 小さいサムネはこの箱の中央を切り抜いたもの（clip-path の
          // inset、studies-center-image.tsx）なので、箱を定位置に置くこと
          // がそのまま「fix 位置に対して中央」になる。
          //
          // transitionDuration/transitionTimingFunction が introSlideSettled
          // で切り替わる仕組みはそのまま残してある。イントロ直後にズームを
          // 叩いた1回ぶんだけ INTRO_SLIDE_* の柔らかい timing を使い、以降は
          // ズームと同じ ZOOM_* に戻る（その state 自身の doc comment 参照）。
          //
          // `zoomed` が true になり得るのは introDone 後だけ（ズームの入口が
          // すべて introDone でガードされている）なので、この分岐が上の
          // zoomed 側の transform と競合することはない。
          left: 0,
          top: 0,
          width: CENTER_WIDTH,
          height: CENTER_HEIGHT,
          willChange: "width, height",
          transform: `translate(${CENTER_LEFT}, ${
            introDone ? CENTER_TOP : `calc(${CENTER_TOP} - ${INTRO_CENTER_RISE_PX}px)`
          })`,
          // `width`/`height` are plain constants (CENTER_WIDTH/CENTER_HEIGHT)
          // throughout every *intro*-related transition (centered → resting
          // slide), so listing them here is a no-op the rest of the time —
          // nothing to animate since neither their old nor new computed
          // value ever differs in that case. They only start *from* a
          // genuinely different value on one specific transition: zooming
          // back out, where the zoomed branch's own `width`/`height` (see
          // above) really do differ from this box's own resting values.
          transitionProperty: "transform, width, height",
          transitionDuration: introSlideSettled ? `${ZOOM_TRANSITION_MS}ms` : `${INTRO_SLIDE_DURATION_MS}ms`,
          transitionTimingFunction: introSlideSettled ? ZOOM_EASE : INTRO_SLIDE_EASE,
        };

  // A fixed-size, `transform: scale()`-only inner wrapper (avoiding any
  // `width`/`height` animation on the actual `<img>`) was tried here per an
  // earlier real-device jank report -- reverted per two further real-device
  // follow-ups that its own visual trade-off was worse than the jank it
  // fixed: a non-uniform `scaleX !== scaleY` (unavoidable when scaling a
  // fixed *portrait* reference box up to a landscape/square target) reads as
  // outright distortion, not just "a bit stretched" -- first reported as
  // permanently wrong at rest ("squareのとき、縦長画像がそのまま正方形に伸
  // びて表示される"), then, even after confining that approximation to just
  // the brief mid-transition window, reported as still visibly wrong during
  // that window too ("アニアメーション途中がめっちゃ変"). Per direct
  // follow-up choosing to prioritize a correct shape at every instant over
  // maximum smoothness ("実サイズをCSSで直接アニメさせる方式に戻す"),
  // StudiesCenterImage is back to sizing itself directly off
  // centerImageStyle's own real, `width`/`height`-transitioning box (plain
  // `h-full w-full`, see its own component file) -- `<img>`'s `object-fit`
  // does re-run every frame that transitions, the real cost this whole
  // detour tried to eliminate, but the shape is always correct, at rest and
  // mid-motion alike.
  //
  // On real-device smoothness: a transform-based FLIP rewrite was considered
  // again, but that's the *exact* scale-based technique already reverted
  // above for visible distortion — reproducing it would just trade the jank
  // back for that same rejected defect. So the real `width`/`height` keep
  // animating (shape stays correct) and only `will-change: width, height` is
  // added on top, signalling the browser to prepare for that change ahead of
  // time rather than reactively at the first frame — mirroring this
  // codebase's own established `will-change: clip-path`/`transform`
  // precedent (studies-center-image.tsx, its own white-flash fix doc
  // comment). It doesn't move `width`/`height` onto the compositor — no CSS
  // mechanism does, they're inherently layout properties — so some
  // real-device cost necessarily remains.
  //
  // `contain: layout paint` was also tried here, alongside will-change, and
  // has been removed: `paint` clips descendants to this box, and the "Tap to
  // return" label deliberately sits *outside* it (`top: calc(100% + 20px)`,
  // 20px below the image), so containment silently made that label
  // disappear entirely once zoomed.

  return (
    <div
      className="absolute inset-0 lg:hidden"
      style={{ touchAction: "none" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleGalleryClick}
    >
      <MobileStudiesThumbnailRail studies={studies} position={resolvedPosition} onSelect={handleThumbnailSelect} shown={position !== null} />

      <Link
        href="/"
        className="absolute block text-[15px] leading-[1.5] font-medium whitespace-nowrap text-black [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
        style={{ top: "50px", left: TEXT_LEFT }}
      >
        ANDMADE Inc.
      </Link>

      {/* text-[14px] → 13px — per direct follow-up ("リード文を13pxに")。 */}
      <div
        className="absolute text-[13px] leading-[17px] font-normal whitespace-nowrap text-black"
        style={{ top: GROUP_TOP, left: TEXT_LEFT }}
      >
        {/* Manual line breaks per explicit spec, replacing an earlier
           auto-wrapped (width-constrained) paragraph. Curtain-reveal per
           line (mirroring studies-gallery.tsx's own intro paragraph) — see
           INTRO_TEXT_EASE's own doc comment above. Each line sits inside its
           own `overflow-hidden` box so the inner `<p>` can slide up from
           translateY(100%) (fully hidden behind that line's own box) to
           translateY(0), staggered by `lineIndex * INTRO_TEXT_LINE_STAGGER_MS`
           once `introDone` flips true. */}
        {INTRO_TEXT_LINES.map((line, lineIndex) => (
          <div key={line} className="overflow-hidden">
            <p
              style={{
                transform: introDone ? "translateY(0)" : "translateY(100%)",
                transitionProperty: "transform",
                transitionDuration: `${INTRO_TEXT_REVEAL_MS}ms`,
                transitionDelay: introDone ? `${lineIndex * INTRO_TEXT_LINE_STAGGER_MS}ms` : "0ms",
                transitionTimingFunction: INTRO_TEXT_EASE,
              }}
            >
              {line}
            </p>
          </div>
        ))}
      </div>

      {/* opacity — パラパラが始まるまでサムネ自体を出さない。per direct
         follow-up ("背景が表示されてからサムネが表示されてすぐにパラパラが
         はじまるようにして"、その後 "サムネが表示されるタイミングをもう少し
         速くして"）。「背景フェード → サムネ出現 → INTRO_THUMBNAIL_LEAD_MS
         後にパラパラ」の順になる。以前は position ?? 0 で Study01 が最初から
         描かれていて、背景が出ている間ずっと静止したサムネが見えていた。

         出現そのものは opacity ではなく StudiesCenterImage の `revealed`
         （中央から広がるマスク）に任せている — per direct follow-up
         ("最初にサムネが表示されるときも、パッと表示させずに中央からマスクが
         広がって表示されるようにして")。 */}
      <div
        className="absolute"
        style={{ ...centerImageStyle }}
        onClick={handleImageClick}
      >
        {/* expandDurationMs/expandEase reuse this exact same INTRO_SLIDE_*
           pair as the outer wrapper's own centered→CENTER_LEFT/CENTER_TOP_PX
           slide (centerImageStyle above) — per direct follow-up that the
           slide looked like it traced a slight curve while moving right
           ("拡大しながら移動してるので、少し曲線を描きながら右にスライドし
           てるように見えてる"): StudiesCenterImage's own default expand
           timing (900ms, a different curve) used to run out of step with
           this slide (750ms), and since the visible photo is always centered
           within this moving box, those two independently-eased motions
           summed into a curved path — see StudiesCenterImage's own
           expandDurationMs/expandEase doc comment for the full reasoning.
           Passing the exact same constants here (not just visually similar
           values) guarantees both stay in lockstep. */}
        <StudiesCenterImage
          studies={studies}
          activeIndex={activeIndex}
          expanded={introDone}
          expandDurationMs={INTRO_SLIDE_DURATION_MS}
          expandEase={INTRO_SLIDE_EASE}
          revealed={thumbnailShown}
          videoPlaying={zoomed}
        />

        {/* "Tap to return" — per explicit spec ("拡大時は画像右下に「Tap to
           return」と入れる"), then corrected per direct follow-up ("tap to
           returnが画像の外に出てない。画像外の右下25pxの位置"), then
           tightened 5px per a later follow-up ("SPのtap to returnの上マー
           ジンも5px詰めて"): this sits *outside* the image entirely (below
           it, flush with its own right edge, 20px below its bottom edge)
           rather than inset over the photo
           itself — an earlier version used `right`/`bottom` insets, which
           overlaid it *on top of* the image's own bottom-right corner
           instead. No cursor to follow on a touch device (unlike PC's own
           cursor-tracking "Zoom"/"Zoom Out" label), so this is a plain,
           static label rather than a rAF-driven follow.

           `right` is 8px (the grid's own margin) instead of flush-0 while
           full-width-zoomed (landscape, and now square too — see
           `isFullWidthZoom` above) — per direct follow-up ("横画像拡大時の
           右下tap to returnの右マージン8px空けて"): a full-width zoom spans
           the entire viewport width (see computeZoomedBoxPx), so this
           wrapper's own right edge sits exactly at the screen's right edge,
           and `right: 0` there landed the label flush against the true
           screen edge with no breathing room at all — portrait zooms don't
           reach the screen edge, so flush-0 still reads fine there. */}
        {zoomed && (
          <p
            className="absolute text-[12px] leading-[1.2] font-normal whitespace-nowrap text-black transition-opacity"
            style={{
              top: "calc(100% + 20px)",
              right: isFullWidthZoom ? "8px" : 0,
              opacity: returnLabelVisible ? 1 : 0,
              transitionDuration: `${RETURN_LABEL_FADE_MS}ms`,
            }}
          >
            Tap to return
          </p>
        )}
      </div>

      {/* "Tap to zoom." — flush against the center image's own right edge,
         same row as the "01 - 10" counter below. Hidden while zoomed
         (superseded by "Tap to return" above). Opacity tracks `introDone`
         (not `settled`) per direct follow-up ("SPで最初表示されるときは、
         01-10とtap to zoomも非表示、Study01が表示されるタイミングでフェー
         ドイン") — `introDone` flips false→true exactly once, at the mount-
         time intro's own finish, and never reverts; `settled` was tried
         first, but it toggles false on *every* glide (every swipe/auto-
         advance/thumbnail click), which made this hide and re-fade on every
         subsequent image switch too — reported back as a regression
         ("イメージが切り替わる度に01-10とtap to zoomが消えてる"). `introDone`
         gives the same "fade in together with Study01's own first reveal"
         timing (both flip at that same moment) without hiding again later. */}
      {!zoomed && (
        // leading 1.2 → 1.5 — per direct follow-up ("01-10とtap to zoomの
        // 上面が揃ってないっぽい。1pxくらい01-10が下にズレてる？"): both this
        // and the "01 - 10" counter row below share the exact same literal
        // `top: COUNTER_TOP`, but a 12px line box's half-leading (the space
        // a taller line-height adds above the glyph, since it's split evenly
        // above/below by default) scales with the leading value — this was
        // 1.2 while the counter row was 1.5, so their glyphs sat at very
        // slightly different heights *despite* an identical `top`. Matching
        // the counter row's own 1.5 removes that half-leading discrepancy.
        <p
          className="absolute text-right text-[12px] leading-[1.5] font-normal whitespace-nowrap text-black transition-opacity"
          style={{
            top: COUNTER_TOP,
            left: CENTER_LEFT,
            width: CENTER_WIDTH,
            opacity: introDone ? 1 : 0,
            transitionDuration: introDone ? "300ms" : "0ms",
          }}
        >
          Tap to zoom.
        </p>
      )}

      {/* Rotated vertical "Study NN" / title block — Figma node 1070:1015,
         sitting in the gap between the rail and the center image. Stacking
         order matches PC's own (studies-gallery.tsx): "Study NN"/count
         first/12px, title second/14px — this order was briefly swapped
         (title first, count second) per an earlier follow-up ("SPのほうも
         PCに合わせてtitleとlabelを逆にして"), then swapped right back once
         PC's own order turned out to be the wrong one to match in the first
         place (per "pcのほうは上の小さい文字にNauts stickerってタイトルが
         入って下の大きい文字がStudy01になってしまってるんだって" — the
         correct order is count first, title second, on *both* trees). "Study
         NN" falls back to the same
         activeIndex+1/zero-padded auto count as PC's own equivalent line
         unless this study has its own microCMS `label` override set (see
         lib/studies.ts's own `Study.label` doc comment — added per earlier
         follow-up, "大きい方の連番自体を変えたい"). `active.title`'s own
         placeholder data (lib/studies.ts) happens to already read "Study 01"
         etc. today, so the two lines look identical until real, distinct
         per-study copy exists — same placeholder-data caveat as PC's own
         single-line title readout.

         Anchoring geometry — a zero-size "shim" div pins one exact point
         (TEXT_LEFT, CENTER_TOP_PX), and the actual rotated content is
         positioned *inside* it via `left: 0; bottom: 0`, landing its own
         bottom-left corner exactly on that pinned point (a zero-size
         container's own top and bottom edges coincide, so `bottom: 0` here
         means the same thing `top: 0` would). Combined with
         `transform-origin: left bottom` + `rotate(90deg)`, this makes the
         *rotated* visual grow purely rightward and downward from that same
         pinned point — i.e. its own top edge lands at CENTER_TOP_PX (flush
         with the center image's own top, per earlier follow-up "Study01の
         テキストはイメージの上面に揃えて") *and* its own left edge lands at
         TEXT_LEFT (flush with "ANDMADE Inc." above it, per this follow-up:
         "study01の面をANDMADE Inc.にそろえて"), simultaneously, with no need
         to know this block's own rendered width/height numerically (an
         earlier `transform-origin: top left` version instead grew leftward
         from TEXT_LEFT, landing its left edge well to the *left* of
         "ANDMADE Inc." instead of flush with it — this pivot-corner choice is
         what fixes that).

         Opacity now tracks `settled` (0 while not settled, instant-on/300ms-
         off) — matching PC's own placeholder-title treatment exactly
         (studies-gallery.tsx) — per two direct follow-ups: "表示時にStudy01
         のテキストは出さない" (during the mount-time intro glide, `settled`
         is still false the whole time, so this now stays fully hidden until
         it actually finishes — an earlier, always-visible version showed the
         plain title immediately) and "自動スライド時にStudy01のテキストが
         パッと変わってからスクランブルテキストが走ってる": `activeIndex`
         (and so this text) updates continuously *during* a glide, well before
         `settled` flips back to true, so an always-visible version showed the
         new title as a plain, un-scrambled pop the instant it changed, with
         the scramble reveal only catching up later once settled. Hiding this
         behind the same opacity gate PC's own title uses means that pop now
         happens while invisible, and the scramble reveal is the very first
         thing shown once it fades back in — no visible pop beforehand. */}
      <div className="absolute" style={{ left: TEXT_LEFT, top: CENTER_TOP }}>
        <div
          className="absolute flex flex-col items-start gap-[8px] whitespace-nowrap text-black transition-opacity"
          style={{
            left: 0,
            bottom: 0,
            transformOrigin: "left bottom",
            transform: "rotate(90deg)",
            opacity: settled ? 1 : 0,
            transitionDuration: settled ? "0ms" : "300ms",
          }}
        >
          <p className="text-[12px] leading-[1.5] font-medium [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
            <ScrambleText
              text={displayed.label || `Study ${String(displayedIndex + 1).padStart(2, "0")}`}
              active={settled}
            />
          </p>
          {/* 14px → 13px — per direct follow-up ("study01下の各見出しを
              13pxに")。 */}
          <p className="text-[13px] leading-[1.5] font-medium [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
            <ScrambleText text={displayed.title} active={settled} />
          </p>
        </div>
      </div>

      {/* "01 - 10" counter — same SlotDigits/gauge treatment as PC's own
         (studies-gallery.tsx), just fixed literal px instead of --scale, and
         GaugeFillSP's own transition-based grow (see that component's own
         doc comment) instead of PC's --scale-driven `@keyframes`
         (.studies-gauge-fill). The whole row's own opacity tracks `introDone`
         (not `settled`) — see "Tap to zoom."'s own doc comment above for why:
         `settled` toggles on *every* glide (every swipe/auto-advance/
         thumbnail click), which made this whole row hide and re-fade on
         every subsequent image switch instead of only the very first mount,
         a regression the user flagged directly. `introDone` flips true
         exactly once, at the same moment `settled` first does, so the first
         fade-in still lands together with Study01's own first reveal.

         Also fades out while `zoomed` — per direct follow-up ("SPのとき、
         zoomしたら01-10はフェードアウトで隠して"): stays mounted (not
         conditionally rendered) so `transition-opacity` actually plays
         rather than the row just vanishing instantly, matching "Tap to
         zoom."'s own sibling row (which instead swaps to a whole separate
         "Tap to return" element while zoomed) in spirit, if not
         implementation — this row has no zoomed-specific replacement, so it
         simply fades to nothing instead. */}
      <div
        className="absolute flex items-baseline gap-[8px] text-[12px] leading-[1.5] font-medium whitespace-nowrap text-black transition-opacity"
        style={{
          top: COUNTER_TOP,
          left: CENTER_LEFT,
          opacity: introDone && !zoomed ? 1 : 0,
          transitionDuration: introDone ? "300ms" : "0ms",
        }}
      >
        <SlotDigits value={activeIndex + 1} digits={2} durationMs={350} />
        <div
          className="relative h-px shrink-0 self-center bg-black/20"
          style={{ width: `${GAUGE_WIDTH_PX}px` }}
        >
          {!zoomed && (
            <GaugeFillSP
              key={autoAdvanceGeneration}
              durationMs={AUTO_ADVANCE_MS}
              opacity={introDone && settled ? 0.8 : 0}
            />
          )}
        </div>
        <span className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
          {String(studies.length).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}
