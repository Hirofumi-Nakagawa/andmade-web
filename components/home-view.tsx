"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLenis } from "lenis/react";
import { HeaderSummon } from "@/components/header-summon";
import { HomeStatement } from "@/components/home-statement";
import { HoveredProjectTitle } from "@/components/hovered-project-title";
import { MobileHome } from "@/components/mobile-home";
import { SoundColorsBackground } from "@/components/sound-colors-background";
import { PreloadProjectPreviews } from "@/components/preload-project-previews";
import { ProjectGridSection } from "@/components/project-grid-section";
import {
  ProjectHoverPreview,
  type HoverPreviewEntry,
  type HoverPreviewRect,
} from "@/components/project-hover-preview";
import { ProjectThumbnailGrid } from "@/components/project-thumbnail-grid";
import { ProjectViewToggle } from "@/components/project-view-toggle";
import { RecentNews } from "@/components/recent-news";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { markPageEntered } from "@/lib/entrance";
import { getGridScale } from "@/lib/grid-scale";
import type { NewsItem } from "@/lib/news";
import {
  PREVIEW_RATIO_ASPECT,
  getProjectImageSrc,
  getProjectImageSrcSet,
  getProjectPreviewVideoSrc,
  type PreviewRatio,
  type Project,
} from "@/lib/projects";

/** Grid used for the hover-preview's random placement — matches grid-overlay.tsx. */
const GRID_MARGIN_PX = 24;
const GRID_COLUMN_WIDTH_PX = 58;
const GRID_COLUMN_COUNT = 24;
/** Preview boxes never start left of the 5th grid line. */
const PREVIEW_START_COLUMN = 4;
const PREVIEW_VERTICAL_MARGIN_PX = 15;
/** How close to the very bottom of the page counts as "reached the bottom". */
const BOTTOM_OF_PAGE_TOLERANCE_PX = 2;
/** Clears the preview if you leave a title and don't hover another within this long. */
const HOVER_CLEAR_DELAY_MS = 2000;
/** Matches ProjectHoverPreview's own opacity transition duration (see its
 *  own duration-300 class) — sped up from the original 500ms to match the
 *  faster 300ms fade used elsewhere for this kind of dismiss-fade (e.g.
 *  idle-overlay.tsx/site-intro.tsx's own EXIT_FADE_MS, header-summon.tsx's
 *  own FADE_MS), per explicit request ("フェードアウトの速度もう少し速くし
 *  て / 他でフェードアウト使ってる箇所で500msより速くしてる箇所があったらそ
 *  れに合わせて"). */
const HOVER_PREVIEW_FADE_MS = 300;
/** スクロールが止まってから、ホバー抑制（suppressHoverFromScroll）を
 *  解くまでの待ち。Lenis は減速中も細かいスクロールイベントを出し続ける
 *  ので、最後の1発からこの時間で解除される。150 → 90ms（止まりぎわの
 *  ホバーが拾われにくかったため）。取りこぼし自体は
 *  pendingHoverIndexRef で拾い直すので、ここは「カーソル静止のまま行が
 *  流れてきて誤爆する」のを防げる最小限でよい。 */
const SCROLL_SUPPRESS_TAIL_MS = 90;
/** How close the footer needs to be to the bottom of the viewport before the
 *  bottom-left title text hides, so it never overlaps the footer. */
const FOOTER_HIDE_MARGIN_PX = 0;
/** Colors of Sound を off にしてから実体をアンマウントするまで —
 *  sound-colors-background.tsx の FADE_OUT_MS と揃えること。 */
const SOUND_COLORS_EXIT_MS = 260;

/**
 * Per-ratio sizing rules: minimum width in grid columns, and — landscape
 * only, per the brief — a max width in columns. Portrait has no explicit
 * max; it's naturally bounded by viewport height. The aspect ratio itself
 * (width / height) comes from the shared PREVIEW_RATIO_ASPECT in lib/projects.ts.
 */
const PREVIEW_RATIO_SIZE: Record<
  PreviewRatio,
  { minColumns: number; maxColumns?: number; ignoreViewportHeightCap?: boolean }
> = {
  "portrait-3-2": { minColumns: 9 },
  "landscape-3-2": { minColumns: 14, maxColumns: 18 },
  "portrait-3-4": { minColumns: 9 },
  "landscape-8-5": { minColumns: 14, maxColumns: 18 },
  // Square sits between the two families, so it gets its own middle band
  // rather than borrowing either: at the portrait minimum (9) a 1:1 box is
  // noticeably smaller than the portraits it sits alongside, while at the
  // landscape minimum (14) it becomes as tall as it is wide and starts
  // fighting the viewport-height clamp. Capped like the landscapes are,
  // since — unlike portrait — its height grows just as fast as its width.
  // ignoreViewportHeightCap — per direct follow-up ("squareは③のルールは
  // 無しにして"): square だけはビューポート高さから逆算した幅上限を適用
  // しない。低い画面では 11〜15 列の抽選のまま、箱が画面下へはみ出し得る
  // （top はマージン位置で止まるので上は切れない）。
  "square-1-1": { minColumns: 11, maxColumns: 15, ignoreViewportHeightCap: true },
};

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * A random rect for the hover preview, sized to the given project's own
 * fixed aspect ratio (width grid-snapped, height derived from the ratio)
 * between that ratio's minimum column width and however wide it can go
 * while still respecting its max column width (landscape only), the
 * 15px-margined viewport height, and the 5th-column-rightward area — then
 * placed at a random spot within those same bounds.
 */
function generateRandomPreviewRect(previewRatio: PreviewRatio): HoverPreviewRect {
  const scale = getGridScale();
  const marginPx = GRID_MARGIN_PX * scale;
  const columnWidthPx = GRID_COLUMN_WIDTH_PX * scale;
  const availableColumns = GRID_COLUMN_COUNT - PREVIEW_START_COLUMN;

  const widthOverHeight = PREVIEW_RATIO_ASPECT[previewRatio];
  const size = PREVIEW_RATIO_SIZE[previewRatio];
  const viewportHeight = window.innerHeight;
  const maxHeightPx = Math.max(1, viewportHeight - PREVIEW_VERTICAL_MARGIN_PX * 2);
  const maxWidthByHeightColumns = Math.floor((maxHeightPx * widthOverHeight) / columnWidthPx);

  const widthCeilingColumns = Math.min(
    availableColumns,
    size.ignoreViewportHeightCap ? availableColumns : maxWidthByHeightColumns,
    size.maxColumns ?? availableColumns
  );
  const maxWidthColumns = Math.max(size.minColumns, widthCeilingColumns);
  const widthColumns = randomInt(size.minColumns, maxWidthColumns);
  const width = widthColumns * columnWidthPx;
  const height = width / widthOverHeight;

  const maxStartColumn = GRID_COLUMN_COUNT - widthColumns;
  const startColumn = randomInt(PREVIEW_START_COLUMN, Math.max(PREVIEW_START_COLUMN, maxStartColumn));
  const left = marginPx + columnWidthPx * startColumn;

  const maxTop = Math.max(PREVIEW_VERTICAL_MARGIN_PX, viewportHeight - PREVIEW_VERTICAL_MARGIN_PX - height);
  const top = randomInt(PREVIEW_VERTICAL_MARGIN_PX, maxTop);

  return { top, left, width, height };
}

type HomeViewProps = {
  /** Real (or placeholder-fallback) project list, fetched server-side in
   *  app/page.tsx (an async Server Component wrapping this client component)
   *  via getProjects() and handed down as the initial/only state here.
   *
   *  Previously this component (as the default export of app/page.tsx
   *  itself) started from PLACEHOLDER_PROJECTS and fetched the real list
   *  client-side from /api/projects after mounting — meaning every mount,
   *  including a soft-navigation return to "/" from a project detail page,
   *  briefly painted the dummy placeholder list before the real fetch
   *  resolved and swapped it in. Reported as "一瞬ダミーの一覧が表示され
   *  て、それが消えてからcmsに登録された一覧が表示されてるっぽい". Fetching
   *  server-side instead means the real list is already present in the very
   *  first render, so that dummy-then-real swap can no longer happen. */
  initialProjects: Project[];
  /** Recent announcements, also read at build time in app/page.tsx — see
   *  recent-news.tsx's own `items` prop. Threaded through to both the PC
   *  (RecentNews) and SP (MobileHome → MobileRecentNews) trees. */
  news: NewsItem[];
};

export function HomeView({ initialProjects, news }: HomeViewProps) {
  const [projects] = useState<Project[]>(initialProjects);

  /** Colors of Sound（背景に再生曲の色を溜める帯）の on/off。デフォルトは
   *  off。off の間は SoundColorsBackground を丸ごと
   *  アンマウントするので、描画ループも fetch も走らない。トグル本体は FV
   *  右上（home-statement.tsx）。 */
  const [colorsOn, setColorsOn] = useState(false);
  /** off にした直後も、左へ畳まれるワイプ（sound-colors-background.tsx の
   *  REVEAL_MS）が終わるまでは実体を残す。それ以外は本当にアンマウント
   *  されているので、デフォルト（off）では fetch も描画ループも走らない。 */
  const [colorsMounted, setColorsMounted] = useState(false);
  // on にした瞬間のマウントはレンダー中に決める（このコードベースの慣例 —
  // project-view-toggle.tsx / now-playing-ticker.tsx と同じ「effect ではなく
  // レンダー中に state を合わせる」パターン）。
  if (colorsOn && !colorsMounted) setColorsMounted(true);
  useEffect(() => {
    if (colorsOn || !colorsMounted) return;
    const timer = setTimeout(() => setColorsMounted(false), SOUND_COLORS_EXIT_MS);
    return () => clearTimeout(timer);
  }, [colorsOn, colorsMounted]);

  const footerRef = useRef<HTMLDivElement>(null);
  // Every project title's own DOM element — used only to play the
  // underline-sweep animation on all of them when the Tx/Th toggle is
  // clicked (see handleToggleClick below). Previously also fed a live-
  // measured thumbPositions system that kept the old Img-view thumbnail
  // overlay (project-image-grid.tsx) pixel-synced to this text list; that
  // whole overlay approach is gone now that Th mode is its own independent
  // grid (project-thumbnail-grid.tsx), rendered in place of this text list
  // rather than layered on top of it, so no positioning/measurement is
  // needed here anymore.
  const titleEls = useRef<(HTMLElement | null)[]>(Array(projects.length).fill(null));
  const [showImages, setShowImages] = useState(false);

  // Txt/Img トグルの登場アニメを、イントロ完了時に再生し直すための世代
  // カウンタ — per direct follow-up ("pc, spのtxt-Imgもスライドイン+フェード
  // インで表示")。トグル（project-view-toggle.tsx）はマウント時に自前で
  // スライド＋フェードするが、初回訪問ではイントロのスプラッシュの裏で
  // 終わってしまい見えない。一覧のカード（project-list.tsx の
  // replayGeneration）と同じく、andmade:intro-complete で key を変えて
  // 丸ごと再マウントする — トグルの reveal 状態はトグル自身が持っている
  // ので、再マウント＝初期状態からのやり直しになる。
  const [toggleReplayGeneration, setToggleReplayGeneration] = useState(0);
  // 「ページに入った瞬間」を記録する（lib/entrance.ts 参照）。マウント時と
  // イントロ完了時だけ打ち直すので、Txt/Img の切り替えでは一覧の登場遅延が
  // 付かない。
  useState(() => {
    markPageEntered();
    return true;
  });

  useEffect(() => {
    function handleIntroComplete() {
      markPageEntered();
      setToggleReplayGeneration((generation) => generation + 1);
    }
    window.addEventListener("andmade:intro-complete", handleIntroComplete);
    return () => window.removeEventListener("andmade:intro-complete", handleIntroComplete);
  }, []);

  // Tx (ProjectGridSection, a long list) and Th (ProjectThumbnailGrid, a
  // fixed 4-column grid) render very different total heights — per direct
  // report ("Thにしたとき、フッターまでスクロールできない。Tx時のページの
  // 高さのままになってる"): Lenis (smooth-scroll.tsx) computes its own
  // scrollable height/limit once and doesn't automatically know this in-page
  // toggle just changed it (it isn't a route change, the one case
  // lenis-route-resize.tsx already handles), so its cached limit stuck at
  // whichever height was current when it last measured — capping scroll at
  // the old Tx-based height even after Th's own (different) content mounted.
  // Same fix as LenisRouteResize's own: `resize()` after a paint of the new
  // content, just keyed on `showImages` instead of `pathname`.
  //
  // (A follow-up attempt also tried preserving scroll *position* across the
  // toggle — capturing how far down the page you were as a fraction of max
  // scroll, then re-applying that same fraction once the new mode's height
  // settled, since Txt/Img's very different total heights otherwise land the
  // same raw scrollY on unrelated content — per bug report "txt-imgがスク
  // ロール途中の位置で、imgからtxtに切り替えたとき、txt-imgがガタっと動く
  // 挙動がある". Reverted per direct follow-up that it read as *more*
  // unnatural than the original jump ("②のガタツキは前回より見え感が不自然
  // なので戻してほしい") — this toggle intentionally just resets to whatever
  // the new mode's own layout puts at the current scrollY again, no
  // position-preservation.)
  const lenis = useLenis();
  useEffect(() => {
    const frame = requestAnimationFrame(() => lenis?.resize());
    return () => cancelAnimationFrame(frame);
  }, [showImages, lenis]);

  // マウント直後とフォント確定後にも measure し直す。Lenis はスクロール可能な
  // 高さを自前でキャッシュしていて、測ったあとに本文の高さが変わっても
  // 自動では追随しない。FV のステートメント（home-statement.tsx）が入って
  // ページが数百px伸びたうえ、Adobe Fonts が入れ替わると行の高さも動く
  // （ProjectGridSection も同じ理由で document.fonts.ready を待って測り
  // 直している）。上限が古いままだと、実際のページ末尾まで行く手前で
  // スクロールが止まる＝フッターに届かない。
  useEffect(() => {
    if (!lenis) return;
    let cancelled = false;
    const frame = requestAnimationFrame(() => lenis.resize());
    document.fonts.ready.then(() => {
      if (!cancelled) lenis.resize();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [lenis]);

  const registerTitleRef = useCallback((index: number, el: HTMLElement | null) => {
    titleEls.current[index] = el;
  }, []);

  // Plays the underline-sweep animation (see .underline-sweep-play in
  // globals.css) on every project title every time the Tx/Th toggle is
  // clicked, regardless of which button or whether the view actually
  // changes. Removing then re-adding the class with a forced reflow in
  // between restarts the CSS animation even if it's already mid-play or
  // just finished on that same element (simply re-adding an already-present
  // class doesn't restart it on its own).
  const handleToggleClick = useCallback(() => {
    const titles = titleEls.current.filter((el): el is HTMLElement => el !== null);
    titles.forEach((el) => el.classList.remove("underline-sweep-play"));
    // Single shared reflow read (rather than one per element) is enough to
    // flush the removals above before the re-adds below.
    if (titles[0]) void titles[0].offsetWidth;
    titles.forEach((el) => {
      el.classList.add("underline-sweep-play");
      // Clean the class back off once the animation actually finishes —
      // leaving it on permanently made `.underline-sweep-play::after`'s
      // `animation` value identical to `.group:hover .underline-sweep::after`'s
      // (both resolve to the exact same `underline-sweep 0.6s ...` value), so
      // after a single Tx/Th click, hovering that title stopped replaying the
      // sweep entirely: since the *value* of `animation` never actually
      // changed on hover (only which rule "won" did), the browser correctly
      // treats it as the same, already-finished animation rather than a new
      // one — reported as "Tx選択時にホバーした時、下線タイトルがアニメーションしなくなってる".
      el.addEventListener("animationend", () => el.classList.remove("underline-sweep-play"), { once: true });
    });
  }, []);

  // Hover-preview: a max-2-deep stack (current + previous), grid-snapped
  // placement sized to each project's own fixed ratio, disabled in Img view.
  const [prevShowImagesForHoverClear, setPrevShowImagesForHoverClear] = useState(showImages);
  const [hoverEntries, setHoverEntries] = useState<HoverPreviewEntry[]>([]);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [hoverIdle, setHoverIdle] = useState(false);
  // Mirrors which title is actually under the cursor right now — unlike
  // hoveredIndex above, this clears the instant the mouse leaves (no 1.5s
  // idle grace period), since the card-dimming and the big title text
  // shouldn't linger the way the background image preview deliberately does.
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [atPageBottom, setAtPageBottom] = useState(false);
  // Whether the footer is (nearly) in view — used to hide the bottom-left
  // title text before it visually overlaps the footer. More sensitive than
  // atPageBottom (which only trips once scrolled all the way to the very
  // bottom, by which point the footer had already been visible for a while).
  const [footerVisible, setFooterVisible] = useState(false);
  // True while the footer's "Back to top" smooth-scroll is in progress — the
  // cursor ends up sitting over the project list as it scrolls up underneath
  // it, which would otherwise keep re-triggering the hover preview.
  const [suppressHoverPreview, setSuppressHoverPreview] = useState(false);
  // Ordinary scrolling has the exact same problem suppressHoverPreview above
  // works around for the Back-to-top case: Lenis's inertia keeps the page
  // moving for a while under an otherwise-stationary cursor, so a title can
  // pass underneath the cursor purely from the page moving, not the mouse
  // actually moving — firing a real mouseenter/mouseleave anyway, which
  // would otherwise flash the hover-preview/dim state on and back off as a
  // row settles into view. This mirrors that same suppression for *any*
  // scroll (see the effect below), clearing shortly (150ms) after scrolling
  // actually stops rather than staying suppressed the whole time like the
  // Back-to-top case does.
  const [suppressHoverFromScroll, setSuppressHoverFromScroll] = useState(false);
  /**
   * いまカーソルが乗っているタイトルの index（抑制中でも記録する）。
   *
   * mouseenter は「乗った瞬間」の1回しか飛ばない。スクロールが止まりきる
   * 直前にタイトルへ乗ると、その1回が suppressHoverFromScroll に弾かれて
   * 終わり、抑制が解けても誰も再実行しないので、カーソルを一度外して
   * 乗せ直すまで背景イメージが出なかった（報告: "スクロールして止まる瞬間
   * くらいにホバーすると表示されない"）。
   *
   * 乗っている対象はここに覚えておき、抑制が解けた時点でまだ乗っていれば
   * その場で本来の処理を流す（下の effect）。判定を緩めるのではなく、
   * 取りこぼしを拾い直す形。
   */
  const pendingHoverIndexRef = useRef<number | null>(null);
  const clearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingClear = useCallback(() => {
    if (clearTimeoutRef.current) {
      clearTimeout(clearTimeoutRef.current);
      clearTimeoutRef.current = null;
    }
    if (unmountTimeoutRef.current) {
      clearTimeout(unmountTimeoutRef.current);
      unmountTimeoutRef.current = null;
    }
  }, []);

  /** ホバーアウト後、非選択行の透過（0.2）が 100% へ戻るまでの猶予 — per
   *  direct follow-up ("ホバーアウトですぐに文字の透過が100%に戻らないように
   *  したい 1秒後に戻るようにして" → "0.5秒で戻るようにして")。猶予内に
   *  別の行へホバーし直せば
   *  タイマーは破棄され、暗いまま次の行が立つ（明→暗の点滅が出ない）。 */
  const DIM_CLEAR_DELAY_MS = 500;
  const dimClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (dimClearTimeoutRef.current) clearTimeout(dimClearTimeoutRef.current);
    },
    []
  );

  const handleHoverTitle = useCallback(
    (index: number) => {
      // カーソルがどのタイトルの上に居るかは、抑制中かどうかに関わらず
      // 覚えておく（pendingHoverIndexRef の doc comment 参照）。
      pendingHoverIndexRef.current = index;
      if (suppressHoverPreview || suppressHoverFromScroll) return;
      if (dimClearTimeoutRef.current) clearTimeout(dimClearTimeoutRef.current);
      setActiveIndex(index);
      cancelPendingClear();
      setHoverIdle(false);
      if (showImages || index === hoveredIndex) return;
      setHoveredIndex(index);
      setHoverEntries((prev) =>
        [
          {
            key: `${index}-${Date.now()}`,
            rect: generateRandomPreviewRect(projects[index].previewRatio),
            imageSrc: getProjectImageSrc(projects[index]),
            imageSrcSet: getProjectImageSrcSet(projects[index]),
            videoSrc: getProjectPreviewVideoSrc(projects[index]),
          },
          ...prev,
        ].slice(0, 2),
      );
    },
    [projects, showImages, hoveredIndex, suppressHoverPreview, suppressHoverFromScroll, cancelPendingClear],
  );

  // While the "Back to top" scroll is in progress, immediately clear any
  // preview already showing (rather than waiting for the mouse to actually
  // leave the title, which won't happen since the page is scrolling
  // underneath a stationary cursor).
  const handleBackToTopStart = useCallback(() => {
    setSuppressHoverPreview(true);
    cancelPendingClear();
    setHoverEntries([]);
    setHoveredIndex(null);
    setHoverIdle(false);
    setActiveIndex(null);
  }, [cancelPendingClear]);

  const handleBackToTopEnd = useCallback(() => {
    setSuppressHoverPreview(false);
  }, []);

  // Generalizes suppressHoverFromScroll (declared above) to *any* scroll,
  // clearing shortly (150ms) after scrolling actually stops rather than
  // staying suppressed the whole time like the Back-to-top case does.
  useEffect(() => {
    let idleTimeout: ReturnType<typeof setTimeout> | null = null;
    const handleScroll = () => {
      setSuppressHoverFromScroll(true);
      setActiveIndex(null);
      // Same fade-then-remove as handleHoverEnd's own idle path below, just
      // without its 2s grace delay first — scrolling away is a much more
      // decisive "I'm done looking at this" signal than simply moving the
      // cursor off a title, which might resume hovering something else any
      // moment. Previously this cleared hoverEntries immediately, popping
      // the preview image off instantly instead of fading it out (reported
      // as "スクロールすると背景画像が消えるけど、その際フェードアウトで消
      // えるようにして"). cancelPendingClear() first so repeated scroll
      // events (this fires continuously while scrolling) keep pushing the
      // actual removal back rather than racing a half-dozen overlapping
      // timeouts — same guard handleHoverEnd relies on.
      cancelPendingClear();
      setHoverIdle(true);
      unmountTimeoutRef.current = setTimeout(() => {
        setHoverEntries([]);
        setHoveredIndex(null);
        setHoverIdle(false);
      }, HOVER_PREVIEW_FADE_MS);
      if (idleTimeout) clearTimeout(idleTimeout);
      idleTimeout = setTimeout(() => setSuppressHoverFromScroll(false), SCROLL_SUPPRESS_TAIL_MS);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (idleTimeout) clearTimeout(idleTimeout);
    };
  }, [cancelPendingClear]);

  // スクロール由来の抑制が解けた瞬間、まだタイトルに乗ったままなら
  // ホバーを流し直す（pendingHoverIndexRef の doc comment 参照）。
  useEffect(() => {
    if (suppressHoverFromScroll || suppressHoverPreview) return;
    const index = pendingHoverIndexRef.current;
    if (index === null) return;
    // effect 本体での同期 setState を避けるため rAF 経由（このコードベースの
    // 通例）。handleHoverTitle は「同じ index なら何もしない」ので、
    // 既に出ているときに呼んでも二重には出ない。
    const frame = requestAnimationFrame(() => handleHoverTitle(index));
    return () => cancelAnimationFrame(frame);
  }, [suppressHoverFromScroll, suppressHoverPreview, handleHoverTitle]);

  // Leaving a title without hovering another one within 3s fades the
  // preview out, then removes it — rather than leaving the last one
  // showing forever, or cutting it instantly with no transition. The card
  // dimming and big title text, by contrast, clear immediately (activeIndex).
  const handleHoverEnd = useCallback(() => {
    pendingHoverIndexRef.current = null;
    // 即時ではなく DIM_CLEAR_DELAY_MS 後に戻す（doc comment 参照）。
    if (dimClearTimeoutRef.current) clearTimeout(dimClearTimeoutRef.current);
    dimClearTimeoutRef.current = setTimeout(() => setActiveIndex(null), DIM_CLEAR_DELAY_MS);
    cancelPendingClear();
    clearTimeoutRef.current = setTimeout(() => {
      setHoverIdle(true);
      unmountTimeoutRef.current = setTimeout(() => {
        setHoverEntries([]);
        setHoveredIndex(null);
        setHoverIdle(false);
      }, HOVER_PREVIEW_FADE_MS);
    }, HOVER_CLEAR_DELAY_MS);
  }, [cancelPendingClear]);

  useEffect(() => cancelPendingClear, [cancelPendingClear]);

  // Switching to Img view clears the whole hover-preview history, so coming
  // back to Txt later starts fresh instead of showing stale previews. Reset
  // during render (comparing against a tracked previous value) rather than
  // inside an effect — see project-view-toggle.tsx / now-playing-ticker.tsx
  // for the same pattern used elsewhere in this codebase.
  if (showImages !== prevShowImagesForHoverClear) {
    setPrevShowImagesForHoverClear(showImages);
    if (showImages) {
      setHoverEntries([]);
      setHoveredIndex(null);
      setActiveIndex(null);
    }
  }

  // Fades everything out only once you've scrolled all the way to the
  // bottom of the page (not just near the last title — that faded previews
  // out while there were still several rows left to hover). Also checks the
  // footer's live position here in the same handler (rather than a separate
  // effect/listener) so there's only one code path reacting to scroll —
  // hides the bottom-left title text before it can overlap the footer.
  useEffect(() => {
    function checkScrollPosition() {
      const scrolledToBottom =
        window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - BOTTOM_OF_PAGE_TOLERANCE_PX;
      setAtPageBottom(scrolledToBottom);

      const footer = footerRef.current;
      if (footer) {
        const footerTop = footer.getBoundingClientRect().top;
        // The title text sits ~144px tall from the viewport's bottom edge
        // (bottom-24px + ~120px line box) — hide once the footer is within
        // FOOTER_HIDE_MARGIN_PX of coming into view, and keep hidden for as
        // long as it stays there (including once fully scrolled past, when
        // its top goes negative).
        setFooterVisible(footerTop <= window.innerHeight + FOOTER_HIDE_MARGIN_PX);
      }
    }
    checkScrollPosition();
    window.addEventListener("scroll", checkScrollPosition, { passive: true });
    window.addEventListener("resize", checkScrollPosition);
    return () => {
      window.removeEventListener("scroll", checkScrollPosition);
      window.removeEventListener("resize", checkScrollPosition);
    };
  }, []);

  const hoveredProjectTitle =
    !showImages && !footerVisible && activeIndex != null ? projects[activeIndex].title : null;
  const hoveredProjectCategory =
    !showImages && !footerVisible && activeIndex != null ? projects[activeIndex].category : null;

  // pb-[28px] below is PC-only (lg:) — it used to apply unconditionally,
  // which stacked on top of the SP footer's own pb-[20px] and left too much
  // space below the footer on SP (reported as "フッター下のマージンがまだ
  // 空きすぎてる"). 30px → 24px → 28px, both per direct follow-up ("studies
  // とcontactに合わせて24pxにして", then "やっぱりちょっと下げすぎかな...
  // 28pxに変更して") — matches app/studies/page.tsx's own bottom-[28px]
  // SiteFooter offset and app/contact/page.tsx's own bottom-[28px] footer
  // elements exactly.
  return (
    <div id="top" className="relative w-full flow-root bg-(--color-background) lg:pb-[28px]">
      {/* 今日聴いた曲の色が左（朝）から右（夜）へ溜まっていく背景 —
          components/sound-colors-background.tsx の doc comment 参照。
          #top の最初の子なので、#top 自身の背景色の上・以降の兄弟
          （ホバープレビューや本文）の下に描かれる（どれも z-index:auto
          なので DOM 順で前後が決まる）。PC/SP 共通。 */}
      {colorsMounted && <SoundColorsBackground active={colorsOn} />}
      {/* PC-only tree, split from SP's own (mobile-home.tsx) at Tailwind's
          default `lg` breakpoint (1024px) — see mobile-home.tsx's own doc
          comment for why this is a plain CSS split, not a JS viewport
          check. `contents` (rather than `block`) at `lg:` keeps every child
          below un-wrapped from this div's own layout/stacking perspective,
          so it doesn't change how the previously-direct children below
          behave relative to #top above (same DOM-order-over-z-index
          reasoning as ProjectHoverPreview vs. the text layer). */}
      <div className="hidden lg:contents">
        {!showImages && <ProjectHoverPreview entries={hoverEntries} released={atPageBottom || hoverIdle} />}

        {/* `relative` (no z-index) so this becomes a positioned element with
            the default "auto" stack level, same as the preview images
            (position:fixed, z-index:auto) above. Positioned elements at the
            same "auto" level paint in DOM order, and this comes after the
            preview, so it wins — without introducing a *new* stacking
            context (that needs an explicit z-index), which would otherwise
            isolate the mix-blend-exclusion text inside from the page
            background it's supposed to blend against. */}
        <div className="relative">
          <SiteHeader fadeIn />

          {/* FV のステートメント帯（home-statement.tsx の doc comment 参照）。 */}
          <HomeStatement colorsOn={colorsOn} onColorsToggle={() => setColorsOn((on) => !on)} />

        {/* 280 → 180 → 175 → 165。以前はヘッダー
            直下からの距離だったが、いまは FV ステートメントの最終行
            （"Who we are"）からの距離。 */}
        <div className="relative mt-[calc(165px*var(--scale))]">
          <ProjectViewToggle
            key={toggleReplayGeneration}
            count={projects.length}
            showImages={showImages}
            onShowImagesChange={setShowImages}
            onToggleClick={handleToggleClick}
          />

          {/* FV-right "recent news" list — per direct follow-up ("トップの
              FV右側に最近のお知らせを追加したいので...")。See
              recent-news.tsx's own doc comment for positioning/data details;
              renders nothing until real microCMS "news" entries exist.
              No `hidden` prop (unlike SP's own MobileRecentNews) — per direct
              follow-up specifically scoped to PC ("PCのお知らせはTh時も消さ
              ない"), reverting PC's own earlier "Th選択時はお知らせはフェー
              ドアウトで非表示にする" treatment; SP's identical fade-out on Th
              stays as-is since this follow-up only called out PC. */}
          <RecentNews items={news} />

          {/* No mix-blend-mode here anymore. Tx mode used to blend this whole
             wrapper (exclusion), which is what made its white text read
             correctly against the hover-preview images behind it; that's now
             replaced by plain black text sitting on an animated white plate
             that wipes in on hover (see project-card.tsx). Th mode never
             blended at this level in the first place — its own titles carry
             mix-blend-exclusion directly (project-thumbnail-grid.tsx), since
             blending here would have taken the thumbnail images with it
             (mix-blend-mode on an ancestor blends its entire rendered subtree
             as one unit). */}
          <div className="ml-[calc(198px*var(--grid-scale))] flex w-[var(--content-width-fluid)] flex-col items-start">
            {showImages ? (
              <ProjectThumbnailGrid projects={projects} />
            ) : (
              <ProjectGridSection
                projects={projects}
                onTitleRef={registerTitleRef}
                onHoverTitle={handleHoverTitle}
                onHoverEnd={handleHoverEnd}
                activeIndex={activeIndex}
              />
            )}
          </div>

          {/* Kept out of the list wrapper above — the footer renders in
              literal black, with no blend-mode dependency, matching the
              About page (see app/about/page.tsx). It was split out back when
              that wrapper still blended; the wrapper no longer does (see its
              own comment), but the separation stays since the two have
              different left-margin/width needs anyway. */}
          {/* mt — 330 → 350 → 400（いずれも直接の指示）。Img mode keeps its own value 45px below
              Tx's, which is what makes the two modes' *visible* gaps match:
              per an earlier follow-up ("Img選択時にフッターと一覧のマージンが
              txt時と同じく300pxになるようにして"), the thumbnail grid's box
              ends at the last row's real visible bottom (see
              project-thumbnail-grid.tsx's own marginBottom comment), but its
              CaseCounter — a sticky element with a real in-flow
              h-[calc(15px*var(--scale))] — still sits inside that box after
              the grid, and Tx's own visible gap likewise measures ~30px
              shorter than its literal margin (measured from the meta text
              under the last titles). So Img's literal value stays 45px lower
              to land on the same on-screen distance; keep the two in step
              when retuning either. */}
          <div
            ref={footerRef}
            className={`ml-[calc(198px*var(--grid-scale))] w-[var(--content-width-fluid)] ${
              showImages ? "mt-[calc(315px*var(--scale))]" : "mt-[calc(360px*var(--scale))]"
            }`}
          >
            <SiteFooter onBackToTopStart={handleBackToTopStart} onBackToTopEnd={handleBackToTopEnd} theme="dark" />
          </div>
        </div>

        {/* Rendered last so it paints frontmost among this wrapper's "auto"
            stacked siblings (same DOM-order trick as ProjectHoverPreview vs.
            the text layer above) — otherwise the footer, coming later in the
            DOM, painted on top of this and visually broke it up. */}
        <HoveredProjectTitle title={hoveredProjectTitle} category={hoveredProjectCategory} />

        {/* Also last (after HoveredProjectTitle even) so it's frontmost of
            all — see header-summon.tsx. */}
        <HeaderSummon />
        </div>
      </div>

      <MobileHome
        projects={projects}
        news={news}
        colorsOn={colorsOn}
        onColorsToggle={() => setColorsOn((on) => !on)}
      />

      {/* Renders nothing — warms the preview images while the intro plays.
          Mounted here, outside both the PC tree above and MobileHome, because
          both of those render on every viewport (shown/hidden via `lg:`
          classes rather than conditionally mounted), so placing it inside
          either would warm both platforms' image candidates on both
          platforms. See its own doc comment. */}
      <PreloadProjectPreviews projects={projects} />
    </div>
  );
}
