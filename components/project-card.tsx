"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ScrambleText } from "@/components/scramble-text";
import { slugify, type Project } from "@/lib/projects";

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
  /** True while a *different* card is hovered — dims this one to 60%.
   *  Un-dims at the same transition speed once hovering stops entirely. */
  isDimmed?: boolean;
};

/** Delay step between columns in the same row, so they reveal left-to-right. */
const COLUMN_STAGGER_MS = 120;
/** Extra delay before the category/role/date block starts fading in. */
const META_FADE_DELAY_MS = 150;

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
  const [revealed, setRevealed] = useState(false);
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
        setRevealed(true);
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const baseDelay = column * COLUMN_STAGGER_MS;

  return (
    // Slide-in (translate-y) restored — briefly removed per "Txのスライドイ
    // ンは無しで", then reverted right back per a direct follow-up
    // ("やっぱりTxのスライドイン戻して").
    <li
      ref={cardRef}
      className={`transition-all duration-500 ease-out ${
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
        onMouseEnter={onHoverTitle}
        onMouseLeave={onHoverEnd}
        // gap 14px → 12px, then a further 1px → 11px — per two direct
        // follow-ups tightening the space below the underlined title row
        // ("トップページ一覧の下線見出しの下マージンを2px詰めて", then
        // "さらに1px詰めて").
        className={`group flex cursor-pointer flex-col items-start gap-[calc(11px*var(--scale))] transition-opacity duration-300 ease-out ${
          isDimmed ? "opacity-60" : "opacity-100"
        }`}
      >
        <span
          ref={(el) => {
            titleRef.current = el;
            onTitleRef?.(el);
          }}
          className="underline-sweep text-[length:calc(14px*var(--scale))] leading-[1.5] font-medium text-white [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
        >
          <ScrambleText text={project.title} active={revealed} />
        </span>
        <div
          className={`flex flex-col items-start text-[length:calc(12px*var(--scale))] text-white/50 transition-opacity duration-700 ease-out ${
            revealed ? "opacity-100" : "opacity-0"
          }`}
          style={{ transitionDelay: `${baseDelay + META_FADE_DELAY_MS}ms` }}
        >
          {/* Date folded into this same <p> (a third `leading-[1.25]` line,
             not a separate flex sibling with its own explicit `gap` above it
             anymore) — per direct follow-up asking for its own top margin to
             match category/role's own line spacing exactly ("一覧日付の上
             マージンをカテゴリーの行間と同じにしておいて"): the previous
             `gap-[calc(10px*var(--scale))]` was a second, independent spacing
             system, with no guarantee of ever matching whatever `leading-
             [1.25]` actually renders as between category and role. Sharing
             one `<p>`/one line-height for all three lines makes that
             equality exact by construction rather than an approximated px
             value. The date's own font/tracking still differ from category/
             role, so it's wrapped in its own inline `<span>` carrying just
             those two overrides, same "differently-styled inline run within
             one block" pattern as scramble-text.tsx's own per-character
             spans. */}
          <p className="font-normal leading-[1.25] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
            {project.category}
            <br />
            {project.role}
            <br />
            <span className="font-(family-name:--font-courier) tracking-[calc(-0.6px*var(--scale))]">
              {project.date}
            </span>
          </p>
        </div>
      </div>
    </li>
  );
}
