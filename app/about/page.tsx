import type { Metadata, Viewport } from "next";
import { AboutBackground } from "@/components/about-background";
import { AboutSection } from "@/components/about-section";
import { AboutSideNav } from "@/components/about-side-nav";
import { GrainOverlay } from "@/components/grain-overlay";
import { HeaderSummon } from "@/components/header-summon";
import { MobileAbout } from "@/components/mobile-about";
import { PageBodyBackground } from "@/components/page-body-background";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  ABOUT_NAV_ITEMS,
  APPROACH_EN,
  APPROACH_JA,
  AWARDS_COL_1,
  AWARDS_COL_2,
  GUIDING_PRINCIPLES,
  MEDIA_COL_1,
  MEDIA_COL_2,
  OUTLINE_COL_1,
  OUTLINE_COL_2,
  SERVICES_COL_1,
  SERVICES_COL_2,
  VISION_EN,
  VISION_JA,
} from "@/lib/about-content";

// Composes against the root layout's own title template
// ("%s - ANDMADE Inc.") into "About - ANDMADE Inc.".
// `alternates.canonical` set explicitly here — Next.js's metadata merging
// replaces the parent's `alternates` object wholesale rather than merging
// field-by-field, so without this override the page would otherwise
// incorrectly inherit the root layout's own canonical ("/", the home page).
export const metadata: Metadata = { title: "About", alternates: { canonical: "/about" } };

// viewportFit: "cover" — per repeated follow-up describing a persistent pink
// margin at the very top of the screen that AboutBackground's own photo
// never reached, unaffected by repeatedly repositioning that photo (this
// file's own `ios-about-hero-bleed` bleed offset, and widening the photo
// itself): that area is the iOS status bar/dynamic-toolbar chrome itself,
// which sits *outside* the page's own CSS coordinate space entirely without
// this — no `top` offset on page content, however large, can ever paint
// into a region the browser doesn't consider part of the document at all.
// `viewport-fit=cover` is the standard mechanism that extends the page's own
// layout viewport to cover the true physical screen (root layout.tsx's own
// `viewport` export leaves this unset — every other route keeps the
// browser's own default reserved margin there, unaffected). Scoped to this
// route only (not the root layout) since it also shifts *every* other fixed/
// absolute top-anchored element's position on whichever page it's active —
// see mobile-about.tsx's own header `paddingTop` and mobile-menu.tsx's own
// `env(safe-area-inset-bottom)` compensations, both added alongside this so
// nothing on this specific route drifts under the notch/home-indicator as a
// side effect.
//
// NOT the `100vh`→`100dvh` + `position: fixed` background-layer approach
// (an alternative found and suggested as a follow-up): that combination
// solves a *different* iOS bug — content clipped at the *bottom* of a
// viewport-height-sized box when the address bar expands mid-scroll (100vh
// resolves to the *largest* possible viewport, so a box sized off it
// overflows past the *currently* visible, smaller one). AboutBackground has
// no vh/dvh height at all (its height is purely the photo's own intrinsic
// aspect ratio, `h-auto`), and `position: fixed` for this photo was already
// tried and deliberately reverted earlier in this project (see
// about-background.tsx's own top-level doc comment) — it needed a
// scroll-driven wash gradient to ever get out of the way on a page much
// taller than one screen, and that combination directly caused several of
// the exact bugs already fixed here (a mismatched-color seam, a gap opening
// at the screen's own top edge once parallax was added). Re-introducing it
// would very likely resurrect that same class of regression while not even
// addressing this specific top-of-screen gap, which was never a vh/dvh or
// scroll-clipping problem to begin with.
//
// (Historical note: the above is about AboutBackground specifically, the
// plain parallax photo this page renders below — for a while this page
// instead rendered FlowerShaderBackground/AboutHeroBackground, an animated
// shader version of this same hero (see that file's own doc history) that
// sidestepped every bug described above by construction: no scroll-driven
// wash gradient, no parallax drift to desync, and no vh/dvh sizing at all.
// Parked per direct follow-up ("背景画像を元の静止画の状態に戻して...まだ続
// きをどこかのタイミングでお願いするかも") — the shader components
// themselves are untouched and still fully wired up, just not rendered here
// for now; swap the import back to AboutHeroBackground (and restore this
// root div's own flat background below to bg-white, since the shader's own
// scroll-driven wash replaces what this static photo instead leans on a flat
// page color for) to resume that work.)
export const viewport: Viewport = { viewportFit: "cover" };

/** `font-feature-settings: "ss09" 1` — the stylistic set Gen Interface JP
 *  body copy uses throughout the About page (matches project-card.tsx's
 *  category text / Figma node 520:1634 etc.). */
const SS09 = { fontFeatureSettings: '"ss09" 1' } as const;

/** Trims only the leading/trailing half-leading of a stacked-paragraph
 *  block's first/last line (matching the [text-box-edge/trim] treatment
 *  used everywhere else in this codebase for single-line elements) without
 *  touching the natural line-height *between* paragraphs — trimming every
 *  paragraph individually would collapse that spacing to zero, since
 *  there's no `gap` between them (see BilingualBody below). Untrimmed, the
 *  first paragraph's own top half-leading was stacking on top of the
 *  section's own header-to-body gap, making it look bigger than the design. */
function paragraphTrimClass(index: number, length: number) {
  const isFirst = index === 0;
  const isLast = index === length - 1;
  if (isFirst && isLast) return "[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]";
  if (isFirst) return "[text-box-edge:cap_alphabetic] [text-box-trim:trim-start]";
  if (isLast) return "[text-box-edge:cap_alphabetic] [text-box-trim:trim-end]";
  return "";
}

/** The Vision/Approach two-column body: a wide Japanese paragraph column
 *  (Gen Interface JP Light, justified) beside a narrower English one
 *  (default sans, 50% black). Matches Figma nodes 520:1633/520:1641. */
function BilingualBody({ ja, en }: { ja: string[]; en: string[] }) {
  return (
    <div className="flex w-full items-start gap-[calc(30px*var(--grid-scale))] pl-[calc(116px*var(--grid-scale))]">
      <div
        className="w-[calc(638px*var(--grid-scale))] text-justify font-(family-name:--font-gen-interface-jp) text-[length:calc(16px*var(--scale))] leading-[1.7] font-light tracking-[calc(0.48px*var(--scale))] text-black"
        style={SS09}
      >
        {ja.map((paragraph, i) => (
          <p key={paragraph} className={`mb-0 last:mb-0 ${paragraphTrimClass(i, ja.length)}`}>
            {paragraph}
          </p>
        ))}
      </div>
      <div className="w-[calc(434px*var(--grid-scale))] text-[length:calc(14px*var(--scale))] leading-[1.2] text-black/50">
        {en.map((paragraph, i) => (
          <p key={paragraph} className={`mb-0 last:mb-0 ${paragraphTrimClass(i, en.length)}`}>
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  );
}

export default function About() {
  return (
    // bg-[#E897B4] — AboutBackground (below) has no scroll-driven wash of its
    // own (that mechanism only ever existed on the since-parked shader
    // version, see the `viewport` export's own doc comment above) — it just
    // fades its own photo's bottom edge into whatever flat color sits behind
    // it, so this root div needs to actually be that solid color the whole
    // way down, not white, per direct follow-up reverting back to this
    // original static-photo design ("背景画像を元の静止画の状態に戻して").
    // #E897B4 → #DEA4B0 → #E897B4 — the middle value was reverted per direct
    // follow-up ("Aboutの背景画像と色を元に戻して", alongside the photo file
    // itself being manually restored back too) — matches
    // PageBodyBackground's own color just below (this page's current chosen
    // pink, see that component's own history of hex changes).
    // pb-[30px] lg:pb-[28px] — PC-only 30px → 24px → 28px, both per direct
    // follow-up ("studiesとcontactに合わせて24pxにして", then "やっぱりちょっ
    // と下げすぎかな...28pxに変更して"): matches app/studies/page.tsx's own
    // bottom-[28px] SiteFooter offset and app/contact/page.tsx's own
    // bottom-[28px] footer elements exactly. `lg:` override only (base
    // pb-[30px] left as-is) — this div is shared by both the PC-only tree
    // and MobileAbout below, and only the PC value was asked to change.
    <div id="top" className="relative w-full flow-root bg-[#E897B4] pb-[30px] lg:pb-[28px]" style={{ minHeight: "100svh" }}>
      <PageBodyBackground color="#E897B4" />

      {/* Shared between both trees below, so it renders once,
          unconditionally, rather than being split/duplicated the way the
          rest of this page is — see this component's own doc history for
          why it's `position: absolute` (not `fixed`) and has no wash
          gradient of its own. */}
      <AboutBackground />

      {/* Same full-viewport, always-on grain Contact's own shader background
          renders inline — see grain-overlay.tsx's own top-level doc comment
          for why this page needs a standalone component for it instead of
          reusing FlowerShaderBackground directly, per direct follow-up
          ("contactと同じノイズをaboutにも適用して"). Rendered once here
          (like AboutBackground above), independent of the PC/SP split below. */}
      <GrainOverlay />

      {/* PC-only tree, split from SP's own (mobile-about.tsx) at Tailwind's
          default `lg` breakpoint (1024px) — same plain-CSS split as
          app/page.tsx's own PC/MobileHome pairing (see that file's own doc
          comment for why: avoids hydration mismatches, keeps both trees'
          state alive across a resize), added per direct follow-up ("SPの
          Aboutページ実装も進めて")。 */}
      <div className="hidden lg:contents">
        <div className="relative">
          <SiteHeader dark />

        <div className="relative mt-[calc(280px*var(--scale))]">
          <AboutSideNav />

          {/* Width here (and therefore this wrapper's own border-b, "Outline"
             section's own bottom line) uses `--content-width * --grid-scale`
             directly rather than `--content-width-fluid` — per explicit spec
             ("outlineの下の線も幅に合わせて"), matching the same fluid
             treatment AboutSection's own border-t/index row just got: unlike
             `--content-width-fluid`, this doesn't clamp at a flat 1218px
             below the 1440px breakpoint, so this line keeps shrinking down to
             the 1024px floor instead of staying pixel-locked. Safe to change
             here (unlike most `--content-width-fluid` usages elsewhere on
             this page) because every child section's own actual content
             already sizes itself independently via explicit
             `calc(Npx*var(--grid-scale))` widths (BilingualBody's columns,
             the Services/Awards/Media/Outline column pairs, etc.) rather than
             inheriting 100% of this wrapper — so narrowing this wrapper only
             ever shrinks unused trailing space, never the body copy itself. */}
          <div className="relative ml-[calc(198px*var(--grid-scale))] flex w-[calc(var(--content-width)*var(--grid-scale))] flex-col items-start gap-[calc(130px*var(--scale))] border-b border-black/15 pb-[calc(80px*var(--scale))]">
            <AboutSection id={ABOUT_NAV_ITEMS[0].id} label="Vision" index="01">
              <BilingualBody ja={VISION_JA} en={VISION_EN} />
            </AboutSection>

            <AboutSection id={ABOUT_NAV_ITEMS[1].id} label="Approach" index="02">
              <div className="flex w-full flex-col items-start gap-[calc(70px*var(--scale))]">
                <BilingualBody ja={APPROACH_JA} en={APPROACH_EN} />

                <div className="flex w-full flex-col items-start gap-[calc(40px*var(--scale))]">
                  <p className="pl-[calc(116px*var(--grid-scale))] text-justify text-[length:calc(14px*var(--scale))] leading-[1.2] font-medium whitespace-nowrap text-black [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
                    Guiding Principles
                  </p>

                  {GUIDING_PRINCIPLES.map((principle, index) => (
                    <div
                      key={principle.titleEn}
                      className="flex w-full items-start gap-[calc(30px*var(--grid-scale))] pl-[calc(116px*var(--grid-scale))]"
                    >
                      <div className="flex flex-col items-start justify-center gap-[calc(20px*var(--scale))]">
                        {/* "1."-"4." numbering — per Figma node 520:1636
                            (e.g. node 1177:2/3/6), missing from the previous
                            version of this section entirely. The digit
                            itself is plain default sans (no
                            font-gen-interface-jp), matching Figma's own
                            Akzidenz-Grotesk_Next:Regular there. */}
                        <div className="flex items-center gap-[calc(6px*var(--scale))] whitespace-nowrap text-[length:calc(16px*var(--scale))] leading-[1.7] text-black">
                          <p className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">{index + 1}.</p>
                          <p
                            className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both] font-(family-name:--font-gen-interface-jp) font-light tracking-[calc(0.8px*var(--scale))]"
                            style={SS09}
                          >
                            {principle.titleJa}
                          </p>
                        </div>
                        {/* pl-[18px] — per Figma node 520:1636 (e.g. node
                            1178:2/1178:14/1178:25/1178:37, all wrapping
                            their own body text in this same offset): indents
                            the body copy so its own left edge lines up with
                            the JA heading text just above it (past the "1."
                            number + gap-6 before it), not flush with the
                            number itself — per direct follow-up ("各見出し
                            下の要素の左面...は左詰めではなく、日本語見出し
                            の左面に合わせて"). */}
                        <div
                          className="w-[calc(638px*var(--grid-scale))] pl-[calc(18px*var(--scale))] text-justify font-(family-name:--font-gen-interface-jp) text-[length:calc(14px*var(--scale))] leading-[1.7] font-light tracking-[calc(0.7px*var(--scale))] text-black/70"
                          style={SS09}
                        >
                          {principle.bodyJa.map((paragraph, i) => (
                            <p
                              key={paragraph}
                              className={`mb-0 last:mb-0 ${paragraphTrimClass(i, principle.bodyJa.length)}`}
                            >
                              {paragraph}
                            </p>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col items-start justify-center gap-[calc(20px*var(--scale))]">
                        <p className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both] w-[calc(434px*var(--grid-scale))] text-[length:calc(15px*var(--scale))] leading-[1.7] text-black/70">
                          {principle.titleEn}
                        </p>
                        <div className="w-[calc(434px*var(--grid-scale))] text-[length:calc(14px*var(--scale))] leading-[1.2] text-black/50">
                          {principle.bodyEn.map((paragraph, i) => (
                            <p
                              key={paragraph}
                              className={`mb-0 last:mb-0 ${paragraphTrimClass(i, principle.bodyEn.length)}`}
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
            </AboutSection>

            <AboutSection id={ABOUT_NAV_ITEMS[2].id} label="Services" index="03">
              <div className="flex w-full items-start pl-[calc(116px*var(--grid-scale))] text-justify text-[length:calc(15px*var(--scale))] leading-[1.8] text-black">
                <div className="flex w-[calc(464px*var(--grid-scale))] flex-col items-start gap-[calc(20px*var(--scale))]">
                  {SERVICES_COL_1.map((item) => (
                    <p key={item} className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
                      {item}
                    </p>
                  ))}
                </div>
                <div className="flex flex-col items-start gap-[calc(20px*var(--scale))]">
                  {SERVICES_COL_2.map((item) => (
                    <p key={item} className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
                      {item}
                    </p>
                  ))}
                </div>
              </div>
            </AboutSection>

            <AboutSection id={ABOUT_NAV_ITEMS[3].id} label="Awards" index="04">
              <div className="flex w-full items-start pl-[calc(116px*var(--grid-scale))] text-justify text-[length:calc(15px*var(--scale))] leading-[1.8] text-black">
                <div className="flex w-[calc(464px*var(--grid-scale))] flex-col items-start gap-[calc(20px*var(--scale))]">
                  {AWARDS_COL_1.map((item) => (
                    <p key={item} className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
                      {item}
                    </p>
                  ))}
                </div>
                <div className="flex flex-col items-start gap-[calc(20px*var(--scale))]">
                  {AWARDS_COL_2.map((item) => (
                    <p key={item} className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
                      {item}
                    </p>
                  ))}
                </div>
              </div>
            </AboutSection>

            <AboutSection id={ABOUT_NAV_ITEMS[4].id} label="Media" index="05">
              <div className="flex w-full items-start pl-[calc(116px*var(--grid-scale))] text-justify text-[length:calc(15px*var(--scale))] leading-[1.8] text-black">
                <div className="flex w-[calc(464px*var(--grid-scale))] flex-col items-start gap-[calc(20px*var(--scale))]">
                  {MEDIA_COL_1.map((item) =>
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
                <div className="flex flex-col items-start gap-[calc(20px*var(--scale))]">
                  {MEDIA_COL_2.map((item) =>
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
              </div>
            </AboutSection>

            <AboutSection id={ABOUT_NAV_ITEMS[5].id} label="Outline" index="06">
              <div className="flex w-full items-start pl-[calc(116px*var(--grid-scale))] text-justify leading-[1.6] text-black">
                {[OUTLINE_COL_1, OUTLINE_COL_2].map((column, i) => (
                  <div
                    key={i}
                    className="flex w-[calc(464px*var(--grid-scale))] flex-col items-start gap-[calc(30px*var(--scale))]"
                  >
                    {column.map((entry) => (
                      <div key={entry.label} className="flex flex-col items-start gap-[calc(12px*var(--scale))]">
                        <p className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both] font-(family-name:--font-courier) text-[length:calc(12px*var(--scale))] tracking-[calc(-0.6px*var(--scale))] text-black/50">
                          {entry.label}
                        </p>
                        {entry.href ? (
                          <a
                            href={entry.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline-sweep text-[length:calc(15px*var(--scale))] text-black [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
                          >
                            {entry.value}
                          </a>
                        ) : (
                          <p className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both] text-[length:calc(15px*var(--scale))] text-black">
                            {entry.value}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </AboutSection>

            {/* Absolutely positioned (top: 100% = exactly the border-b's own
                line, then pushed down calc(18px*var(--scale)) from there) —
                per explicit spec ("Outlineエリア下のラインから18pxの位置に")
                — rather than a plain in-flow sibling, so it doesn't add to
                this wrapper's own height and push the footer below (whose
                own mt-[calc(330px*var(--scale))] a few lines down is tuned
                against *this* div's bottom edge specifically). right-0 (not
                left-0) — per direct follow-up ("Shift+G to show the
                grid.を右端に移動"): flush with this wrapper's own right
                edge, i.e. the same right end as the border-b line above it. */}
            <p
              className="absolute right-0 font-(family-name:--font-courier) text-[length:calc(12px*var(--scale))] tracking-[calc(-0.6px*var(--scale))] text-black/50 [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
              style={{ top: "100%", marginTop: "calc(18px * var(--scale))" }}
            >
              Shift+G to show the grid.
            </p>

            {/* Left-aligned counterpart to "Shift+G to show the grid." above —
               same row (top: 100% + the same 18px*scale marginTop), same
               font/color/opacity (font-courier, text-black/50) — per direct
               follow-up ("Aboutページの一番下、Shift+Gと同じ並びに以下を左詰
               めで追加 フォントと色、透過はShift+Gのテキストと合わせる").
               "Gen Interface JP" links out to the typeface's own site
               (underline-sweep — same underline+hover-sweep treatment as
               every other inline text link site-wide), per further direct
               follow-up. */}
            <p
              className="absolute left-0 font-(family-name:--font-courier) text-[length:calc(12px*var(--scale))] tracking-[calc(-0.6px*var(--scale))] text-black/50 [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
              style={{ top: "100%", marginTop: "calc(18px * var(--scale))" }}
            >
              Fonts in Use: Akzidenz-Grotesk Next, Courier Prime,{" "}
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

          <div className="ml-[calc(198px*var(--grid-scale))] mt-[calc(330px*var(--scale))] w-[var(--content-width-fluid)]">
            <SiteFooter theme="dark" />
          </div>
        </div>

          <HeaderSummon />
        </div>
      </div>

      <MobileAbout />
    </div>
  );
}
