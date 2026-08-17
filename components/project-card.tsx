"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ScrambleText } from "@/components/scramble-text";
import { slugify, type Project } from "@/lib/projects";
import { isInitialEntrance, LIST_ENTRANCE_DELAY_MS } from "@/lib/entrance";

type ProjectCardProps = {
  project: Project;
  /** Column index within its row (0-2) — staggers the reveal left-to-right. */
  column: number;
  /** Ref to the last row's title link — used by ProjectGridSection to measure it. */
  lastTitleRef?: React.Ref<HTMLDivElement>;
  /** Reports this project's title element up to app/page.tsx — used to play
   *  the underline-sweep animation on every title when the Tx/Th toggle is
   *  clicked (see app/page.tsx's own handleToggleClick). */
  onTitleRef?: (el: HTMLElement | null) => void;
  /** Called on hover — triggers the full-screen background preview in app/page.tsx. */
  onHoverTitle?: () => void;
  /** Called on mouse leave — starts the 3s clear timer in app/page.tsx. */
  onHoverEnd?: () => void;
  /** True while a *different* card is hovered — dims this one to 40%.
   *  Un-dims at the same transition speed once hovering stops entirely. */
  isDimmed?: boolean;
};

/** Delay step between columns in the same row, so they reveal left-to-right. */
const COLUMN_STAGGER_MS = 120;
/** 一覧全体を「ワンテンポ」遅らせる。FV のコピー（カーテンリビール）が動き出して
 *  から一拍おいて一覧が続く、という順番にするための待ち。
 *
 *  効かせるのは**初回表示ぶんだけ**（ページに入った直後に既に画面内に
 *  あったカード）。スクロールで下から入ってくるカードや、Txt/Img の
 *  切り替えで作り直されたカードにまでこの遅延を足すと、ただ反応が鈍い
 *  だけになる — 判定は lib/entrance.ts の isInitialEntrance()。 */
/** Extra delay before the category/role/date block starts fading in. */
const META_FADE_DELAY_MS = 150;

/** The title plate's own `inset`, as a literal CSS `inset` shorthand
 *  (top right bottom left) — negative values push each edge *outward* past
 *  the text box. 1px all round, with an extra 1px on the bottom edge only,
 *  which is where a text-box-trimmed line has the least room to spare
 *  (descenders hang below the box). */
const TITLE_PLATE_INSET = "-1px -1px -2px -1px";

/** The category/role/date plates' own `inset` — 1px past the text box on
 *  every side, same shorthand form as TITLE_PLATE_INSET above (which adds a
 *  further 1px on the bottom for the title's larger descenders). */
const META_PLATE_INSET = "-1px";

/** Plate wipe timing — matches .underline-sweep's own 0.6s/curve
 *  (globals.css) so the plate and the title's underline read as one gesture. */
const PLATE_SWEEP_MS = 600;
const PLATE_SWEEP_EASE = "cubic-bezier(0.16, 1, 0.55, 1)";
/** How long the category/role/date plates wait after the title's own, so the
 *  two read as a sequence rather than one simultaneous flash. */
const PLATE_META_DELAY_MS = 100;

/**
 * The plate that wipes in behind a hovered card's text, in the page's own
 * background color (not a hardcoded white) so it reads as the background
 * itself sliding back over the hover-preview image rather than as a separate
 * white highlight.
 *
 * Rendered once per *line-level* box rather than once per card: each plate
 * is positioned against its own parent's box, so putting one inside each
 * shrink-to-fit line gives every line a plate hugging that line's real
 * width. A single card-level plate would instead span the full grid column,
 * which is usually far wider than the text.
 *
 * `inset` is a literal CSS `inset` shorthand — "0" (the default, used by
 * the category/role/date lines) makes the plate exactly its parent's box,
 * while negative values push individual edges outward past it. The title
 * passes TITLE_PLATE_INSET: its text is `text-box-trim`med to cap-height/
 * baseline, so descenders ("y" in "Dots by...") hang below that box and
 * would otherwise sit on the hover-preview image with nothing behind them.
 *
 * This exists because the Tx list no longer renders through
 * mix-blend-exclusion (see home-view.tsx). White-on-blend used to keep the
 * text legible over whatever hover-preview image sat behind it; plain black
 * text needs something opaque behind it to do the same job.
 *
 * Every visual property is an inline style driven by an explicit `active`
 * boolean, deliberately: two earlier versions drove the wipe through CSS
 * instead — first Tailwind's `scale-x-0`/`scale-x-100` utilities (which
 * compile to the `scale` longhand behind `--tw-scale-*` custom properties
 * and an `@property` registration), then a hand-written `.text-plate` /
 * `.group:hover` rule pair in globals.css. The first left every row plated
 * on real iOS Safari (the `scale-x-0` half never took); the second showed no
 * plate at all. Rather than keep guessing at which layer was dropping the
 * rule, this version has nothing to drop: an inline `transform` on the
 * element itself is the highest-precedence, least-indirection option there
 * is, and `active` is a plain React value both trees already compute.
 */
function HoverPlate({
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

/**
 * One project entry. Triggers the moment the title area itself scrolls into
 * the actual viewport (IntersectionObserver on the title span with no
 * rootMargin shrinking — a negative rootMargin here previously delayed the
 * trigger well past the title actually being visible). Once triggered, the
 * whole block slides up + fades in together, while the title text itself
 * reveals one character at a time, each flickering briefly before settling
 * (see scramble-text.tsx, modeled on thelookback (tlb.betteroff.studio)'s
 * loading-screen text) — the underline itself is always static, no separate
 * entrance animation. Columns in the same row stagger left-to-right so a
 * row reveals "one by one" rather than all at once.
 */
export function ProjectCard({
  project,
  column,
  lastTitleRef,
  onTitleRef,
  onHoverTitle,
  onHoverEnd,
  isDimmed,
}: ProjectCardProps) {
  const router = useRouter();
  const cardRef = useRef<HTMLLIElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  /** 確定後のタイトルの高さを測る影（下の JSX の doc comment 参照）。 */
  const titleMeasureRef = useRef<HTMLSpanElement>(null);
  const [titleMinHeight, setTitleMinHeight] = useState<number>();
  const [revealed, setRevealed] = useState(false);
  /** 初回表示ぶんか（lib/entrance.ts の pageEnteredAt 参照）。 */
  const [initialReveal, setInitialReveal] = useState(false);
  // Local hover state purely for the HoverPlate below — the existing
  // onHoverTitle/onHoverEnd props report hover *up* to app/page.tsx for the
  // background preview, but nothing carried it back down to this card's own
  // markup.
  const [hovered, setHovered] = useState(false);
  const href = `/projects/${slugify(project.title)}`;

  // Note on site-intro.tsx's "andmade:intro-complete" replay: cards already
  // sitting in the viewport trigger this observer (and so `revealed`) the
  // instant they mount — including while the intro's full-screen splash
  // sits on top of this page, rendering it silently underneath. Rather than
  // trying to fake a hidden-then-shown replay here (toggling `revealed`
  // false then true again), which fights this element's own column-stagger
  // `transitionDelay` and silently no-ops (the delay means the "hidden"
  // step's target value never actually paints before the very next frame
  // flips it back), project-list.tsx instead forces a full remount of every
  // card on that event (via a bumped `key`) — this observer then simply
  // re-runs from scratch on the fresh mount, replaying the reveal exactly
  // like a first-time one.
  //
  // (A previous attempt at also skipping this reveal on a return-visit
  // remount, via a module-level "already revealed once this session" flag,
  // was reverted — per bug report "スクランブルテキストがなくなった。一瞬
  // ダミーの一覧が表示されて、それが消えてからcmsに登録された一覧が表示さ
  // れてるっぽい": removing the scramble animation on those remounts
  // unmasked a separate, pre-existing placeholder/real-data swap during
  // load, which the animation had been visually hiding rather than causing.
  // Reverting restores the original always-scrambles-in behavior; the
  // "return from a detail page" flicker this was meant to fix is still
  // open.)
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInitialReveal(isInitialEntrance());
        setRevealed(true);
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 影の高さ＝確定後のタイトルの高さ。列幅の変化（リサイズ）と、Adobe Fonts
  // が入れ替わって折り返しが変わる瞬間の両方で測り直す。
  useEffect(() => {
    const el = titleMeasureRef.current;
    if (!el) return;
    const update = () => setTitleMinHeight(el.offsetHeight);
    const frame = requestAnimationFrame(update);
    const observer = new ResizeObserver(update);
    observer.observe(el);
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) update();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [project.title]);

  const baseDelay = (initialReveal ? LIST_ENTRANCE_DELAY_MS : 0) + column * COLUMN_STAGGER_MS;

  /**
   * スクランブルの開始も baseDelay ぶん待つ。
   *
   * カード自体のスライド＋フェードは列ごとに遅らせている（baseDelay）のに、
   * ScrambleText だけは `revealed` で即スタートしていた。右の列ほど待ち時間が
   * 長いので、姿を現す頃にはスクランブルが終わっていて、ただのフェードインに
   * 見えていた。開始を揃えれば、どの列も「出てきながら組み上がる」になる。
   */
  const [scrambleActive, setScrambleActive] = useState(false);
  useEffect(() => {
    if (!revealed) return;
    // 0ms でも setTimeout 経由（effect 本体で直接 setState しない）。
    const timer = setTimeout(() => setScrambleActive(true), baseDelay);
    return () => clearTimeout(timer);
  }, [revealed, baseDelay]);

  return (
    // Slide-in (translate-y) restored — briefly removed per "Txのスライドイ
    // ンは無しで", then reverted right back per a direct follow-up
    // ("やっぱりTxのスライドイン戻して").
    <li
      ref={cardRef}
      // `transition-[translate,opacity]`, not `transition-all`: this element
      // carries a per-column `transitionDelay` (baseDelay below), and `all`
      // made that delay apply to *every* animatable property it inherits —
      // including the Konami easter egg's page-wide `text-shadow`, which is
      // rewritten every frame while scrolling. Columns 1 and 2 (120ms/240ms)
      // had their transition restarted before the delay ever elapsed, so the
      // glitch never rendered there at all while column 0 (0ms) showed it
      // normally. Naming the two properties this element actually animates
      // leaves inherited values to apply instantly, as they should.
      //
      // transform → translate: Tailwind v4 の translate-y-* は transform では
      // なく CSS の `translate` プロパティを出力する（.translate-y-\[24px\]{
      // translate:var(--tw-translate-x) var(--tw-translate-y)}）。transform を
      // 並べていた間はスライドだけトランジションが乗らず、24px ぶん瞬間移動して
      // いた（フェードは効いていたので気づきにくい。"トップのtxt時の一覧表示時の
      // スライドインが無くなってる" として報告）。同じ理由で
      // project-view-toggle.tsx / recent-news.tsx / reveal-on-mount.tsx も修正。
      className={`transition-[translate,opacity] duration-500 ease-out ${
        revealed ? "translate-y-0 opacity-100" : "translate-y-[24px] opacity-0"
      }`}
      style={{ transitionDelay: `${baseDelay}ms` }}
    >
      {/* TODO: microCMS-backed project detail pages don't exist yet at /projects/[slug] — this will 404 until they do.
          A plain clickable div instead of next/link's <a> — Chrome (and other
          browsers) shows a real <a href>'s target URL in the bottom-left
          status bar on hover, which collided with the bottom-left hover title
          (components/hovered-project-title.tsx). Browsers don't allow that
          status-bar preview to be suppressed for actual links (a deliberate
          anti-phishing protection), so this trades away native link semantics
          (open-in-new-tab, copy-link, crawlable href) to avoid it instead. */}
      <div
        ref={lastTitleRef}
        role="link"
        tabIndex={0}
        onClick={() => router.push(href)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            router.push(href);
          }
        }}
        onMouseEnter={() => {
          setHovered(true);
          onHoverTitle?.();
        }}
        onMouseLeave={() => {
          setHovered(false);
          onHoverEnd?.();
        }}
        // gap 14px → 12px, then a further 1px → 11px — per two direct
        // follow-ups tightening the space below the underlined title row
        // ("トップページ一覧の下線見出しの下マージンを2px詰めて", then
        // "さらに1px詰めて").
        className={`group flex cursor-pointer flex-col items-start gap-[calc(11px*var(--scale))] transition-opacity duration-300 ease-out ${
          isDimmed ? "opacity-25" : "opacity-100"
        }`}
      >
        {/* タイトルの高さをあらかじめ確保する箱。

            スクランブル中は順番待ちの文字が空欄なので文字列が短く、長い
            タイトルだと折り返しが1行 → 確定時に2行になり、その瞬間に高さが
            跳ねていた（＝上下のガタツキ）。確定後の高さを先に測って
            min-height にしておけば、見た目（空欄から順に埋まる）を一切変えずに
            ガタツキだけ消える。
            
            w-full — 高さを測る影は「列の幅で折り返したときの高さ」でなければ
            意味がない。カードは flex の items-start（＝中身の幅に縮む）なので、
            この箱だけ明示的に列いっぱいに広げる。下線を引く span 自体は
            従来どおり中身の幅のままなので、下線がテキストと一緒に伸びる
            挙動は変わらない。 */}
        <span className="relative block w-full" style={{ minHeight: titleMinHeight }}>
          <span
            ref={titleMeasureRef}
            aria-hidden
            className="invisible absolute inset-x-0 top-0 text-[length:calc(14px*var(--scale))] leading-[1.5] font-medium [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
          >
            {project.title}
          </span>
          <span
            ref={(el) => {
              titleRef.current = el;
              onTitleRef?.(el);
            }}
            // block w-fit。この span は元々
            // カード（flex 列）の直接の子で、フレックスアイテムは
            // ブロック化されるので text-box-trim が効いていた。上の箱で
            // 包んだ結果ふつうのインラインに戻り、trim が効かなくなって
            // ボックスが行ボックス（1.5em）の高さになっていた — 下線は
            // その下端基準なので離れ、下マージンも広がる。block で
            // ブロック化して trim を戻し、w-fit で幅は中身なりのまま
            // （＝下線がテキストと同じ長さ）にする。
            className="underline-sweep block w-fit text-[length:calc(14px*var(--scale))] leading-[1.5] font-medium [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] text-black"
          >
            <HoverPlate active={hovered} inset={TITLE_PLATE_INSET} />
            {/* `relative` so the text paints above the plate behind it — the
               plate is absolutely positioned, which would otherwise stack it
               over this static inline content. */}
            <span className="relative">
              <ScrambleText text={project.title} active={scrambleActive} />
            </span>
          </span>
        </span>
        <div
          className={`flex flex-col items-start text-[length:calc(12px*var(--scale))] text-black/50 transition-opacity duration-700 ease-out ${
            revealed ? "opacity-100" : "opacity-0"
          }`}
          style={{ transitionDelay: `${baseDelay + META_FADE_DELAY_MS}ms` }}
        >
          {/* All three lines still share this one <p> and its single
             `leading-[1.25]`, so the spacing between them stays exactly what
             it always was — the date in particular keeps matching
             category/role's own line spacing by construction rather than via
             a separately-tuned `gap`. What changed is only that each line is
             now its own `block w-fit` span instead of being separated by
             <br>: that gives each one a real box to hang its own HoverPlate
             off, shrink-wrapped to that line's own text width, so the plates
             step in and out with the text rather than all sharing the widest
             line's width. `block` spans inside a block container stack with
             no extra spacing of their own, so this is layout-identical to
             the <br> version it replaces.

             The date keeps its own font/tracking overrides, now on the same
             span that carries its plate rather than a nested one. */}
          <p className="font-normal leading-[1.25] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
            <span className="relative block w-fit">
              <HoverPlate active={hovered} inset={META_PLATE_INSET} delayMs={PLATE_META_DELAY_MS} />
              <span className="relative">{project.category}</span>
            </span>
            <span className="relative block w-fit">
              <HoverPlate active={hovered} inset={META_PLATE_INSET} delayMs={PLATE_META_DELAY_MS} />
              <span className="relative">{project.role}</span>
            </span>
            <span className="relative block w-fit font-(family-name:--font-courier) tracking-[calc(-0.6px*var(--scale))]">
              <HoverPlate active={hovered} inset={META_PLATE_INSET} delayMs={PLATE_META_DELAY_MS} />
              <span className="relative">{project.date}</span>
            </span>
          </p>
        </div>
      </div>
    </li>
  );
}
