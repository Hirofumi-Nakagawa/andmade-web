"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { introDefinitelyWontShow, willIntroShow } from "@/components/site-intro";
import type { NewsItem } from "@/lib/news";

/**
 * Top page's FV-right "recent news" list (Figma node 1090:70, "news") — per
 * direct request ("トップのFV右側に最近のお知らせを追加したいので、下記み
 * たいに縦向き配置で情報を入れて（管理画面で入力できるようにする。最大2件。
 * 入力が無い場合は非表示。2件以上ある場合は最新2件だけ表示）画面固定には
 * しない"). Content is entirely microCMS-driven (see lib/news.ts's own doc
 * comment for the expected "news" endpoint shape) — read at build time in
 * app/page.tsx and handed down as the `items` prop. (This used to fetch
 * /api/news client-side after mount; that Route Handler can't exist in a
 * static export — see next.config.ts's own `output: "export"` comment — and
 * threading the data down also removes the brief empty-then-populated flash
 * the fetch caused.) Renders
 * nothing at all whenever that resolves to an empty array — covers both
 * "microCMS isn't configured yet" (see lib/news.ts's own PLACEHOLDER_NEWS,
 * shown until then) and "no news entries exist yet" in one codepath,
 * satisfying "入力が無い場合は非表示" with no separate flag.
 *
 * "縦向き配置" (vertical layout) — a plain horizontal block (Courier Prime
 * date + Akzidenz Grotesk Next text stacked per entry, both entries stacked
 * again with their own gap) rotated 90° clockwise as a single unit, exactly
 * matching Figma's own `rotate-90` on this node. A `transform: rotate(90deg)`
 * doesn't reflow layout — the rotated element still occupies its own
 * *pre-rotation* box in the flow, and rotating around that box's own center
 * (the default transform-origin) keeps that exact center point fixed while
 * swapping which extent is "width" and which is "height" visually. So: the
 * outer wrapper below is sized to the *measured* pre-rotation content size
 * with width/height swapped, and centers that (naturally-sized, unrotated-
 * layout) content via `items-center justify-center` — since both share the
 * same center point, the rotated content's true visual footprint always
 * exactly fills the outer wrapper, whatever the real (variable-length) news
 * text actually measures out to.
 *
 * An earlier version used a flat, guessed box size (Figma's own two-entry
 * reference footprint) instead of measuring — close enough to *look*
 * plausible, but wrong enough that the block's real right edge landed
 * noticeably short of the intended margin (reported as "右マージン24pxに
 * しておいて": the actual rendered text was overflowing past the guessed
 * box's own declared edge, which is what --edge-right-inset was supposedly
 * pinned to, so the margin it was *meant* to enforce wasn't actually
 * reaching the visible text at all). Measuring (via ResizeObserver +
 * `offsetWidth`/`offsetHeight`, not `getBoundingClientRect()` — see
 * slot-digits.tsx's own doc comment for why that specifically matters once a
 * `rotate(90deg)` ancestor is involved: `getBoundingClientRect()` reports
 * the box *after* the rotation swaps its rendered width/height, silently
 * corrupting this exact swap-back calculation, while `offsetWidth`/
 * `offsetHeight` ignore transforms entirely) removes that guesswork, so the
 * margin is always exactly right regardless of how long the real text is.
 *
 * Positioned `absolute` within app/page.tsx's own `originRef` (top: 0 —
 * level with ProjectViewToggle's own resting position, i.e. the very top of
 * the FV content below the header) and pinned to the page's literal right
 * margin via `--edge-right-inset` (the same convention CaseCounter/
 * SiteHeader's own "Playing" text use) — deliberately *not* `fixed` (per
 * direct follow-up, "画面固定にはしない") and *not* `sticky` either (unlike
 * ProjectViewToggle's own Tx/Th toggle): this scrolls away with the rest of
 * the FV once the page scrolls past it, rather than staying pinned to the
 * viewport.
 */
type RecentNewsProps = {
  /** The announcements to show — resolved at build time (app/page.tsx's own
   *  getRecentNews()), already capped to the latest 2 by lib/news.ts. */
  items: NewsItem[];
  /** Fades this out (opacity only, no slide) — per direct request ("Th選択
   *  時はお知らせはフェードアウトで非表示にする"). Kept separate from
   *  `revealed` below (which still only ever goes true→that's-it, driving
   *  the one-time slide+fade entrance) rather than folding this into that
   *  same ternary, so toggling Tx/Th back and forth doesn't replay the
   *  translate-y slide on every toggle — only opacity should animate here. */
  hidden?: boolean;
};

export function RecentNews({ items, hidden = false }: RecentNewsProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  // Pre-rotation content size, measured live — null until the first
  // measurement resolves, during which the wrapper stays invisible (see
  // `visibility` below) rather than flashing at some wrong guessed size
  // first.
  const [contentSize, setContentSize] = useState<{ width: number; height: number } | null>(null);

  // Slide+fade entrance — per direct follow-up ("PC,SPともにお知らせも下から
  // スライド+フェードインで表示"), matching the exact same treatment
  // ProjectViewToggle's own Tx/Th toggle already has right alongside this
  // element (translate-y-[24px]+opacity-0 → translate-y-0+opacity-100, 500ms
  // ease-out) — and mobile-recent-news.tsx's own SP counterpart, which
  // already had this (tied to mobile-home.tsx's railRevealed, since that
  // element deliberately reveals in sync with the Tx/Th rail it sits next
  // to). This one has no equivalent sibling timer to sync with, and — unlike
  // ProjectViewToggle — depends on an async fetch (/api/news) before there's
  // anything to reveal at all, so `revealed` is deferred until `contentSize`
  // itself resolves (one rAF after, so the still-hidden state gets a chance
  // to actually paint first) rather than a flat mount-relative timer: a
  // timer alone risks flipping to "revealed" before the fetch/measurement
  // even finishes, which would have the fade/slide already fully "used up"
  // invisibly by the time this actually becomes visible, reading as an
  // instant pop-in rather than a genuine slide+fade.
  const [revealed, setRevealed] = useState(false);
  // introReady — per direct follow-up ("pcのトップのお知らせもスライドイン
  // +フェードインで表示させて"): same `introDefinitelyWontShow()`/
  // `willIntroShow()`/"andmade:intro-complete" pairing case-counter.tsx's own
  // `revealed` state just added (see that component's own doc comment for
  // the full reasoning). Without this, `revealed` below could already flip
  // true — and this whole slide+fade transition already finish — silently
  // *behind* site-intro.tsx's still-opaque splash on a fresh page load,
  // reading as an instant pop-in with no visible entrance once the splash
  // actually disappears, since there'd be nothing left of the animation to
  // see by then.
  const pathname = usePathname();
  const [introReady, setIntroReady] = useState(() => introDefinitelyWontShow());
  useEffect(() => {
    if (!willIntroShow(pathname)) return;

    function handleIntroComplete() {
      setIntroReady(true);
    }
    window.addEventListener("andmade:intro-complete", handleIntroComplete, { once: true });
    return () => window.removeEventListener("andmade:intro-complete", handleIntroComplete);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately mount-only: `pathname` is intentionally only read at its initial value, matching site-header.tsx's own identical convention.
  }, []);

  useEffect(() => {
    if (!contentSize || !introReady) return;
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, [contentSize, introReady]);

  // The ResizeObserver callback defers its own setContentSize to the next
  // animation frame rather than calling it synchronously — per direct
  // follow-up reporting a runtime error on both PC and SP ("PCでもSPでもエ
  // ラーが出てる"): the PC and SP trees are always mounted together (CSS-only
  // lg:hidden split, not conditional rendering — see mobile-home.tsx's own
  // doc comment), and SP's own rail (mobile-home.tsx's VerticalLabel ×3 +
  // MobileRecentNews) added several more ResizeObservers alongside this
  // one; enough synchronous observer→setState cycles landing in the same
  // frame is exactly what trips the browser's "ResizeObserver loop completed
  // with undelivered notifications" error, which Next.js's dev overlay shows
  // as a full-screen runtime error regardless of which tree is visible.
  // Deferring the state update by one frame breaks that synchronous loop.
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    let frame: number | null = null;
    function update() {
      if (!el) return;
      setContentSize({ width: el.offsetWidth, height: el.offsetHeight });
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
  }, [items]);

  if (items.length === 0) return null;

  return (
    // `--edge-right-inset` (see globals.css's own doc comment on it) is only
    // correct when read inside a box shaped exactly like SiteHeader's own
    // `<header>` — starting at the fluid `ml-[calc(198px*var(--grid-scale))]`
    // margin and exactly `--content-width-fluid` wide — since its own value
    // is precomputed assuming that specific box's right edge, not just "the
    // nearest positioned ancestor, whatever width that happens to be." This
    // wrapper exists purely to recreate that exact box (absolute + zero
    // flow-height, same as ProjectViewToggle's own `absolute inset-0`
    // sibling, so it doesn't push the project grid section down) — without
    // it, `right: var(--edge-right-inset)` was being read against originRef
    // itself instead (a plain full-width `relative` box with no such
    // margin/width of its own), landing flush at the literal browser window
    // edge (0px margin) rather than the intended 24px (reported as "お知ら
    // せの右マージンを24pxだよ" after an initial version already got the
    // rotated content's own *sizing* right but not this).
    <div className="absolute top-0 left-0 ml-[calc(198px*var(--grid-scale))] w-[var(--content-width-fluid)]">
      {/* z-40 — per direct follow-up reporting the news link's hover/click
          not registering ("カーソルが反応しないのはなぜ？何か上にレイヤー
          被ってない？"): this box shares the exact same top-of-originRef
          screen area as both ProjectViewToggle's own `absolute inset-0`
          sibling *and* the project grid section right below it (both
          contribute no flow-height of their own, or are position:static, so
          nothing pushes this news box down — it visually/structurally
          overlaps that same region by design). Without an explicit z-index,
          this and those other positioned elements all sit at the same
          implicit z-index:0 "auto" stacking layer, where paint order then
          falls back to DOM *tree* order rather than sibling order — a
          project title deep inside the grid section (itself `position:
          relative` for its own .underline-sweep) can end up ordered above
          this despite this being a later top-level sibling, silently
          swallowing hover/click here. mobile-recent-news.tsx's own SP
          counterpart already had this same `z-40` from the start; this PC
          version was simply missing it.
      */}
      <div
        className={`absolute z-40 flex items-center justify-center mix-blend-exclusion transition-[translate,opacity] duration-500 ease-out ${
          revealed ? "translate-y-0" : "translate-y-[24px]"
        } ${revealed && !hidden ? "opacity-100" : "opacity-0"}`}
        style={{
          top: 0,
          right: "var(--edge-right-inset)",
          // Swapped — see this component's own doc comment above for why the
          // rotated content's true visual width/height are the pre-rotation
          // content's own height/width respectively.
          width: contentSize ? contentSize.height : undefined,
          height: contentSize ? contentSize.width : undefined,
          visibility: contentSize ? "visible" : "hidden",
        }}
        data-name="news"
      >
        {/* konami-rotated — a marker for the Konami easter egg's own glitch
            trail (globals.css). That trail is a text-shadow, whose offsets
            are in this element's *local* coordinates and so get carried
            around by the rotate(90deg) below: without swapping its axes here,
            the trail would run sideways on screen while every other piece of
            text on the page trails vertically. Purely cosmetic and inert
            unless the egg is running. */}
        <div
          ref={contentRef}
          style={{ transform: "rotate(90deg)" }}
          className="konami-rotated flex-none"
        >
          {/* Inter-item gap 16px → 18px (+2px, between the two news entries)
              — per direct follow-up ("2つのお知らせのマージンを2px増やす"). */}
          <div
            className="flex flex-col whitespace-nowrap text-[length:calc(12px*var(--scale))] leading-[1.5]"
            style={{ gap: "calc(18px*var(--scale))" }}
          >
            {items.map((item) => (
              <div key={item.id} className="flex flex-col items-start" style={{ gap: "calc(8px*var(--scale))" }}>
                <p className="font-(family-name:--font-courier) text-[rgba(255,255,255,0.5)] tracking-[calc(-0.6px*var(--scale))] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
                  {item.date}
                </p>
                {item.url ? (
                  // underline-sweep (app/globals.css) instead of a plain
                  // `underline` class — per direct follow-up ("pcでお知らせの
                  // 下線リンクテキストにホバーしたらアンダーラインスイープ
                  // を付けて"): same hover treatment already used for project
                  // list title links (project-list.tsx), rendering its own
                  // `::after` underline (so the base/no-hover look is
                  // unchanged) that sweeps out-then-in on hover instead of a
                  // static line.
                  //
                  // marginLeft went 0→1→2px right across two follow-ups, then
                  // back to 0 (net) per a third ("左に2px戻して"), alongside a
                  // new marginTop: -1 ("上に1px移動") — both nudges given in
                  // this element's own pre-rotation/local space (this whole
                  // block is rotated 90° via contentRef above — see this
                  // component's own doc comment), matching every other px
                  // adjustment in this codebase, which is always specified
                  // against the *authored*, unrotated layout, not final
                  // on-screen cardinal directions. `marginLeft`/`marginTop`,
                  // not `transform: translate(...)` — see
                  // mobile-recent-news.tsx's own identical body-text nudge for
                  // why: `transform` on a plain *inline* element (this `<a>`'s
                  // default display) combined with `.underline-sweep`'s own
                  // `position: relative` (both independently make this same
                  // inline box a containing block for its `::after`
                  // pseudo-element) is a fragile combination that caused a
                  // real, reported bug there (the underline briefly correct
                  // then shrinking to a partial width on a real device) —
                  // avoided here from the start by using the same
                  // transform-free margin-based fix directly.
                  // --underline-offset: calc(-0.1em - 1px) — per direct
                  // follow-up moving just this link's own underline down 1px
                  // ("お知らせの下線テキストの下線位置を1px下げて"), without
                  // touching .underline-sweep's own shared default (see that
                  // rule's own doc comment in globals.css).
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-normal text-white underline-sweep [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
                    style={{ marginTop: -1, "--underline-offset": "calc(-0.1em - 1px)" } as React.CSSProperties}
                  >
                    {item.text}
                  </a>
                ) : (
                  <p
                    className="font-normal text-white [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
                    style={{ marginTop: -1 }}
                  >
                    {item.text}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
