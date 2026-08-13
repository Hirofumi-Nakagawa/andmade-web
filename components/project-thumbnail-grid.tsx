"use client";

import { useEffect, useRef, useState } from "react";
import { KONAMI_WARP_IMAGES_ATTRIBUTE } from "@/components/konami-warp-canvas";
import { useRouter } from "next/navigation";
import { CaseCounter } from "@/components/case-counter";
import { ScrambleText } from "@/components/scramble-text";
import {
  slugify,
  PREVIEW_RATIO_ASPECT,
  getProjectColor,
  getProjectImageSrc,
  getProjectImageSrcSet,
  getProjectPreviewVideoSrc,
  type Project,
} from "@/lib/projects";

type ProjectThumbnailGridProps = {
  /** Fetched (or placeholder-fallback) project list — same data Tx mode's
   *  ProjectGridSection renders, threaded down from app/page.tsx. */
  projects: Project[];
};

/** Number of columns this grid always renders, at every viewport width the
 *  PC tree ever shows at (down to 1024px). Explicit N-track CSS grid rather
 *  than `flex-wrap`, matching ProjectList's own convention (its 3-track
 *  grid, see that file) — per direct request ("ウィンドウ幅が1024pxまでは
 *  Thのサムネは4カラムをキープして"): `flex-wrap` reflows its column count
 *  based on available width vs. each card's own (shrinking) size, which
 *  actually drifted from 4 up to 6+ columns well before 1024px, since
 *  --grid-scale shrinks the cards while --content-width-fluid stays flat
 *  below 1440px. A fixed-track grid instead keeps the *column count*
 *  constant and lets the cards themselves keep resizing with --grid-scale,
 *  exactly like ProjectList already does for Tx mode.
 *
 *  4 → 5 per direct follow-up ("PCのTh時の1列のサムネの数を5個にして（マー
 *  ジンは10px、現状と同じく19マス使用）"): COLUMN_WIDTH_PX below is
 *  recomputed so the row's own total width (at the 1440px reference canvas)
 *  stays exactly what it was at 4 columns — the same ~19-grid-cell span this
 *  row has always occupied — with the same 10px gap, just splitting that
 *  same span across one more column. */
const COLUMNS = 5;

/** This row's own total width at the 1440px reference canvas (scaled by
 *  --grid-scale like everything else below) — 4 × 268px + 3 × 10px gaps =
 *  1102px, the original 4-column row's own total span (the "19 grid cells"
 *  referenced above). Kept as its own named constant (rather than inlining
 *  268×4+10×3) so a future column-count change can recompute COLUMN_WIDTH_PX
 *  the same way without re-deriving this from scratch. */
const ROW_WIDTH_PX = 1102;
/** 10 → 8 — per direct follow-up ("PCのImg時の一覧のマージンを10px→8pxに変
 *  更"). Also feeds COLUMN_WIDTH_PX below, so this row's own total width
 *  stays exactly ROW_WIDTH_PX regardless of the gap value — narrowing the
 *  gap widens each column slightly to make up the difference, rather than
 *  narrowing the row's own total span. */
const GAP_PX = 8;
/** (1102 - 4×8) / 5 = 214px — see COLUMNS/ROW_WIDTH_PX/GAP_PX's own doc
 *  comments above for the full derivation. */
const COLUMN_WIDTH_PX = (ROW_WIDTH_PX - (COLUMNS - 1) * GAP_PX) / COLUMNS;

/** Delay step between cards' own color-wipe stagger (see the reveal overlay
 *  further down) — row-dominant, column-secondary, so the whole grid plays
 *  in strict top-left-first reading order: an entire row cascades left→right
 *  before the next row starts at all. Per direct follow-up ("カラーワイプ
 *  の表示を左上から順に表示されるようにして"): ROW_STAGGER_MS must stay
 *  greater than (COLUMNS - 1) × COLUMN_STAGGER_MS (4 × 20 = 80 here) or a
 *  later row's earliest column would start before an earlier row's last
 *  column, breaking that strict ordering. Previously column-dominant (60ms
 *  column step vs. 30ms row step), which produced a diagonal sweep instead —
 *  fine for the old slide-in-from-below entrance this stagger originally
 *  drove, but read as skipping around rather than "starting from the top
 *  left" once this became the color-wipe's own only visible ordering cue
 *  (the entrance slide/fade itself was removed per an earlier follow-up).
 *
 *  STAGGER_MAX_MS was still 400 after that change — a leftover from when
 *  COLUMN_STAGGER_MS (60) was the dominant term, so 400 comfortably covered
 *  several rows. With ROW_STAGGER_MS now dominant, that same 400ms cap got
 *  hit within just a few rows, so most of a ~33-project, 7-row grid
 *  collapsed onto the exact same capped delay and revealed simultaneously,
 *  out of order. The actual reveal mechanism itself was then rewritten to
 *  per-index `setTimeout`s (see this file's own top-level doc comment)
 *  rather than CSS animation-delay, since CSS's own paused-animation timing
 *  model wasn't reliably holding the order across ~30 simultaneously-started
 *  animations. These step values were briefly exaggerated (100/500ms, 10s
 *  cap) purely to make the cascade obvious enough to visually confirm the
 *  order was actually correct — confirmed per direct follow-up
 *  ("確認できたので、もう少し控えめな値にして"), then dialed back down to
 *  these more understated ones. */
// 20/100 → 30/150 — per direct follow-up ("img時のサムネが表示されるときの
// アニメーションが順になってる感が弱いので、もう少しだけ差を付けて")。
// 制約（ROW > (COLUMNS-1) × COLUMN = 4×30 = 120）は 150 で引き続き満たす。
const COLUMN_STAGGER_MS = 30;
const ROW_STAGGER_MS = 150;
const STAGGER_MAX_MS = 2000;

/**
 * Standalone Th-mode grid, originally matching the Figma design at node
 * 1400:1546 (a fixed 4-column grid; now 5, see COLUMNS' own doc comment),
 * 10px column gap / 90px row gap（行間は 80 → 90px、per direct follow-up
 * "一覧内のサムネの上下間マージンを10px増やしたい"）(both scaled by --grid-scale, matching
 * every other spacing value on this page), each card
 * a real previewRatio-aspect image + 10px gap + underlined 14px title below
 * — no category/role/date shown here. Per explicit scoping with the user,
 * Figma's separate image-less text-only tail entries (for projects without
 * photography yet) are intentionally out of scope for this pass.
 *
 * Replaces project-image-grid.tsx's old approach entirely: rather than a
 * separate thumbnail layer positioned on top of the always-mounted Tx text
 * list (kept pixel-synced via a live-measured thumbPositions/titleEls/
 * metaEls system in app/page.tsx), this is now a genuine independent layout
 * — app/page.tsx swaps this in *instead of* ProjectGridSection when Th is
 * selected, so no positioning/measurement machinery is needed at all.
 *
 * Also renders its own CaseCounter (the "N Cases" bottom-right label) —
 * mirrors project-grid-section.tsx's own measure()/negative-margin/
 * lastTitleRef trick exactly (see that file's own doc comment for the full
 * mechanism), just anchored to this grid's own last card's title instead of
 * ProjectList's. Per bug report ("PCでcasesが消えてる"): CaseCounter used to
 * live *only* inside ProjectGridSection, so it unmounted entirely — along
 * with the whole Tx list — the instant Th mode swapped it out for this
 * component. Giving this grid its own CaseCounter instance instead keeps
 * "N Cases" visible (and correctly sticky-releasing at this grid's own
 * bottom edge) in both modes, matching SP's own "33 Cases" label, which
 * never disappears between Tx/Th since it lives in mobile-home.tsx's shared
 * rail rather than inside either mode's own list/grid.
 *
 * `revealed` is tracked per-card here (an array of booleans), each one
 * flipped by its own `setTimeout`, not derived from CSS `animation-delay` on
 * an always-"running" animation — per repeated bug report that the
 * color-wipe stagger still wasn't playing top-left-first
 * ("左上から順になってない") even after two earlier fixes (moving from
 * per-card IntersectionObservers to one shared `revealed` boolean, then
 * raising STAGGER_MAX_MS). Relying on CSS's own `animation-delay` +
 * `animation-play-state: paused→running` to encode the stagger asks every
 * browser to (a) keep an animation's delay frozen for as long as it sits
 * paused from creation, then (b) start every affected element's delay
 * countdown from the exact same instant once ~30 elements'
 * `animation-play-state` all flip in one React commit — real, but evidently
 * not reliable enough in practice to hold the intended order across a full
 * grid. Explicit `setTimeout`s sidestep that entirely: plain JS timers, not
 * CSS's own paused-animation timing model, decide exactly when each card's
 * own `revealed` (and so its `animation-play-state`) flips, so the
 * row/column order is enforced directly rather than hoped for.
 *
 * Per direct follow-up ("Th時はスクロールで画面内に入ったらサムネのアニメー
 * ションが走るようにして"): scheduling now starts per-card, from the moment
 * that card scrolls into view, rather than all at once from this
 * component's own mount. One shared IntersectionObserver (not one per card)
 * watches every card's `<li>`; whichever cards it reports as intersecting in
 * the *same* callback invocation share that invocation's own "now" as their
 * common stagger reference, so cards that first become visible together
 * (e.g. the whole grid, on first load, if it fits on screen; or several rows
 * at once after a fast scroll) still cascade top-left-first relative to each
 * other exactly as before — only cards revealed while the user was scrolled
 * elsewhere resolve into their own, later batch, which is what makes each
 * row play as it's scrolled to instead of everything firing at Th-toggle
 * time. A single shared observer (rather than one instance per card) is
 * itself deliberate too: independent per-card observers each resolve their
 * own async callback on their own schedule, which is exactly the ordering
 * unreliability already diagnosed once this session (see above) — one
 * observer batches simultaneously-intersecting elements into one array,
 * processed together, synchronously, in one JS turn.
 */
export function ProjectThumbnailGrid({ projects }: ProjectThumbnailGridProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const lastTitleRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [trailingHeight, setTrailingHeight] = useState(0);
  const [revealedIndices, setRevealedIndices] = useState<boolean[]>(() => projects.map(() => false));

  useEffect(() => {
    function measure() {
      const list = listRef.current;
      const lastTitle = lastTitleRef.current;
      if (!list || !lastTitle) return;
      const listBottom = list.getBoundingClientRect().bottom;
      const titleTop = lastTitle.getBoundingClientRect().top;
      setTrailingHeight(Math.max(0, listBottom - titleTop));
    }

    measure();
    window.addEventListener("resize", measure);

    // Re-measure whenever the grid's own box changes size, not just on
    // window resize — verified live that a mount-time measurement runs ~15px
    // stale against where the last row actually settles once the reveal
    // animations/text wrapping finish, and nothing about that shift involves
    // the window resizing. Observing the <ul> catches every layout-affecting
    // change inside it (title wraps, late data) whenever it happens.
    const resizeObserver = new ResizeObserver(() => measure());
    if (listRef.current) resizeObserver.observe(listRef.current);

    // Same document.fonts.ready re-measure as project-grid-section.tsx's own
    // identical effect — row heights (and so this gap) can shift slightly
    // once the real font swaps in for the browser's fallback.
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) measure();
    });

    return () => {
      cancelled = true;
      window.removeEventListener("resize", measure);
      resizeObserver.disconnect();
    };
  }, [projects.length]);

  // Watches each card's own <li> (via cardRefs, populated by each
  // ProjectThumbnailCard's onCardRef below) and schedules that card's reveal
  // — via the same per-index setTimeout stagger as before — once it actually
  // scrolls into view, rather than all at once from mount. See this
  // component's own doc comment above for the full mechanism/rationale.
  // Resets to all-false first whenever `projects` changes identity, so this
  // also correctly replays if that ever happens without a full remount (the
  // lazy useState initializer above already covers the true first-mount
  // case, so this reset is specifically for a later `projects` change while
  // this component itself stays mounted).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- this derived array's *length* depends on `projects`, and each entry then progresses asynchronously (once its own card scrolls into view, then via its own setTimeout) — there's no pure-render way to express "start all-false, then flip true entries in over time" without an effect owning that state.
    setRevealedIndices(projects.map(() => false));

    const timers: ReturnType<typeof setTimeout>[] = [];
    const elementToIndex = new Map<Element, number>();
    cardRefs.current.forEach((el, index) => {
      if (el) elementToIndex.set(el, index);
    });

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const index = elementToIndex.get(entry.target);
        if (index === undefined) continue;
        observer.unobserve(entry.target);
        const column = index % COLUMNS;
        const row = Math.floor(index / COLUMNS);
        const delay = Math.min(column * COLUMN_STAGGER_MS + row * ROW_STAGGER_MS, STAGGER_MAX_MS);
        timers.push(
          setTimeout(() => {
            setRevealedIndices((prev) => {
              if (prev[index]) return prev;
              const next = prev.slice();
              next[index] = true;
              return next;
            });
          }, delay)
        );
      }
    });
    cardRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => {
      observer.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [projects]);

  return (
    // marginBottom: exactly cancels the negative-margin pull-up just inside —
    // that pull-up drags this container's bottom up to the last card's *title
    // top* (CaseCounter's sticky release needs exactly that edge), but the
    // last row's tallest card visibly extends far past it, so the footer,
    // spaced off this container, sat much closer to the thumbnails than to
    // the Tx list (measured ~134px vs ~287px). The grid's own bottom IS the
    // last row's visible bottom (`content-start`, bottom row defines it), so
    // re-adding the same trailingHeight *outside* the container (margins
    // don't move CaseCounter's containing-block bottom) lands the next
    // sibling's margin exactly on the content actually on screen — and, being
    // the same state value, it cancels by construction even while a
    // measurement is stale. Per direct follow-up "Img選択時にフッターと一覧の
    // マージンがtxt時と同じく300pxになるようにして", paired with the
    // Img-conditional footer margin in home-view.tsx.
    <div className="relative w-full" style={{ marginBottom: `${trailingHeight}px` }}>
      <div style={{ marginBottom: `-${trailingHeight}px` }}>
        <ul
          ref={listRef}
          // Konami エッグのリキッドグラス（画面上下の歪み）の対象マーカー —
          // per direct follow-up ("Img時も画面上下のグラスエフェクトが効く
          // ようにして")。Txt 一覧の data-konami-warp と対になる画像用の
          // 属性で、konami-warp-canvas.tsx が各 <img> を敷き直したテクスチャ
          // を作って歪ませる。エッグ起動中しか読まれない。
          {...{ [KONAMI_WARP_IMAGES_ATTRIBUTE]: "" }}
          className="grid w-full content-start items-start"
          style={{
            gridTemplateColumns: `repeat(${COLUMNS}, calc(${COLUMN_WIDTH_PX}px * var(--grid-scale)))`,
            // Was a hardcoded "10px" literal (stale even before this GAP_PX
            // change — see that constant's own doc comment) — now derived
            // from GAP_PX so this can never drift out of sync with the width
            // math above again.
            columnGap: `calc(${GAP_PX}px * var(--grid-scale))`,
            rowGap: "calc(90px * var(--grid-scale))",
          }}
        >
          {projects.map((project, index) => (
            <ProjectThumbnailCard
              key={project.title}
              project={project}
              index={index}
              revealed={revealedIndices[index] ?? false}
              lastTitleRef={index === projects.length - 1 ? lastTitleRef : undefined}
              onCardRef={(el) => {
                cardRefs.current[index] = el;
              }}
            />
          ))}
        </ul>
      </div>
      <CaseCounter count={projects.length} lastTitleRef={lastTitleRef} />
    </div>
  );
}

function ProjectThumbnailCard({
  project,
  index,
  revealed,
  lastTitleRef,
  onCardRef,
}: {
  project: Project;
  index: number;
  revealed: boolean;
  lastTitleRef?: React.Ref<HTMLDivElement>;
  /** Reports this card's own <li> up to the grid's shared IntersectionObserver
   *  — see ProjectThumbnailGrid's own scheduling effect. */
  onCardRef: (el: HTMLLIElement | null) => void;
}) {
  const router = useRouter();
  const titleRef = useRef<HTMLSpanElement>(null);
  const href = `/projects/${slugify(project.title)}`;
  // ホバー中だけ静止画→動画に切り替える（下の <video> 参照）— per direct
  // follow-up ("Img 時のサムネホバーで動画再生"、previewVideo がある実績
  // のみ）。videoReady はフェードイン用（最初のフレームがデコード済みに
  // なるまで静止画を出したままにする）。
  const [thumbHovered, setThumbHovered] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const hoverVideoSrc = getProjectPreviewVideoSrc(project);

  // Replays the title's underline-sweep on thumbnail hover — per direct
  // follow-up ("Thのサムネにホバーしても下線アニメーションが走るように").
  // A first attempt used a plain CSS general-sibling-combinator rule
  // (`.th-card-thumb:hover ~ .th-card-title .underline-sweep::after`), but
  // the user reported it still wasn't firing — switched to this instead:
  // the exact same "remove .underline-sweep-play, force a reflow, re-add
  // it" restart trick app/page.tsx's own playUnderlineSweep already uses
  // (for the same underlying reason — see that function's own doc comment:
  // just re-adding an already-present class doesn't restart a
  // running/finished CSS animation on its own), proven to work elsewhere in
  // this codebase rather than a novel CSS-only approach.
  const playUnderlineSweep = () => {
    const el = titleRef.current;
    if (!el) return;
    el.classList.remove("underline-sweep-play");
    void el.offsetWidth;
    el.classList.add("underline-sweep-play");
    el.addEventListener("animationend", () => el.classList.remove("underline-sweep-play"), { once: true });
  };

  const navigate = () => router.push(href);

  return (
    // No cursor/role/click/hover on the <li> itself — per explicit request
    // ("Thのサムネのカーソルが反応するエリアはサムネとタイトルだけにして"),
    // the card's own gap between image and title (and any other space in
    // this box) shouldn't react to the cursor at all. The image and title
    // below are each independently interactive instead — no shared `group`,
    // each just uses its own plain CSS `:hover` (an img `:hover` scale, and
    // `.underline-sweep`'s own already-built-in `:hover` rule), so hovering
    // one never affects the other.
    // No entrance slide-in/fade-in on the card itself anymore — per direct
    // follow-up ("Thの一覧がスライドイン+フェードインで表示されるのを無し
    // にしてみて。それがあるからワイプカラーが見えてないだけなのかも"): the
    // card's own opacity transition (0→1 over 500ms) ran concurrently with
    // the color-wipe overlay's clip-path animation below (both keyed off the
    // same `revealed`/`delay`), so the wipe itself was fading in/becoming
    // visible at the same time its own clip-path was already partway through
    // covering/peeling — muddying (and, at low opacity in its early phase,
    // largely hiding) the effect instead of showing a crisp wipe over an
    // already-visible card. `revealed` itself is kept (still gates
    // ScrambleText and the color-wipe's own start below), just no longer
    // drives this <li>'s own opacity/translate.
    <li
      ref={onCardRef}
      className="flex flex-col items-start"
      style={{
        // Literal 10px, not scaled by --grid-scale — per direct follow-up
        // ("サムネとタイトルの間のマージンが目視で17pxくらいあるので目視で
        // 10pxにして"): on any monitor wider than the 1440px reference
        // canvas (where --grid-scale grows past 1), the scaled version
        // visibly grew past the intended 10px — this small a gap reads as a
        // fixed breathing-room value, not something that should track the
        // rest of the grid's own proportional scaling. 10px → 5px per a
        // further direct follow-up ("Thのタイトルとサムネのマージンをさら
        // に5px詰めて").
        gap: "5px",
      }}
    >
      {/* Mouse-only shortcut over the same destination as the title link
         below (tabIndex=-1/aria-hidden, not a second competing accessible
         link) — same convention the old overlay's own hit-area layer used
         (project-image-grid.tsx, removed), see project-card.tsx's own doc
         comment for the fuller reasoning. No mix-blend-exclusion here (unlike
         the title below used to have) — per explicit request ("Thのサムネは
         ブレンドモード解除して") the thumbnail image should render in its own
         normal colors, not blended against whatever sits behind the page.
         onMouseEnter replays the title's own underline-sweep — see
         playUnderlineSweep's own doc comment above. */}
      <div
        role="link"
        tabIndex={-1}
        aria-hidden
        onClick={navigate}
        onMouseEnter={() => {
          playUnderlineSweep();
          setThumbHovered(true);
        }}
        onMouseLeave={() => {
          setThumbHovered(false);
          setVideoReady(false);
        }}
        // No bg-[#d9d9d9] placeholder fill anymore — per direct follow-up
        // ("カラーワイプが右にはけるとき、左にグレー画像をアニメーションさ
        // せてる？それが余計な動きに見えるから、グレーベタは最初から無しで
        // いい"): with the image itself now clipped away until the wipe
        // reveals it (th-thumbnail-image-reveal below), any spot not yet
        // covered by either the color overlay or the revealed photo showed
        // this gray fill through instead — visible as an unwanted second
        // "gray" edge trailing alongside the color/photo wipe. Dropping it
        // just leaves that momentarily-uncovered sliver transparent, which
        // reads as nothing rather than a distracting extra motion.
        className="relative w-full cursor-pointer overflow-hidden"
        style={{ aspectRatio: String(PREVIEW_RATIO_ASPECT[project.previewRatio]) }}
      >
        {/* th-thumbnail-image-reveal — per direct follow-up ("最初からサム
           ネは表示させずに、カラーワイプが右にスライドするタイミングで表
           示するようにして"): keeps the photo itself clipped away until the
           color overlay below starts peeling, see that class's own doc
           comment in globals.css. Same animationPlayState as the overlay so
           both move in lockstep (no animationDelay here anymore — this
           card's own `revealed` prop is itself already delayed via the
           grid's own per-index setTimeout, see this file's own top-level
           doc comment). Applied to this plain wrapping div (clipping the
           <img> as a descendant) rather than directly on the <img> itself —
           per follow-up report that the image was still showing from the
           start even with the class/animation wired directly onto it ("ま
           だ最初からサムネ画像が表示されてる"): `clip-path` on a plain
           block element is the same already-proven-working technique the
           color overlay below uses, so routing the image's own reveal
           through an ordinary div instead of a replaced <img> element
           sidesteps whatever browser-specific quirk that direct combination
           was hitting. */}
        <div
          aria-hidden
          className="th-thumbnail-image-reveal absolute inset-0 overflow-hidden"
          style={{ animationPlayState: revealed ? "running" : "paused" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- variable per-project aspect ratio, no fixed dimensions to feed next/image */}
          <img
            src={getProjectImageSrc(project)}
            srcSet={getProjectImageSrcSet(project)}
            // 4 thumbnails per row across the content width — roughly a
            // quarter of the viewport on PC, full width below the lg
            // breakpoint (where this grid isn't rendered at all, but the
            // browser still needs a fallback descriptor).
            sizes="(min-width: 1024px) 25vw, 100vw"
            alt=""
            // hover:scale-[1.08] → 1.04 — per direct follow-up ("Thのホバー
            // 時のサムネ拡大をもう少し抑えたい"), a more subdued hover scale.
            className="h-full w-full object-cover transition-transform duration-[220ms] ease-[cubic-bezier(0.16,1,0.55,1)] hover:scale-[1.04]"
          />
          {/* ホバー中の動画（previewVideo がある実績のみ）。静止画の上に
              重ね、最初のフレームがデコードできたらフェードイン — 準備中は
              下の静止画が見えたままなので空白は出ない。ホバーが外れたら
              アンマウント（次回はまた頭から再生）。pointer-events-none で
              ホバー判定は親（画像ラッパー）に任せ、img の hover:scale は
              動画には掛けない（拡大中に切り替わると段差が出るため）。 */}
          {hoverVideoSrc && thumbHovered && (
            <video
              src={hoverVideoSrc}
              autoPlay
              muted
              loop
              playsInline
              onLoadedData={() => setVideoReady(true)}
              className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ease-out ${videoReady ? "opacity-100" : "opacity-0"}`}
            />
          )}
        </div>
        {/* Color-wipe reveal — per direct follow-up ("Th選択時、サムネが表
           示されるとき、各実績に設定してるカラーが左→右にスライドアニメー
           ションで表示、右にはけたらサムネが表示される仕様にしてみて"),
           bringing PC to parity with SP's own identical mobile-project-
           thumbnail-grid.tsx treatment — see .th-thumbnail-color-wipe's own
           doc comment in globals.css for the full two-phase mechanism/spec,
           including why this class is always applied (animationPlayState
           toggled instead of the class itself) rather than conditionally
           added on `revealed`. No animationDelay here anymore — see this
           file's own top-level doc comment for why the stagger moved to a
           per-index setTimeout instead. */}
        <div
          aria-hidden
          className="th-thumbnail-color-wipe pointer-events-none absolute inset-0"
          style={{
            backgroundColor: getProjectColor(project, index),
            animationPlayState: revealed ? "running" : "paused",
          }}
        />
      </div>
      <div
        ref={lastTitleRef}
        role="link"
        tabIndex={0}
        onClick={navigate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate();
          }
        }}
        className="cursor-pointer"
      >
        {/* text-black (#000), no mix-blend-exclusion — per direct follow-up
           ("Thのサムネ下のタイトルは#000に"), reverting the earlier
           Figma-matched "mix-blend-exclusion text-white" treatment (blending
           white against the page background would no longer render as a
           literal #000 — the two are mutually exclusive, so the blend mode
           had to come off too). --underline-offset: calc(-0.1em + 3px) moves
           the underline 3px closer to the text (up) — per direct follow-up
           ("Thのタイトルの下線を上に3px移動", then a further "さらに1px上に
           移動", then "PCのimg時のタイトル下線の位置を1px下げる" — 4px → 3px),
           same per-instance override convention as recent-news.tsx's
           own (see .underline-sweep::after's own doc comment in globals.css)
           rather than editing the shared default, which would move every
           other underline site-wide too. */}
        {/* opacity — per bug report ("Imgを選択したとき、一瞬だけ見出しだけ
           が先に表示されてるように見える"), matching mobile-project-
           thumbnail-grid.tsx's own identical fix for the same class of bug:
           ScrambleText shows this title's real, plain text immediately
           whenever `active` (== `revealed` here) is false — by design, so
           that *other* callers with no reveal-gating just render normal
           static text (see that component's own doc comment) — so before
           this card's own `revealed` flips true, the title was already
           fully legible while the thumbnail image/color-wipe below (both
           also gated on `revealed`, via `animationPlayState`) still hadn't
           started at all, reading as the heading arriving before its own
           thumbnail. Hiding this whole span until `revealed` is true keeps
           that plain-text state invisible so title and thumbnail visibly
           start together. */}
        <span
          ref={titleRef}
          className={`underline-sweep text-[length:calc(14px*var(--scale))] leading-[1.5] font-medium text-black [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${
            revealed ? "opacity-100" : "opacity-0"
          }`}
          style={{ "--underline-offset": "calc(-0.1em + 3px)" } as React.CSSProperties}
        >
          <ScrambleText text={project.title} active={revealed} />
        </span>
      </div>
    </li>
  );
}
