"use client";

import { useCallback, useRef } from "react";
import Link from "next/link";

/** Duplicated from app/projects/[slug]/page.tsx's own CONTENT_ML — this is a
 *  standalone client component (the page itself is an async Server
 *  Component, so the hover-state logic below can't live inline there), same
 *  duplication convention that page's own `paragraphTrimClass` already uses
 *  rather than importing a page-local helper. */
const CONTENT_ML = "calc(198px * var(--grid-scale))";

/**
 * "Next Project" teaser row (Figma node 1349:388) — caption + linked title on
 * one line, a category/role/date recap link below it, and a large thumbnail
 * link to the right. Split out of app/projects/[slug]/page.tsx into its own
 * client component specifically so the title/meta/thumbnail links can share
 * one hover-triggered underline-sweep animation (see playUnderlineSweep
 * below) — that needs real event handlers, which an async Server Component
 * can't attach directly.
 *
 * Three separate <Link> elements (title, meta paragraph, thumbnail), not one
 * wrapping link over the whole row — per direct follow-up ("Next Projectの
 * カーソル反応エリアは、イメージとテキスト箇所だけにする"): the empty gap
 * between the text column and the thumbnail, and the "Next Project" caption
 * itself, aren't meant to be clickable.
 *
 * Hovering *any* of the three links now also plays the title's own
 * underline-sweep — per direct follow-up ("next projectのリンクエリアに
 * カーソルが乗ったら下線アニメーションが走るようにして"). A shared `group`
 * ancestor was tried for this earlier and reverted (per an even earlier,
 * narrower follow-up: "Next Projectの下線ホバーが反応するエリアもテキスト
 * とイメージのエリアだけにして") because a single rectangular `group` box
 * spanning the text column and the thumbnail necessarily also covers the
 * "Next Project" caption and the dead gap between them — hovering either of
 * those incorrectly replayed the sweep too. Programmatically replaying the
 * animation instead (same remove/reflow/re-add restart trick
 * app/page.tsx's own playUnderlineSweep already uses, for the same
 * reason: hovering the meta paragraph or the thumbnail doesn't make the
 * *title's own* CSS `:hover` match, so `.underline-sweep:hover::after` never
 * fires on its own) reaches exactly the three real link elements and nothing
 * else.
 */
export function NextProjectTeaser({
  href,
  title,
  category,
  role,
  date,
  image,
  imageSrcSet,
  aspect,
}: {
  href: string;
  title: string;
  category: string;
  role: string;
  date: string;
  /** The *next* project's own first gallery image (not its hero/KV) — per
   *  direct follow-up ("next projectのグレー画像箇所に次の実績イメージを表
   *  示する（hero画像じゃなくてギャラリー画像の1枚目を表示する）"). Both
   *  undefined until that project has a real detail page with at least one
   *  uploaded "image"-type gallery block — renders the original plain gray
   *  box until then, same as every other gallery slot's own placeholder
   *  convention. */
  image?: string;
  /** Responsive candidates for `image` (lib/projects.ts). */
  imageSrcSet?: string;
  aspect?: number;
}) {
  const titleRef = useRef<HTMLAnchorElement>(null);

  const playUnderlineSweep = useCallback(() => {
    const el = titleRef.current;
    if (!el) return;
    el.classList.remove("underline-sweep-play");
    // Forces a reflow so the class removal above is actually flushed before
    // re-adding it below — otherwise the browser sees no net class change
    // and won't restart an already-finished (or still-playing) animation.
    void el.offsetWidth;
    el.classList.add("underline-sweep-play");
    el.addEventListener("animationend", () => el.classList.remove("underline-sweep-play"), { once: true });
  }, []);

  return (
    <div className="flex w-full items-start justify-between">
      <div className="mt-[calc(96px*var(--scale))] flex-1">
        {/* items-start (not items-baseline) — per direct follow-up ("Next
           Projectの文字と右の実績名の上面揃える"): both this caption and the
           title already carry matching [text-box-edge/trim] trim classes, so
           aligning their tops via flex directly lines up their real,
           trimmed top edges instead of their (different-size-font) baselines. */}
        <div className="flex items-start">
          {/* "Next Project" caption — plain Akzidenz-Grotesk Next Regular
             (Figma node 1349:376), duplicated from DetailCaption's own
             font="sans" dark variant rather than importing it from the page
             file. */}
          <p
            className="shrink-0 pl-[calc(82px*var(--grid-scale))] whitespace-nowrap text-[length:calc(14px*var(--scale))] text-black/50 [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
            style={{ width: CONTENT_ML }}
          >
            Next Project
          </p>
          {/* 20px → 18px — per direct follow-up ("Next Projectの実績名の文
             字サイズを20px→18pxに"). */}
          <Link
            ref={titleRef}
            href={href}
            className="underline-sweep text-[length:calc(18px*var(--scale))] font-medium whitespace-nowrap text-black [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
          >
            {title}
          </Link>
        </div>
        {/* leading-[15px] — per direct follow-up ("Next Projectのカテゴリー、
           日付の行間を15pxに"): these three lines are one <p>-like block
           joined by <br/>, not separate flex items with a `gap`, so their own
           line spacing is just this element's line-height. */}
        <Link
          href={href}
          onMouseEnter={playUnderlineSweep}
          className="mt-[calc(12px*var(--scale))] block text-[length:calc(12px*var(--scale))] leading-[calc(15px*var(--scale))] text-black/50 [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
          style={{ marginLeft: CONTENT_ML, width: "calc(232px*var(--grid-scale))" }}
        >
          {category}
          <br />
          {role}
          <br />
          <span className="font-(family-name:--font-courier) tracking-[calc(-0.6px*var(--scale))]">{date}</span>
        </Link>
      </div>
      <Link
        href={href}
        onMouseEnter={playUnderlineSweep}
        // No background fill — see ProjectHeroParallax's own comment
        // (project-hero-parallax.tsx).
        className="relative mr-[24px] block shrink-0 overflow-hidden"
        style={{ width: "calc(870px*var(--grid-scale))", aspectRatio: aspect ?? 870 / 543 }}
      >
        {image && (
          <>
          {/* Plain <img>, not next/image — see project-hero-parallax.tsx's own
             note: every CMS URL is `http`-prefixed, so next/image was
             bypassed for all real content anyway. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
            <img
              src={image}
              srcSet={imageSrcSet}
              sizes="(min-width: 1024px) 45vw, 100vw"
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          </>
        )}
      </Link>
    </div>
  );
}
