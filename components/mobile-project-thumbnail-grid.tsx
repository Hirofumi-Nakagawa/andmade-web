"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ScrambleText } from "@/components/scramble-text";
import {
  slugify,
  PREVIEW_RATIO_ASPECT,
  getProjectColor,
  getProjectImageSrc,
  getProjectImageSrcSet,
  type Project,
} from "@/lib/projects";

type MobileProjectThumbnailGridProps = {
  /** Fetched (or placeholder-fallback) project list — same data Tx mode's
   *  MobileProjectList renders, threaded down from mobile-home.tsx. */
  projects: Project[];
};

/** Left inset — 1 of globals.css's fluid --sp-grid-column-width columns, one
 *  column further left than mobile-home.tsx's own CONTENT_INDENT (2 columns,
 *  matching the header/Tx list) — per direct follow-up ("Img時のサムネ一覧
 *  を左に1マス移動して"), this grid's own left edge is now a deliberate
 *  exception rather than staying aligned with everything else on the page. */
const CONTENT_INDENT = "calc(var(--sp-grid-column-width) * 1)";

/** Delay step between cards' own color-wipe stagger — row-dominant,
 *  column-secondary, so the grid plays in strict top-left-first reading
 *  order (a whole row cascades left→right before the next row starts) —
 *  per direct follow-up ("カラーワイプの表示を左上から順に表示されるよう
 *  にして"), matching PC's own identical project-thumbnail-grid.tsx change
 *  (see that file's own doc comment for the full "why row must dominate"
 *  reasoning — ROW_STAGGER_MS just needs to stay greater than
 *  (COLUMNS - 1) × COLUMN_STAGGER_MS, 1 × 20 = 20 here, which it already
 *  does by a wide margin).
 *
 *  STAGGER_MAX_MS raised from 400 — per further bug report ("まだ左上から
 *  順になってない"), matching PC's own identical fix: at only 2 columns,
 *  this grid has roughly *double* PC's row count for the same project list
 *  (~17 rows vs. ~7), so the old 400ms cap (hit after just row 4) bunched an
 *  even larger fraction of the list onto one simultaneous delay than on PC.
 *  The reveal mechanism itself was then rewritten to per-index
 *  `setTimeout`s (see this file's own top-level doc comment) rather than
 *  CSS animation-delay, matching PC's own identical rewrite. These step
 *  values were briefly exaggerated (100/500ms, 10s cap) purely to make the
 *  cascade obvious enough to visually confirm the order was actually
 *  correct — confirmed per direct follow-up ("確認できたので、もう少し控え
 *  めな値にして"), then dialed back down to these more understated ones.
 *
 *  2 → 3 columns, column gap 8px → 4px — per direct follow-up ("SPのImg選択
 *  時、1列のサムネの数を3にして（マージンは4px）"). */
const COLUMNS = 3;
const COLUMN_STAGGER_MS = 20;
const ROW_STAGGER_MS = 100;
const STAGGER_MAX_MS = 2000;

/**
 * Standalone SP Th-mode grid, originally matching the Figma design at node
 * 1400:1835 (fixed 2-column grid, 8px column gap / 35px row gap, each card
 * an image + title below, mix-blend-exclusion white text) — no category/
 * role/date shown here, matching PC's own project-thumbnail-grid.tsx scoping
 * (Figma's separate image-less text-only tail entries are out of scope for
 * this pass). Per later direct follow-ups, now diverges from that Figma
 * spec the same way PC's own grid did: no mix-blend-exclusion (plain #000
 * title instead), image-title gap tightened from 10px to 3px, and the
 * title's own underline nudged up — see each tweak's own inline comment.
 *
 * Replaces mobile-home.tsx's old MobileProjectThumbnails approach entirely:
 * rather than a separate thumbnail layer positioned on top of the
 * always-mounted Tx text list (kept pixel-synced via a live-measured
 * rowPositions/rowSettled/screenStaggerHidden system in mobile-home.tsx),
 * this is now a genuine independent layout — mobile-home.tsx swaps this in
 * *instead of* MobileProjectList when Th is selected, matching PC's own Th
 * redesign (project-thumbnail-grid.tsx) exactly, so no positioning/
 * measurement machinery is needed at all.
 *
 * `revealed` is tracked per-card here (an array of booleans), each one
 * flipped by its own `setTimeout`, not derived from CSS `animation-delay` on
 * an always-"running" animation — per repeated bug report that the
 * color-wipe stagger still wasn't playing top-left-first
 * ("左上から順になってない") even after two earlier fixes, matching PC's own
 * identical rewrite — see project-thumbnail-grid.tsx's own doc comment for
 * the fuller "why CSS animation-delay + play-state wasn't reliable enough"
 * reasoning. Explicit setTimeouts, not CSS's own paused-animation timing
 * model, now decide exactly when each card's own `revealed` (and so its
 * `animation-play-state`) flips.
 *
 * Per direct follow-up ("Th時はスクロールで画面内に入ったらサムネのアニメー
 * ションが走るようにして"), matching PC's own identical change: scheduling
 * now starts per-card, from the moment that card scrolls into view, via one
 * shared IntersectionObserver watching every card's `<li>` — see
 * project-thumbnail-grid.tsx's own doc comment for the fuller "why one
 * shared observer, not one per card" reasoning.
 */
export function MobileProjectThumbnailGrid({ projects }: MobileProjectThumbnailGridProps) {
  const cardRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [revealedIndices, setRevealedIndices] = useState<boolean[]>(() => projects.map(() => false));

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
    <ul
      className="grid"
      style={{
        paddingLeft: CONTENT_INDENT,
        // width: 12 grid columns total — 1 for CONTENT_INDENT's own
        // paddingLeft (box-sizing: border-box, Tailwind's preflight, folds
        // that padding into this same width) + 11 of actual grid track
        // space, per direct follow-up ("その分、一覧の幅を11マス分に広げて").
        // Was 10 tracks, which stopped short of the right margin to leave
        // room for the rotated "recent news" block; that now fades out in Img
        // mode (see mobile-home.tsx's own `hidden={showImages}`), so the grid
        // takes the freed columns and its right edge lands on the page's own
        // right margin.
        width: "calc(var(--sp-grid-column-width) * 12)",
        gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`,
        // 4px → 2px — per direct follow-up ("マージンを4→2pxに変更して").
        columnGap: "2px",
        // 35px → 40px（"一覧の列の上下マージンをさらに5px広げて"）→ 50px
        // — per direct follow-up ("spのimg時の一覧の列上下マージンを10px
        // 空けて")。
        rowGap: "50px",
      }}
    >
      {projects.map((project, index) => (
        <MobileProjectThumbnailCard
          key={project.title}
          project={project}
          index={index}
          revealed={revealedIndices[index] ?? false}
          onCardRef={(el) => {
            cardRefs.current[index] = el;
          }}
        />
      ))}
    </ul>
  );
}

function MobileProjectThumbnailCard({
  project,
  index,
  revealed,
  onCardRef,
}: {
  project: Project;
  index: number;
  revealed: boolean;
  /** Reports this card's own <li> up to the grid's shared
   *  IntersectionObserver — see MobileProjectThumbnailGrid's own scheduling
   *  effect. */
  onCardRef: (el: HTMLLIElement | null) => void;
}) {
  const router = useRouter();
  const href = `/projects/${slugify(project.title)}`;

  // Reserves this title's own rendered height from the very first frame —
  // per bug report ("belle ideeのタイトルが2行になるとき2列目から下が一瞬
  // ガタガタする"): ScrambleText's own flickering random glyphs can render
  // very slightly wider than the settled real characters (see that
  // component's own doc comment on mixed-case glyph width), occasionally
  // enough to cross this title's own wrap threshold mid-animation even for a
  // title that's a single line at rest — for a title sitting right at that
  // 1-vs-2-line boundary, that transient wrap change flips this card's own
  // total height, which changes this CSS Grid row's own height (rows
  // auto-size to their tallest card), instantly shifting every row below it.
  // Measured here via a hidden, invisible sibling rendering the same plain
  // title text at this title's own true 100% width, so its real, final line
  // count/height is known immediately on mount — well before ScrambleText
  // ever finishes — and applied as this card's own min-height throughout, so
  // any such transient wrap never actually changes this card's own rendered
  // height (and so never disturbs row layout). Re-measures if `project.title`
  // itself ever changes (this card getting reused for a different project) —
  // matches mobile-menu.tsx's own identical measure-real-DOM-don't-guess
  // convention (see that file's own panelHeight).
  const titleMeasureRef = useRef<HTMLSpanElement>(null);
  const [titleMinHeight, setTitleMinHeight] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const el = titleMeasureRef.current;
    if (!el) return;
    setTitleMinHeight(el.offsetHeight);
  }, [project.title]);

  const navigate = () => router.push(href);

  return (
    // No entrance slide-in/fade-in on the card itself anymore — per direct
    // follow-up ("Thの一覧がスライドイン+フェードインで表示されるのを無し
    // にしてみて。それがあるからワイプカラーが見えてないだけなのかも"),
    // matching PC's own identical project-thumbnail-grid.tsx change: the
    // card's own opacity transition ran concurrently with the color-wipe
    // overlay's clip-path animation below (both keyed off the same
    // `revealed`/`delay`), muddying (and, early on, largely hiding) the
    // wipe. `revealed` itself is kept (still gates ScrambleText and the
    // color-wipe's own start below), just no longer drives this <li>'s own
    // opacity/translate.
    <li
      ref={onCardRef}
      // min-w-0 — per direct follow-up ("タイトルは幅に入らない場合は自動改
      // 行する"): this <li> is both a flex-col container *and* a CSS Grid
      // item (the grid's own `repeat(COLUMNS, 1fr)` tracks above), and grid
      // items default to `min-width: auto`, which effectively floors their
      // own shrinkability at their content's own natural (unwrapped) size —
      // a long title could silently widen this whole column (and so the
      // whole row) rather than wrapping inside it. min-w-0 lets this item
      // actually shrink down to the grid track's own real width, which is
      // what lets the title span below (now `w-full`, so it has a real box
      // to wrap text within instead of hugging its own unwrapped content)
      // wrap onto a second line instead of overflowing.
      // relative — containing block for the hidden title-height measurer
      // below (titleMeasureRef); see that ref's own doc comment.
      className="relative flex min-w-0 flex-col items-start"
      // 10px → 3px → 8px → 10px → 9px — per direct follow-up ("タイトルとサ
      // ムネのマージンを7px詰めて"), then reopened 5px per further follow-up
      // ("Img時のタイトルとサムネのマージンが詰まりすぎ。さらに5px離して")
      // once the grid moved to narrower 3-column cards, then nudged to 10px
      // ("サムネとタイトルのマージンを10pxに変更して"), then in by 1px per
      // the latest ("Img時のタイトルとサムネのマージンを1px詰めて").
      style={{ gap: "9px" }}
    >
      {/* Mouse/tap-only shortcut over the same destination as the title link
         below (tabIndex=-1/aria-hidden, not a second competing accessible
         link) — same convention as PC's own project-thumbnail-grid.tsx. */}
      <div
        role="link"
        tabIndex={-1}
        aria-hidden
        onClick={navigate}
        // No bg-[#d9d9d9] placeholder fill anymore — per direct follow-up
        // ("カラーワイプが右にはけるとき、左にグレー画像をアニメーションさ
        // せてる？それが余計な動きに見えるから、グレーベタは最初から無しで
        // いい"), matching PC's own identical fix — see that file's own doc
        // comment for the fuller reasoning.
        className="relative w-full cursor-pointer overflow-hidden"
        style={{ aspectRatio: String(PREVIEW_RATIO_ASPECT[project.previewRatio]) }}
      >
        {/* th-thumbnail-image-reveal — per direct follow-up ("最初からサム
           ネは表示させずに、カラーワイプが右にスライドするタイミングで表
           示するようにして"), matching PC's own identical treatment — keeps
           the photo clipped away until the color overlay below starts
           peeling, see that class's own doc comment in globals.css. Same
           animationPlayState as the overlay so both move in lockstep (no
           animationDelay here anymore — this card's own `revealed` prop is
           itself already delayed via the grid's own per-index setTimeout,
           see this file's own top-level doc comment). Applied to this plain
           wrapping div (clipping the <img> as a descendant) rather than
           directly on the <img> itself — per follow-up report that the
           image was still showing from the start even with the class wired
           directly onto it ("まだ最初からサムネ画像が表示されてる"),
           matching PC's own identical fix — see that file's own doc comment
           for the fuller "why route it through a plain div" reasoning. */}
        <div
          aria-hidden
          className="th-thumbnail-image-reveal absolute inset-0 overflow-hidden"
          style={{ animationPlayState: revealed ? "running" : "paused" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- variable per-project aspect ratio, no fixed dimensions to feed next/image */}
          <img
            src={getProjectImageSrc(project)}
            srcSet={getProjectImageSrcSet(project)}
            // Two thumbnails per row on SP.
            sizes="50vw"
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
        {/* Color-wipe reveal — see .th-thumbnail-color-wipe's own doc comment
           in globals.css for the full two-phase mechanism/spec, including
           why this class is always applied (animationPlayState toggled
           instead of the class itself) rather than conditionally added on
           `revealed`. No animationDelay here anymore — see this file's own
           top-level doc comment for why the stagger moved to a per-index
           setTimeout instead. */}
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
        role="link"
        tabIndex={0}
        onClick={navigate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate();
          }
        }}
        // Plain w-full — no `width: calc(100% + 10px)` extra-slack-while-
        // animating/snap-to-100%-once-settled treatment anymore, per direct
        // follow-up ("「サムネ幅を10px超えてから改行する」という条件・実装
        // は不要とのことなので、削除してください"). Still no
        // `whitespace-nowrap`/`overflow-hidden` "mask" here (an earlier
        // attempt at that was reverted per direct follow-up, "1行固定と
        // タイトルのマスクはなしで") — this only ever gives text a real box
        // to wrap within, never forces a single line or clips anything.
        className="w-full cursor-pointer"
      >
        {/* text-black (#000), no mix-blend-exclusion (removed from the grid's
           own <ul> above) — per direct follow-up ("SPのThもブレンドモード
           無しでタイトルは#000に"), matching PC's own project-thumbnail-grid
           .tsx identical treatment.

           Plain native underline (text-decoration), not the shared
           .underline-sweep class PC's own grid and every other title on this
           site use — per two rounds of bug report on the exact same title
           once it started wrapping onto 2 lines ("タイトル下線が2行になる
           ときはちゃんと下線がついてない", then after an inline-block/
           block+w-fit attempt, "2行のとき、1行目に下線がついてないのと2行
           目の下線がサムネ幅いっぱいまで伸びてる"): .underline-sweep::after
           is one single `position:absolute; left:0; right:0` box drawn
           against *the whole element's* own box (globals.css) — for a
           single-line title that's indistinguishable from "underline the
           text", but for a *wrapped* title it can only ever draw one bar,
           positioned under the *last* line only, sized to that one box's
           own width — never each line's own actual text width, and (per the
           second report) that box's own width couldn't be reliably kept
           down to the actual wrapped content's width either (CSS `fit-
           content` on wrapping text resolves to the *available* width, not
           the narrowest width the wrapped lines actually render at, once
           the unwrapped text is wider than that available space — a genuine
           CSS layout limitation, not something fixable by adjusting this
           element's own display/width values further). A native
           `text-decoration-line` sidesteps all of this entirely: browsers
           already paint it correctly under *every* wrapped line, each sized
           to that line's own real text — exactly what multi-line titles
           need. The trade-off is this title no longer plays the animated
           hover sweep every other .underline-sweep title on the site has;
           given the sweep technique can't correctly support more than one
           line to begin with, a plain (but always-correct) underline here
           reads better than an animated one that's wrong half the time. */}
        <span
          // leading-[1.5] → 1.2 → 1.1 → 1.2 → 1.3 → 1.4 — per repeated
          // direct follow-up ("Img時のタイトル行間をもう少し詰めて", "行間
          // がまだ広いのはなぜ？", "1.2に戻して", "leading-[1.3]にして",
          // "leading-[1.4]に変更"): titles now wrap onto multiple lines more
          // often at 3 narrower columns/10-grid-column-wide layout, so the
          // looser 1.5 line-height
          // (mostly unnoticed back when titles were almost always a single
          // line) reads as noticeably loose between wrapped lines. text-
          // box-trim below only trims the *outer* leading above the first
          // line/below the last (per spec) — it doesn't reduce the *inter*
          // -line gap between two wrapped lines, which is purely this
          // line-height value's own job.
          //
          // opacity — per bug report ("Img選択時に表示される瞬間タイトルが
          // 一瞬表示されてからスクランブルテキストが走る挙動"): ScrambleText
          // shows this title's real, plain text immediately whenever
          // `active` (== `revealed` here) is false — by design, so that
          // *other* callers with no reveal-gating just render normal static
          // text (see that component's own doc comment) — so before this
          // card's own `revealed` flips true, the title was already fully
          // legible for however long the scroll-triggered reveal took to
          // reach it, then suddenly blanked out and re-scrambled in the
          // instant `revealed` actually flipped — a visible "flash of real
          // text, then it disappears and scrambles" glitch. Hiding this
          // whole span until `revealed` is true keeps that plain-text state
          // invisible the entire time, so the only thing ever visible is the
          // scramble-in animation itself, starting from nothing. No
          // overflow-hidden/whitespace-nowrap "mask" here anymore (an
          // earlier attempt at that was reverted per direct follow-up,
          // "1行固定とタイトルのマスクはなしで") — this stays plain normal
          // wrapping throughout, same as everywhere else on this site.
          className={`block underline decoration-1 underline-offset-2 text-[10px] leading-[1.4] font-medium text-black [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${
            revealed ? "opacity-100" : "opacity-0"
          }`}
          // minHeight — see titleMinHeight's own doc comment above.
          style={{ minHeight: titleMinHeight }}
        >
          <ScrambleText text={project.title} active={revealed} />
        </span>
        {/* Hidden measurer — see titleMinHeight's own doc comment above.
           Absolutely positioned (against the <li>'s own now-`relative` box,
           not this animating title div's) at this same true 100% width,
           rendering the same plain title text in the same font/size/leading,
           so its real rendered height always matches exactly what the
           visible span above will settle to. invisible (not display:none)
           keeps it laid out/measurable; pointer-events-none/aria-hidden keep
           it out of interaction and assistive tech entirely — it's never
           actually seen. */}
        <span
          ref={titleMeasureRef}
          aria-hidden
          className="pointer-events-none invisible absolute left-0 top-0 block text-[10px] leading-[1.4] font-medium [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
          style={{ width: "100%" }}
        >
          {project.title}
        </span>
      </div>
    </li>
  );
}
