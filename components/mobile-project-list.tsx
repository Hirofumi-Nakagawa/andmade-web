"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLenis } from "lenis/react";
import type Lenis from "lenis";
import { ScrambleText } from "@/components/scramble-text";
import { slugify, type Project } from "@/lib/projects";

type MobileProjectListProps = {
  /** Fetched (or placeholder-fallback) project list — threaded down from
   *  mobile-home.tsx, which receives it from app/page.tsx (see that file's
   *  own doc comment). Replaces this file's own previous direct `import {
   *  projects } from "@/lib/projects"` now that the real list is async. */
  projects: Project[];
  /** Fires whenever a different project's title crosses TRIGGER_LINE_PX —
   *  mobile-home.tsx uses this to pick which project's image to show fixed
   *  bottom-right while scrolling. */
  onActiveChange: (index: number | null) => void;
  /** Which row (if any) is the one currently shown in the bottom-right
   *  preview — every *other* row's underlined title/category/role/date dims
   *  to opacity 0.3 while this is set (PC's own equivalent is 0.4). Several earlier follow-ups iterated on
   *  a *percentage transparency* figure (40% → 30% → 20% → 15% → 40% → 30%),
   *  each read as "100% minus that figure" to get an opacity value (e.g.
   *  "透過30%" → opacity 0.7) — repeatedly reported as barely/not visibly
   *  doing anything even after re-scoping to exactly the title/category/
   *  role/date text. The real issue was that reading itself: a later direct
   *  follow-up ("opacity 0.7じゃなくて、0.3ね") clarified the user meant the
   *  opacity *value* to literally be 0.3 (70% transparent), a much stronger
   *  dim than 0.7 ever produced. Set via an inline `style` below rather than
   *  a Tailwind class — 85 (an even earlier figure) wasn't one of Tailwind's
   *  own default opacity-* steps, and the arbitrary-value class equivalent
   *  (`opacity-[85%]`) was reported as not visibly applying, so this
   *  sidesteps that class of doubt entirely. Passed back down from
   *  mobile-home.tsx (which owns the preview's own visibility state) rather
   *  than computed locally here — `null` whenever the preview itself isn't
   *  actually showing (idle timeout, footer in view, "Back to top"
   *  scrolling), not just whenever *some* row happens to be "active", so
   *  every row sits at full opacity whenever there's nothing actually on
   *  screen to contrast them against. */
  highlightedIndex: number | null;
  /** Fires once, the moment a row's own text actually reveals (its
   *  IntersectionObserver first firing, same instant `itemRevealed` below
   *  flips true) — mobile-home.tsx uses this to reveal that row's Th-mode
   *  thumbnail at the exact same moment, per direct follow-up ("スクロール
   *  でテキストが表示されるのに合わせてサムネも表示"), replacing an earlier
   *  version that revealed thumbnails on their own separate, Th-tap-driven
   *  index stagger instead. */
  onRowRevealed?: (index: number) => void;
  /** Bumped by mobile-home.tsx on every Tx/Th click (regardless of whether
   *  the view actually changes) — replays *every* row's own underline sweep
   *  at once, per direct follow-up ("PC同様、Tx,Th切り替え時に下線見出しに
   *  アンダーラインスイープを適用して"), matching PC's own app/page.tsx
   *  handleToggleClick (which does the same to every project title there).
   *  Distinct from each row's own `isSelected`-triggered replay (see
   *  MobileProjectItemProps.isSelected) — both can bump the same
   *  underlineGeneration independently. */
  replayUnderlineToken?: number;
};

/** Distance from the top of the viewport used as the "reading line," just
 *  below the fixed header — whichever project's title has most recently
 *  scrolled past this line is reported as active. 140 → 190 → 250 (fixed
 *  values, per earlier direct follow-ups) → briefly a dynamic
 *  `window.innerHeight / 2` (per "一覧の縦位置は画面縦幅に対して中央の位置
 *  に配置") → reverted back to a fixed 250 (per "アクティブ判定ラインは固定
 *  250pxのまま") — that follow-up turned out to mean the list's own
 *  *starting position* on the page instead (see mobile-home.tsx's own
 *  listTopMarginPx) → finally, per a further direct follow-up
 *  ("アクティブ判定ラインはwindow.innerHeight / 2に-100pxにして"), dynamic
 *  again, this time explicitly as the trigger line itself: computed fresh on
 *  every tick from `window.innerHeight`, originally 100px above the
 *  viewport's own vertical center. Shifted to 110px above center per direct
 *  follow-up ("SPトップをスクロールした際に一覧が選択される条件も上記対応
 *  に合わせて10px調整して"), matching mobile-home.tsx's own header-to-list
 *  gap tightening (mt-[180px] → mt-[170px]) in the same direction, then to
 *  120px above center per further direct follow-up ("スクロール時の一覧選
 *  択の判定ラインを-120pxにして"). */
function getTriggerLinePx() {
  return window.innerHeight / 2 - 120;
}

/** Per-row delay step for the reveal cascade whenever several rows become
 *  visible together (see MAX_STAGGER_ROWS below and each row's own
 *  `revealDelayMs`) — per direct follow-up ("最初に表示される一覧のスクラ
 *  ンブルテキストのアニメーションが一斉に走ってるので、上から少しだけ差を
 *  付けて順に表示されるようにして。現状だとちょっと忙しない"): every row
 *  used to flip straight to its own `itemRevealed` the instant it became
 *  visible, so a whole screenful of rows' translateY/opacity transitions
 *  *and* ScrambleText reveals all started on the exact same frame — reading
 *  as one single busy burst rather than a list "arriving" top to bottom.
 *  40 → 90 per a further direct follow-up ("まだ忙しないのでステップ幅調整
 *  して") — 40ms was apparently still too tight to read as a clear
 *  top-to-bottom cascade; more than doubling it gives each row noticeably
 *  more room to settle before the next one starts. */
const ROW_REVEAL_STAGGER_MS = 90;

/** Caps how many rows' worth of stagger delay any single row can ever be
 *  given — see each row's own `revealDelayMs` (`Math.min(index,
 *  MAX_STAGGER_ROWS - 1) * ROW_REVEAL_STAGGER_MS`) below, and this file's
 *  own top-level doc comment for why: with a plain `index *
 *  ROW_REVEAL_STAGGER_MS` and *every* row revealing together on mount (the
 *  reverted design below), a list of `projects.length` rows took
 *  `projects.length * ROW_REVEAL_STAGGER_MS` to even finish *starting*
 *  every row's own reveal — several real seconds for a list this long,
 *  during which every row's CSS transition and ScrambleText reveal were
 *  simultaneously mutating the DOM, confirmed via an actual Safari Web
 *  Inspector Timeline recording to be forcing sustained synchronous layout
 *  recalculation on nearly every frame throughout that whole window —
 *  enough to visibly delay touch-input handling on real (but not
 *  desktop-devtools-emulated) hardware. Capping the multiplier bounds the
 *  worst case to `(MAX_STAGGER_ROWS - 1) * ROW_REVEAL_STAGGER_MS`,
 *  regardless of how far down the list a row sits or how many rows happen
 *  to already be visible together. */
const MAX_STAGGER_ROWS = 8;

/**
 * SP project list (Figma node 975:530) — a single-column stack (unlike PC's
 * 3-column ProjectList), simple fixed-px title+meta blocks instead of PC's
 * --scale-fluid ones.
 *
 * Each row reveals via its own IntersectionObserver the moment it actually
 * scrolls into view (see MobileProjectItem below) — matching PC's own
 * project-card.tsx — rather than every row revealing together on mount. This
 * *reverses* an earlier explicit request ("初回表示時に下にスクロールしたら
 * 順に表示される演出は無しでアクセスしたら順に下まで表示しちゃってOK"),
 * which itself had reverted an even earlier per-item-IntersectionObserver
 * version — but per direct follow-up investigating a real-device-only
 * multi-second delay before the top page's list/MENU became tappable
 * (confirmed via an actual performance recording — see MAX_STAGGER_ROWS'
 * own doc comment above), revealing *every* row on mount regardless of
 * whether it's even visible yet was the direct cause: for a list this long,
 * simultaneously animating far more rows than can ever fit on one phone
 * screen at once is real, avoidable main-thread cost for content the user
 * can't even see yet. Reintroducing the per-item observer, now *with* the
 * MAX_STAGGER_ROWS cap this file's earlier per-item-observer version never
 * needed (that version had no global stagger at all), bounds the reveal
 * cascade to whatever's actually on screen at any one moment, mount or not.
 *
 * Reports which project is "currently being read" via a plain
 * getBoundingClientRect() sweep on every Lenis scroll tick, rather than an
 * IntersectionObserver — an earlier version used one with a thin
 * percentage-based rootMargin band, which turned out unreliable in practice
 * (reported as "スクロールでイメージが表示されない"). Walking the list in
 * document order and taking the *last* title that's already scrolled above
 * the trigger line (see getTriggerLinePx()) is simpler and deterministic:
 * once one hasn't crossed that line yet, none further down have either, so
 * the sweep can stop early.
 */
export function MobileProjectList({
  projects,
  onActiveChange,
  highlightedIndex,
  onRowRevealed,
  replayUnderlineToken,
}: MobileProjectListProps) {
  const itemRefs = useRef<(HTMLElement | null)[]>(Array(projects.length).fill(null));
  const lastActiveRef = useRef<number | null>(null);

  // Wrapped in useCallback — see mobile-home.tsx's own identical
  // handleLenisTick for why an inline arrow function here would make
  // lenis-react's useLenis(callback) phantom-fire on every render, not just
  // real scroll ticks (though this callback's own `active !== lastActiveRef.current`
  // guard happens to make those phantom firings harmless no-ops here, unlike
  // mobile-home.tsx's own unconditional showPreview() call — still memoized
  // for consistency/cheaper phantom firings).
  // Skips the whole sweep below whenever scroll genuinely hasn't moved since
  // the last tick — per direct follow-up investigating a real-device-only
  // (never reproduced in desktop devtools) multi-second delay before the top
  // page's list/MENU become tappable, confirmed via an actual Safari Web
  // Inspector Timeline recording showing repeated "強制適用レイアウト"
  // (forced synchronous layout) entries throughout that exact window. Lenis's
  // own raf loop calls this tick every single animation frame indefinitely,
  // not only while the user is actually scrolling, and the sweep below reads
  // every row's own `getBoundingClientRect()` — a layout-dependent read that
  // becomes a *forced* synchronous layout recalculation whenever anything
  // else has mutated the DOM since the browser's last natural layout pass.
  // For several seconds after mount, that's exactly the case on nearly every
  // frame: every row's own reveal transition (translate/opacity) and its
  // ScrambleText title are actively mutating throughout that whole window —
  // multiplied across every row, every single frame, this is real, sustained
  // main-thread cost that a real device's single JS thread can't always keep
  // up with, delaying its ability to promptly handle touch input, while
  // desktop devtools' emulation (same fast desktop CPU regardless of
  // viewport size) never visibly struggles with it. Bailing out immediately
  // whenever `lenis.scroll` hasn't actually changed removes this forced-
  // reflow cost for the overwhelming majority of frames during that window
  // (nothing has scrolled yet at that point in a fresh page load) — genuine
  // scroll input still runs the exact same full, accurate sweep as before.
  const lastScrollRef = useRef<number | null>(null);
  const handleLenisTick = useCallback((lenisInstance: Lenis) => {
    if (lenisInstance.scroll === lastScrollRef.current) return;
    lastScrollRef.current = lenisInstance.scroll;

    const triggerLinePx = getTriggerLinePx();
    let active: number | null = null;
    for (let i = 0; i < itemRefs.current.length; i++) {
      const el = itemRefs.current[i];
      if (!el) continue;
      if (el.getBoundingClientRect().top <= triggerLinePx) {
        active = i;
      } else {
        break;
      }
    }
    // The very last row can run out of room to ever cross the trigger line —
    // the only scroll distance left below it is the list section's own
    // pb-[20px] + mobile-home.tsx's LIST_FOOTER_GAP_PX (200px) + the
    // footer's own height, which isn't guaranteed to add up to enough,
    // however far down the page the last title happens to sit. When that
    // falls short, the sweep above permanently stalls one row short of the
    // real last project, and — since mobile-home.tsx's own footerReady only
    // flips once *this exact last index* is reported active — the footer
    // stays stuck hidden too. Reported as "一覧最後のTriangleのイメージも
    // ...まだ表示されない" / "フッターも表示されなくなった". Once the page
    // has actually been scrolled all the way to its true bottom (no
    // scrollable distance left at all), force the last row active
    // regardless of its own title's exact position — "the user has reached
    // the end of the list" is a real, unambiguous condition here, unlike any
    // fixed pixel trigger line, which depends on content/viewport heights
    // that vary per device.
    if (active !== projects.length - 1) {
      const atBottom =
        window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1;
      if (atBottom) active = projects.length - 1;
    }
    if (active !== lastActiveRef.current) {
      lastActiveRef.current = active;
      onActiveChange(active);
    }
  }, [onActiveChange, projects.length]);

  useLenis(handleLenisTick);

  return (
    // gap-[40px] → 35px — per direct follow-up ("SPトップページの「txt」表示
    // 時の実績一覧について、各実績間のマージンを現在より5px詰めて").
    <ul className="flex flex-col gap-[35px]">
      {projects.map((project, index) => (
        <MobileProjectItem
          key={project.title}
          project={project}
          revealDelayMs={Math.min(index, MAX_STAGGER_ROWS - 1) * ROW_REVEAL_STAGGER_MS}
          isDimmed={highlightedIndex != null && highlightedIndex !== index}
          isSelected={highlightedIndex === index}
          onRevealed={() => onRowRevealed?.(index)}
          replayUnderlineToken={replayUnderlineToken}
          itemRef={(el) => {
            itemRefs.current[index] = el;
          }}
        />
      ))}
    </ul>
  );
}

type MobileProjectItemProps = {
  project: Project;
  /** This row's own share of the top-to-bottom stagger, applied once this
   *  row's own IntersectionObserver first reports it visible — see
   *  ROW_REVEAL_STAGGER_MS/MAX_STAGGER_ROWS' own doc comments above. */
  revealDelayMs: number;
  /** True for every row *except* whichever one is currently shown in the
   *  bottom-right preview — see MobileProjectListProps.highlightedIndex. */
  isDimmed: boolean;
  /** True only for the one row currently shown in the bottom-right preview —
   *  the exact inverse of isDimmed whenever *some* row is highlighted, both
   *  false when nothing is (see MobileProjectListProps.highlightedIndex).
   *  Replays this row's own underline sweep the moment this flips from false
   *  to true — see the effect below. */
  isSelected: boolean;
  /** Fires once, the same instant `itemRevealed` below flips true — see
   *  MobileProjectListProps.onRowRevealed. */
  onRevealed?: () => void;
  /** See MobileProjectListProps.replayUnderlineToken — replays this row's
   *  own underline sweep whenever this changes, independent of isSelected. */
  replayUnderlineToken?: number;
  itemRef: (el: HTMLElement | null) => void;
};

/** One SP project entry — translateY 24px→0px + fade-in, 500ms ease-out,
 *  triggered by its own IntersectionObserver the moment it actually scrolls
 *  into view (see `itemRevealed`'s own effect below, and this file's own
 *  top-level doc comment for why this reintroduces a per-item observer).
 *  Title itself scrambles in character-by-character via ScrambleText, also
 *  matching PC's project-card.tsx (`active={itemRevealed}` — the scramble
 *  starts the same instant this row's own reveal fires) — and, per a later,
 *  separate follow-up, its underline sweeps *again* every time this exact
 *  row becomes the selected one ("下線もアニメーションさせて"). An
 *  intermediate version also replayed the title's own scramble-text reveal
 *  at that same moment ("選択時に下線タイトルをスクランブルテキストでアニ
 *  メーション") — removed per a later follow-up ("選択時のスクランブルテキ
 *  スト演出は無しで"), so only the underline sweep replays on selection now.
 *
 * `itemRevealed` — flips true `revealDelayMs` after this row's own
 * IntersectionObserver first reports it intersecting (once, then
 * disconnects — matching PC's project-card.tsx). Delaying via `setTimeout`
 * (not e.g. a CSS `transition-delay`, which wouldn't reach ScrambleText's
 * own JS-driven reveal at all) staggers the `<li>`'s own translate/opacity
 * transition together with its title's ScrambleText reveal, for whichever
 * handful of rows happen to cross into view at close to the same moment
 * (mount, or a fast scroll) — see ROW_REVEAL_STAGGER_MS/MAX_STAGGER_ROWS'
 * own doc comments above for why this is capped rather than a plain
 * unbounded `index * ROW_REVEAL_STAGGER_MS`.
 *
 * The reveal transition (translate/opacity, 500ms) lives on the outer `<li>`;
 * the dim transition (`isDimmed`, opacity 70%/100%, 300ms) lives on a
 * *separate* inner wrapper — same two-layer split PC's own project-card.tsx
 * uses (its own `<li>` vs. its inner `role="link"` div) rather than one
 * element trying to drive two independent opacity transitions with two
 * different durations/triggers at once. */
/** The category/role/date plates' own `inset` — 1px past the text box on
 *  every side, same shorthand form as TITLE_PLATE_INSET above (which adds a
 *  further 1px on the bottom for the title's larger descenders). */
const META_PLATE_INSET = "-1px";

/** Plate wipe timing — mirrors PC's own project-card.tsx values. */
const PLATE_SWEEP_MS = 600;
const PLATE_SWEEP_EASE = "cubic-bezier(0.16, 1, 0.55, 1)";
/** Title-to-meta stagger — PC's own PLATE_META_DELAY_MS. */
const PLATE_META_DELAY_MS = 100;

/** The title plate's own `inset` shorthand (top right bottom left) — PC's
 *  own TITLE_PLATE_INSET verbatim, same reasoning (descenders hang below a
 *  text-box-trimmed box, so the bottom edge gets an extra 1px). */
const TITLE_PLATE_INSET = "-1px -1px -2px -1px";

/**
 * SP counterpart of PC's own HoverPlate (project-card.tsx): the plate in the
 * page's own background color that wipes in behind the *selected* row's
 * text. SP has no hover, so this is driven by an explicit `active` prop off
 * each row's own `isSelected` rather than a CSS `group-hover`.
 *
 * One per line-level box, each absolutely positioned against a
 * shrink-to-fit parent, so every line's plate hugs that line's own text
 * width — see PC's own equivalent, including why every visual property here
 * is an inline style rather than a CSS class.
 */
function SelectedPlate({
  active,
  inset = "0",
  delayMs = 0,
}: {
  active: boolean;
  inset?: string;
  delayMs?: number;
}) {
  return (
    <span
      aria-hidden
      className="pointer-events-none bg-(--color-background)"
      style={{
        position: "absolute",
        inset,
        transform: active ? "scaleX(1)" : "scaleX(0)",
        // Origin flips with the state so the plate enters from the left and
        // *exits to the right* rather than retracting back the way it came:
        // collapsing toward `right` moves the plate's left edge rightward,
        // reading as it being wiped off that way. The switch itself is never
        // visible — at the moment it happens the plate is at whichever scale
        // makes the other end irrelevant.
        transformOrigin: active ? "left" : "right",
        transition: `transform ${PLATE_SWEEP_MS}ms ${PLATE_SWEEP_EASE}`,
        // Stagger on the way in only (title first, then the meta lines);
        // on the way out everything leaves together, so a dismissed row
        // doesn't linger in pieces.
        transitionDelay: active ? `${delayMs}ms` : "0ms",
      }}
    />
  );
}

function MobileProjectItem({
  project,
  revealDelayMs,
  isDimmed,
  isSelected,
  onRevealed,
  replayUnderlineToken,
  itemRef,
}: MobileProjectItemProps) {
  const router = useRouter();
  const href = `/projects/${slugify(project.title)}`;
  const liRef = useRef<HTMLLIElement>(null);

  const [itemRevealed, setItemRevealed] = useState(false);
  // Always calls the *latest* onRevealed without needing it in the effect's
  // own dependency array below — mobile-home.tsx passes a fresh inline
  // arrow function every render, which would otherwise re-subscribe (tear
  // down and re-observe) this row's own IntersectionObserver on every single
  // render instead of once per mount.
  const onRevealedRef = useRef(onRevealed);
  useEffect(() => {
    onRevealedRef.current = onRevealed;
  }, [onRevealed]);
  useEffect(() => {
    const el = liRef.current;
    if (!el) return;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        timeoutId = setTimeout(() => {
          setItemRevealed(true);
          onRevealedRef.current?.();
        }, revealDelayMs);
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [revealDelayMs]);

  // Replays the underline sweep every time this row *becomes* selected — not
  // on every render while it stays selected, hence the `wasSelectedRef` edge
  // check. Bumps `underlineGeneration`, which is used as this row's own
  // underline bar's `key` below — a real remount, not the class-remove-
  // reflow-re-add restart trick app/page.tsx's own playUnderlineSweep uses
  // (an earlier version here used that same trick directly on this title,
  // which was reported as working fine in desktop devtools but misbehaving
  // on an actual phone — "pcの検証ツールだと問題ないんだけどスマホで見たら
  // 挙動がおかしい"). A genuine fresh mount reliably replays a CSS animation
  // with zero JS reflow-timing tricks needed, matching this codebase's own
  // general preference for remounts over in-place resets. This only works
  // safely here because the underline bar below is a *separate* element
  // (see the JSX) — remounting an ancestor of ScrambleText would also
  // replay *its* reveal, which a later follow-up explicitly asked to stop
  // doing ("選択時のスクランブルテキスト演出は無しで").
  const [underlineGeneration, setUnderlineGeneration] = useState(0);
  const wasSelectedRef = useRef(false);
  useEffect(() => {
    if (isSelected && !wasSelectedRef.current) {
      setUnderlineGeneration((generation) => generation + 1);
    }
    wasSelectedRef.current = isSelected;
  }, [isSelected]);

  // Also replays this same underline sweep on every Tx/Th click — per direct
  // follow-up ("PC同様、Tx,Th切り替え時に下線見出しにアンダーラインスイー
  // プを適用して"), matching PC's own handleToggleClick (app/page.tsx),
  // which replays every project title's sweep on every toggle click
  // regardless of which button or whether the view actually changes.
  // Compared against a tracked previous value (not just "run on every
  // change") so the very first render — replayUnderlineToken's own initial
  // value, not a real click — doesn't also trigger a spurious replay.
  const prevReplayTokenRef = useRef(replayUnderlineToken);
  useEffect(() => {
    if (replayUnderlineToken !== prevReplayTokenRef.current) {
      prevReplayTokenRef.current = replayUnderlineToken;
      setUnderlineGeneration((generation) => generation + 1);
    }
  }, [replayUnderlineToken]);

  return (
    // Slide-in (translate-y) restored — briefly removed per "Txのスライドイ
    // ンは無しで", then reverted right back per a direct follow-up
    // ("やっぱりTxのスライドイン戻して"), matching PC's own identical
    // project-card.tsx change.
    <li
      ref={(el) => {
        liRef.current = el;
        itemRef(el);
      }}
      className={`transition-all duration-500 ease-out ${
        itemRevealed ? "translate-y-0 opacity-100" : "translate-y-[24px] opacity-0"
      }`}
    >
      <div
        role="link"
        tabIndex={0}
        onClick={() => router.push(href)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            router.push(href);
          }
        }}
        // 12px — widened back out from 4px, per direct follow-up
        // ("カテゴリとのマージンが詰まりすぎ"): 4px was tightened that far to
        // match the underline sitting close beneath the title, but read as
        // the title and category block crowding into each other instead.
        // Tightened by 2px again (10px), then a further 1px (9px), per two
        // later direct follow-ups on both platforms ("トップページ一覧の下線
        // 見出しの下マージンを2px詰めて", then "さらに1px詰めて") — matching
        // project-card.tsx's own identical reductions.
        className="flex cursor-pointer flex-col items-start gap-[9px] transition-opacity duration-300 ease-out"
        // 0.3 — SP-specific, deliberately dimmer than PC's own 0.4
        // (project-card.tsx's opacity-40).
        //
        // touchAction: manipulation — mirrors mobile-menu.tsx's own identical
        // fix on every one of its own tap targets (see that file's own doc
        // comment): with the default `touch-action: auto`, real touch
        // hardware can hold a tap for a moment while deciding whether it's
        // the start of a double-tap-to-zoom/pan gesture before actually
        // firing `click` — a delay that never reproduces in devtools' own
        // mouse-driven touch emulation, only on genuine touch hardware.
        // `manipulation` skips that disambiguation delay entirely.
        style={{ opacity: isDimmed ? 0.3 : 1, touchAction: "manipulation" }}
      >
        <span
          // No text-box-trim here — deliberately plain, normal-flow line
          // sizing (16px * leading-[1.3] = 20.8px — was 18px * 1.3 = 23.4px
          // before a direct follow-up, "文字サイズ：18pxは16pxに"; mobile-
          // home.tsx's own Tx/Th rail leading value was updated to match,
          // see its own doc comment — content-independent: see
          // ScrambleText's own blankChars() doc comment for why a plain line
          // box never collapses even on a blank first frame, unlike a
          // trimmed one). This span is now a mixed inline+block container
          // (ScrambleText's inline text, then a block-level underline right
          // below it — see below), which is why text-box-trim was dropped:
          // its cap-height/baseline trimming is defined in terms of a text
          // line's own edges, and this element's "last line" is no longer
          // text at all once the underline sits below it.
          //
          // After repeated rounds where the underline was reported invisible
          // despite each fix being individually well-reasoned (text-box-trim/
          // forced-height interactions, ScrambleText's blank-frame handling,
          // a native-decoration fallback that then masked the sweep
          // animation instead), the underline is now a plain in-*flow* block
          // element (see below) instead of `position:absolute` measured
          // against this span's own box — sidestepping box-model measurement
          // entirely: a block-level sibling directly under an inline-block's
          // inline content is a basic, unambiguous CSS mechanism (no
          // containing-block/trim-box math to get wrong), and with no
          // explicit width of its own it naturally stretches to match
          // *this* span's own content width (this span sizes itself to fit
          // the title text, being an inline-block with no forced width) —
          // i.e. the same width the title text itself renders at, with zero
          // separate width bookkeeping needed.
          // whitespace-nowrap — per direct follow-up ("スクランブルテキスト
          // でタイトルが表示されるとき、タイトルが2行になったりして、一覧
          // がガタガタ見える"): the list's own 8-column width constraint
          // (see mobile-home.tsx's own MobileProjectList wrapper) lets long
          // titles wrap to a second line, and a reveal that changes the
          // title's own rendered width mid-animation (see `holdWidth`'s own
          // removal just below) can cross that wrap threshold as it plays,
          // changing the row's own height — reading as the whole list
          // jumping/reflowing. Titles now always render on one line (can
          // overflow the column visually for a very long title, but never
          // reflows other rows while revealing).
          // text-[15px] → 14px（"一覧タイトルを14pxに"）→ 15px — per direct
          // follow-up ("14pxにした箇所を15pxにして")。
          className="relative inline-block text-[15px] leading-[1.3] font-medium text-black whitespace-nowrap"
        >
          <SelectedPlate active={isSelected} inset={TITLE_PLATE_INSET} />
          {/* No `holdWidth` (was set) — per direct follow-up ("PCのスクラン
              ブルテキストは左から順に表示されてるけど、SPのほうは最初から
              文字列の長さ分表示されてる状態でスクランブルアニメーションが
              走ってる...そこも含めてPCと同じ作りにして"): PC's own
              project-card.tsx never passes `holdWidth` either, so its title
              starts blank and grows left-to-right as each character
              arrives, instead of every character showing a flickering
              placeholder glyph from frame one. `holdWidth` was added here
              specifically to keep this row's own width constant through the
              reveal (avoiding a wrap-driven height jank) — now handled by
              `whitespace-nowrap` above instead, which prevents wrapping
              outright regardless of how the reveal's width changes over
              time, so `holdWidth`'s own layout-stability job is no longer
              needed and this can match PC's reveal exactly.

              stepMs=36/jitterMs=28/flickerMs=36 (PC's own project-card.tsx
              stays on ScrambleText's own defaults — 44/35/45) — per direct
              follow-up asking whether the two shared the same speed and, on
              confirming they did, to make SP's own reveal a little quicker:
              same ratio scaled down (~20%) across all three timing knobs so
              the reveal just plays faster overall rather than only
              shortening one phase (e.g. faster steps but same lingering
              flicker) and reading unevenly. */}
          {/* `relative` so the text paints above its plate. */}
          <span className="relative">
            <ScrambleText text={project.title} active={itemRevealed} stepMs={36} jitterMs={28} flickerMs={36} />
          </span>
          {/* The underline itself — see globals.css's own .underline-bar/
              .underline-bar-play for why this is a real element (keyed,
              remounted on selection) rather than the shared .underline-sweep
              ::after technique PC's own project-card.tsx uses. `block` (not
              `absolute`) — see this span's own doc comment above for why.
              marginTop pulls it up snug against the text line right above it
              (a small negative margin, not a measured/computed offset against
              any particular box edge). underline-bar-play only applies from
              the *second* render onward (underlineGeneration > 0) — the very
              first mount should just show a plain, already-settled
              underline, not sweep in.

              -0.1em - 1px → -0.1em - 2px — per direct follow-up raising this
              underline 1px, matching PC's own identical 1px adjustment
              ("その下線見出しの下線の位置を1px上に上げて"): more negative
              margin-top pulls a block element further up, so an extra 1px
              here raises it exactly 1px higher (the opposite direction from
              PC's own `bottom`-based fix, since this is an in-flow negative
              margin rather than an absolutely-positioned offset from the
              box's own bottom edge). Note this also incidentally shrinks this
              row's own total rendered height by that same 1px (a negative
              top margin on a block child pulls its parent's own auto-height
              inward too), on top of the gap tightened separately above. */}
          <span
            key={underlineGeneration}
            aria-hidden
            // `relative` — required now that a SelectedPlate sits behind
            // this title. The plate is absolutely positioned, and this
            // underline is a plain in-flow block, so without its own
            // positioning it paints *under* the plate and disappears the
            // moment the row becomes selected. (PC has no equivalent problem:
            // its underline is a ::after, already absolutely positioned and
            // later in paint order than the plate.)
            className={`underline-bar pointer-events-none relative block ${
              underlineGeneration > 0 ? "underline-bar-play" : ""
            }`}
            style={{ marginTop: "calc(-0.1em - 2px)" }}
          />
        </span>
        {/* 16px → 14px（"文字サイズ：...16pxは14pxに"）→ 一度 10px/12px を
            試して 14px へ戻した経緯（"10px→12pxの変更を元に戻してください"）
            の後、12px（"カテゴリーと日付を12pxに"）→ 13px — per direct
            follow-up ("12pxにした箇所を13pxに")。 */}
        {/* Each line is its own `block w-fit` span so its plate hugs that
            line's real width, exactly as on PC (project-card.tsx).

            All three lines share one <p> and one `leading-[1.25]`, again
            matching PC. The date used to sit in a *second* <p> with an
            8px flex `gap` above it, which left a bare 8px band between the
            role and date plates that no plate covered — visible as a gap in
            the backing once a row is selected. Consecutive block spans
            inside a single <p> stack line box to line box with nothing
            between them, so the plates now meet exactly. The date keeps its
            own font/tracking overrides on the same span that carries its
            plate, the same way PC handles it. */}
        <div className="flex flex-col items-start text-[13px] text-black/50">
          <p className="font-normal leading-[1.25] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
            <span className="relative block w-fit">
              <SelectedPlate active={isSelected} inset={META_PLATE_INSET} delayMs={PLATE_META_DELAY_MS} />
              <span className="relative">{project.category}</span>
            </span>
            <span className="relative block w-fit">
              <SelectedPlate active={isSelected} inset={META_PLATE_INSET} delayMs={PLATE_META_DELAY_MS} />
              <span className="relative">{project.role}</span>
            </span>
            <span className="relative block w-fit font-(family-name:--font-courier) tracking-[-0.7px]">
              <SelectedPlate active={isSelected} inset={META_PLATE_INSET} delayMs={PLATE_META_DELAY_MS} />
              <span className="relative">{project.date}</span>
            </span>
          </p>
        </div>
      </div>
    </li>
  );
}
