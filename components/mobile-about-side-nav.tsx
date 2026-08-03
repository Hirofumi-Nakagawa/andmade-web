"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useLenis } from "lenis/react";
import { VerticalLabel } from "@/components/vertical-label";
import { ABOUT_NAV_ITEMS, spSectionId, type AboutSectionId } from "@/lib/about-content";
import { useFadeIn } from "@/components/use-fade-in";

/**
 * SP counterpart to components/about-side-nav.tsx — Figma node 1067:4
 * ("sp_about"), "Frame 82": a rotated (90°), comma-separated
 * Vision/Approach/Services/Awards/Media/Outline scroll-spy column running
 * down the page's own left margin. Same scroll-spy *thinking* as the PC
 * version (an IntersectionObserver watching each MobileAboutSection's own
 * `id`, current section at 50% opacity) — per direct follow-up ("基本的に
 * PCと同じ考え方で実装して") — ported wholesale rather than re-derived,
 * just rendering through VerticalLabel (see that file's own doc comment)
 * for the 90° rotation instead of PC's plain upright flex-col, and
 * comma-separated the way mobile-menu.tsx's own NAV_ITEMS list already
 * reads (matching Figma's own literal "," text nodes between each label,
 * e.g. 1067:534/673/535/674...) rather than PC's plain vertical stack with
 * no separators.
 *
 * `sticky top-[30px]` — same resting offset as mobile-home.tsx's own Tx/Th
 * rail (that file's own RAIL_REST_OFFSET_PX/`top-[30px]` history), wrapped
 * in the same `absolute inset-0` containing-block trick PC's AboutSideNav
 * and the Tx/Th rail both already use, so it has room to actually stick
 * across the whole section-list scroll range without being pushed down by
 * its own sticky sibling's height.
 *
 * Tapping a label scrolls to its section (per direct follow-up, "About左ナ
 * ビをPC同様、タップで各エリアにスクロールするようにして") via an explicit
 * `lenis.scrollTo(target)` rather than relying on the plain `href="#id"`
 * anchor default — PC's own AboutSideNav gets away with a bare anchor
 * because Lenis's own `anchors: true` option (see smooth-scroll.tsx)
 * intercepts and smooth-scrolls those globally, but this link sits inside a
 * VerticalLabel-rotated block (see that component's own transform), and a
 * rotated ancestor is exactly the kind of real-device-only tap-target
 * quirk this codebase has already run into more than once (mobile-menu.tsx's
 * own touchAction fixes) — calling scrollTo explicitly on click sidesteps
 * depending on the native anchor default (and whatever hit-testing/touch
 * delay it's subject to under a transform) ever firing correctly at all.
 * `touchAction: manipulation` on each link for the same reason mobile-menu.tsx
 * and mobile-project-list.tsx already need it on real touch hardware.
 *
 * Also focuses whichever link is currently active — per direct follow-up
 * ("スクロールで各セクションにきたら、ナビをフォーカスさせて") — so the
 * scroll-spy state a sighted user already sees via the 50%-opacity dimming
 * (`isCurrent` below) is also exposed to keyboard/assistive-tech users as
 * real DOM focus, not just a visual-only cue. `{ preventScroll: true }` is
 * required here — a plain `.focus()` call scrolls its target into view by
 * default, which for a `position: sticky` element already on screen would
 * otherwise fight the very user-driven scroll that's *causing* this to run
 * in the first place.
 *
 * Skips the very first activeId (the initial "nothing selected" state,
 * before any real scrolling has happened) — per direct follow-up reporting the nav
 * "completely unresponsive" to taps right after this was added: on a real
 * touch device, a `.focus()` call landing on a link at the exact moment a
 * tap/scroll gesture is starting is a plausible way to disrupt that
 * gesture's own click resolution (focus changing out from under an
 * in-progress touch sequence is a known class of real-device-only
 * interaction bug elsewhere in this codebase too — see mobile-menu.tsx's own
 * touchAction history). Only calling this once `activeId` has genuinely
 * *changed* from that initial value (i.e. only in response to real,
 * settled scroll-spy activity, never on mount) removes the one scenario
 * most likely to race an incoming tap: page load itself.
 *
 * Every `document.getElementById`/`href` below reads through `spSectionId`
 * (see that function's own doc comment in lib/about-content.ts), not
 * `ABOUT_NAV_ITEMS`' own bare ids directly — the actual root cause of both
 * "タップしても正しいエリアまでスクロールしない" and "各エリアに来てもナビ
 * が50%透過にならない": PC's AboutSection and this file's own
 * MobileAboutSection both render simultaneously in the DOM (see
 * app/about/page.tsx — split by a CSS-only `hidden lg:contents`/`lg:hidden`
 * toggle, not real mount/unmount), so a bare id here always resolved to
 * PC's own element instead (first in DOM order, and — being `display:none`
 * on a phone — with a zero-size, zero-position layout box: an
 * IntersectionObserver on it can never report `isIntersecting`, and
 * scrolling to its `getBoundingClientRect()` just lands at (0,0)).
 *
 * `lenis?.resize()` immediately before `scrollTo` — belt-and-suspenders
 * alongside the id fix above: lenis-route-resize.tsx already re-measures
 * Lenis's own scroll dimensions once, one rAF after every route change, but
 * this page's own content (VerticalLabel's async ResizeObserver-driven
 * measurements, section reveal-on-scroll mounts, etc.) can still settle its
 * true final height after that single measurement — a stale, under-measured
 * `limit` would silently clamp `scrollTo` short of a deep target like
 * Outline. Forcing a fresh measurement right at the moment of the tap costs
 * nothing and removes that whole class of doubt.
 *
 * `handleNavClick`'s `offset` calculation — per direct follow-up reporting
 * the previous approach (numerically matching this file's own `sticky
 * top-[N]` against MobileAboutSection's own `scroll-mt-[N]`, two
 * independently hand-set CSS values) actually got *more* misaligned, not
 * less ("線の上面揃えはまだずれてる。というかさっきよりズレてる"): matching
 * two guessed numbers can't account for whatever VerticalLabel's own
 * rotation geometry (see that component's doc comment) actually renders the
 * decorative line's real on-screen position as. Rather than guess a third
 * number, this measures `lineRef`'s real `getBoundingClientRect()` against
 * `stickyRef`'s (their difference is the line's fixed offset *within* its
 * own sticky wrapper — constant regardless of whether the wrapper is
 * currently stuck or still in its natural flow position, since that's a
 * plain relative measurement between two elements sharing the same local
 * layout), adds `STICKY_TOP_PX` (the resting offset once actually stuck) to
 * get the line's true resting Y, then solves Lenis's own `scrollTo(target,
 * {offset})` formula backwards (see lenis.mjs: final on-screen Y of the
 * target = its own `scroll-margin-top` minus `offset`) for the `offset`
 * that lands the target's own top exactly there. Self-correcting against
 * the real DOM instead of two numbers that have to be kept in sync by hand.
 */
const STICKY_TOP_PX = 30;

export function MobileAboutSideNav() {
  const lenis = useLenis();
  // 初期値は空文字＝どれも current にしない — per direct follow-up
  // ("SPの左ナビのVisionが最初からcurrentになってるので、はじめは非選択状態に
  // しておいて")。以前は Vision を決め打ちで入れていたが、FV（3行コピー＋
  // リード文）が入ったことで、ページを開いた時点ではまだ Vision の本文まで
  // スクロールしていない。current は下の IntersectionObserver が実際に
  // セクションを捉えてから初めて付く。
  const [activeId, setActiveId] = useState<string>("");
  const linkRefs = useRef<Partial<Record<string, HTMLAnchorElement>>>({});
  const hasActiveIdChangedRef = useRef(false);
  const stickyRef = useRef<HTMLDivElement>(null);
  // 表示時のフェードイン — per direct follow-up
  // ("SPのaboutの左ナビはフェードインをつける")。PC の AboutSideNav が
  // 既に持っている登場アニメの SP 版。sticky を包む外側の
  // `absolute inset-0` ではなく sticky 要素自身に掛けている —— 外側は
  // sticky が張り付くための領域なので、そこを触ると追従が壊れる。
  const shown = useFadeIn();
  const lineRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const sections = ABOUT_NAV_ITEMS.map((item) => document.getElementById(spSectionId(item.id))).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (sections.length === 0) return;

    const visible = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        // 帯（rootMargin で作った画面中央の判定域）にどのセクションも
        // 入っていなければ current を外す — per direct follow-up ("一度
        // currentになってからページ上まで戻ってもvisionがcurrentになった
        // ままなので、非選択にするようにして")。以前は `if (firstVisible)`
        // で、見つからないときは直前の値を保持していたため、FV まで
        // スクロールを戻しても Vision が点いたままだった。
        // ページ最下部（フッター付近）で Outline が帯から外れたときも
        // 同じく非選択になる。「今いるセクション」を示す表示なので、
        // どのセクションにもいない状態では何も点かないほうが一貫する。
        const firstVisible = ABOUT_NAV_ITEMS.find((item) => visible.has(spSectionId(item.id)));
        setActiveId(firstVisible ? firstVisible.id : "");
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 },
    );

    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!hasActiveIdChangedRef.current) {
      hasActiveIdChangedRef.current = true;
      return;
    }
    linkRefs.current[activeId]?.focus({ preventScroll: true });
  }, [activeId]);

  function handleNavClick(id: AboutSectionId) {
    return (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      const target = document.getElementById(spSectionId(id));
      if (!target) return;
      if (lenis) {
        lenis.resize();
        const sticky = stickyRef.current;
        const line = lineRef.current;
        // Real, measured resting Y of the decorative line — see this file's
        // own top-level doc comment ("handleNavClick's offset calculation").
        const lineRestingY =
          sticky && line
            ? STICKY_TOP_PX + (line.getBoundingClientRect().top - sticky.getBoundingClientRect().top)
            : STICKY_TOP_PX;
        const scrollMarginTop = Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
        lenis.scrollTo(target, { offset: scrollMarginTop - lineRestingY });
      } else {
        target.scrollIntoView({ behavior: "smooth" });
      }
    };
  }

  return (
    <div className="absolute inset-0">
      <div
        ref={stickyRef}
        className="sticky"
        style={{
          top: STICKY_TOP_PX,
          willChange: "transform",
          opacity: shown ? 1 : 0,
          transition: "opacity 500ms ease-out",
        }}
      >
        <VerticalLabel>
          {/* Pre-rotation flex-ROW (not flex-col) — per direct follow-up
              with a reference screenshot ("AboutのVision上の線は添付のよう
              に配置して"): VerticalLabel's own rotation maps this content's
              *pre-rotation X axis* (left-to-right) onto the *final,
              post-rotation Y axis* (top-to-bottom reading order) — see that
              component's own doc comment on the transform geometry — while
              its *pre-rotation Y axis* maps onto the final X axis (the
              rotated column's own thickness/crosswise direction). A
              flex-col here (an earlier version, stacking the line above the
              label row along pre-Y) put the two side by side in the final
              *thickness* direction instead of one-before-the-other in the
              final *reading* direction — both ended up landing at roughly
              the same final Y (near the very top, since both started at
              pre-X 0), overlapping "Vision" rather than sitting cleanly
              above it. A flex-row instead places the line before the label
              row along pre-X, landing it at a smaller final-Y than "Vision"
              — genuinely first in the final top-to-bottom reading order,
              matching PC's own AboutSideNav (`<span aria-hidden
              className="mb-[15px] h-px w-[10px] bg-black" />`) conceptually,
              just built along the axis this rotated version actually needs. */}
          <div className="flex items-center">
            {/* h-[10px] w-px (a short *vertical* line pre-rotation) — not
                PC's own w-[10px] h-px horizontal one — for the same axis-swap
                reason as the flex-row above: pre-Y maps to the final
                *thickness* (crosswise) direction, so a mark that should read
                as a short crosswise tick in the final view (PC's own mark is
                horizontal, crosswise to *its* vertical label stack) needs its
                extent along pre-Y here instead. mr- (not mb-) since this is
                now the first child of a flex-row. */}
            <span ref={lineRef} aria-hidden className="mr-[15px] h-[10px] w-px bg-black" />
            <div className="flex items-center gap-[5px] text-[12px] leading-[1.2] font-medium text-black">
              {ABOUT_NAV_ITEMS.map((item, i) => {
                const isCurrent = item.id === activeId;
                return (
                  <Fragment key={item.id}>
                    <a
                      ref={(el) => {
                        linkRefs.current[item.id] = el ?? undefined;
                      }}
                      href={`#${spSectionId(item.id)}`}
                      onClick={handleNavClick(item.id)}
                      aria-current={isCurrent ? "true" : undefined}
                      // outline-none — the browser's own default focus ring
                      // (a blue box) was showing on whichever link this
                      // component's own scroll-spy `.focus()` call above just
                      // landed on — per direct follow-up ("選択時に青枠が付
                      // いてる"). The 50%-opacity `isCurrent` treatment right
                      // below is already this design's own visual indicator
                      // for "current section", so a second, browser-default
                      // outline on top of it read as an unstyled leftover
                      // rather than an intentional cue. focus-visible:outline
                      // keeps a plain outline specifically for genuine
                      // keyboard Tab navigation (the one case `:focus-visible`
                      // still matches even with the base `:focus` outline
                      // suppressed) — so removing the default doesn't remove
                      // real keyboard-accessibility feedback, just the
                      // programmatic-focus/tap case this scroll-spy triggers.
                      className={`outline-none transition-colors [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-black/50 ${
                        isCurrent ? "text-black/50" : "text-black"
                      }`}
                      style={{ touchAction: "manipulation" }}
                    >
                      {item.label}
                    </a>
                    {i < ABOUT_NAV_ITEMS.length - 1 && (
                      <span className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">,</span>
                    )}
                  </Fragment>
                );
              })}
            </div>
          </div>
        </VerticalLabel>
      </div>
    </div>
  );
}
