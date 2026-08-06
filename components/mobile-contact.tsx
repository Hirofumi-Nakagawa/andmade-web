"use client";

import { useEffect } from "react";
import { CopyEmail } from "@/components/copy-email";
import Link from "next/link";
import { CurtainRevealLines } from "@/components/curtain-reveal-lines";
import { RevealOnMount } from "@/components/reveal-on-mount";
import { ScrambleText } from "@/components/scramble-text";
import { setLightMenuPill } from "@/lib/menu-theme-store";

/** Same 3-line English tagline as app/contact/page.tsx's own PC tree
 *  (CONTACT_TAGLINE_LINES) — duplicated here rather than imported, matching
 *  every other piece of literal copy shared between this page's PC/SP trees.
 *  Curtain-revealed via CurtainRevealLines instead of the usual RevealOnMount
 *  slide+fade every other block on this page still uses — per direct
 *  follow-up ("この英字3行は下からスライドイン+フェードインは無しで、変わり
 *  にカーテンリビールをつけて"). Line breaks per direct follow-up spec — moved
 *  "shape" back onto line 2's own end (was line 3's start, per a later
 *  follow-up, "spのcontactの3行テキストの改行を、and（改行）shapeにして"),
 *  reverted back to the original break per direct follow-up ("spのcontact
 *  ページの3行英文を下記の改行に戻して"), then changed again to the current
 *  "and"（改行）"shape it into..." per the latest direct follow-up. */
const CONTACT_TAGLINE_LINES = [
  "Every project starts with a conversation.",
  "Together, we’ll uncover the essence and",
  "shape it into something clear and lasting.",
];

/** Same "margin + 2 columns" idiom every other Mobile* component uses (see
 *  mobile-not-found.tsx's own TEXT_LEFT / mobile-studies.tsx's own TEXT_LEFT)
 *  — grid column 3, matching this page's own Figma export (node 1074:1180,
 *  "sp_contact"): "ANDMADE Inc.", "Get in touch.", both paragraphs, and the
 *  Inquiries/Social block all share this exact left edge (72px at the 400px
 *  reference canvas). */
const TEXT_LEFT = "calc(var(--sp-grid-column-width) * 2 + var(--sp-grid-margin))";

/** "ANDMADE Inc." top offset — the fixed 50px every other Mobile* component
 *  places it at (mobile-studies.tsx, mobile-not-found.tsx). */
const ANDMADE_INC_TOP_PX = 50;

/** Gap between Studies' own "ANDMADE Inc." and its center image, currently
 *  181px (mobile-studies.tsx: CENTER_TOP_PX (231) - "ANDMADE Inc."'s own
 *  top (50)) — reused here verbatim per direct follow-up ("Get in touchと
 *  ANDMADE Inc.のマージンは、StudiesのANDMADE Inc.とイメージとのマージンと
 *  同じにしておいて"). Not imported directly from mobile-studies.tsx (that
 *  file exports no such constant, and CENTER_TOP_PX bundles in an unrelated
 *  BELOW_HEADER_OFFSET_PX follow-up specific to that page) — just the same
 *  literal number, called out here so it stays easy to find/compare if
 *  Studies' own margin ever changes again. */
const STUDIES_ANDMADE_TO_IMAGE_GAP_PX = 181;

/** "Get in touch." top offset — ANDMADE_INC_TOP_PX + the same gap Studies
 *  used to use between its own "ANDMADE Inc." and its center image (see
 *  STUDIES_ANDMADE_TO_IMAGE_GAP_PX's own doc comment), rather than Figma's
 *  own literal export value for this page (which would have placed it 30px
 *  higher) — minus a further 10px per direct follow-up ("SPのcontactのget
 *  in touchの位置を10px上に上げる"), which intentionally moves this page's
 *  own "Get in touch." independently of Studies' own image position (a
 *  separate, later follow-up moved *that* by its own 10px too — see
 *  mobile-studies.tsx's own CENTER_TOP_PX — the two are no longer meant to
 *  stay numerically in sync going forward, just historically derived from
 *  the same starting number). */
const GET_IN_TOUCH_TOP_PX = ANDMADE_INC_TOP_PX + STUDIES_ANDMADE_TO_IMAGE_GAP_PX - 10;

/** Figma's own (content-relative, chrome-offset-already-removed) top for
 *  "Get in touch." on this page's own SP export — 201px. The delta between
 *  that and GET_IN_TOUCH_TOP_PX above is applied uniformly to every other
 *  element Figma placed below it (the two paragraphs, the Inquiries/Social
 *  block, and the rotated side label, which shares this same y in the
 *  original design) — same "shift everything below by one constant offset"
 *  technique mobile-studies.tsx's own BELOW_HEADER_OFFSET_PX uses, so every
 *  element's own *relative* spacing from Figma stays intact even though the
 *  whole block now starts lower than Figma's own literal export. */
const FIGMA_GET_IN_TOUCH_TOP_PX = 201;
const BELOW_HEADER_OFFSET_PX = GET_IN_TOUCH_TOP_PX - FIGMA_GET_IN_TOUCH_TOP_PX;

/** Every other element's own Figma top (content-relative, 53px status-bar
 *  chrome already subtracted from the raw export) plus BELOW_HEADER_OFFSET_PX. */
// 312 → 307 — per direct follow-up ("spのcontactのget in touchの下マージンを
// 5px詰めて"): tightens just the gap between "Get in touch." and the 3-line
// English tagline below it, 5px closer. JP_PARAGRAPH_TOP_PX/CONTACT_LINKS_TOP_PX
// below are unaffected (each of these is its own independent Figma-derived
// offset, not chained off one another).
// 307 → 302 — per direct follow-up ("英語上マージンを5px詰める")。
const BODY_PARAGRAPH_TOP_PX = 302 - 53 + BELOW_HEADER_OFFSET_PX;
// 391 → 381 — per direct follow-up ("SPのcontactの3行テキストの下マージンを
// 10px詰めて"): tightens just the gap between the 3-line English tagline
// above and this JP paragraph, 10px closer. CONTACT_LINKS_TOP_PX below is
// unaffected (each of these three is its own independent Figma-derived
// offset, not chained off one another), so the Inquiries/Social block keeps
// its own original position, unchanged.
// 381 → 376 — 上の英語ブロックが5px上がったのに追従（英語↔日本語の
// 間隔は維持）。
const JP_PARAGRAPH_TOP_PX = 376 - 53 + BELOW_HEADER_OFFSET_PX;
// 466 → 456 — per direct follow-up ("inquiriesとsocialも合わせて上に10px移
// 動"), matching the same 10px tightened above.
// 456 → 446（上の2ブロックの5px上昇に追従 + "日本語文下マージンを5px
// 詰める"）→ 454 — per direct follow-up ("日本語下マージンは35pxにして")。
// 日本語2行目のインク下端は行ボックス(24px×2)より約7.5px上に来るため、
// 見た目のマージン35px = top差 約78px（454 − 376）。
const CONTACT_LINKS_TOP_PX = 454 - 53 + BELOW_HEADER_OFFSET_PX;

/** 「Get in touch.」以下のコンテンツ群を画面縦中央に置くためのラッパー定数 —
 *  per direct follow-up ("spのcontactのGet in touch以下の要素を画面に対して
 *  縦位置中央配置にして")。各要素の絶対 top はそのまま「Get in touch.」の
 *  ink 上端（GET_IN_TOUCH_TOP_PX）基準の相対値に読み替え、ラッパー自体を
 *  `top: calc(50% - GROUP_HEIGHT/2)` に置く。
 *
 *  GROUP_HEIGHT_PX はグループの見た目の全高の実測近似:
 *  リンクブロックの相対 top（CONTACT_LINKS_TOP_PX - GET_IN_TOUCH_TOP_PX =
 *  200px）+ Inquiries/Social ブロック自身の高さ（トリム済みラベル ≈7px +
 *  gap12 + 16pxリンク ≈11px + gap35 + 7 + 12 + 11 ≈ 96px を四捨五入で
 *  ≈100px）≈ 300px。数px の誤差は「中央」の知覚には影響しない。 */
const GROUP_HEIGHT_PX = 300;
/** 中央配置からの微調整 — per direct follow-up ("もう少しだけ下に下げたい")。 */
const GROUP_NUDGE_Y_PX = 20; // 10 → 20（"さらに10px下げて"）
/** `font-feature-settings: "ss09" 1` — matches the stylistic set the PC
 *  Contact page (app/contact/page.tsx) applies to this same Japanese copy. */
const SS09 = { fontFeatureSettings: '"ss09" 1' } as const;

/**
 * SP counterpart of app/contact/page.tsx (Figma node 1074:1180, "sp_contact")
 * — same copy/links as PC's own ContactHero + Inquiries/Social block, laid
 * out as literal fixed-px offsets against the 400px SP reference canvas
 * (matching every other Mobile* component's convention), rendered as a
 * sibling of that page's own PC-only tree (see that file's `hidden
 * lg:contents` wrapper).
 *
 * Two deliberate departures from Figma's own SP export, both per explicit
 * follow-up:
 * 1. Background — Figma's own mockup layers a photo/gradient behind this
 *    content (the frame's own `image 4`/`image 5`/masked-gradient layers);
 *    per direct instruction ("背景は一旦#000に（デザイン上で画像を載せてる
 *    けど無視して）") none of that is reproduced here — the visible
 *    background is the page's own full-viewport shader canvas
 *    (ContactBlendBackground, app/contact/page.tsx), whose base colour is
 *    #000000. This root div itself must stay background-free: it's
 *    `position: fixed` and paints *above* that canvas, so any opaque colour
 *    here would hide the shader on SP entirely. (During a brief
 *    no-shader/#000ベタ era this div did carry its own bg-[#000] — the page
 *    root's #000 never actually paints on SP since this component is fixed
 *    and the PC tree is display:none, leaving the page root ~zero height,
 *    which is why the body's cream showed through per "spのcontactの背景色
 *    が検証ツールでも#000になってないんだけど" — but the shader's return
 *    per "contactの背景を元にもどして" made an opaque colour here harmful
 *    again, so it came back off.)
 * 2. "Get in touch."'s own vertical position — see GET_IN_TOUCH_TOP_PX above.
 *
 * The sitewide "MENU" pill (components/mobile-menu.tsx) needs no per-page
 * markup here (it's already mounted globally, app/layout.tsx) but does need
 * this page to flip it to its inverted white-pill/black-label scheme — per
 * direct follow-up ("Menuは404と同じく白黒反転で"), the exact same
 * `setLightMenuPill` toggle app/not-found.tsx already uses for its own dark
 * photo backdrop (see lib/menu-theme-store.ts).
 */
export function MobileContact() {
  useEffect(() => {
    setLightMenuPill(true);
    return () => setLightMenuPill(false);
  }, []);

  return (
    // fixed inset-0 (was `relative h-dvh`) + overflow-hidden — per direct
    // follow-up ("SPのcontactをsafariで見た時、studiesと同じようにページ全
    // 体がスワイプで画面が動かないようにしたい", then, after plain
    // `overflow-hidden` on an in-flow `h-dvh` box alone still wasn't enough,
    // "クリッピングして画面固定にして"): every piece of real content here is
    // already `position: absolute`, so in theory this box's own natural
    // height already equals exactly one viewport with nothing to scroll —
    // but staying *in normal document flow* (`relative`) still leaves the
    // real `<html>`/`<body>` scroll position free to move by however many
    // px iOS Safari's own dynamic-toolbar resize or sub-pixel rounding
    // momentarily disagrees by, which reads as the whole page visibly
    // dragging/bouncing on a swipe even though there's no *intentional*
    // content to scroll to. Taking this element fully out of document flow
    // (`fixed inset-0`, pinned straight to the viewport, contributing zero
    // height to `#top`/`<body>` above it) removes that possibility at the
    // root instead of just clipping its own internal overflow — with
    // nothing left in the actual document to measure as scrollable, iOS
    // Safari has nothing to bounce against regardless of any toolbar/
    // rounding jitter. `overflow-hidden` stays too, still guarding this
    // element's own internal content the same way as before.
    // Deliberately no background here — see this component's own doc comment
    // (departure #1): the shader canvas behind this div supplies the black.
    <div className="fixed inset-0 h-dvh w-full overflow-hidden lg:hidden">
      {/* Every element below except "Get in touch." itself slides up 24px
         while fading in shortly after mount — per direct follow-up ("contact
         のget in touch以外の要素はaboutページと同じように少し下からスライ
         ド+フェードインで表示"), reusing RevealOnMount verbatim (the exact
         same component/timing app/contact/page.tsx's own PC tree already
         uses for its own info block/photo/copyright, itself matching
         about-section.tsx's reveal). "Get in touch." keeps its own
         ScrambleText-only reveal instead (see that element's own render
         below), unchanged.

         "ANDMADE Inc." itself is the one exception to that — per direct
         follow-up ("SPのContactページのヘッダーはスライドイン+フェードイン
         無し"): plain, instantly-visible, no RevealOnMount wrapper, matching
         this exact same page's own PC tree (SiteHeader with no `fadeIn` —
         see that component's own doc comment: only Home ever passes
         `fadeIn`, every other page's header, including this one's PC
         sibling above, has always rendered instantly). */}
      <Link
        href="/"
        className="absolute block text-[16px] leading-[1.5] font-medium whitespace-nowrap text-white [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
        style={{ top: `${ANDMADE_INC_TOP_PX}px`, left: TEXT_LEFT }}
      >
        ANDMADE Inc.
      </Link>

      {/* Rotated vertical label along the grid's own left margin — per
         direct follow-up ("We're always open to new ideas.をget in touchの
         上面に揃える"), switched from the earlier fixed-box-centered
         technique (which only happened to look close to top-aligned, not
         an exact match) to the same corner-pin "shim" idiom
         mobile-studies.tsx's own rotated title uses: the outer
         (RevealOnMount) div pins one exact point (the grid's left margin,
         SIDE_LABEL_TOP_PX — same value as GET_IN_TOUCH_TOP_PX), with no
         rotation of its own so its normal slide-up-while-fading-in
         animation isn't distorted by a compounded transform. The actual
         rotated content is a plain child positioned *inside* it via
         left:0/bottom:0 + transform-origin:"left bottom" + rotate(90deg) —
         so its own bottom-left corner stays fixed at that pinned point, and
         turning it 90° swings the box so its *rotated* top-left corner
         lands there instead, growing the visible text purely rightward and
         downward from it (flush with the grid margin, flush with "Get in
         touch."'s top).

         Holds "We're always..." — reverted back per direct follow-up
         ("左右のテキストの位置をやっぱり元にもどして"), undoing an earlier
         swap with the right-edge block below. */}
      {/* 回転の「We're always open to new ideas.」はここにあったが、
         貼付レイアウトの指示（"We're always open to new ideas.はpc,spともに
         トリ"）で削除。 */}

      {/* Right-edge rotated parenthetical caption ("( Rooted in purpose,
         Designed with clarity, Built to last )") — temporarily removed from
         render per direct follow-up ("SPの右端の( rooted~は一旦トリで"). Not
         a permanent deletion (note the "一旦" — "for now"): the markup/
         geometry reasoning (same zero-size "shim" idiom as mobile-studies.tsx's
         own rotated title block, right:8px / GET_IN_TOUCH_TOP_PX pinned,
         rotate(90deg) growing leftward/downward) is preserved here in this
         comment in case it comes back — see this file's own version history
         for the exact JSX that was here. */}

      {/* 縦中央配置ラッパー — GROUP_HEIGHT_PX の doc comment 参照。中の
         各要素はこのラッパー基準の相対 top（元の Figma 由来の top から
         GET_IN_TOUCH_TOP_PX を引いた値）で、相互の間隔は従来のまま。 */}
      <div
        className="absolute inset-x-0"
        style={{ top: `calc(50% - ${GROUP_HEIGHT_PX / 2 - GROUP_NUDGE_Y_PX}px)` }}
      >
      <p
        // 40px → 38px → 36px — two direct follow-ups ("「get in touch」の文
        // 字サイズを、現在より2px小さく", then "そこからさらに2px小さく"),
        // each applied on top of the last rather than both measured off the
        // original 40px independently.
        className="absolute text-[34px] leading-[1.75] font-normal whitespace-nowrap text-white [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
        style={{ top: 0, left: TEXT_LEFT }}
      >
        <ScrambleText text="Get in touch." active />
      </p>

      <CurtainRevealLines
        lines={CONTACT_TAGLINE_LINES}
        className="absolute text-[14px] leading-[18px] font-normal text-white"
        style={{ top: `${BODY_PARAGRAPH_TOP_PX - GET_IN_TOUCH_TOP_PX}px`, left: TEXT_LEFT }}
      />

      <RevealOnMount
        className="absolute font-(family-name:--font-gen-interface-jp) text-[14px] leading-[24px] font-light whitespace-nowrap text-white tracking-[0.7px]"
        style={{ top: `${JP_PARAGRAPH_TOP_PX - GET_IN_TOUCH_TOP_PX}px`, left: TEXT_LEFT, ...SS09 }}
      >
        <p>プロジェクトのご相談やご質問など、</p>
        <p>まずはお気軽にお問い合わせください。</p>
      </RevealOnMount>

      <RevealOnMount
        className="absolute flex flex-col items-start gap-[35px] whitespace-nowrap leading-[1.6]"
        style={{ top: `${CONTACT_LINKS_TOP_PX - GET_IN_TOUCH_TOP_PX}px`, left: TEXT_LEFT }}
      >
        <div className="flex flex-col items-start gap-[12px]">
          <p className="font-(family-name:--font-courier) text-[12px] text-[#757575] tracking-[-0.6px] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
            Inquiries
          </p>
          {/* mailto → クリックでコピー＋"Copied" 表示（copy-email.tsx）。 */}
          <CopyEmail inverted belowMenu className="[text-decoration-skip-ink:none] [text-underline-position:from-font] text-[16px] text-white underline decoration-solid decoration-from-font [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]" />
        </div>
        <div className="flex flex-col items-start gap-[12px]">
          <p className="font-(family-name:--font-courier) text-[12px] text-[#757575] tracking-[-0.6px] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
            Social
          </p>
          <div className="flex items-center gap-[8px] text-[16px] text-white">
            <a
              href="https://www.instagram.com/andmade_inc"
              target="_blank"
              rel="noopener noreferrer"
              className="[text-decoration-skip-ink:none] [text-underline-position:from-font] underline decoration-solid decoration-from-font [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
            >
              Instagram
            </a>
            <span className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">,</span>
            <a
              href="https://x.com/ANDMADE_jp"
              target="_blank"
              rel="noopener noreferrer"
              className="[text-decoration-skip-ink:none] [text-underline-position:from-font] underline decoration-solid decoration-from-font [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
            >
              X
            </a>
          </div>
        </div>
      </RevealOnMount>
      </div>
    </div>
  );
}
