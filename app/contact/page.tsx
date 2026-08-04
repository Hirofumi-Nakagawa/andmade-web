import type { Metadata } from "next";
import { CopyEmail } from "@/components/copy-email";
import { INSTAGRAM_URL, SITE_NAME, SITE_URL, X_URL } from "@/lib/site";
import Image from "next/image";
import Link from "next/link";
import { ContactHero } from "@/components/contact-hero";
import { CopyrightYear } from "@/components/copyright-year";
import { ContactBlendBackground } from "@/components/contact-blend-background";
import { CurtainRevealLines } from "@/components/curtain-reveal-lines";
import { StatusBarMaskColor } from "@/components/status-bar-mask";
import { HeaderSummon } from "@/components/header-summon";
import { MobileContact } from "@/components/mobile-contact";
import { RevealOnMount } from "@/components/reveal-on-mount";
import { SiteHeader } from "@/components/site-header";
import { withBasePath } from "@/lib/base-path";

/** The page's own 3-line English tagline — per direct follow-up ("この英字3
 *  行は下からスライドイン+フェードインは無しで、変わりにカーテンリビールを
 *  つけて"), curtain-revealed via CurtainRevealLines instead of the usual
 *  RevealOnMount slide+fade every other block on this page still uses.
 *  Duplicated in mobile-contact.tsx (not imported) — same convention as
 *  every other piece of literal copy shared between this page's PC/SP
 *  trees. */
const CONTACT_TAGLINE_LINES = [
  "Every project starts with a conversation.",
  "Together, we’ll uncover the essence and shape",
  "it into something clear and lasting.",
];

// Composes against the root layout's own title template
// ("%s - ANDMADE Inc.") into "Contact - ANDMADE Inc.".
// `alternates.canonical` set explicitly here — Next.js's metadata merging
// replaces the parent's `alternates` object wholesale rather than merging
// field-by-field, so without this override the page would otherwise
// incorrectly inherit the root layout's own canonical ("/", the home page).
export const metadata: Metadata = { title: "Contact", alternates: { canonical: "/contact/" } };

/** `font-feature-settings: "ss09" 1` — matches the stylistic set used for
 *  Gen Interface JP body copy elsewhere (about page, project-card.tsx). */
const SS09 = { fontFeatureSettings: '"ss09" 1' } as const;

/** Below this window *height*, the page stops shrinking any further — see
 *  `PAGE_HEIGHT` below. */
const COMPACT_MIN_HEIGHT_PX = 750;
/** The page's own effective height: exactly the viewport above
 *  COMPACT_MIN_HEIGHT_PX (unchanged, no-scroll behavior), but frozen at
 *  COMPACT_MIN_HEIGHT_PX below it rather than continuing to shrink — so the
 *  ©/photo placeholder (both sized/positioned off this same value, not raw
 *  `100vh`) stay exactly as they'd look at a 750px-tall window instead of
 *  cramming further, and the page simply becomes taller than the actual
 *  window and scrolls (native/Lenis document scroll — nothing about this
 *  page needs its own scroll container) once the window goes below that. */
const PAGE_HEIGHT = `max(100vh, ${COMPACT_MIN_HEIGHT_PX}px)`;

/**
 * Contact page (Figma node 330:1103) — the one dark-themed page on the
 * site: pure black (#000) background, all text pure white (#fff) — per
 * direct follow-up ("contactページの背景色は#000に、文字はすべて#fffに"),
 * replacing the original dark olive (#181609) background and #e5e5e5/#757575
 * text scheme. Same grid/scale conventions as Home/About (--scale,
 * --grid-scale, --content-width-fluid, text-box-trim) throughout.
 *
 * The footer here is deliberately not the shared SiteFooter component —
 * Figma's own mockup only shows a plain "©2026 / ANDMADE Inc." line (no
 * logo, no Inquiries/Social, no Back to top), since this page's own content
 * already surfaces the Inquiries/Social block directly above it.
 */
/**
 * ContactPage structured data, with the studio's real inquiry address as a
 * ContactPoint. The email is the same `mailto:` this page already renders
 * visibly further down — it's public either way, so this exposes nothing new,
 * it just states the relationship ("this address is how you reach this
 * organization for inquiries") in a form answer engines can use directly.
 */
const contactJsonLd = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  url: `${SITE_URL}/contact/`,
  name: `Contact - ${SITE_NAME}`,
  mainEntity: {
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    email: "info@andmade.jp",
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "sales",
      email: "info@andmade.jp",
      availableLanguage: ["Japanese", "English"],
    },
    sameAs: [INSTAGRAM_URL, X_URL],
  },
};

export default function Contact() {
  return (
    <div id="top" className="relative w-full flow-root" style={{ backgroundColor: "#000" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(contactJsonLd) }}
      />
      {/* iOS status-bar mask follows this page's own black — see
         components/status-bar-mask.tsx. */}
      <StatusBarMaskColor color="#000" />
      {/* bg-lab.htmlの黒ベース設定を移植したシェーダー背景(bg-lab移植版) —
         背景の変遷: 画像ベース(FlowerShaderBackground + melt-bg.jpg) → この
         bg-lab移植版 → #000ベタ → 画像ベースに一瞬戻し → 最終的にこれ(per
         direct follow-up "やっぱり一つ前のシェーダーのやつに戻して")。
         画像ベース版もディスク上に残っている。色0が#000000なのでページ自身の
         背景色ともシームレス。 */}
      <ContactBlendBackground />

      {/* PC-only tree, split from SP's own (mobile-contact.tsx) at Tailwind's
         default `lg` breakpoint (1024px) — same plain-CSS split as
         app/studies/page.tsx's own StudiesGallery/MobileStudies pairing (see
         that file's own doc comment for why). The shared `#000` background
         above stays outside this split, unconditional for both trees. */}
      <div className="hidden lg:contents">
      <div className="relative overflow-hidden" style={{ height: PAGE_HEIGHT }}>
        <SiteHeader contact />

        <div className="relative mt-[calc(280px*var(--scale))]">
          {/* Left margin matches the Home page's Tx/Th toggle
              (project-view-toggle.tsx: ml-[calc(24px*var(--grid-scale))]),
              same 12px/medium text — vertically aligned to "Get in touch."'s
              own *bottom* edge instead (bottom-0, positioned against the
              wrapper directly below rather than the outer mt-280-offset
              origin div — that wrapper is a plain, otherwise-unstyled
              `relative` box sized to ContactHero's own rendered height, so
              bottom-0 here lands exactly on ContactHero's own bottom edge
              regardless of its exact trimmed pixel height, without needing
              to know that height). Only the first line gets trim-start and
              only the last gets trim-end (matching app/about/page.tsx's
              paragraphTrimClass convention for stacked multi-line text) —
              trimming every line would collapse the natural 1.15 leading
              *between* them along with the unwanted leading above/below the
              whole block; this way only the outer edges are trimmed, so the
              block's bottom still lands exactly on "Get in touch."'s own
              bottom edge. No mix-blend-exclusion since this page has no
              photo/light background to blend against (plain #fff on
              black, like the rest of Contact's own text). */}
          <div className="relative">
            <RevealOnMount className="absolute bottom-0 ml-[calc(24px*var(--grid-scale))] whitespace-nowrap text-[length:calc(12px*var(--scale))] leading-[1.15] font-normal text-[#fff]">
              <p className="mb-0 [text-box-edge:cap_alphabetic] [text-box-trim:trim-start]">{`We’re always`}</p>
              <p className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-end]">open to new ideas.</p>
            </RevealOnMount>

            <ContactHero />

            {/* 右端の "( Rooted in purpose , Designed with clarity , Built to
                last )" キャプションはここにあったが、per direct follow-up
                ("contactの下記を消して") で削除。SP側(mobile-contact.tsx)は
                それより前に同じ理由で外されており、これで PC/SP どちらにも
                出なくなった。同じ3語は site-intro.tsx のピルと
                idle-overlay.tsx にも出てくるので、そちらは別物として残っている。
                復活させる場合はこのファイルの版歴から JSX を戻すこと
                （右端 24px = var(--edge-right-inset) + 24px、ContactHero の
                 下端揃え、区切りカンマは 5px gap）。 */}
          </div>

          <div className="ml-[calc(198px*var(--grid-scale))] mt-[calc(40px*var(--scale))] flex flex-col items-start gap-[calc(40px*var(--scale))]">
            {/* gap tightened 40px → 35px → 30px (two direct follow-ups, "3行
                英字の下マージンを5px詰めて" ×2) — the space directly below
                the 3-line English tagline above (only affects the gap
                between it and the Japanese paragraph right below it, not the
                further-down Inquiries/Social block, which sits in the outer
                flex-col's own separate gap). */}
            <div className="flex flex-col items-start gap-[calc(30px*var(--scale))] text-[#fff]">
              <CurtainRevealLines
                lines={CONTACT_TAGLINE_LINES}
                className="text-[length:calc(26px*var(--scale))] leading-[1.2]"
                // pb-[8px] on the trimmed last line only (bumped up from an
                // initial 4px, which still wasn't quite enough clearance) —
                // per direct follow-up ("contactの3行英字の3行目の下がマスク
                // で文字が見切れてる"): text-box-trim:trim-end sizes that line's own
                // box tightly to the alphabetic baseline (no leading below
                // it), but this line's actual text ("it into something clear
                // and lasting.") has real descenders (the "g" in "something"
                // and "lasting") whose ink dips below that baseline — with
                // zero clearance there, this line's own overflow-hidden
                // curtain-reveal mask (see curtain-reveal-lines.tsx) was
                // clipping those descenders. The wrapping mask div has no
                // explicit height of its own (it just shrinks to fit this
                // <p>'s rendered box), so padding-bottom here grows that mask
                // just enough to give the descenders room, the same
                // clearance-instead-of-removing-the-trim fix already used for
                // an identical glyph-overshoot issue in now-playing-ticker.tsx.
                lineClassNames={[undefined, undefined, "[text-box-edge:cap_alphabetic] [text-box-trim:trim-end] pb-[calc(8px*var(--scale))]"]}
              />
              <RevealOnMount
                className="font-(family-name:--font-gen-interface-jp) text-[length:calc(14px*var(--scale))] leading-[1.75] font-light whitespace-nowrap tracking-[calc(0.7px*var(--scale))]"
                style={SS09}
              >
                <p className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">プロジェクトのご相談やご質問など、まずはお気軽にお問い合わせください。</p>
              </RevealOnMount>
            </div>

            <RevealOnMount className="flex w-[calc(342px*var(--scale))] items-start justify-between leading-[1.6]">
              <div className="flex flex-col items-start gap-[calc(15px*var(--scale))]">
                {/* /50 — per direct follow-up ("contactの「Inquiries、
                    Social」は透過50%に"): these are the small label captions
                    above the actual email/social links, not the links
                    themselves, so they stay dimmer than the surrounding
                    full-white (#fff) text. */}
                <p className="font-(family-name:--font-courier) text-[length:calc(12px*var(--scale))] text-[#fff]/50 tracking-[calc(-0.6px*var(--scale))] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
                  Inquiries
                </p>
                {/* mailto → クリックでコピー＋"Copied" 表示（copy-email.tsx）
                    — per direct follow-up。見た目のクラスは従来のまま。 */}
                <CopyEmail inverted className="underline-sweep text-[length:calc(18px*var(--scale))] text-[#fff] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]" />
              </div>
              <div className="flex flex-col items-start gap-[calc(15px*var(--scale))]">
                <p className="font-(family-name:--font-courier) text-[length:calc(12px*var(--scale))] text-[#fff]/50 tracking-[calc(-0.6px*var(--scale))] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
                  Social
                </p>
                <div className="flex items-center gap-[calc(10px*var(--scale))] text-[length:calc(18px*var(--scale))] text-[#fff]">
                  <a
                    href="https://www.instagram.com/andmade_inc"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline-sweep [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
                  >
                    Instagram
                  </a>
                  <span className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">,</span>
                  <a
                    href="https://x.com/ANDMADE_jp"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline-sweep [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
                  >
                    X
                  </a>
                </div>
              </div>
            </RevealOnMount>
          </div>
        </div>

        {/* The bottom-right photo box (originally a flat #858585 Figma
            placeholder, briefly a shader-effect panel) has been removed
            entirely. A real photo may go back in this same spot
            later — reinstating it just means re-adding a wrapper div here
            (bottom-24px anchored, aspect-[348/464], height derived from
            PAGE_HEIGHT — see this file's own version history for the exact
            markup that was here). */}

        <RevealOnMount className="absolute bottom-[28px] ml-[calc(198px*var(--grid-scale))] text-[length:calc(30px*var(--scale))] leading-[1.05] font-medium text-[#fff] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
          <p className="mb-0">
            ©<CopyrightYear />
          </p>
          <p>ANDMADE Inc.</p>
        </RevealOnMount>

        {/* Same logo mark as SiteFooter (/andmade-mark.svg) — per direct
            follow-up ("pcのcontactの右下に他ページのフッターに入れてるロゴを
            #fffで配置して"). No invert filter needed here (unlike
            SiteFooter's "dark" theme): the SVG's paths are hardcoded
            fill="white" already, and this page's background is plain black,
            so it renders white with no extra treatment. Bottom-right
            anchored like the page's own ©/ANDMADE Inc. block, using the same
            right-edge convention (var(--edge-right-inset)) and 52px*scale
            sizing as SiteFooter's own logo.

            Links back to "/" — per direct follow-up ("contactの右下ロゴに
            トップへの導線追加"), same behavior as SiteFooter's own logo
            (components/site-footer.tsx). No longer aria-hidden/decorative
            now that it's an actual navigation link. */}
        <RevealOnMount
          className="absolute bottom-[28px] h-[calc(52px*var(--scale))] w-[calc(52px*var(--scale))]"
          style={{ right: "calc(var(--edge-right-inset) + 24px)" }}
        >
          <Link href="/" className="block h-full w-full">
            <Image src={withBasePath("/andmade-mark.svg")} alt="ANDMADE" width={52} height={52} className="h-full w-full" />
          </Link>
        </RevealOnMount>

        <HeaderSummon noBlend />
      </div>
      </div>

      <MobileContact />
    </div>
  );
}
