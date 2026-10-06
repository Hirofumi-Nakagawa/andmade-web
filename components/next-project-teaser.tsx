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
/** Next Project の category / role / date まわりの間隔（px、1440px 基準）。
 *  NEXT_META_LINE_HEIGHT_PX は「1項目の中」の行間（カテゴリーが折り返した
 *  ときの行送り）、NEXT_META_FIELD_GAP_PX は「項目どうし」の間。
 *  どちらも直接の指示での調整用 — 詳しい経緯は下の JSX のコメント参照。 */
const NEXT_META_LINE_HEIGHT_PX = 14;
const NEXT_META_FIELD_GAP_PX = 9;

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
        {/* items-end — 一度は上面揃え（items-start、per direct follow-up
           "Next Projectの文字と右の実績名の上面揃える"）だったが、後続の
           指示（"「Next Project」文字の下面を実績タイトル下面に揃える"）で
           下面揃えに。キャプション・タイトルとも [text-box-edge/trim] で
           トリム済みなので、flex の end 揃えがそのまま実インクの下端揃えに
           なる（フォントサイズ違いのベースライン揃えではなく）。 */}
        <div className="flex items-end">
          {/* "Next Project" caption — plain Akzidenz-Grotesk Next Regular
             (Figma node 1349:376), duplicated from DetailCaption's own
             font="sans" dark variant rather than importing it from the page
             file. */}
          <p
            className="shrink-0 pl-[calc(82px*var(--grid-scale))] whitespace-nowrap text-[length:calc(14px*var(--scale))] text-black [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
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
        {/* category / role / date。
           以前は1つのブロックを <br/> で区切っていたので、行間は
           すべて line-height の15px（"Next Projectのカテゴリー、日付の
           行間を15pxに"）一択だった。カテゴリーが2行に折り返す実績
           （SATOYAMA TERRACE など）では、

             ・折り返した中の行間 → 広すぎる
             ・カテゴリーと role の間 → 狭すぎる

           という相反する指摘が出たため、3つを別々のブロックに分けた
           （直接の指示）。これで「1項目の中の行間」は line-height、
           「項目どうしの間」は margin と、別々に調整できる。

           各ブロックに text-box-trim を付けてあるので、項目間の見た目の
           余白は margin の値そのもの（上の行のベースライン → 下の行の
           キャップ上端）になる。分ける前の見た目上の間隔は
           15px − キャップハイト（12px × 0.706 ≒ 8.5px）＝ 約6.5px だった
           ので、NEXT_META_FIELD_GAP_PX はそこから少し広げた値。 */}
        <Link
          href={href}
          onMouseEnter={playUnderlineSweep}
          className="mt-[calc(12px*var(--scale))] block text-[length:calc(12px*var(--scale))] text-black/50"
          style={{ marginLeft: CONTENT_ML, width: "calc(232px*var(--grid-scale))" }}
        >
          <span
            className="block [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
            style={{ lineHeight: `calc(${NEXT_META_LINE_HEIGHT_PX}px * var(--scale))` }}
          >
            {category}
          </span>
          <span
            className="block [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
            style={{
              lineHeight: `calc(${NEXT_META_LINE_HEIGHT_PX}px * var(--scale))`,
              marginTop: `calc(${NEXT_META_FIELD_GAP_PX}px * var(--scale))`,
            }}
          >
            {role}
          </span>
          <span
            className="block font-(family-name:--font-courier) tracking-[calc(-0.6px*var(--scale))] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
            style={{
              lineHeight: `calc(${NEXT_META_LINE_HEIGHT_PX}px * var(--scale))`,
              marginTop: `calc(${NEXT_META_FIELD_GAP_PX}px * var(--scale))`,
            }}
          >
            {date}
          </span>
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
