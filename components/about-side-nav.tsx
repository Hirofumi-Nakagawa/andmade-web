"use client";

import { useCallback, useEffect, useState } from "react";
import { useLenis } from "lenis/react";
import { ABOUT_NAV_ITEMS } from "@/lib/about-content";

/** This nav's own `sticky top-[N]` resting offset, and the value each
 *  section's own `scroll-mt-[N]` is set to (about-section.tsx) — the two have
 *  to agree for a jumped-to section's top border to line up with this nav's
 *  own top line. Kept here as one constant that handleNavClick below solves
 *  against, rather than as two independently hand-set CSS numbers. */
const STICKY_TOP_PX = 24;

/** An element's top in *document* coordinates, walking the offsetParent
 *  chain rather than reading getBoundingClientRect().
 *
 *  This distinction is the whole fix — see handleNavClick. `offsetTop` is a
 *  pure layout value, unaffected by CSS transforms; `getBoundingClientRect()`
 *  reports the *transformed* box. AboutSection renders unrevealed sections
 *  with `translate-y-[24px]` (its scroll-triggered entrance), so a rect-based
 *  measurement of a section further down the page is 24px lower than where
 *  that section will actually come to rest once it reveals. */
function documentTop(el: HTMLElement): number {
  let y = 0;
  let node: HTMLElement | null = el;
  while (node) {
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return y;
}

/**
 * Left-edge scroll-spy nav for the About page (Figma node 520:1740,
 * "Frame 82") — Vision/Approach/Services/Awards/Media/Outline. Positioned
 * exactly like project-view-toggle.tsx's Txt/Img switch: an `absolute
 * inset-0` wrapper (so it takes no space in normal flow but gives the
 * `sticky` child room to stick for the whole scroll range) with the nav
 * itself `sticky top-[24px]`, offset from the grid's left margin via
 * `ml-[calc(24px*var(--grid-scale))]` — same pattern, same numbers.
 *
 * The current section is indicated the same way SiteHeader marks the
 * current page (`aria-current` → 50% opacity) rather than a moving
 * highlight — the small horizontal line above "Vision" (matching Figma's
 * static "Line 1") stays put; it isn't a per-item active indicator.
 *
 * Fades in on mount (same slide+fade treatment as reveal-on-mount.tsx:
 * translate-y-[24px]+opacity-0 → translate-y-0+opacity-100, 500ms ease-out)
 * — applied directly to the `nav` itself rather than via a RevealOnMount
 * wrapper div, since an extra wrapper here (of only its own content height)
 * would replace the `absolute inset-0` div as `nav`'s sticky "containing
 * block", breaking the room it needs to keep sticking across the full page
 * scroll (see this file's own top comment).
 */
export function AboutSideNav() {
  // 初期値は空文字＝どれも current にしない — per direct follow-up（SP と
  // 同じ指摘、"pcも同様に修正して"）。FV（3行コピー＋リード文）が入った
  // ことで、ページを開いた時点ではまだ Vision の上端がナビの線に届いて
  // いない。updateActive() が実際に判定してから初めて付く。
  const [activeId, setActiveId] = useState<string>("");
  const [revealed, setRevealed] = useState(false);
  const lenis = useLenis();

  /**
   * Scrolls to a section explicitly instead of letting the bare `href="#id"`
   * anchor do it — per direct follow-up ("aboutページを開いてすぐ左ナビを
   * 押したとき、左ナビと上面が揃わない。以前にも同じ症状があった").
   *
   * Root cause: Lenis's own `anchors: true` (smooth-scroll.tsx) resolves an
   * anchor target through `getBoundingClientRect()`, which reports the
   * *transformed* box. Every AboutSection that hasn't scrolled into view yet
   * is sitting at `translate-y-[24px]` (its entrance state, see
   * about-section.tsx), so a section further down the page measures 24px
   * lower than where it will actually settle. Lenis scrolls to that measured
   * spot, the section then reveals and shifts 24px up, and the result is a
   * section top sitting 24px above this nav's own line — exactly the
   * misalignment reported. It only shows up "開いてすぐ" because once a
   * section has revealed (AboutSection disconnects its observer, so the state
   * is permanent) the transform is gone and the same click lands correctly.
   *
   * documentTop() sidesteps the whole thing by measuring layout position
   * rather than rendered position, so the entrance transform — mid-animation
   * or not — can't affect the result. Subtracting STICKY_TOP_PX lands the
   * section's own top border at this nav's own resting Y.
   *
   * `lenis.resize()` first: this page's content settles its true height after
   * mount (section reveals, the About background canvas), and a stale
   * measurement would let Lenis clamp a deep target like Outline short —
   * the same belt-and-suspenders call mobile-about-side-nav.tsx already makes
   * for its own version of this handler.
   *
   * stopPropagation() + a Lenis-less fallback: both exist so that the buggy
   * path above can never run, not even as a fallback — per direct follow-up
   * reporting the symptom still happening on the *first* click only
   * ("最初にservices以下のボタンを押すと画面上までスクロールした状態で止まる。
   * 2回目以降は左ナビの横線と同じ面で止まる"), which is precisely what
   * Lenis's own anchor handler does to a not-yet-revealed section. Lenis
   * binds that handler on the document, so an un-stopped click still reaches
   * it even after preventDefault(); and an early `return` on a null `lenis`
   * (its context is empty for the first render or two) would hand the click
   * straight back to it. Stopping the event here and computing the same
   * number either way removes both routes.
   */
  const handleNavClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
      const target = document.getElementById(id);
      if (!target) return; // 対象が無いときだけブラウザ既定の挙動に任せる
      event.preventDefault();
      event.stopPropagation();

      const top = Math.max(documentTop(target) - STICKY_TOP_PX, 0);
      if (lenis) {
        lenis.resize();
        lenis.scrollTo(top);
      } else {
        // Lenis がまだ初期化されていない場合でも、着地点の計算は同じ。
        window.scrollTo({ top, behavior: "smooth" });
      }
      // URL のハッシュは意図的に書き換えない — per direct follow-up
      // ("aboutの左ナビをクリックしたとき、urlに#visionとかつかないように
      // して")。preventDefault() でアンカーの既定動作を止めているので、
      // ここで何もしなければ URL は /about のまま。
    },
    [lenis]
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  /**
   * Scroll-spy — per direct follow-up ("左ナビがcurrentになるタイミングは、
   * 各コンテンツと上面が揃った時にして（一番下のoutlineだけはフッターまで
   * スクロールしたらcurrentにする※pc時のみ）").
   *
   * Deliberately *not* an IntersectionObserver band any more (this used to be
   * `rootMargin: "-40% 0px -55% 0px"`, i.e. "whichever section is crossing a
   * thin strip above centre"). That band has no relationship to where a
   * section actually comes to rest when you click the nav, so the highlight
   * changed at a spot the user never sees a section arrive at. The rule is
   * now literally the same one handleNavClick above scrolls to: a section
   * becomes current the moment its own top edge reaches this nav's top line
   * (STICKY_TOP_PX from the viewport top).
   *
   * どのセクションの上端もまだ線に届いていない状態（= FV を見ている
   * ページ最上部）では、どれも current にしない。
   *
   * Outline is excluded from that rule and only becomes current once the
   * footer has scrolled into view — Outline is short enough that its own top
   * often never reaches the line at all on a tall window, which would leave
   * the last nav item permanently unreachable.
   *
   * Reads documentTop() rather than getBoundingClientRect() for the same
   * reason handleNavClick does: unrevealed sections are transformed, and only
   * their layout position is meaningful here.
   */
  const updateActive = useCallback(() => {
    const scrollY = window.scrollY;

    // Outline（最後の項目）はフッター基準。フッターの上端が画面内に入ったら
    // current にする。
    const last = ABOUT_NAV_ITEMS[ABOUT_NAV_ITEMS.length - 1];
    const footer = document.querySelector<HTMLElement>("[data-about-footer]");
    if (footer && documentTop(footer) <= scrollY + window.innerHeight) {
      setActiveId(last.id);
      return;
    }

    // それ以外は「上端がナビの線に到達した最後のセクション」。+1 は
    // ちょうど揃った位置でのサブピクセル誤差の吸収。
    //
    // 初期値は空文字。以前は ABOUT_NAV_ITEMS[0]（Vision）を入れていたため、
    // Vision の上端がまだ線に届いていないページ最上部でも Vision が
    // current になり、一度スクロールしてから戻っても点いたままだった
    // — per direct follow-up（SP と同じ指摘、"pcも同様に修正して"）。
    let current = "";
    for (const item of ABOUT_NAV_ITEMS.slice(0, -1)) {
      const el = document.getElementById(item.id);
      if (!el) continue;
      if (documentTop(el) - STICKY_TOP_PX <= scrollY + 1) current = item.id;
    }
    setActiveId(current);
  }, []);

  // Lenis のスクロールtickに乗せる（別途 scroll リスナを張ると Lenis の
  // 仮想スクロールと1フレームずれる）。
  useLenis(updateActive);

  // 初回とリサイズ時の同期。初回分を rAF に逃がしているのは
  // react-hooks/set-state-in-effect 対策 — effect の本体で直接 setState
  // すると連鎖レンダリングになるため（このコードベースの他の同種の箇所と
  // 同じ回避方法）。リロード位置がページ途中だった場合に、正しい項目から
  // 始まるようにするための1回。
  useEffect(() => {
    const frame = requestAnimationFrame(updateActive);
    window.addEventListener("resize", updateActive);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateActive);
    };
  }, [updateActive]);

  return (
    <div className="absolute inset-0">
      <nav
        aria-label="About sections"
        // top-[24px] は STICKY_TOP_PX と同じ値であること（handleNavClick が
        // この位置に着地させる計算をしている）。
        className={`sticky top-[24px] ml-[calc(24px*var(--grid-scale))] flex flex-col items-start whitespace-nowrap text-[length:calc(12px*var(--scale))] leading-[1.2] font-medium text-black transition-all duration-500 ease-out ${
          revealed ? "translate-y-0 opacity-100" : "translate-y-[24px] opacity-0"
        }`}
        data-name="about-side-nav"
      >
        <span aria-hidden className="mb-[calc(15px*var(--scale))] h-px w-[calc(10px*var(--scale))] bg-black" />
        <div className="flex flex-col items-start gap-[calc(7px*var(--scale))]">
          {ABOUT_NAV_ITEMS.map((item) => {
            const isCurrent = item.id === activeId;
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(event) => handleNavClick(event, item.id)}
                aria-current={isCurrent ? "true" : undefined}
                className={`transition-colors [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${
                  isCurrent ? "text-black/50" : "text-black hover:text-black/50"
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
