"use client";

import { useCallback, useEffect } from "react";
import Link from "next/link";
import { useLenis } from "lenis/react";
import { MobileAboutSection } from "@/components/mobile-about-section";
import { RecentlyPlayedFlip } from "@/components/recently-played-flip";
import { MobileAboutSideNav } from "@/components/mobile-about-side-nav";
import { CurtainRevealLines } from "@/components/curtain-reveal-lines";
import { RevealOnMount } from "@/components/reveal-on-mount";
import { setFooterReady as broadcastFooterReady } from "@/lib/footer-mode-store";
import { useNowPlaying } from "@/components/now-playing-provider";
import {
  ABOUT_NAV_ITEMS,
  APPROACH_EN,
  APPROACH_JA,
  AWARDS_COL_1,
  AWARDS_COL_2,
  GUIDING_PRINCIPLES,
  HERO_LEAD_EN,
  HERO_LEAD_JA,
  HERO_LINES,
  MEDIA_COL_1,
  MEDIA_COL_2,
  OUTLINE_COL_1,
  OUTLINE_COL_2,
  SERVICES_COL_1,
  SERVICES_COL_2,
  spSectionId,
  VISION_EN,
  VISION_JA,
} from "@/lib/about-content";

/** `font-feature-settings: "ss09" 1` — same stylistic set app/about/page.tsx's
 *  own SS09 uses for Gen Interface JP body copy. */
const SS09 = { fontFeatureSettings: '"ss09" 1' } as const;

/** Extra left indent on top of the page's own 8px side margin — mirrors
 *  mobile-home.tsx's own identical constant/reasoning exactly (2 of
 *  globals.css's own fluid `--sp-grid-column-width` columns, so header/
 *  content/side-nav all stay aligned with GridOverlay's own SP grid at every
 *  viewport width instead of a hardcoded px value that only matches Figma's
 *  own 400px reference). */
const CONTENT_INDENT = "calc(var(--sp-grid-column-width) * 2)";

/** SP の FV リードは「〜デザインにつながると」で改行して4行にする — per
 *  direct follow-up ("デザインにつながると（改行")。原稿
 *  （lib/about-content.ts の HERO_LEAD_JA）は PC と共有の3行のままなので、
 *  3行目だけ末尾の「考えています。」を切り離して2行に分ける。原稿側の
 *  文言が変わって末尾が一致しなくなったときは、分割せずそのまま出す
 *  （改行位置の指定より文言の正しさを優先）。 */
const SP_HERO_LEAD_TAIL = "考えています。";
const SP_HERO_LEAD_JA = HERO_LEAD_JA[2].endsWith(SP_HERO_LEAD_TAIL)
  ? [
      HERO_LEAD_JA[0],
      HERO_LEAD_JA[1],
      HERO_LEAD_JA[2].slice(0, -SP_HERO_LEAD_TAIL.length),
      SP_HERO_LEAD_TAIL,
    ]
  : HERO_LEAD_JA;

/** Distance-from-bottom (px) that flips MobileMenu into footer mode — mirrors
 *  mobile-home.tsx's own SELECTED_TEXT_BOTTOM_PX-driven bottom check, minus
 *  the "last project active" condition that check also requires: there's no
 *  equivalent concept on this plain content page, so "scrolled (near) the
 *  true bottom" alone is the whole rule here. */
const FOOTER_READY_THRESHOLD_PX = 100;

/** Gap between the page's last section and the trailing spacer below it
 *  (where MobileMenu's own footer-mode panel grows in from) — per direct
 *  follow-up ("Outlineとフッターのマージンはトップの一覧とフッターとの
 *  マージンと同じにして"): the exact same value as mobile-home.tsx's own
 *  LIST_FOOTER_GAP_PX (see that constant's own doc comment for its full
 *  tuning history), not a separately-derived Figma gap — now 550px per a
 *  later direct follow-up ("それぞれのフッター用トレーリングスペーサーを
 *  550pxに戻して"), after briefly 500px, then 120px, per still-earlier
 *  direct follow-ups. Only applies while a track is playing — see
 *  CONTENT_FOOTER_GAP_PX_IDLE below for the no-track-playing case. */
const CONTENT_FOOTER_GAP_PX = 550;
/** Same spacer, but for when no track is currently playing — per direct
 *  follow-up ("再生中の曲がないとき、SPのフッター用トレーリングスペーサーを
 *  menuの高さに合わせて550pxから400pxに変更して"): MobileMenu's own
 *  footer-mode panel is shorter without a "Playing" line to show, so the
 *  spacer that reserves room for it below the content can shrink to match. */
const CONTENT_FOOTER_GAP_PX_IDLE = 400;

/** Trims only the leading/trailing half-leading of a stacked-paragraph
 *  block's first/last line, matching app/about/page.tsx's own identical
 *  helper (BilingualBody's paragraph trimming) — see that file's own doc
 *  comment for the full reasoning. Duplicated here rather than imported
 *  since app/about/page.tsx isn't a module other components can import from
 *  (it's a page, not a shared lib). */
function paragraphTrimClass(index: number, length: number) {
  const isFirst = index === 0;
  const isLast = index === length - 1;
  if (isFirst && isLast) return "[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]";
  if (isFirst) return "[text-box-edge:cap_alphabetic] [text-box-trim:trim-start]";
  if (isLast) return "[text-box-edge:cap_alphabetic] [text-box-trim:trim-end]";
  return "";
}

/** SP counterpart to app/about/page.tsx's own BilingualBody — Figma node
 *  1067:543 ("01"/Vision): unlike PC's side-by-side JA/EN columns, SP stacks
 *  the Japanese paragraph block directly above the English one (gap-[30px]
 *  flex-col), both full-width. */
function MobileBilingualBody({ ja, en }: { ja: string[]; en: string[] }) {
  return (
    <div className="flex w-full flex-col items-start gap-[30px]">
      <div
        className="w-full text-justify font-(family-name:--font-gen-interface-jp) text-[14px] leading-[1.6] tracking-[0.3px] text-black"
        style={SS09}
      >
        {ja.map((paragraph, i) => (
          <p key={paragraph} className={`mb-0 last:mb-0 ${paragraphTrimClass(i, ja.length)}`}>
            {paragraph}
          </p>
        ))}
      </div>
      <div className="w-full text-[13px] leading-[1.2] text-black/50">
        {en.map((paragraph, i) => (
          <p key={paragraph} className={`mb-0 last:mb-0 ${paragraphTrimClass(i, en.length)}`}>
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  );
}

/**
 * SP (mobile) About page — Figma node 1067:4 ("sp_about"). Rendered alongside
 * (not replacing) the existing PC-only tree in app/about/page.tsx, split at
 * the `lg` breakpoint exactly like mobile-home.tsx pairs with app/page.tsx
 * (`hidden lg:contents` on the PC tree, `lg:hidden` here) — per direct
 * follow-up ("SPのAboutページ実装も進めて 基本的にPCと同じ考え方で実装し
 * て"). Shares AboutBackground (app/about/page.tsx renders it once, outside
 * either tree) and every text content constant in lib/about-content.ts
 * as-is — none of that is PC-specific, so none of it needed porting or
 * duplicating, only the layout/typography around it.
 *
 * Plain black text throughout, no mix-blend-exclusion — mirrors PC's own
 * `<SiteHeader dark />` treatment for this same page (About's photo+wash
 * background is designed against solid black text, unlike Home's blended
 * white), confirmed by Figma node 1067:4 itself: none of its text layers
 * carry a blend-mode fill, unlike mobile-home.tsx's own white/blended
 * equivalents.
 *
 * Footer: broadcasts into lib/footer-mode-store.ts (see that file's own doc
 * comment) — the exact same mechanism, same margin-above-footer *treatment*
 * (footerReady flips once scrolled within FOOTER_READY_THRESHOLD_PX of the
 * true bottom, with a plain trailing spacer giving it room to grow into) as
 * mobile-home.tsx's own Top page — no separate footer component exists to
 * reuse, so "same as Top" means this same footerReady+trailing-
 * spacer pattern feeding MobileMenu's own `footerMode` (now a persistent
 * singleton mounted once in app/layout.tsx, not rendered here — see that
 * component's own top-level doc comment), not a shared footer component.
 * Unlike Top, this page has no preview image of its own to suppress while
 * "Back to top" scrolls, so it doesn't listen for MobileMenu's back-to-top
 * window events at all.
 *
 * No `introReplayGeneration`/`key` remount trick anywhere here, unlike
 * mobile-home.tsx — SiteIntro only ever shows on the actual top-page route
 * (see its own pathname check), so there's no opaque splash for anything on
 * this page to hide behind and desync from; every reveal here (sections,
 * MobileMenu's own mount timer) can just run from a plain, un-keyed mount.
 */
export function MobileAbout() {
  // Drives the trailing-spacer height below — see CONTENT_FOOTER_GAP_PX_IDLE's
  // own doc comment.
  const { isPlaying } = useNowPlaying();
  const footerGapPx = isPlaying ? CONTENT_FOOTER_GAP_PX : CONTENT_FOOTER_GAP_PX_IDLE;
  const handleLenisTick = useCallback(() => {
    const distanceFromBottom = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
    broadcastFooterReady(distanceFromBottom <= FOOTER_READY_THRESHOLD_PX);
  }, []);
  useLenis(handleLenisTick);

  // Resets the shared store back to false on unmount — see mobile-home.tsx's
  // own identical cleanup effect for why (navigating away mid-footerMode
  // shouldn't leave MobileMenu's panel grown into footer content for a
  // moment on whatever page mounts next).
  useEffect(() => () => broadcastFooterReady(false), []);

  return (
    // No bg-(--color-background) here — per direct follow-up ("背景画像と背
    // 景色が反映されてない"): this div is `position: relative` (a positioned
    // element), same as AboutBackground's own `position: fixed` — both land
    // in the "positioned, z-index:auto" stacking layer, ordered by DOM tree
    // order rather than element type. Since this component renders *after*
    // AboutBackground in app/about/page.tsx, an opaque background here was
    // painting directly on top of that fixed photo, hiding it completely.
    // `#top` (the shared ancestor in app/about/page.tsx) already supplies
    // the same fallback color beneath everything, so nothing more is needed
    // here than removing this redundant, blocking copy of it.
    <div className="relative w-full lg:hidden">
      <div className="px-[8px]">
        {/* Brand — pt-[50px]/CONTENT_INDENT match mobile-home.tsx's own header
            exactly, minus mix-blend-exclusion (see this file's own doc
            comment above for why About stays plain black).

            paddingTop: calc(50px + env(safe-area-inset-top)) — not a plain
            pt-[50px] class here (mobile-home.tsx's own header keeps that
            simpler version, deliberately unchanged) — this route alone now
            sets `viewport-fit=cover` (see app/about/page.tsx's own `viewport`
            export) so AboutBackground's photo can paint behind the iOS
            status bar/notch instead of stopping at a solid-color margin
            there. That same `viewport-fit=cover` also enlarges *this* page's
            own coordinate space to include that area, which without this
            compensation would shift this text 50px from the *true* top of
            the physical screen instead of 50px below the status bar/notch
            like before. `env(safe-area-inset-top)` resolves to 0 on every
            other route (no `viewport-fit=cover` there), so this is a no-op
            anywhere but here. */}
        <Link
          href="/"
          className="block text-[15px] leading-[1.5] font-medium text-black [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
          style={{ paddingLeft: CONTENT_INDENT, paddingTop: "calc(50px + env(safe-area-inset-top))" }}
        >
          ANDMADE Inc.
        </Link>

        {/* mt-[170px] — originally 180px, same header-to-content gap as
            mobile-home.tsx's own mt-[180px] to its project list (Figma node
            1067:4 spec's this same 180px gap here too, independently),
            tightened 10px, then a further 20px (180 → 170 → 150) per two
            direct follow-ups — this page only, mobile-home.tsx's own
            180px is untouched. Shared `relative` containing block for
            MobileAboutSideNav's own `absolute inset-0` sticky wrapper,
            mirroring AboutSideNav/AboutSection's identical PC-side
            relationship.

            No `pb-[20px]` here (moved to a plain sibling spacer below) — per
            direct follow-up ("左ナビの固定解除のタイミングを、outlineの下線
            と左ナビの下面が揃うタイミングで固定解除にして"): `position:
            sticky` releases exactly when *this* element's own padding-box
            bottom edge reaches the sticky child's own bottom edge — with
            `pb-[20px]` living here, that release point sat 20px past the
            Outline line (the flex column's last child) instead of flush
            against it. Moving that same 20px outside this container (same
            total visual spacing, since it's still 20px before the trailing
            spacer below) makes this container's own bottom coincide exactly
            with the Outline line, so the nav's native sticky release now
            lands exactly there with no extra JS needed. */}
        <div className="relative mt-[150px]">
          <MobileAboutSideNav />

          {/* FV — PC (app/about/page.tsx) と同じ内容の SP 版。per direct
              follow-up（添付デザイン "SPも添付のように調整して"）。

              PC ではこのブロックを左ナビのコンテナの *外* に出しているが、
              SP では中に入れてある。添付では左ナビ（縦組み）の頭が見出しと
              同じ高さから始まっているため。sticky の解除位置はコンテナの
              *下端* で決まるので、上端を FV のぶん上げてもアウトラインの
              下線で解除される挙動（以前調整した内容）は変わらない。 */}
          <div style={{ paddingLeft: CONTENT_INDENT }}>
            {/* 見出しはカーテンリビール（直接の指示 "pc,spともに3行コピーを
                カーテンリビールで表示して"）。PC 版と同じ理由で text-box-trim
                は付けない（1行ぶんの overflow-hidden で覆う仕組みなので、
                trim すると "purpose." の p のディセンダが切れる）。

                サイズ 36px は直接の指示。ただし固定 px にはできない —
                この3行は SP のコンテンツ幅ほぼいっぱいに組まれているので、
                36px のままだと幅の狭い端末（393pt 以下）で折り返して
                レイアウトが崩れる。そこで min(36px, 8.5vw) とし、
                大きめの端末では指示どおり 36px、狭い端末ではその端末で
                1行に収まる上限まで自動で縮む形にしてある。
                （34px → 36px → 32px。最後は per direct follow-up
                 ("sp、aboutとcontactの34px文字→32pxに")。8.5vw は
                 "Designed with clarity." の字幅約9.2em が 10マスに収まる
                 限界から逆算した値。）
                行間 1.12 と字間 -0.02em は PC 版（50px / 56px / -1px）と
                同じ比率。PC 側を触るときは合わせて見直すこと。 */}
            <CurtainRevealLines
              lines={HERO_LINES}
              // relative top-[-4px] — 直接の指示（2px → 3px → さらに1px上へ）。
              // カーテンリビールのために text-box-trim を外した結果、1行目の
              // 上にハーフレディング（(36*1.12-36)/2 ≒ 2px）が残るぶんの
              // 打ち消し。マージンではなく relative なので、下のリード文の
              // 位置は動かない。
              className="relative top-[-4px] font-normal [font-kerning:normal] text-black"
              style={{ fontSize: "min(32px, 8.5vw)", lineHeight: 1.12, letterSpacing: "-0.02em" }}
            />

            {/* 見出しからの 35px、日本語↔英語の 30px（いずれも直接の指示。
                PC はそれぞれ 20px / 30px）。PC と違って左のインデント
                （10マス送り）は無く、見出しと同じ左面に揃う。

                35px は「見た目で 40px」になるよう逆算した値（直接の指示）。
                見出しは text-box-trim を外してあるので3行目の下にハーフ
                レディングが約2px残り、さらに見出し全体を relative で3px
                上げているので、40px 指定だと実測 45px に見えていた。
                日本語↔英語の 30px のほうは両側とも text-box-trim が効いて
                いるので、指定値がそのまま見た目の間隔になる。 */}
            <RevealOnMount fadeOnly>
              {/* tracking 0.3px → -0.4px — per direct follow-up ("リード
                  「〜その積み重ねが、」までが一行で入るように文字間を調整
                  して")。2段落目の頭24文字が 14px 全角のままだと狭い端末で
                  コンテンツ幅を超えるため、字間を詰めて1行に収める。 */}
              <div
                className="mt-[35px] w-full font-(family-name:--font-gen-interface-jp) text-[14px] leading-[1.7] font-light tracking-[-0.4px] text-black"
                style={SS09}
              >
                {/* 16px → 15px（直接の指示）。Vision 以下の本文と同じサイズ。

                    一時は2段落（1文目 / 2文目）に組み直していたが、per direct
                    follow-up ("積み重ねが、で改行して") で原稿どおりの固定
                    改行に戻し、さらに SP だけ4行に分割（SP_HERO_LEAD_JA の
                    doc comment 参照）。 */}
                {SP_HERO_LEAD_JA.map((line, i, all) => (
                  <p key={line} className={paragraphTrimClass(i, all.length)}>
                    {line}
                  </p>
                ))}
              </div>
              {/* mt 30 → 25 — per direct follow-up ("SPのaboutのFV「本質を〜」
                  の日本語リード下のマージンを5px詰めて")。 */}
              <div className="mt-[25px] w-full text-[13px] leading-[1.2] text-black/50">
                {/* 英語は1段落に連結。理由は上の日本語と同じ。 */}
                <p className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
                  {HERO_LEAD_EN.join(" ")}
                </p>
              </div>
            </RevealOnMount>
          </div>

          {/* items-stretch (was items-start) — per direct follow-up
              ("Aboutの03~06の見出し上の線の長さが10マス分になってない"):
              `items-start` makes each flex-col child (each
              MobileAboutSection) shrink-to-fit its own content along the
              cross axis instead of stretching to this wrapper's own full
              width, which itself is exactly 10 of the page's 12 SP-grid
              columns (100vw - 16px page margin - CONTENT_INDENT's own 2
              columns = 10 columns' worth, by construction). Vision/Approach
              (01/02) happened to still look full-width regardless, since
              their own justified paragraph text naturally wraps to fill
              that space either way — but Services/Awards/Media (03/04/05,
              whose own body wrappers below are `whitespace-nowrap`) and
              Outline (06) all have noticeably narrower natural content,
              so under `items-start` each of those sections — and therefore
              each one's own border-t "(Label) NN" row, which is `w-full`
              *relative to this same shrunk-to-fit section* — ended up
              visibly shorter than the intended 10 columns. Stretching every
              section to this wrapper's actual full width fixes all of them
              at once, rather than special-casing 03-06 individually. */}
          {/* mt — 50px（添付デザインからの実測）→ 70px（直接の指示 "spの
              英語リード文下マージンを70pxに"）。FV から Vision 以下までの
              間隔。PC は 120px。 */}
          <div className="mt-[70px] flex w-full flex-col items-stretch gap-[100px]" style={{ paddingLeft: CONTENT_INDENT }}>
            <MobileAboutSection id={spSectionId(ABOUT_NAV_ITEMS[0].id)} label="Vision" index="01">
              <MobileBilingualBody ja={VISION_JA} en={VISION_EN} />
            </MobileAboutSection>

            <MobileAboutSection id={spSectionId(ABOUT_NAV_ITEMS[1].id)} label="Approach" index="02">
              <div className="flex w-full flex-col items-start gap-[70px]">
                <MobileBilingualBody ja={APPROACH_JA} en={APPROACH_EN} />

                <div className="flex w-full flex-col items-start gap-[50px]">
                  <p
                    className="text-justify text-[14px] leading-[1.2] font-medium whitespace-nowrap text-black [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
                    style={{ marginBottom: -5 }}
                  >
                    Guiding Principles
                  </p>

                  {GUIDING_PRINCIPLES.map((principle, index) => (
                    <div
                      key={principle.titleEn}
                      className="flex w-full flex-col items-start gap-[30px]"
                      style={index > 0 ? { marginTop: -5 } : undefined}
                    >
                      {/* gap 12 → 14 — per direct follow-up ("Guiding Principlesの1~4の
                          各見出し下のマージンを2px増やす")。英語側（下の
                          pl-[18px] 付きラッパー）は 12px のまま — per direct
                          follow-up ("英語は2px増やさないで")。 */}
                      <div className="flex w-full flex-col items-start gap-[14px]">
                        <div className="flex items-center gap-[6px] whitespace-nowrap text-[14px] leading-[1.7] text-black">
                          <p className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">{index + 1}.</p>
                          <p
                            className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both] font-(family-name:--font-gen-interface-jp) font-light text-[14px] tracking-[0.75px]"
                            style={SS09}
                          >
                            {principle.titleJa}
                          </p>
                        </div>
                        <div
                          className="w-full pl-[17px] text-justify font-(family-name:--font-gen-interface-jp) text-[13px] leading-[1.7] font-light tracking-[0.7px] text-black/70"
                          style={SS09}
                        >
                          {(principle.bodyJaSp ?? principle.bodyJa).map((paragraph, i) => (
                            <p
                              key={paragraph}
                              className={`mb-0 last:mb-0 ${paragraphTrimClass(i, (principle.bodyJaSp ?? principle.bodyJa).length)}`}
                            >
                              {paragraph}
                            </p>
                          ))}
                        </div>
                      </div>
                      {/* pl 18 → 17 — per direct follow-up ("Guiding Principlesの各タイトル
                          下要素の左マージンを1px詰めて")。上の日本語本文の pl も同時に 17。 */}
                      <div className="flex w-full flex-col items-start gap-[12px] pl-[17px]">
                        <p
                          className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both] text-justify text-[14px] leading-[1.7] whitespace-nowrap text-black/70"
                          style={{ marginTop: -5 }}
                        >
                          {principle.titleEn}
                        </p>
                        <div className="w-full text-[13px] leading-[1.2] text-black/50">
                          {(principle.bodyEnSp ?? principle.bodyEn).map((paragraph, i) => (
                            <p
                              key={paragraph}
                              className={`mb-0 last:mb-0 ${paragraphTrimClass(i, (principle.bodyEnSp ?? principle.bodyEn).length)}`}
                            >
                              {paragraph}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </MobileAboutSection>

            <MobileAboutSection id={spSectionId(ABOUT_NAV_ITEMS[2].id)} label="Services" index="03">
              {/* 各行の間隔（flex gap）20 → 18px — per direct follow-up
                  ("spのservices、media、awardsの行間を2px詰めて")。各行は
                  text-box-trim 済みの単行 <p> なので、行間の実体は leading
                  ではなくこの gap。Awards / Media も同時に 18px。 */}
              <div className="flex w-full items-start gap-[35px] text-justify text-[14px] leading-[1.8] whitespace-nowrap text-black">
                <div className="flex flex-col items-start gap-[18px]">
                  {SERVICES_COL_1.map((item) => (
                    <p key={item} className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
                      {item}
                    </p>
                  ))}
                </div>
                <div className="flex flex-col items-start gap-[18px]">
                  {SERVICES_COL_2.map((item) => (
                    <p key={item} className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
                      {item}
                    </p>
                  ))}
                </div>
              </div>
            </MobileAboutSection>

            {/* Awards/Media flatten PC's two columns into a single stacked
                list — Figma node 1067:4's own "04"/"05" sections lay every
                entry from both PC columns out in one vertical run (COL_1's
                own entries, then COL_2's, in that same order) rather than
                two side-by-side columns. */}
            <MobileAboutSection id={spSectionId(ABOUT_NAV_ITEMS[3].id)} label="Awards" index="04">
              <div className="flex w-full flex-col items-start gap-[18px] text-justify text-[14px] leading-[1.8] whitespace-nowrap text-black">
                {[...AWARDS_COL_1, ...AWARDS_COL_2].map((item) => (
                  <p key={item} className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
                    {item}
                  </p>
                ))}
              </div>
            </MobileAboutSection>

            <MobileAboutSection id={spSectionId(ABOUT_NAV_ITEMS[4].id)} label="Media" index="05">
              <div className="flex w-full flex-col items-start gap-[18px] text-justify text-[14px] leading-[1.8] whitespace-nowrap text-black">
                {[...MEDIA_COL_1, ...MEDIA_COL_2].map((item) =>
                  item.linked ? (
                    <a
                      key={item.text}
                      href={item.href ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline-sweep [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
                    >
                      {item.text}
                    </a>
                  ) : (
                    <p key={item.text} className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
                      {item.text}
                    </p>
                  ),
                )}
              </div>
            </MobileAboutSection>

            {/* Outline also flattens PC's two columns (COL_1 then COL_2, same
                order — Name/Founder/Established/Office/Related Projects, per
                Figma node 1067:4's own single-column "06" section) into one
                vertical run of label/value pairs. */}
            <MobileAboutSection id={spSectionId(ABOUT_NAV_ITEMS[5].id)} label="Outline" index="06">
              <div className="flex w-full flex-col items-start gap-[30px] text-justify leading-[1.6] text-black">
                {[...OUTLINE_COL_1, ...OUTLINE_COL_2].map((entry) => (
                  <div key={entry.label} className="flex flex-col items-start gap-[12px]">
                    <p className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both] font-(family-name:--font-courier) text-[12px] tracking-[-0.6px] text-black/50">
                      {entry.label}
                    </p>
                    {entry.href ? (
                      <a
                        href={entry.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline-sweep text-[14px] text-black [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
                      >
                        {entry.value}
                      </a>
                    ) : (
                      <p className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both] text-[14px] text-black">
                        {entry.value}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </MobileAboutSection>

          </div>

          {/* Line below Outline — matches PC's own identical treatment
              (app/about/page.tsx's own `border-b border-black/15` on its
              equivalent wrapper) — per direct follow-up ("Outlineエリアの
              下に線追加"), which this SP version had omitted entirely.
              Pulled out of the gap-[100px] flex column above (which the
              line used to sit inside as its *last* child, so it inherited
              that same 100px gap instead of its own dedicated distance) so
              its own `mt-[60px]` — per further direct follow-up, "Outline下
              の線までのマージンを60pxに変更" — can be set independently of
              the between-section spacing. A *wrapping* div carries the
              `paddingLeft: CONTENT_INDENT` here (not the line itself) —
              padding on the empty line div directly wouldn't actually inset
              its own visible background, which paints under padding by
              default; a padded parent shifting where its 100%-wide child
              starts is what the original left-edge fix (below) actually
              relied on, reproduced here rather than nesting the line back
              inside the section wrapper above. */}
          <div style={{ paddingLeft: CONTENT_INDENT }}>
            <div aria-hidden className="mt-[60px] h-px w-full bg-black/15" />

            {/* SP counterpart to app/about/page.tsx's own "Shift+G to show the
               grid." / "Fonts in Use: ..." row (no Shift+G shortcut exists on
               SP, so only this half is rendered here) — per direct follow-up
               ("Aboutページの一番下、Shift+Gと同じ並びに以下を左詰めで追加
               ...SPのときは以下の改行で入れる"): same font/color/opacity as
               PC's version (font-courier, text-black/50, matching e.g. the
               Outline label style a few lines up), three lines instead of
               one — line breaks after "Fonts in Use:" and after "Courier
               Prime," per further direct follow-up. "Gen Interface JP" links
               out to the typeface's own site (underline-sweep), matching
               PC's identical addition. */}
            <p className="mt-[18px] font-(family-name:--font-courier) text-[12px] tracking-[-0.6px] text-black/50 [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
              Fonts in Use:
              <br />
              Akzidenz-Grotesk Next, Courier Prime,
              <br />{" "}
              <a
                href="https://gen.typesetting.jp/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline-sweep"
                style={{ "--underline-offset": "calc(-0.1em + 3px)" } as React.CSSProperties}
              >
                Gen Interface JP
              </a>
            </p>
          </div>
        </div>

        {/* Was `pb-[20px]` on the `relative mt-[180px]` wrapper above — moved
            out here as a plain spacer (same 20px, same total spacing) so
            that wrapper's own bottom edge lines up exactly with the Outline
            line for MobileAboutSideNav's sticky release. See that wrapper's
            own doc comment above. */}
        <div aria-hidden className="h-[20px]" />

        {/* 直近再生のパラパラ — per direct follow-up ("sp、aboutのページ下
            にもPC同様に直近再生したジャケとアーティスト名を表示して ジャケ
            の上マージンは150pxで下マージンは現状のマージンと同じに")。
            上 150px、下は既存のトレーリングスペーサー（footerGapPx）が
            そのまま働くので現状どおり。SP では --scale = 1 なので
            RecentlyPlayedFlip の 110px/12px 指定はそのままの実寸で出る。 */}
        <div className="mt-[150px] flex w-full justify-center">
          <RecentlyPlayedFlip />
        </div>

        {/* Trailing spacer — see CONTENT_FOOTER_GAP_PX's own doc comment. */}
        <div style={{ height: footerGapPx }} />
      </div>
    </div>
  );
}
