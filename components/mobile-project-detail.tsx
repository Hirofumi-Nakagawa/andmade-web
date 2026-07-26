"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useLenis } from "lenis/react";
import { ScrambleText } from "@/components/scramble-text";
import { ProjectHeroParallax } from "@/components/project-hero-parallax";
import { ProjectDetailReveal } from "@/components/project-detail-reveal";
import { setFooterReady as broadcastFooterReady } from "@/lib/footer-mode-store";
import { setLightMenuPill } from "@/lib/menu-theme-store";
import { useNowPlaying } from "@/components/now-playing-provider";
import {
  slugify,
  type Project,
  type ProjectDetail,
  type ProjectGalleryBlock,
  type ProjectGalleryImage,
} from "@/lib/projects";

/** Page's own side margin — same fluid `--sp-grid-margin` (8px at the 400px
 *  reference canvas) every other Mobile* component uses for its own side
 *  margin, rather than a literal `px-[8px]`, so this stays aligned with
 *  GridOverlay's own SP grid at every viewport width. */
const SIDE_ML = "var(--sp-grid-margin)";
/** "ANDMADE Inc." header logo's own left offset — 2 grid columns in from
 *  SIDE_ML, matching every other Mobile* component's own header position
 *  (mobile-home.tsx's own CONTENT_INDENT, mobile-contact.tsx/mobile-
 *  studies.tsx's own TEXT_LEFT) — per direct follow-up ("ヘッダーロゴはSPの
 *  他ページ同様の位置に合わせて"): this page's own header previously sat
 *  flush at SIDE_ML alone, further left than every other SP page's logo. */
const HEADER_ML = "calc(var(--sp-grid-column-width) * 2 + var(--sp-grid-margin))";
/** Left offset for the Date/Link column in the Category/Role/Date/Link
 *  recap row below — per direct follow-up ("Credit上のDateとLinkの左面は左
 *  から8個目のグリッドに合わせる"), replacing the earlier CSS-grid `1fr`
 *  auto-split (which only approximated Figma's own literal offsets) with a
 *  literal "8 grid columns in" position, same idiom as HEADER_ML above. Date
 *  and Link share this one left edge because they're stacked in the same
 *  visual column (Date on top, Link directly below it), not side by side.
 *  Shifted 8 → 7 (one grid column left), per further follow-up
 *  ("SPのCredit上のDateとLinkを1マス左へ"). */
const CREDIT_FIELD_LEFT = "calc(var(--sp-grid-column-width) * 7 + var(--sp-grid-margin))";
const CREAM = "#f6f6f4";
const DEFAULT_BACKGROUND = "#1a2d8b";
/** Distance-from-bottom (px) that flips MobileMenu into footer mode — same
 *  value/mechanism as mobile-about.tsx's own FOOTER_READY_THRESHOLD_PX. */
const FOOTER_READY_THRESHOLD_PX = 100;
/** Gap between this page's last real content and the trailing spacer below
 *  it (where MobileMenu's own footer-mode panel grows in from) — same value
 *  as mobile-about.tsx's own CONTENT_FOOTER_GAP_PX, not a separately-derived
 *  Figma gap (this page has no Figma spec for that transition at all — see
 *  this component's own top-level doc comment). 550px per a direct
 *  follow-up ("それぞれのフッター用トレーリングスペーサーを550pxに戻して"),
 *  after briefly 500px, then 120px, per still-earlier direct follow-ups. Only
 *  applies while a track is playing — see CONTENT_FOOTER_GAP_PX_IDLE below
 *  for the no-track-playing case. */
const CONTENT_FOOTER_GAP_PX = 550;
/** Same spacer, but for when no track is currently playing — per direct
 *  follow-up ("再生中の曲がないとき、SPのフッター用トレーリングスペーサーを
 *  menuの高さに合わせて550pxから400pxに変更して"): MobileMenu's own
 *  footer-mode panel is shorter without a "Playing" line to show, so the
 *  spacer that reserves room for it below the content can shrink to match. */
const CONTENT_FOOTER_GAP_PX_IDLE = 400;
/** `font-feature-settings: "ss09" 1` — same stylistic set every other Gen
 *  Interface JP body copy on this site uses (app/projects/[slug]/page.tsx's
 *  own SS09, mobile-about.tsx's own SS09, etc.). */
const SS09 = { fontFeatureSettings: '"ss09" 1' } as const;

/** Trims only the leading/trailing half-leading of a stacked-paragraph
 *  block's first/last line — duplicated from every other page's identical
 *  helper (app/projects/[slug]/page.tsx's own paragraphTrimClass,
 *  mobile-about.tsx's own copy, etc.) rather than importing one, matching
 *  this codebase's established convention for this specific helper. */
function paragraphTrimClass(index: number, length: number) {
  const isFirst = index === 0;
  const isLast = index === length - 1;
  if (isFirst && isLast) return "[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]";
  if (isFirst) return "[text-box-edge:cap_alphabetic] [text-box-trim:trim-start]";
  if (isLast) return "[text-box-edge:cap_alphabetic] [text-box-trim:trim-end]";
  return "";
}

/** One gray-box-with-optional-photo gallery slot — SP counterpart of
 *  app/projects/[slug]/page.tsx's own GalleryImage. `unoptimized` whenever
 *  `image` is a full URL, for the same reason as that component's own doc
 *  comment (temporary, non-allow-listed Figma CDN preview URLs). */
function MobileGalleryImage({
  image,
  aspect,
  mask,
  alt = "",
  sizes = "100vw",
}: ProjectGalleryImage & { alt?: string; mask?: string; sizes?: string }) {
  return (
    <div
      // bg-[#d9d9d9] only while no real photo is set yet — per direct
      // follow-up ("詳細ページで透過の画像を登録したら、透過部分がグレーに
      // なってるので、画像の背景色は設定しない限り、色はなしにして"): once a
      // real (possibly transparent-PNG) photo exists, this box no longer
      // forces a gray fill behind it.
      className={`relative w-full overflow-hidden ${image ? "" : "bg-[#d9d9d9]"}`}
      style={{
        aspectRatio: aspect,
        ...(mask
          ? { maskImage: `url(${mask})`, WebkitMaskImage: `url(${mask})`, maskSize: "cover", WebkitMaskSize: "cover" }
          : {}),
      }}
    >
      {image && (
        <Image
          src={image}
          alt={alt}
          fill
          sizes={sizes}
          unoptimized={image.startsWith("http")}
          className="object-cover"
        />
      )}
    </div>
  );
}

/** SP counterpart of GalleryVideo — same gray-placeholder-until-a-real-`src`
 *  behavior. */
function MobileGalleryVideo({ src, poster, aspect }: { src?: string; poster?: string; aspect: number }) {
  return (
    <div className={`relative w-full overflow-hidden ${src ? "" : "bg-[#d9d9d9]"}`} style={{ aspectRatio: aspect }}>
      {src && (
        <video
          src={src}
          poster={poster}
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
        />
      )}
    </div>
  );
}

/**
 * Renders one ProjectGalleryBlock for SP — reuses the exact same
 * `detail.gallery` array PC's own GalleryBlockView reads (see that
 * component's own doc comment, and lib/projects.ts's own ProjectGalleryBlock
 * doc comment), just mapped onto SP's own three width treatments instead of
 * PC's 24/20-grid-column system:
 *  - "full": edge-to-edge (100vw via negative side margins), matching PC.
 *  - "content": inset to this page's own standard SIDE_ML, PC's equivalent.
 *  - "inset" / "insetSmall": PC's own heavily-padded, background-colored box
 *    (either width variant — see ProjectGalleryWidth's own doc comment)
 *    drops its padding/background on SP but keeps the same side margin as
 *    "content" — per direct follow-up ("insetを選択時はSPではcontent選択時
 *    と同じく両サイドに余白がつくようにして"), replacing an earlier version
 *    that collapsed all the way to full-bleed (per an even earlier
 *    follow-up "PCの1カラム画像で上下左右にpaddingのあるやつはSPではpadding
 *    なしに"). The code below doesn't actually branch on "inset" vs.
 *    "insetSmall" specifically — anything that isn't "full" falls into this
 *    same side-padding treatment, so "insetSmall" (added later) needed no
 *    code change here at all, just this note.
 *  - "twoColumn": stacked vertically (both images at "content" width, gap
 *    matching the others) instead of PC's side-by-side pair — SP flattens
 *    every PC side-by-side layout into a single column, same convention
 *    mobile-about.tsx's own Services/Awards/Media/Outline sections already
 *    use for their PC two-column data. This block's own `width` (full/
 *    content/inset — only meaningful for PC's own asymmetric-padding "inset"
 *    layout, see ProjectGalleryBlock's own "twoColumn" doc comment) is
 *    intentionally ignored here; SP always renders this same stacked layout
 *    regardless of it.
 */
function MobileGalleryBlockView({ block }: { block: Exclude<ProjectGalleryBlock, { type: "idea" } | { type: "outcome" }> }) {
  if (block.type === "twoColumn") {
    return (
      <div className="flex w-full flex-col items-stretch gap-[10px]" style={{ paddingLeft: SIDE_ML, paddingRight: SIDE_ML }}>
        {block.images.map((image, i) => (
          <MobileGalleryImage key={i} {...image} />
        ))}
      </div>
    );
  }

  const media =
    block.type === "video" ? (
      <MobileGalleryVideo src={block.src} poster={block.poster} aspect={block.aspect} />
    ) : (
      <MobileGalleryImage image={block.image} aspect={block.aspect} />
    );

  if (block.width === "full") return media;

  // "content" and "inset" now share the exact same SP treatment — plain
  // side padding at SIDE_ML, no background box — per direct follow-up
  // ("insetを選択時はSPではcontent選択時と同じく両サイドに余白がつくように
  // して"). PC's own separate padded/background-colored "inset" box only
  // applies there; see GalleryMediaBlock's own doc comment (app/projects/
  // [slug]/page.tsx).
  return <div style={{ paddingLeft: SIDE_ML, paddingRight: SIDE_ML }}>{media}</div>;
}

/**
 * Bilingual caption + JA/EN text block — SP counterpart of
 * app/projects/[slug]/page.tsx's own BilingualSection (Figma nodes
 * 1353:839/846, 1365:1046 for Overview/Idea/Outcome respectively): unlike
 * PC's side-by-side caption-column + JA/EN-row layout, SP stacks caption
 * (small, muted, Courier or plain per `courierCaption`) directly above the
 * JA paragraph block, directly above the EN one — same "stack instead of
 * side-by-side" simplification mobile-about.tsx's own MobileBilingualBody
 * already uses for PC's Vision/Approach columns.
 *
 * `captionSize`/`captionTracking` — per Figma, "(Overview)" (12px/-0.6px)
 * and "(Idea)"/"(Outcome)" (14px/-0.7px) genuinely use two different caption
 * sizes in this design (not a copy/paste slip on Figma's part, as far as
 * this component can tell) — reproduced here as literal per-instance
 * overrides rather than silently normalizing them to one shared value.
 */
function MobileBilingualSection({
  caption,
  ja,
  en,
  captionSize = 12,
  captionTracking = -0.6,
  dark = false,
}: {
  caption: string;
  ja: string[];
  en: string[];
  captionSize?: number;
  captionTracking?: number;
  /** Matches this project's own `detail.headerColor` — per direct follow-up
   *  ("overview、idea、outcomeのテキストもヘッダーの文字色を変更したら変わ
   *  るようにして"), same PC/SP-shared change as page.tsx's own
   *  BilingualSection. */
  dark?: boolean;
}) {
  return (
    <div className="flex w-full flex-col items-start gap-[40px] py-[70px]" style={{ paddingLeft: SIDE_ML, paddingRight: SIDE_ML }}>
      <p
        className={`font-(family-name:--font-courier) leading-[1.5] whitespace-nowrap [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${
          dark ? "text-black/50" : "text-white/50"
        }`}
        style={{ fontSize: captionSize, letterSpacing: captionTracking }}
      >
        {caption}
      </p>
      <div className="flex w-full flex-col items-start gap-[30px]">
        <div
          className={`w-full text-justify font-(family-name:--font-gen-interface-jp) text-[15px] leading-[1.6] tracking-[0.45px] ${
            dark ? "text-black" : "text-white"
          }`}
          style={SS09}
        >
          {ja.map((paragraph, i) => (
            <p key={paragraph} className={`mb-0 last:mb-0 ${paragraphTrimClass(i, ja.length)}`}>
              {paragraph}
            </p>
          ))}
        </div>
        <div className={`w-full text-[14px] leading-[1.2] ${dark ? "text-black/50" : "text-white/50"}`}>
          {en.map((paragraph, i) => (
            <p key={paragraph} className={`mb-0 last:mb-0 ${paragraphTrimClass(i, en.length)}`}>
              {paragraph}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * SP (mobile) project detail page — Figma node 1353:654 ("sp_projects_
 * detail"), per direct follow-up ("SPの詳細ページも実装進めて"). Rendered
 * alongside (not replacing) app/projects/[slug]/page.tsx's own PC-only tree,
 * split at the `lg` breakpoint exactly like every other Mobile* component
 * pairs with its own PC page (`hidden lg:flow-root` there, `lg:hidden`
 * here).
 *
 * Reuses `project`/`next`/`detail` as-is — the exact same props (and so the
 * exact same `lib/projects.ts` data, including `detail.gallery`) PC's own
 * tree reads, none of it PC-specific, matching mobile-about.tsx's own
 * "share PC's content constants, only the layout differs" convention.
 *
 * The site's own MENU pill / expanded nav panel (Now Playing, Projects/
 * About/Studies/Contact, Inquiries/Social, copyright — Figma's own "ft"/
 * "menu" nodes) needs no markup here at all — components/mobile-menu.tsx is
 * a persistent singleton mounted once in app/layout.tsx, not rebuilt per
 * page. This component only broadcasts scroll-near-bottom into
 * lib/footer-mode-store.ts (same mechanism/threshold as mobile-about.tsx)
 * and reserves a trailing spacer for that panel to grow into.
 *
 * Page-entrance treatment reuses PC's own ProjectDetailReveal directly (per
 * later direct follow-up "SPの実績詳細もPC同様、ページ表示時にスライドイン
 * +フェードインをつけて") — that component is plain, platform-agnostic CSS
 * (no `--scale`/PC-only grid variables), so it works here unchanged: this
 * page's own `backgroundColor` fades in from a neutral off-white while
 * everything below the header slides up 24px + fades in as one block. The
 * "ANDMADE Inc." header logo itself is passed as ProjectDetailReveal's own
 * `header` prop instead of plain `children` — per further follow-up
 * ("ヘッダーはスライドイン+フェードイン付けない") — so it stays outside that
 * slide+fade treatment, matching PC's own SiteHeader/HeaderSummon exclusion
 * (see that component's own doc comment for why). The title still
 * scramble-reveals via ScrambleText independently, same as every other
 * project title site-wide (mobile-project-list.tsx).
 *
 * Credit block: iterates `detail.creditColumns` as stacked columns (each
 * column's own rows, one under the other) rather than PC's 2 side-by-side
 * columns — same SP-flattens-PC's-columns convention as the gallery's own
 * "twoColumn" handling above. Figma's own SP export groups a few of these
 * same roles onto shared lines differently than PC's per-row breakdown (e.g.
 * "Director, Planner, Copy Writer" combined) — reproducing that exact
 * regrouping would need a second, SP-specific credit data shape; iterating
 * the existing structured rows instead keeps this page driven by the exact
 * same data PC already uses, at the cost of a minor, purely cosmetic
 * line-grouping difference from Figma's own literal SP mockup text.
 */
export function MobileProjectDetail({
  project,
  next,
  detail,
}: {
  project: Project;
  next: Project;
  detail?: ProjectDetail;
}) {
  const backgroundColor = detail?.backgroundColor ?? DEFAULT_BACKGROUND;
  // Next Project's own thumbnail (below) shows the *next* project's first
  // gallery image, not its hero/KV — per direct follow-up ("next projectの
  // グレー画像箇所に次の実績イメージを表示する（hero画像じゃなくてギャラ
  // リー画像の1枚目を表示する")), same PC/SP-shared change as page.tsx's own
  // nextThumb. Falls back to the plain gray placeholder box if that project
  // has no detail yet, or its first "image" block hasn't had a real photo
  // uploaded yet either.
  const nextThumb = next.detail?.gallery.find(
    (block): block is Extract<ProjectGalleryBlock, { type: "image" }> => block.type === "image"
  );
  // Drives the trailing-spacer height below — see CONTENT_FOOTER_GAP_PX_IDLE's
  // own doc comment.
  const { isPlaying } = useNowPlaying();
  const footerGapPx = isPlaying ? CONTENT_FOOTER_GAP_PX : CONTENT_FOOTER_GAP_PX_IDLE;
  // Per direct follow-up ("ヘッダー・フッターの色は実績ごとに#000か#fffを管
  // 理画面で選択可能にする") — drives this header logo's own text color;
  // see lib/projects.ts's own ProjectDetail.headerColor doc comment.
  const headerDark = detail?.headerColor === "black";
  const headerText = headerDark ? "text-black" : "text-white";
  const [titleActive, setTitleActive] = useState(false);
  // Next Project/footer zone — once its top edge scrolls into view, the
  // MobileMenu pill flips to the sitewide black-base/white-text default,
  // regardless of this project's own `menuColor` — see that field's own
  // doc comment (lib/projects.ts) for why.
  const nextProjectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setTitleActive(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const handleLenisTick = useCallback(() => {
    const distanceFromBottom = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
    broadcastFooterReady(distanceFromBottom <= FOOTER_READY_THRESHOLD_PX);

    const inFooterZone = (nextProjectRef.current?.getBoundingClientRect().top ?? Infinity) <= window.innerHeight;
    setLightMenuPill(inFooterZone ? false : detail?.menuColor === "white");
  }, [detail?.menuColor]);
  useLenis(handleLenisTick);

  // Sets the pill's own initial scheme immediately on mount (before any real
  // scroll tick fires) and resets both shared stores back to their defaults
  // on unmount — same convention as mobile-about.tsx's own footerReady
  // cleanup effect.
  useEffect(() => {
    setLightMenuPill(detail?.menuColor === "white");
    return () => {
      broadcastFooterReady(false);
      setLightMenuPill(false);
    };
  }, [detail?.menuColor]);

  return (
    <ProjectDetailReveal
      backgroundColor={backgroundColor}
      className="relative w-full lg:hidden"
      header={
        // "ANDMADE Inc." only (no full nav; that lives in the shared
        // MobileMenu panel instead), same treatment as every other Mobile*
        // component's own header. Passed as `header` (outside the slide+
        // fade `children` wrapper below) — per direct follow-up ("ヘッダー
        // はスライドイン+フェードイン付けない") — this element still sits
        // inside ProjectDetailReveal's own backgroundColor-fading wrapper,
        // it just doesn't slide/fade along with the rest of the content.
        <Link
          href="/"
          className={`block text-[16px] leading-[1.5] font-medium whitespace-nowrap ${headerText} [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]`}
          style={{ paddingLeft: HEADER_ML, paddingTop: "calc(50px + env(safe-area-inset-top))" }}
        >
          ANDMADE Inc.
        </Link>
      }
    >
      {/* Title band — title (ScrambleText, matching every other project
         title site-wide), category/role/date, "View Website" (Figma nodes
         1353:830/935-937/933). Left-aligned to HEADER_ML (not SIDE_ML) —
         per direct follow-up ("FVの実績タイトルとカテゴリと日付、view
         websiteもANDMADE Inc.の左面に揃える"), matching the header logo's
         own left edge instead of the page's plain side margin. mt-[140px] —
         per direct follow-up ("ヘッダーとのマージンは140pxに"). */}
      <div className="mt-[140px] flex flex-col items-start" style={{ paddingLeft: HEADER_ML, paddingRight: SIDE_ML }}>
        <div className="flex flex-col items-start gap-[15px]">
          <p className={`text-[18px] font-medium leading-[1.5] whitespace-nowrap ${headerText} [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]`}>
            <ScrambleText text={project.title} active={titleActive} />
          </p>
          <div className={`flex flex-col items-start gap-[10px] text-[14px] whitespace-nowrap ${headerText} [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]`}>
            <p className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
              {project.category}
              <br />
              {project.role}
            </p>
            <p className="font-(family-name:--font-courier) tracking-[-0.7px] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
              {project.date}
            </p>
          </div>
        </div>
        {/* mt-[25px] — per direct follow-up ("View Websiteの上マージンは
           25pxに"), its own distinct gap from the meta block above (not the
           15px shared between title/meta). */}
        {detail?.websiteUrl && (
          <a
            href={detail.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`underline-sweep mt-[25px] text-[14px] whitespace-nowrap ${headerText} [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]`}
          >
            View Website
          </a>
        )}
      </div>

      {detail ? (
        <>
          {/* KV — full-bleed, matching Figma's own edge-to-edge 400×500 crop
             (detail.hero.sp, registered independently of PC's own
             detail.hero.pc — per direct follow-up "PCとSPでKVはそれぞれ別の
             画像を登録できるようにする"). Parallaxes on scroll same as PC's
             own KV (per direct follow-up "SPのKVもパララックスさせる"),
             reusing ProjectHeroParallax directly rather than a separate SP
             component — its geometry-measured stop-point logic is already
             platform-agnostic; only the top/bottom overscan offset needed a
             flat-px mode (`fluid={false}`) since SP has no var(--scale). */}
          <div className="mt-[40px] w-full">
            <ProjectHeroParallax image={detail.hero.sp.image} aspect={detail.hero.sp.aspect} mask={detail.hero.sp.mask} fluid={false} />
          </div>

          <MobileBilingualSection caption="(Overview)" ja={detail.overviewJa} en={detail.overviewEn} dark={headerDark} />

          {/* gap-[10px] — margin between gallery images, per direct follow-up
             ("SPのイメージ間のマージンは10pxに"). "(Idea)"/"(Outcome)" blocks
             now render inline as just another top-level item in this same
             list — per direct follow-up ("画像も含めて表示位置を自由に変更
             できるようにしたい。例えばCMSの管理画面の入力の並び順にページ自
             体も表示する仕様にするとか"): no more fixed index/type
             special-casing, this array's own order *is* the page's own
             order (same restructuring as PC's own gallery `.map()`). An
             earlier version nested Idea/Outcome *inside* the preceding
             image's own wrapper so this gap wouldn't apply to it — no
             longer possible now that Idea/Outcome can appear anywhere, so
             they now get the same 10px gap as every other block. */}
          <div className="flex w-full flex-col items-stretch gap-[10px]">
            {detail.gallery.map((block, i) =>
              block.type === "idea" || block.type === "outcome" ? (
                <MobileBilingualSection key={i} caption={block.caption} ja={block.ja} en={block.en} captionSize={14} captionTracking={-0.7} dark={headerDark} />
              ) : (
                <MobileGalleryBlockView key={i} block={block} />
              )
            )}
          </div>

          {/* Category/Role/Date/Link recap (Figma node 1353:887) — Category/
             Role stacked in a left column (plain flow, paddingLeft: SIDE_ML),
             Date/Link stacked in a right column absolutely positioned at
             CREDIT_FIELD_LEFT — per direct follow-up ("Credit上のDateとLink
             の左面は左から8個目のグリッドに合わせる"), replacing the earlier
             CSS-grid `1fr` auto-split (which only approximated Figma's own
             literal offsets) with that literal grid position. */}
          <div className={`relative mt-[70px] text-[14px] whitespace-nowrap ${headerText}`}>
            <div className="flex flex-col items-start gap-[40px]" style={{ paddingLeft: SIDE_ML }}>
              <div className="flex flex-col items-start gap-[12px]">
                <p
                  className={`font-(family-name:--font-courier) text-[12px] tracking-[-0.6px] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${
                    headerDark ? "text-black/50" : "text-white/50"
                  }`}
                >
                  Category
                </p>
                {/* whitespace-normal — overrides this whole recap block's own
                   whitespace-nowrap (see the outer wrapper above; still wanted
                   for Date/Link, whose values are always short) — per direct
                   follow-up ("SPの実績詳細のcredit上のCategoryとRoleの幅を6
                   マス分にして、それ以上長いときは自動改行する仕様にして"):
                   category/role text is CMS-editable and can run long, so a
                   fixed 6-column width with normal wrapping keeps it readable
                   instead of overflowing past the grid on one line. */}
                <p
                  className="whitespace-normal [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
                  style={{ width: "calc(var(--sp-grid-column-width) * 6)" }}
                >
                  {project.category}
                </p>
              </div>
              <div className="flex flex-col items-start gap-[12px]">
                <p
                  className={`font-(family-name:--font-courier) text-[12px] tracking-[-0.6px] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${
                    headerDark ? "text-black/50" : "text-white/50"
                  }`}
                >
                  Role
                </p>
                {/* See Category's own identical whitespace-normal/width doc
                   comment above. */}
                <p
                  className="whitespace-normal [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
                  style={{ width: "calc(var(--sp-grid-column-width) * 6)" }}
                >
                  {project.role}
                </p>
              </div>
            </div>
            <div className="absolute top-0 flex flex-col items-start gap-[40px]" style={{ left: CREDIT_FIELD_LEFT }}>
              <div className="flex flex-col items-start gap-[12px]">
                <p
                  className={`font-(family-name:--font-courier) text-[12px] tracking-[-0.6px] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${
                    headerDark ? "text-black/50" : "text-white/50"
                  }`}
                >
                  Date
                </p>
                {/* Plain Akzidenz-Grotesk Next Regular (site default, no font
                   class/tracking override needed) — per direct follow-up
                   ("SPのCredit上の日付のフォントもPCと同様に「Akzidenz-Grotesk
                   Next」にしておいて"), matching PC's own identical Date
                   MetaField in app/projects/[slug]/page.tsx (see that one's
                   own doc comment) — dropping the Courier Prime this had. */}
                <p className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">{project.date}</p>
              </div>
              {/* Whole field hidden (not just its value) when there's no
                 website URL — per direct request ("view websiteのurlが無い
                 場合はcredit上のLinkは隠して"), matching the PC page's own
                 same fix. */}
              {detail.websiteUrl && (
                <div className="flex flex-col items-start gap-[12px]">
                  <p
                    className={`font-(family-name:--font-courier) text-[12px] tracking-[-0.6px] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${
                      headerDark ? "text-black/50" : "text-white/50"
                    }`}
                  >
                    Link
                  </p>
                  <a
                    href={detail.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline-sweep [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
                  >
                    View Website
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Divider line above (Credit) — inset 8px on both sides (per
             direct follow-up "Credit上の線の両サイドは8px余白設ける",
             matching the page's own standard SIDE_ML margin instead of the
             earlier edge-to-edge border-t), with 80px margin above and below
             (per direct follow-up "その線の上下マージンは80pxに", replacing
             the earlier 40px/40px). Kept as its own div, separate from the
             (Credit) content below, since that content uses its own distinct
             paddingLeft/Right rather than a margin. */}
          <div
            className={`mt-[80px] border-t ${headerDark ? "border-black/10" : "border-white/20"}`}
            style={{ marginLeft: SIDE_ML, marginRight: SIDE_ML }}
          />

          {/* (Credit) — then each column of detail.creditColumns stacked in
             turn — see this component's own top-level doc comment for why
             this iterates the existing structured data rather than Figma's
             own literal SP-specific line groupings. Row gap within each
             column (Client/Producer/etc.) reverted 20px → 6px (per direct
             follow-up "Credit列内のClient/Producer/Productionなどの行間は
             6pxに戻して" — a correction to the previous turn's edit, which
             had mistakenly widened this row gap instead of the gap *between*
             columns), then 6px → 8px per a further direct follow-up ("<p>の
             行間を6→8pxにして", matching PC's own identical change). The gap
             between columns (e.g. "Client/Producer" vs.
             "Productionなど") is now its own separate 20px (per direct
             follow-up "「Client/Producer」と「Productionなど」のマージンを
             20pxにして"), split out from the "(Credit)" caption's own gap
             above it (now 30px — per further follow-up "SPの(Credit)と
             Client:のマージンは30pxに", replacing the earlier 40px) — a
             single shared flex `gap` can't hold two different values, hence
             the extra nesting. */}
          <div className={`mt-[80px] text-[14px] ${headerText}`} style={{ paddingLeft: SIDE_ML, paddingRight: SIDE_ML }}>
            <p
              className={`font-(family-name:--font-courier) tracking-[-0.7px] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${
                headerDark ? "text-black/50" : "text-white/50"
              }`}
            >
              (Credit)
            </p>
            <div className="mt-[30px] flex flex-col items-start gap-[20px]">
              {detail.creditColumns.map((column, ci) => (
                <div key={ci} className="flex flex-col items-start gap-[8px]">
                  {column.map((row, ri) => (
                    // Keyed by index, not `row.label` — two rows in the same
                    // column can share the same label (e.g. two "Front-end
                    // Developer" credits), which React reported as a
                    // duplicate-key error.
                    // leading-[19px] — 明示指定なし（ブラウザ既定の"normal"、
                    // 実測約21px）だと<p>内で折り返した2行目以降がgap(8px)より
                    // 広く見えるという指摘（PCと同一の原因）を受けて追加。値は
                    // PC側（leading-[calc(19px*var(--scale))]）に追従、SPは他の
                    // Credit行の値（gapなど）と同様に固定px単位のまま。
                    <p key={ri} className="leading-[19px] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
                      <span className={headerDark ? "text-black/50" : "text-white/50"}>{row.label}: </span>
                      {row.value}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p
          className="mt-[40px] text-[14px] text-white/50 [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
          style={{ paddingLeft: SIDE_ML, paddingRight: SIDE_ML }}
        >
          Full case study coming soon.
        </p>
      )}

      {/* Next Project (Figma nodes 1365:1072-1080) — cream background,
         caption + underlined title, category/role/date, then a large
         thumbnail below (SP stacks these; PC places the thumbnail beside
         the text instead — see app/projects/[slug]/page.tsx's own
         NextProjectTeaser for that side-by-side version). */}
      {/* mt-[80px] — (Credit) block's own bottom margin, per direct
         follow-up ("SPのCredit下マージンは80pxに"), replacing the earlier
         30px (itself a correction of an even earlier 80px meant for PC).
         Cream background wraps both the Next Project content *and* the
         trailing footer spacer below (per direct follow-up "SPのNext
         Projectの背景色はフッターまで伸ばす") — previously only the content
         itself carried CREAM, so the spacer (where MobileMenu's footer-mode
         panel grows in from) fell back to this page's own root background
         color instead of staying cream all the way down to the real
         footer. `nextProjectRef` — measured on every Lenis tick above to
         flip MobileMenu's pill to the sitewide black-base/white-text scheme
         once this zone's own top edge scrolls into view (per direct
         follow-up "フッター上のNext Projectのエリアまできたらmenuのベース
         が#000,文字色#fffに変わる仕様にする"), since a white pill would
         otherwise disappear against this same cream background. */}
      <div ref={nextProjectRef} className="mt-[80px] w-full" style={{ backgroundColor: CREAM }}>
        <div className="w-full py-[60px]">
          {/* No shared flex `gap` here (was gap-[10px]) — per direct
             follow-up ("SPのNext Projectの文字とSATOYAMA TERRACEの文字の
             マージンを30pxに"), the "Next Project"→title gap now needs its
             own distinct value from the title→meta gap below it, so each
             child carries its own explicit top margin instead of one shared
             value. Title's own mt-[30px] replaces the old 10px flex gap;
             the meta block's own margin absorbs what used to be its 10px
             flex gap too (10px own + 10px flex → 20px total, unchanged from
             before). */}
          <div className="flex flex-col items-start" style={{ paddingLeft: SIDE_ML, paddingRight: SIDE_ML }}>
            <p className="text-[14px] leading-[1.25] whitespace-nowrap text-black [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
              Next Project
            </p>
            <Link
              href={`/projects/${slugify(next.title)}`}
              className="underline-sweep mt-[30px] text-[18px] leading-[1.25] font-medium whitespace-nowrap text-black [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
            >
              {next.title}
            </Link>
            <div className="mt-[20px] flex flex-col items-start gap-[10px] text-[14px] whitespace-nowrap text-black/50 [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
              <p className="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
                {next.category}
                <br />
                {next.role}
              </p>
              <p className="font-(family-name:--font-courier) tracking-[-0.7px] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
                {next.date}
              </p>
            </div>
          </div>
          {/* mt-[30px] — text block's own bottom margin, per direct
             follow-up ("SPのNext Projectの文字下マージンを30pxに"),
             replacing the earlier 40px. */}
          <Link href={`/projects/${slugify(next.title)}`} className="mt-[30px] block w-full">
            <div
              // bg-[#d9d9d9] only while no real thumbnail is set yet — see
              // MobileGalleryImage's own doc comment for the full
              // "transparent PNG reads as opaque gray" story this fixes.
              className={`relative overflow-hidden ${nextThumb?.image ? "" : "bg-[#d9d9d9]"}`}
              style={{
                aspectRatio: nextThumb?.aspect ?? 384 / 240,
                marginLeft: SIDE_ML,
                marginRight: SIDE_ML,
                width: `calc(100% - ${SIDE_ML} * 2)`,
              }}
            >
              {nextThumb?.image && (
                <Image src={nextThumb.image} alt="" fill sizes="100vw" unoptimized={nextThumb.image.startsWith("http")} className="object-cover" />
              )}
            </div>
          </Link>
        </div>

        {/* Trailing spacer — see CONTENT_FOOTER_GAP_PX's own doc comment. */}
        <div style={{ height: footerGapPx }} />
      </div>
    </ProjectDetailReveal>
  );
}
