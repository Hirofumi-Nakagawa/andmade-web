import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HeaderSummon } from "@/components/header-summon";
import { MobileProjectDetail } from "@/components/mobile-project-detail";
import { NextProjectTeaser } from "@/components/next-project-teaser";
import { ProjectDetailReveal } from "@/components/project-detail-reveal";
import { ProjectTitleScramble } from "@/components/project-title-scramble";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ViewWebsiteLink } from "@/components/view-website-link";
import { ProjectHeroParallax } from "@/components/project-hero-parallax";
import { OGP_IMAGE, SITE_DESCRIPTION, SITE_NAME, SITE_URL, TWITTER_HANDLE } from "@/lib/site";
import {
  getProjectBySlug,
  getProjects,
  isLinkableWebsiteUrl,
  slugify,
  type ProjectGalleryBlock,
  type ProjectGalleryImage,
  type ProjectGalleryTwoColItem,
  type ProjectGalleryWidth,
} from "@/lib/projects";

type ProjectsPageProps = { params: Promise<{ slug: string }> };

/** Every slug this dynamic route should emit an HTML file for. Required by
 *  the static export (next.config.ts's own `output: "export"`): with no
 *  server at request time, Next has to know the full set of pages up front,
 *  so it builds one out/projects/<slug>/index.html per project instead of
 *  resolving `[slug]` on demand.
 *
 *  Uses the same slugify(project.title) mapping getProjectBySlug() resolves
 *  by, so the two can't drift. Projects added in microCMS after a build
 *  simply won't exist until the next build + upload — the deliberate
 *  trade-off of static hosting. */
export async function generateStaticParams() {
  const projects = await getProjects();

  // 空配列を返すと、Next は「generateStaticParams が無い」と誤解して
  // `Page "/projects/[slug]" is missing "generateStaticParams()"` という
  // 実態と食い違うエラーで落ちる（vercel/next.js#71862 — この関数が現に
  // 存在していても再現する既知の挙動）。原因はほぼ必ず「microCMS に届いて
  // いない」ことなので、その場で分かる形にして落とす。
  //
  // getProjects() は設定漏れ・通信失敗のいずれも [] に握り潰す仕様
  // (lib/microcms.ts の getMicrocmsClient が null を返す / lib/projects.ts の
  // catch)。ビルド時にそれが起きるとページが1枚も生成されず、静的サイトと
  // しては成立しないため、ここは握り潰さず明示的に失敗させる。
  if (projects.length === 0) {
    throw new Error(
      "microCMS から実績を1件も取得できなかったため、静的書き出しを中止しました。\n" +
        "MICROCMS_SERVICE_DOMAIN / MICROCMS_API_KEY を確認してください" +
        "（GitHub Actions の場合はリポジトリの Secrets、ローカルの場合は .env.local）。\n" +
        `現在の状態: MICROCMS_SERVICE_DOMAIN=${process.env.MICROCMS_SERVICE_DOMAIN ? "設定あり" : "未設定"}, ` +
        `MICROCMS_API_KEY=${process.env.MICROCMS_API_KEY ? "設定あり" : "未設定"}`
    );
  }

  return projects.map((project) => ({ slug: slugify(project.title) }));
}

/**
 * Per-project meta — per direct follow-up ("各実績ページのmetaを設定できる
 * ようにして")。CMS の3つの任意フィールド（metaTitle / metaDescription /
 * metaOgImg — lib/projects.ts の ProjectCmsContent 参照）から組み、未設定は
 * それぞれ 実績名 / サイト共通説明文 / KV→共通ogp.png へフォールバックする
 * ので、何も入れていない既存の実績も従来どおり成立する。
 *
 * openGraph/twitter をここで持つのは、Next の metadata 継承がオブジェクト
 * 丸ごと（フィールド単位でのマージではない）なため — ルート（app/layout.tsx）
 * のを継承すると title も url も画像もサイト共通のままになる。逆に言えば
 * ここで定義する以上、siteName/locale/card などの共通項も全部自前で埋める
 * 必要がある。title に "- ANDMADE Inc." を明示で付けるのは、ルートの
 * title.template が plain <title> にしか働かない（OGP には適用されない）ため。
 */
export async function generateMetadata({ params }: ProjectsPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await getProjectBySlug(slug);
  if (!result) return {};
  const { project } = result;
  const title = project.metaTitle ?? project.title;
  const description = project.description ?? SITE_DESCRIPTION;
  const ogImage = project.ogImage ?? OGP_IMAGE;
  return {
    title,
    description,
    alternates: { canonical: `/projects/${slug}/` },
    openGraph: {
      title: `${title} - ${SITE_NAME}`,
      description,
      url: `/projects/${slug}/`,
      siteName: SITE_NAME,
      images: [ogImage],
      locale: "ja_JP",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} - ${SITE_NAME}`,
      description,
      images: [ogImage.url],
      site: TWITTER_HANDLE,
      creator: TWITTER_HANDLE,
    },
  };
}

/** Standard content-column width/left-margin used everywhere else in this
 *  codebase (SiteHeader, SiteFooter, ProjectCard) — for this page's own
 *  title/date/meta/Overview-caption text rows only. NOT the same grid the
 *  gallery's own `width` rule uses below (GRID_WIDTH_24/GRID_WIDTH_20), and
 *  NOT what the Category/Role/Date/Link recap row or (Credit) row use either
 *  (CREDIT_BLOCK_ML/CREDIT_BLOCK_WIDTH below) — see those constants' own doc
 *  comments for why. */
const CONTENT_ML = "calc(198px * var(--grid-scale))";

/**
 * Left margin / width for the Category/Role/Date/Link recap row and the
 * (Credit) row directly below it (Figma node 1349:390, which contains both)
 * — per direct follow-up ("Creditとその上の要素を添付のようにグリッド幅や
 * マージンをデザインに合わせて"): unlike DetailCaption's own fixed 198px
 * column (used for Overview/Next Project, where the design uses a
 * `gap`-based flex row instead of literal absolute coordinates), this
 * specific node's own child positions in Figma are literal absolute
 * pixel offsets that don't reduce to a clean "N columns + a gap" formula, so
 * they're reproduced directly rather than approximated: 82px margin each
 * side (1440 - 82*2 = 1276px, this block's own width), with children
 * positioned via CREDIT_FIELD_LEFT_PX below, all relative to this block's
 * own left edge (not the page's). */
const CREDIT_BLOCK_ML = "calc(82px * var(--grid-scale))";
const CREDIT_BLOCK_WIDTH = "calc(1276px * var(--grid-scale))";

/** Literal left offsets (px, at the 1440px reference canvas) for each field
 *  in the recap row (Category/Role/Date) and the (Credit) row's own two
 *  columns, relative to CREDIT_BLOCK_ML — read directly off Figma node
 *  1349:390's own children (1349:348/351/361 and 1349:368/369). The Link
 *  field no longer uses a literal offset here — see MetaField's own
 *  `alignRight` doc comment for why. `creditCol2` (every Credit column past
 *  the first, i.e. everything except Client/Production) shifted 870 → 812
 *  (one grid column, 58px — same PC grid column width GRID_WIDTH_24/
 *  GRID_WIDTH_20 above use) per direct follow-up ("pcのクレジットのクライア
 *  ント以外を左に1マス移動"); `creditCol1` (the Client/Production column)
 *  stays put. */
const CREDIT_FIELD_LEFT_PX = { role: 290, date: 638, creditCol1: 290, creditCol2: 812 } as const;

/** Width of each Credit column — 8 grid columns (58px each = 464px at the
 *  1440px reference canvas). Without an explicit width these columns are
 *  `absolute` with no bound at all, so a long value ran straight on past the
 *  right-hand column's own left edge (812px) and the two overlapped. 8
 *  columns fits inside the 522px gap between creditCol1 and creditCol2 with
 *  room to spare, so a long line now wraps instead of colliding. */
const CREDIT_COLUMN_WIDTH = "calc(464px * var(--grid-scale))";

/** This page's own PC layout grid (components/grid-overlay.tsx, toggled
 *  with Shift+G): 24 columns, 24px margin, 0px gutter, 58px column width at
 *  the 1440px reference canvas — 24 columns = 1392px (58*24), 20 columns =
 *  1160px (58*20). Deliberately distinct from CONTENT_ML/
 *  `--content-width-fluid` above (1218px reference, 198px margin) — that's
 *  the *text* column system (header/footer/body copy), not what "24マス" /
 *  "20マス" mean when the gallery's own width rule (lib/projects.ts's own
 *  ProjectGalleryWidth) refers to grid columns for an *image*. An earlier
 *  version of this file mistakenly based both gallery widths on
 *  --content-width-fluid instead, which came out narrower than intended
 *  (1218*20/24 = 1015px, not the real 1160px 20-column width) — per direct
 *  follow-up confirming the discrepancy ("幅20マス分に変更"). */
const GRID_WIDTH_24 = "calc(1392px * var(--grid-scale))";
const GRID_WIDTH_20 = "calc(1160px * var(--grid-scale))";
/** 8 grid columns = 464px (58*8) at the 1440px reference canvas — the
 *  narrower second "inset" variant's own width (ProjectGalleryWidth's own
 *  "insetSmall", see that type's own doc comment in lib/projects.ts), same
 *  58px-per-column derivation as GRID_WIDTH_24/GRID_WIDTH_20 above. */
const GRID_WIDTH_8 = "calc(464px * var(--grid-scale))";

/** Fallback page background for projects with no `detail.backgroundColor`
 *  of their own (the placeholder-detail branch below) — matches this first
 *  reference project's own color, but any real project picks its own (see
 *  ProjectDetail's own `backgroundColor` doc comment). */
const DEFAULT_BACKGROUND = "#1a2d8b";
const CREAM = "#f6f6f4";

/** `font-feature-settings: "ss09" 1` — matches app/about/page.tsx's own
 *  Gen Interface JP body-copy treatment (Figma node 520:1634 etc.). */
const SS09 = { fontFeatureSettings: '"ss09" 1' } as const;

/**
 * The two gaps in the hero's title / category / role / "View Website" row,
 * both of which tighten as the window narrows.
 *
 * Per direct follow-up ("できるだけ改行はさせたくないので、マージンを狭める
 * 調整をして"): the row wraps rather than overlapping the title now, but
 * wrapping is the fallback, not the goal — squeezing the gaps first buys
 * enough room to keep everything on one line much further down.
 *
 * Both shrink linearly from their full 60/110 at 1440px down to a 30px floor
 * at 1024px, and only once that floor is reached does anything wrap — per
 * direct follow-up ("マージンをウィンドウ幅に合わせて徐々に狭めていって、
 * 最低30pxはマージンが空く状態にしてそれより狭めたら改行する"). Above
 * 1440px the `calc(Npx * var(--scale))` upper bound takes over, so wide
 * screens keep scaling exactly as they did before any of this.
 *
 * The numbers come from measuring the real strings at 14px (--scale is 1 at
 * and below 1440px, so these are literal px): the site's longest category
 * "Identity, Brand site, Graphic, Merchandise, Signs, Typeface" is 335px,
 * "Art Direction, Design" is 120px, "View Website" 78px.
 *
 * A project with all three still can't hold one line all the way down: at
 * 1024px it needs 594px against 548px of room between the title's right edge
 * and the 24px margin. That's a geometric shortfall, not a margin that can
 * be tightened away, so the wrapping fallback stays for the last stretch.
 */
// タイトル → category の間隔。60px → 80px（直接の指示 "80pxにそろえて"、
// 下の HERO_META_ITEM_GAP と同値に統一）。傾きも同じ線形補間
// （(80-30)/416 ≈ 0.1202）。
const HERO_TITLE_META_GAP =
  "clamp(30px, calc((100vw - 1024px) * 0.1202 + 30px), calc(80px * var(--scale)))";
// category → role → "View Website" の間隔。110px → 80px（直接の指示
// "pcの実績詳細のFVのcategory、role、リンクのマージンを80pxにして"）。
// 傾きは 1024px の 30px 下限から 1440px の 80px までの線形補間
// （(80-30)/416 ≈ 0.1202）— 上の doc comment の設計をそのまま追従させた。
const HERO_META_ITEM_GAP =
  "clamp(30px, calc((100vw - 1024px) * 0.1202 + 30px), calc(80px * var(--scale)))";

/** Trims only the leading/trailing half-leading of a stacked-paragraph
 *  block's first/last line, without touching the natural line-height
 *  *between* paragraphs — same helper as app/about/page.tsx's own
 *  `paragraphTrimClass` (duplicated locally rather than imported, since that
 *  one isn't exported). Needed on the Overview JA/EN paragraphs below so
 *  their own top edge lines up with the "(Overview)" caption's own trimmed
 *  top edge — per direct follow-up ("Overviewと右の日英の上面を揃える。現
 *  状だと数pxズレてるように見える"): without this, a block's untrimmed first
 *  paragraph carries its font's ordinary half-leading above the glyphs,
 *  which reads as a few px lower than DetailCaption's own single-line,
 *  fully-trimmed text sitting beside it. */
function paragraphTrimClass(index: number, length: number) {
  const isFirst = index === 0;
  const isLast = index === length - 1;
  if (isFirst && isLast) return "[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]";
  if (isFirst) return "[text-box-edge:cap_alphabetic] [text-box-trim:trim-start]";
  if (isLast) return "[text-box-edge:cap_alphabetic] [text-box-trim:trim-end]";
  return "";
}

/**
 * One image slot — an empty box sized to the real Figma aspect ratio
 * (ProjectGalleryImage's own `aspect`) until a real photo is supplied via
 * `image`. See lib/projects.ts's own ProjectGalleryImage doc comment for why
 * every slot on this first reference page (Yatsumonji Gakuen 70th) is
 * currently empty — the sandbox this was built in has no network access to
 * Figma's own asset CDN to download the real photos.
 *
 * `unoptimized` whenever `image` is a full URL (`http`-prefixed) — the only
 * external URLs this ever receives are the temporary figma.com asset links
 * lib/projects.ts's own YATSUMONJI_GAKUEN_70TH_DETAIL wires in for a
 * provisional preview (see that constant's own doc comment): next/image's
 * optimizer refuses to fetch from a remote host that isn't explicitly
 * allow-listed in next.config's `images.remotePatterns`, which figma.com
 * isn't (and shouldn't be, for a link that expires in about a week) — this
 * skips that optimizer entirely for those URLs and requests the image
 * as-is, exactly like a plain `<img>` would. Local paths (from public/)
 * never start with `http`, so this never affects real, permanent assets. */
/** `sizes` for a gallery image — these blocks are at most the full window
 *  width ("full"), and otherwise a grid-column fraction of it, so `100vw` is
 *  the correct upper bound in every case. */
const GALLERY_IMAGE_SIZES = "100vw";

/**
 * Caption printed under a gallery image — per direct follow-up ("イメージ下
 * にキャプション（PC:14px、SP:12px）を追加できるようにして"). Renders
 * nothing at all when the CMS field is blank, so existing blocks are
 * completely unaffected.
 *
 * `dark` follows the project's own headerColor, like every other piece of
 * text on this page; the muted 50% matches the Category/Role treatment.
 */
function GalleryCaption({ caption, dark }: { caption?: string; dark?: boolean }) {
  if (!caption) return null;
  return (
    <p
      className={`mt-[calc(12px*var(--scale))] text-[length:calc(14px*var(--scale))] leading-[1.5] whitespace-pre-line [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${
        dark ? "text-black/50" : "text-white/50"
      }`}
    >
      {caption}
    </p>
  );
}

function GalleryImage({
  image,
  imageSrcSet,
  aspect,
  mask,
  alt = "",
  sizes = GALLERY_IMAGE_SIZES,
}: ProjectGalleryImage & { alt?: string; mask?: string; sizes?: string }) {
  return (
    <div
      // No background fill — see ProjectHeroParallax's own comment.
      className="relative w-full overflow-hidden"
      style={{
        aspectRatio: aspect,
        ...(mask
          ? {
              maskImage: `url(${mask})`,
              WebkitMaskImage: `url(${mask})`,
              maskSize: "cover",
              WebkitMaskSize: "cover",
            }
          : {}),
      }}
    >
      {image && (
        <>
      {/* Plain <img>, not next/image: every CMS URL is `http`-prefixed, so the
         previous `unoptimized={image.startsWith("http")}` bypassed next/image
         for all real content anyway — no srcset was generated, just the one
         fixed 2560px-wide URL passed through. microCMS's own responsive
         candidates (`imageSrcSet`) give the browser a real choice of sizes at
         no build or serving cost. `absolute inset-0 h-full w-full` reproduces
         what next/image's `fill` was doing. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
          <img
            src={image}
            srcSet={imageSrcSet}
            sizes={sizes}
            alt={alt}
            className="absolute inset-0 h-full w-full object-cover"
          />
        </>
      )}
    </div>
  );
}

/** Same idea as GalleryImage, for the "video" gallery block (per explicit
 *  spec: "KV下の最初のグレー箇所には動画を入れる") — renders the same
 *  empty, aspect-sized box when `src` isn't supplied yet. Muted/autoplay/loop since
 *  this is a silent showcase clip, not a video with its own audio track or
 *  controls. */
function GalleryVideo({ src, poster, aspect }: { src?: string; poster?: string; aspect: number }) {
  return (
    <div className="relative w-full overflow-hidden" style={{ aspectRatio: aspect }}>
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
 * Wraps a single image/video block per its own `width` rule — see
 * ProjectGalleryWidth's own doc comment (lib/projects.ts) for what each
 * variant means. `defaultBackground` is this project's own
 * `detail.backgroundColor`, used for "inset" blocks that don't set their own.
 * `suppressTopPadding` — see GalleryBlockView's own doc comment for why.
 */
function GalleryMediaBlock({
  block,
  defaultBackground,
  suppressTopPadding = false,
  suppressBottomPadding = false,
  collapseGapAbove = false,
  dark = false,
}: {
  block: Extract<ProjectGalleryBlock, { type: "image" | "video" }>;
  defaultBackground: string;
  suppressTopPadding?: boolean;
  /** See GalleryBlockView's own prop of the same name. */
  suppressBottomPadding?: boolean;
  /** See GalleryBlockView's own prop of the same name. */
  collapseGapAbove?: boolean;
  /** This project's own headerColor, for the caption's text colour. */
  dark?: boolean;
}) {
  const media =
    block.type === "video" ? (
      <GalleryVideo src={block.src} poster={block.poster} aspect={block.aspect} />
    ) : (
      <>
        <GalleryImage image={block.image} aspect={block.aspect} sizes={block.width === "full" ? "100vw" : "80vw"} />
        <GalleryCaption caption={block.caption} dark={dark} />
      </>
    );

  // Cancels the gallery list's own item gap above this block, when asked —
  // see GalleryBlockView's own `collapseGapAbove`. Applied on every width
  // branch, not just the inset one, because a "full" block sitting against
  // an inset needs it just as much (per "fullとinsetが上下関係になった際も
  // 20pxマージンは無しにして").
  const gapCancel = collapseGapAbove ? { marginTop: GALLERY_GAP_CANCEL } : {};

  // A "full"-width image runs edge to edge, but its caption shouldn't — it
  // gets the standard content margin so it lines up with the page's own text.
  if (block.width === "full") {
    return (
      <div className="w-full" style={gapCancel}>
        {block.type === "video" ? (
          <GalleryVideo src={block.src} poster={block.poster} aspect={block.aspect} />
        ) : (
          <>
            <GalleryImage image={block.image} aspect={block.aspect} sizes="100vw" />
            {block.caption && (
              <div style={{ marginLeft: CONTENT_ML, marginRight: "24px" }}>
                <GalleryCaption caption={block.caption} dark={dark} />
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  if (block.width === "content") {
    // Centered (mx-auto), 24 grid columns wide (GRID_WIDTH_24) — not
    // left-anchored at CONTENT_ML like the Overview/Credit text columns, per
    // direct follow-up ("画像は中央揃えにして").
    //
    // A CMS-set background paints as a full-bleed band behind that centered
    // column — per direct follow-up ("contentにも背景色指定したら反映される
    // ようにして") — with 24px of it above and below the image, per the
    // follow-up after that ("contentで背景色指定してる場合は上下マージン
    // 24pxにして"). That's the "inset" treatment at a much tighter rhythm
    // (inset uses 100px). Without a colour set, nothing changes — the plain
    // centered box, exactly as before.
    if (!block.backgroundColor) {
      return (
        <div className="mx-auto" style={{ width: GRID_WIDTH_24, ...gapCancel }}>
          {media}
        </div>
      );
    }
    return (
      <div
        className="w-full py-[calc(24px*var(--scale))]"
        style={{ backgroundColor: block.backgroundColor, ...gapCancel }}
      >
        <div className="mx-auto" style={{ width: GRID_WIDTH_24 }}>
          {media}
        </div>
      </div>
    );
  }

  // "inset" (20 grid columns, GRID_WIDTH_20) / "insetSmall" (8 grid columns,
  // GRID_WIDTH_8 — per direct follow-up "実績詳細の動画のinsetをもうひとつ
  // 用意して、グリッド8マス分") — same padded/background-colored box either
  // way, just a different centered width; whose own fill is either this
  // block's own `backgroundColor` or the project's page-wide default.
  // `suppressTopPadding` drops the top half of that padding when the
  // *previous* gallery block is also inset-width (either variant) — see
  // GalleryBlockView's own doc comment.
  const insetWidth = block.width === "insetSmall" ? GRID_WIDTH_8 : GRID_WIDTH_20;
  return (
    <div
      className={`w-full ${insetPaddingClass(suppressTopPadding, suppressBottomPadding)}`}
      style={{ backgroundColor: block.backgroundColor ?? defaultBackground, ...gapCancel }}
    >
      <div className="mx-auto" style={{ width: insetWidth }}>
        {media}
      </div>
    </div>
  );
}

/** 2-column "inset" variant's own asymmetric side padding — per direct
 *  follow-up ("画像2カラムのときもinsetを選択できるようにして、画像幅は左右
 *  それぞれ幅9マス分、paddingは以下のルールにする 左画像：左padding2マス
 *  分、右padding1マス分 右画像：左padding1マス分、右padding2マス分"): each
 *  image sits in its own 12-grid-column half of the GRID_WIDTH_24 container
 *  (left half: 2 cols padding-left + 9 cols image + 1 col padding-right =
 *  12; right half: 1+9+2=12, the mirror), so the visible gap between the two
 *  images (1+1=2 cols) ends up exactly matching the outer edge margins (2
 *  cols each side). 1 grid column = 58px at the 1440px reference canvas,
 *  same derivation GRID_WIDTH_24/GRID_WIDTH_20 above use. */
const INSET_TWO_COL_PAD_OUTER = "calc(116px * var(--grid-scale))"; // 2 columns
const INSET_TWO_COL_PAD_INNER = "calc(58px * var(--grid-scale))"; // 1 column

/** The free text block's own two columns — Japanese 14 grid columns to
 *  English 9, per direct follow-up ("左日本語（14マス分）、右英語（9マス分）
 *  の1列で表示するようにして"), with one column as the gap between them.
 *  Applied as flex proportions rather than literal widths, because a later
 *  follow-up added a column of padding to each side too — see TextBlock's own
 *  comment for that arithmetic. 1 column = 58px at the 1440px reference
 *  canvas, same derivation as the constants just above. */
const TEXT_BLOCK_JA_COLUMNS = 14;
const TEXT_BLOCK_EN_COLUMNS = 9;
const TEXT_BLOCK_GAP = "calc(58px * var(--grid-scale))"; // 1 column

/** The gallery list's own item gap, as a negative margin — used to cancel it
 *  between consecutive colour-set inset blocks so their backgrounds meet.
 *  Must stay in step with the list's own `gap-[calc(24px*var(--scale))]`. */
const GALLERY_GAP_CANCEL = "calc(-24px * var(--scale))";

/** An "inset" block's own 100px vertical padding, with either edge droppable —
 *  see GalleryBlockView's own suppressTopPadding/suppressBottomPadding doc
 *  comment for when each gets dropped. Shared by the single-image and
 *  two-column inset boxes so the two can never drift apart. */
function insetPaddingClass(suppressTop: boolean, suppressBottom: boolean): string {
  return [
    suppressTop ? "" : "pt-[calc(100px*var(--scale))]",
    suppressBottom ? "" : "pb-[calc(100px*var(--scale))]",
  ]
    .filter(Boolean)
    .join(" ");
}

/** 2カラムの片側1枠。`video` が入っていればその枠は動画になり、`image` は
 *  ポスターとして使われる — per direct follow-up ("実績詳細で2カラムのとき、
 *  どちらかに動画も入れられるようにして")。縦横比は画像から取れているので、
 *  動画側も左右で高さが揃う。 */
function TwoColumnMedia({ item }: { item: ProjectGalleryTwoColItem }) {
  if (item.video) {
    return <GalleryVideo src={item.video} poster={item.image} aspect={item.aspect} />;
  }
  return <GalleryImage {...item} sizes="40vw" />;
}

/** Exactly two images side by side — see ProjectGalleryBlock's own
 *  "twoColumn" doc comment (lib/projects.ts) for what `width` means here.
 *  "full"/"content" (the original, still-default layout): widths flex so the
 *  gap between them is always a literal 24px (per explicit spec: "2カラム
 *  （マージンが24pxになるように画像幅可変）"), centered within GRID_WIDTH_24
 *  — same mx-auto centering/grid basis as GalleryMediaBlock's own "content"
 *  width, and for the same reason (per direct follow-up: "画像は中央揃えに
 *  して"). "inset": wrapped in the same full-bleed background/vertical-
 *  padding box GalleryMediaBlock's own single-image "inset" case uses
 *  ("上下paddingは1カラムのinsetと同じに"), each image narrowed to 9 grid
 *  columns via INSET_TWO_COL_PAD_OUTER/INNER above instead of a flat 24px
 *  gap. */
function TwoColumnBlock({
  items,
  width,
  backgroundColor,
  defaultBackground,
  suppressTopPadding = false,
  suppressBottomPadding = false,
  collapseGapAbove = false,
  dark = false,
}: {
  items: [ProjectGalleryTwoColItem, ProjectGalleryTwoColItem];
  width: ProjectGalleryWidth;
  /** This block's own CMS-chosen inset background, if any. */
  backgroundColor?: string;
  defaultBackground: string;
  /** See GalleryBlockView's own doc comment. */
  suppressTopPadding?: boolean;
  /** See GalleryBlockView's own prop of the same name. */
  suppressBottomPadding?: boolean;
  /** See GalleryBlockView's own prop of the same name. */
  collapseGapAbove?: boolean;
  /** This project's own headerColor, for the captions' text colour. */
  dark?: boolean;
}) {
  if (width === "inset") {
    return (
      <div
        className={`w-full ${insetPaddingClass(suppressTopPadding, suppressBottomPadding)}`}
        style={{
          backgroundColor: backgroundColor ?? defaultBackground,
          ...(collapseGapAbove ? { marginTop: GALLERY_GAP_CANCEL } : {}),
        }}
      >
        <div className="mx-auto flex items-start" style={{ width: GRID_WIDTH_24 }}>
          <div className="flex-1" style={{ paddingLeft: INSET_TWO_COL_PAD_OUTER, paddingRight: INSET_TWO_COL_PAD_INNER }}>
            <TwoColumnMedia item={items[0]} />
            <GalleryCaption caption={items[0].caption} dark={dark} />
          </div>
          <div className="flex-1" style={{ paddingLeft: INSET_TWO_COL_PAD_INNER, paddingRight: INSET_TWO_COL_PAD_OUTER }}>
            <TwoColumnMedia item={items[1]} />
            <GalleryCaption caption={items[1].caption} dark={dark} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex items-start gap-[24px]" style={{ width: GRID_WIDTH_24 }}>
      {items.map((item, i) => (
        <div key={i} className="flex-1">
          <TwoColumnMedia item={item} />
          <GalleryCaption caption={item.caption} dark={dark} />
        </div>
      ))}
    </div>
  );
}

/**
 * A free text block — per direct follow-up ("実績詳細ページにフリーテキスト
 * エリアを新たに作る"), starting at the grid's own left edge per the
 * follow-up after it ("galleryTextは左端のグリッドから表示して").
 *
 * Deliberately NOT BilingualSection's geometry: that layout reserves a left
 * caption column and pushes its body to the 3rd-ish column (~372px in), which
 * is what this block looked wrong doing. Here the block runs edge to edge at
 * the page's own literal 24px side margin — the same margin the hero's date
 * and "View Website" use, and the furthest left anything on this page sits
 * (per follow-ups "左端のグリッドから表示して", then "左マージン24pxの位置
 * から表示して"). The optional heading stacks *above* the row rather than
 * beside it, since a side caption would reintroduce exactly the indent this
 * removes.
 *
 * The two halves sit side by side on one row in a 14:9 proportion (Japanese
 * to English) with a one-column gap — per "左日本語（14マス分）、右英語（9
 * マス分）の1列で表示".
 */
function TextBlock({
  caption,
  body,
  bodyEn,
  dark = false,
}: {
  caption?: string;
  body: string[];
  bodyEn: string[];
  dark?: boolean;
}) {
  return (
    // 60px top and bottom — per direct follow-up ("フリーテキストの上下マージ
    // ンは60pxに"), replacing the 150px top margin this inherited from
    // BilingualSection's own rhythm. Both sides are set here (not just the
    // top) so the block keeps its own breathing room regardless of what
    // follows it; the parent list's own 24px item gap sits outside this.
    //
    // Sides: the page's literal 24px margin plus one grid column — per
    // direct follow-up ("フリーテキストの両サイドに1マス分余白追加して").
    //
    // Note this makes the 14/9 column widths a *ratio* rather than literal
    // grid columns: 1 + 14 + 1 + 9 + 1 = 26 columns doesn't fit the grid's
    // own 24, so the two halves now flex to fill whatever the padding leaves,
    // keeping the 14:9 proportion (and the 1-column gap) exactly. At 1440px
    // that's ~741px / ~477px instead of 812 / 522 — the same relationship,
    // just inset. The alternative would have been overflowing the grid.
    <div
      className="my-[calc(60px*var(--scale))] flex flex-col items-start gap-[calc(40px*var(--scale))]"
      style={{
        paddingLeft: `calc(24px + ${TEXT_BLOCK_GAP})`,
        paddingRight: `calc(24px + ${TEXT_BLOCK_GAP})`,
      }}
    >
      {caption ? (
        <p
          className={`font-(family-name:--font-courier) text-[length:calc(14px*var(--scale))] whitespace-nowrap tracking-[calc(-0.7px*var(--scale))] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${
            dark ? "text-black/50" : "text-white/50"
          }`}
        >
          {caption}
        </p>
      ) : null}
      <div className="flex w-full items-start" style={{ gap: TEXT_BLOCK_GAP }}>
        {body.length > 0 && (
          <div
            className={`min-w-0 font-(family-name:--font-gen-interface-jp) text-[length:calc(16px*var(--scale))] text-justify leading-[1.7] tracking-[calc(0.48px*var(--scale))] ${
              dark ? "text-black" : "text-white"
            }`}
            style={{ ...SS09, flex: `${TEXT_BLOCK_JA_COLUMNS} 1 0` }}
          >
            {body.map((paragraph, i) => (
              <p key={paragraph} className={`mb-[1lh] whitespace-pre-line last:mb-0 ${paragraphTrimClass(i, body.length)}`}>
                {paragraph}
              </p>
            ))}
          </div>
        )}
        {/* Everything after the block's first blank line — Akzidenz Grotesk
           Next 400 (the site's own --font-sans, whose first family this is),
           14px on a literal 16px line box, 50% opacity, per direct follow-up.
           Deliberately not the Gen Interface JP / 1.7-leading treatment
           beside it: this half is Latin copy. */}
        {bodyEn.length > 0 && (
          <div
            className={`min-w-0 font-(family-name:--font-sans) font-normal text-[length:calc(14px*var(--scale))] leading-[calc(16px*var(--scale))] ${
              dark ? "text-black/50" : "text-white/50"
            }`}
            style={{ flex: `${TEXT_BLOCK_EN_COLUMNS} 1 0` }}
          >
            {bodyEn.map((paragraph, i) => (
              <p key={paragraph} className={`mb-[1lh] whitespace-pre-line last:mb-0 ${paragraphTrimClass(i, bodyEn.length)}`}>
                {paragraph}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Renders one ProjectGalleryBlock — see that type's own doc comment
 *  (lib/projects.ts) for what each variant looks like. Never called with an
 *  "idea"/"outcome" block — the gallery `.map()` below renders those as a
 *  BilingualSection directly instead, so this only ever needs to handle the
 *  3 media variants.
 *
 *  `suppressTopPadding` — per direct follow-up ("PCの詳細ページでinsetが縦
 *  に並んだ場合は、どちらかの上下paddingを無しにしてマージンが開きすぎない
 *  ようにして"): every "inset"-width block gets its own 100px top+bottom
 *  padding (GalleryMediaBlock/TwoColumnBlock's own `py-[100px]`), so two
 *  consecutive inset blocks previously stacked 100px (first block's bottom)
 *  + 100px (second block's top) + the parent list's own 24px item gap =
 *  224px between them — visibly too wide. Set true only when the *previous*
 *  gallery block is also inset-width (computed in the `.map()` below), which
 *  drops just that one shared edge's padding (this block's own *top*, not
 *  both blocks' touching sides), bringing a run of N consecutive insets down
 *  to a single 100px gap between each pair instead of 200px, while the very
 *  first inset in a run keeps its own top padding.
 *
 *  `suppressBottomPadding` — the mirror of the above at the gallery's own
 *  bottom edge, per direct follow-up ("insetが並びの一番下にくる場合、下
 *  マージンを無くして"): an inset that ends the gallery would otherwise stack
 *  its own 100px against the page's own trailing rhythm below, so the last
 *  block drops it. Only ever set on the final gallery item. */
function GalleryBlockView({
  block,
  defaultBackground,
  suppressTopPadding = false,
  suppressBottomPadding = false,
  collapseGapAbove = false,
  dark = false,
}: {
  block: Exclude<ProjectGalleryBlock, { type: "idea" } | { type: "outcome" } | { type: "text" }>;
  defaultBackground: string;
  suppressTopPadding?: boolean;
  suppressBottomPadding?: boolean;
  /** Cancels the gallery list's own item gap above this block — see
   *  hasOwnBackground. */
  collapseGapAbove?: boolean;
  dark?: boolean;
}) {
  if (block.type === "twoColumn") {
    return (
      <TwoColumnBlock
        items={block.items}
        width={block.width}
        backgroundColor={block.backgroundColor}
        defaultBackground={defaultBackground}
        suppressTopPadding={suppressTopPadding}
        suppressBottomPadding={suppressBottomPadding}
        collapseGapAbove={collapseGapAbove}
        dark={dark}
      />
    );
  }
  return (
    <GalleryMediaBlock
      block={block}
      defaultBackground={defaultBackground}
      suppressTopPadding={suppressTopPadding}
      suppressBottomPadding={suppressBottomPadding}
      collapseGapAbove={collapseGapAbove}
      dark={dark}
    />
  );
}

/** Whether a gallery block renders as PC's padded/background-colored
 *  "inset" box (either width variant — "inset" or "insetSmall", see
 *  ProjectGalleryWidth's own doc comment) — used by the gallery `.map()`
 *  below to detect consecutive inset runs for GalleryBlockView's own
 *  `suppressTopPadding`. Note "insetSmall" isn't actually offered for
 *  "twoColumn" (TwoColumnBlock only special-cases "inset"), but a block with
 *  that combination would still count as inset here, which just means it'd
 *  correctly get treated as adjacent to a real inset neighbor even though
 *  it itself renders as TwoColumnBlock's plain default layout — harmless,
 *  since no such combination is meant to be authored in practice. "idea"/
 *  "outcome" blocks never count (they have no `width` at all, and render as
 *  a BilingualSection, not GalleryBlockView, regardless). */
function isInsetGalleryBlock(block: ProjectGalleryBlock): boolean {
  return (
    (block.type === "image" || block.type === "video" || block.type === "twoColumn") &&
    (block.width === "inset" || block.width === "insetSmall")
  );
}

/** Whether a gallery block carries its own vertical spacing that would
 *  double up against a neighboring block's own — either an inset-width media
 *  block (its own py-100 padding, see isInsetGalleryBlock) or an "idea"/
 *  "outcome" block (rendered as a BilingualSection, its own tightSpacing
 *  mt/mb-116 margin) — per direct follow-up ("実績詳細でinsetとOverviewと
 *  IdeaとOutcome、それぞれが上下で続いた場合はどちらかからpaddingを無しにし
 *  てマージンが空きすぎないように調整する"): extends the inset-run-only
 *  suppressTopPadding fix below to *any* pairing of these "spacious" block
 *  types, not just two inset blocks back to back — a plain "full"/"content"
 *  block has no vertical spacing of its own to double up with, so it's
 *  deliberately excluded here (nothing to suppress either side of it). */
/** Whether this block carries its own CMS-chosen inset background colour
 *  (rather than falling back to the project's own). Two rules key off it —
 *  see the gallery `.map()` below:
 *   - it keeps its top padding even when it follows another inset, so a
 *     deliberately-coloured band never loses its own breathing room;
 *   - a run of such blocks collapses the list's own gap between them, so
 *     their colours meet with no page background showing through.
 *  Per direct follow-up ("insetで背景色を指定した場合、insetが上下に続いてて
 *  も上マージンは付ける。また、背景色を指定した画像間の上下マージン20pxは
 *  無しにする"). */
function hasOwnBackground(block: ProjectGalleryBlock): boolean {
  return (
    (block.type === "image" || block.type === "video" || block.type === "twoColumn") &&
    isInsetGalleryBlock(block) &&
    Boolean(block.backgroundColor)
  );
}

/** A media block that runs edge to edge. */
function isFullWidthBlock(block: ProjectGalleryBlock): boolean {
  return (
    (block.type === "image" || block.type === "video" || block.type === "twoColumn") &&
    block.width === "full"
  );
}

/** Whether this block paints a full-bleed colour band — every "inset" does
 *  (its fill falls back to the project's own colour), and any other width
 *  does once a colour is set on it in the CMS. */
function paintsBackgroundBand(block: ProjectGalleryBlock): boolean {
  if (block.type !== "image" && block.type !== "video" && block.type !== "twoColumn") return false;
  return isInsetGalleryBlock(block) || Boolean(block.backgroundColor);
}

/** The colour a block's band actually renders in — its own if set, otherwise
 *  the project's own for "inset" (which always paints one). Undefined for
 *  blocks that paint no band at all, so two of those never compare equal. */
function bandColor(block: ProjectGalleryBlock, defaultBackground: string): string | undefined {
  if (!paintsBackgroundBand(block)) return undefined;
  if (block.type !== "image" && block.type !== "video" && block.type !== "twoColumn") return undefined;
  return block.backgroundColor ?? (isInsetGalleryBlock(block) ? defaultBackground : undefined);
}

/** Whether two neighbours' bands are the same colour — the cue for merging
 *  them into one continuous field rather than two stacked ones. */
function sharesBandColor(
  block: ProjectGalleryBlock,
  previous: ProjectGalleryBlock,
  defaultBackground: string
): boolean {
  const color = bandColor(block, defaultBackground);
  return color !== undefined && color === bandColor(previous, defaultBackground);
}

/**
 * Whether the list's own item gap between these two neighbours should be
 * cancelled so they meet flush.
 *
 * The rule: both sides have to be things that read as continuous surfaces —
 * a colour band, or a full-bleed image — and at least one of them has to
 * actually be a band. That single condition covers every case asked for
 * across several follow-ups ("背景色を指定した画像間の上下マージン20pxは
 * 無しにする", "fullとinsetが上下関係になった際も", "fullとcontentの並びの
 * ときとcontentとinsetの並びのときも"): band+band, full+band and band+full
 * all collapse, while two plain images, or a plain content block against a
 * band, keep the gap — there's no colour there for the gap to interrupt.
 */
function shouldCollapseGap(block: ProjectGalleryBlock, previous: ProjectGalleryBlock): boolean {
  const blockBand = paintsBackgroundBand(block);
  const previousBand = paintsBackgroundBand(previous);
  if (!blockBand && !previousBand) return false;
  return (blockBand || isFullWidthBlock(block)) && (previousBand || isFullWidthBlock(previous));
}

function hasOwnVerticalSpacing(block: ProjectGalleryBlock): boolean {
  // "text" counts for the same reason "idea"/"outcome" do — TextBlock carries
  // its own mt-150, so a media block placed right after one shouldn't add its
  // own leading spacing on top.
  return (
    isInsetGalleryBlock(block) ||
    block.type === "idea" ||
    block.type === "outcome" ||
    block.type === "text"
  );
}

/** Left-margined caption ("(Overview)" / "Next Project", Figma nodes
 *  1349:389/1349:376) that sits in its own fixed-width column (CONTENT_ML
 *  wide) so its own text lands flush at the page's own literal 82px*grid-
 *  scale margin (matching app/studies/page.tsx's own thumbnail-rail width)
 *  while whatever follows it lines up at CONTENT_ML, the standard content
 *  margin every other page's header/footer/body already uses. NOT used for
 *  the recap row or "(Credit)" below — see CREDIT_BLOCK_ML's own doc
 *  comment for why those need literal absolute positions instead.
 *
 *  `font` defaults to "courier" (Courier Prime, tracked tight — matches
 *  "(Overview)"/"(Credit)", Figma nodes 1346:196/1349:367) — "Next Project"
 *  (Figma node 1349:376) uses plain Akzidenz-Grotesk Next Regular instead,
 *  no tracking override, per direct follow-up ("Next Projectの文字箇所を
 *  Akzidenz-Grotesk Next Regularに変更"). */
function DetailCaption({
  children,
  dark = false,
  font = "courier",
}: {
  children: React.ReactNode;
  dark?: boolean;
  font?: "courier" | "sans";
}) {
  return (
    <p
      className={`shrink-0 pl-[calc(82px*var(--grid-scale))] whitespace-nowrap text-[length:calc(14px*var(--scale))] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${
        font === "courier" ? "font-(family-name:--font-courier) tracking-[calc(-0.7px*var(--scale))]" : ""
      } ${dark ? "text-black/50" : "text-white/50"}`}
      style={{ width: CONTENT_ML }}
    >
      {children}
    </p>
  );
}

/**
 * Bilingual caption + JA/EN two-column text block — Overview's own layout
 * (Figma node 1346:196/198/199), extracted so "(Idea)"/"(Outcome)" (per
 * direct follow-up: "Overviewと同じ仕様の組で「Idea」/「Outcome」として...
 * 追加") can reuse the exact same spec instead of duplicating it. Every
 * spacing/width value here (ml-174px, JA 580px/10 grid columns, EN 376px)
 * carries its own tuning history in the Overview call site's own comments
 * further down — this component just centralizes the shared shape.
 *
 * `tightSpacing` — per direct follow-up ("IdeaとOutcomeの上下マージンを
 * 140pxに"): Overview sits as a plain sibling above the gallery (its 150px
 * top margin below is the only spacing involved, untouched here), but
 * "Idea"/"Outcome" are spliced in as items *inside* the gallery's own
 * `flex-col gap-[24px]` list — that gap already adds 24px above and below
 * every item, stacking with (not collapsing into) this component's own
 * margin. So `tightSpacing` uses 116px (140 - 24) top and bottom instead of
 * the default 150px-top-only, landing the *visible* gap at exactly 140px on
 * both sides once the parent's 24px gap is added in.
 *
 * `suppressTopMargin` — per further direct follow-up ("実績詳細でinsetと
 * OverviewとIdeaとOutcome、それぞれが上下で続いた場合はどちらかからpadding
 * を無しにしてマージンが空きすぎないように調整する"): the 116px top margin
 * above stacks with an *inset* gallery block's own trailing 100px padding
 * whenever one immediately precedes this block in the gallery list (100 +
 * 24 flex gap + 116 = 240px, visibly wider than the 140px rhythm every
 * other pairing lands on) — dropping just this block's own top margin
 * (its bottom margin stays untouched) brings that pairing back down to the
 * inset's own 100px + the 24px gap = 124px, matching this file's own
 * hasOwnVerticalSpacing/suppressTopPadding convention of always trimming
 * whichever block comes *second* in an adjacent "spacious" pair rather than
 * the one that comes first.
 */
/** Newline handling for the CMS textareas rendered here, so that what an
 *  editor types is what they get:
 *    - one newline  -> a line break, via `whitespace-pre-line` on each <p>.
 *      splitParagraphs() (lib/projects.ts) only splits on *blank* lines, so
 *      single newlines survive into these strings; HTML would otherwise
 *      collapse them into ordinary spaces. `pre-line` (not `pre`/`pre-wrap`)
 *      is the right variant — it honours newlines while still collapsing runs
 *      of spaces and wrapping long lines normally, so stray indentation in
 *      the CMS doesn't leak into the layout.
 *    - a blank line -> one empty line, via `mb-[1lh]` on every paragraph but
 *      the last. Consecutive blocks with no margin already sit exactly one
 *      line apart, so adding a further whole line-height puts two lines
 *      between baselines, i.e. one visibly empty line. The `lh` unit resolves
 *      against this element's own computed line-height, so it stays exact at
 *      every breakpoint without restating any leading value here.
 *  Applies to Overview, (Idea) and (Outcome) alike, since all three render
 *  through this same component. */
function BilingualSection({
  caption,
  ja,
  en,
  tightSpacing = false,
  suppressTopMargin = false,
  dark = false,
}: {
  caption: string;
  ja: string[];
  en: string[];
  tightSpacing?: boolean;
  suppressTopMargin?: boolean;
  /** Matches this project's own `detail.headerColor` — per direct follow-up
   *  ("overview、idea、outcomeのテキストもヘッダーの文字色を変更したら変わ
   *  るようにして"): previously these were hardcoded white/white-50
   *  regardless of headerColor, unlike the header/footer, which already
   *  followed it. */
  dark?: boolean;
}) {
  return (
    <div
      className={`flex w-full items-start ${
        tightSpacing
          ? `${suppressTopMargin ? "" : "mt-[calc(116px*var(--scale))]"} mb-[calc(116px*var(--scale))]`
          : "mt-[calc(150px*var(--scale))]"
      }`}
    >
      <DetailCaption dark={dark}>{caption}</DetailCaption>
      <div className="ml-[calc(174px*var(--grid-scale))] flex flex-1 items-start gap-[calc(30px*var(--grid-scale))] pr-[calc(82px*var(--grid-scale))]">
        <div
          className={`w-[calc(580px*var(--grid-scale))] font-(family-name:--font-gen-interface-jp) text-[length:calc(16px*var(--scale))] text-justify leading-[1.7] tracking-[calc(0.48px*var(--scale))] ${
            dark ? "text-black" : "text-white"
          }`}
          style={SS09}
        >
          {ja.map((paragraph, i) => (
            <p key={paragraph} className={`mb-[1lh] whitespace-pre-line last:mb-0 ${paragraphTrimClass(i, ja.length)}`}>
              {paragraph}
            </p>
          ))}
        </div>
        <div
          className={`w-[calc(376px*var(--grid-scale))] text-[length:calc(14px*var(--scale))] leading-[calc(16px*var(--scale))] ${
            dark ? "text-black/50" : "text-white/50"
          }`}
        >
          {en.map((paragraph, i) => (
            <p key={paragraph} className={`mb-[1lh] whitespace-pre-line last:mb-0 ${paragraphTrimClass(i, en.length)}`}>
              {paragraph}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

/** One "Label / value" stack in the Category/Role/Date/Link recap row —
 *  absolutely positioned at `leftPx` (relative to its own CREDIT_BLOCK_ML/
 *  CREDIT_BLOCK_WIDTH-sized ancestor) unless `leftPx` is omitted, in which
 *  case it stays in normal flow (used for the first field, Category, so the
 *  row's own height comes from real content instead of needing a separate
 *  fixed height).
 *
 *  `alignRight` flushes the field's *block* to the right edge of that same
 *  ancestor instead of a literal `leftPx` — per direct follow-up ("credit上
 *  のview websiteはエリア内の右端に揃える"), used for the Link field so it
 *  always sits flush right regardless of the link text's own length, rather
 *  than a fixed 1175px offset (CREDIT_FIELD_LEFT_PX.link, now unused) that
 *  assumed one specific text width. The label/value text itself still reads
 *  left-to-right within that block (`items-start`, not `items-end`) — per a
 *  further follow-up ("Linkは左詰めで") reverting this field's initial
 *  right-justified text, which read as mirrored/backwards; only the block's
 *  own outer position is right-anchored. */
function MetaField({
  label,
  leftPx,
  alignRight = false,
  dark = false,
  children,
}: {
  label: string;
  leftPx?: number;
  alignRight?: boolean;
  /** Matches this project's own `detail.headerColor` — per direct follow-up
   *  ("タイトルとカテゴリー、日付、role、クレジットもヘッダー色に合わせて
   *  変わるようにして"). */
  dark?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-[calc(12px*var(--scale))] ${
        leftPx !== undefined || alignRight ? "absolute top-0" : ""
      } items-start`}
      style={leftPx !== undefined ? { left: `calc(${leftPx}px * var(--grid-scale))` } : alignRight ? { right: 0 } : undefined}
    >
      <p
        className={`font-(family-name:--font-courier) text-[length:calc(12px*var(--scale))] tracking-[calc(-0.6px*var(--scale))] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${
          dark ? "text-black/50" : "text-white/50"
        }`}
      >
        {label}
      </p>
      {children}
    </div>
  );
}

/**
 * Project detail page (実績詳細) — /projects/[slug] (route directory renamed
 * from the original /works/[slug] per direct follow-up "ディレクトリ名を
 * worksじゃなくProjectsに変更"), PC implementation of Figma node 1346:140
 * ("Yatsumonji Gakuen 70th"), the one project with a real detail-page design
 * so far. Every other project's `detail` is still undefined (see
 * lib/projects.ts's own ProjectDetail doc comment), so this page falls back
 * to a minimal placeholder body for those rather than 404ing — project-card
 * .tsx's own `href` already points here for all 29 placeholder projects, so
 * leaving those as dead links would be worse than a plain page.
 *
 * PC-only for this first pass (per explicit scope: "PCの実績詳細") — gated
 * behind `hidden lg:flow-root`, same convention as app/about/page.tsx's own
 * PC/SP split (`flow-root`, not `block` — a plain block display lets
 * SiteHeader's own `mt-[24px]` collapse straight through this wrapper's own
 * top edge instead of staying inside it, leaving that 24px strip showing the
 * page's default background instead of this project's own `backgroundColor`;
 * `flow-root` establishes a new block-formatting context so the child's own
 * top margin stays contained, same fix app/about/page.tsx's own root div
 * already relies on). No Figma SP design exists yet for this page, so the
 * `lg:hidden` branch below is a plain, unstyled-to-Figma stacked fallback
 * rather than a pixel-matched mobile tree — swap in a real
 * MobileProjectDetail component once an SP design exists, same as
 * MobileAbout/MobileStudies/MobileContact.
 */
export default async function ProjectDetailPage({ params }: ProjectsPageProps) {
  const { slug } = await params;
  const result = await getProjectBySlug(slug);
  if (!result) notFound();
  const { project, next } = result;
  const detail = project.detail;
  const websiteUrl = detail?.websiteUrl;
  const backgroundColor = detail?.backgroundColor ?? DEFAULT_BACKGROUND;
  // Per direct follow-up ("ヘッダー・フッターの色は実績ごとに#000か#fffを管
  // 理画面で選択可能にする") — governs SiteHeader/HeaderSummon's own `dark`
  // prop below; see lib/projects.ts's own ProjectDetail.headerColor doc
  // comment for why SP's MobileMenu pill isn't driven by this same field.
  const headerDark = detail?.headerColor === "black";
  // Next Project's own thumbnail (below) shows the *next* project's first
  // gallery image, not its hero/KV — per direct follow-up ("next projectの
  // グレー画像箇所に次の実績イメージを表示する（hero画像じゃなくてギャラリー
  // 画像の1枚目を表示する）"). Falls back to the plain empty box
  // (NextProjectTeaser's own default) if that project has no detail yet, or
  // its first "image" block hasn't had a real photo uploaded yet either —
  // same "gray until a real photo exists" convention every other gallery
  // block already uses, not a special case.
  const nextThumb = next.detail?.gallery.find(
    (block): block is Extract<ProjectGalleryBlock, { type: "image" }> => block.type === "image"
  );

  // CreativeWork structured data for this specific project — lets search and
  // answer engines treat each piece of work as a real entity (what it is, who
  // made it, who it was for, when) rather than as undifferentiated page text.
  // Every value is read from data this page already renders, so there is
  // nothing separate to keep in sync.
  //
  // `client` is pulled out of the Credit block by label rather than being its
  // own CMS field: parseCreditColumns (lib/projects.ts) already turns that
  // block into { label, value } rows, and "Client" is the conventional label
  // used throughout. When a project doesn't have one, the property is simply
  // omitted rather than emitted empty — partial-but-correct structured data
  // is fine, wrong structured data isn't.
  const clientName = detail?.creditColumns
    .flat()
    .find((row) => row.label.trim().toLowerCase() === "client")?.value;
  const projectJsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: project.title,
    url: `${SITE_URL}/projects/${slug}/`,
    ...(project.description ? { description: project.description } : {}),
    // `role` is this studio's own contribution (e.g. "Art Direction, Design")
    // — the closest schema.org equivalent to "what we did on this" is
    // `creator` plus a plain-text `genre`/`about`, so the category and role
    // are surfaced as keywords rather than invented into a richer type.
    keywords: [project.category, project.role].filter(Boolean).join(", "),
    creator: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    ...(clientName ? { sourceOrganization: { "@type": "Organization", name: clientName } } : {}),
    ...(detail?.hero.pc.image ? { image: detail.hero.pc.image } : {}),
    ...(detail?.websiteUrl && isLinkableWebsiteUrl(detail.websiteUrl)
      ? { sameAs: detail.websiteUrl }
      : {}),
  };

  return (
    <div className="relative w-full">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(projectJsonLd) }}
      />
      {/* ProjectDetailReveal — per direct follow-up ("実績詳細ページが表示
         される際、Aboutページと同じように背景色がフェードインしてページ要
         素が下からスライドイン+フェードインで表示して"): fades this
         project's own `backgroundColor` in from a neutral off-white and
         slides/fades its own `children` in below it. `header`/`footer`
         (SiteHeader/HeaderSummon) are passed as separate props instead of
         being nested inside `children` — they stay outside the slide+fade
         treatment (each already has its own separate fade-in logic and
         shouldn't visually slide with the page body), and passing them this
         way (plain JSX) avoids an earlier version's real render error: that
         version instead exposed a `revealed` flag via a render-prop function
         child, but a plain *function* can't cross from this async Server
         Component into a "use client" component's props — only serializable
         values (including other JSX) can. No `currentHref` on either below
         — per direct follow-up ("ヘッダーのProjectsはcurrent表示じゃなくし
         て"), reverting the earlier override back to the ordinary
         pathname-based "current" check every other page already uses (never
         matches this route, so "Projects" now renders as a plain link here). */}
      <ProjectDetailReveal
        backgroundColor={backgroundColor}
        className="relative hidden lg:flow-root"
        header={<SiteHeader noBlend dark={headerDark} />}
        // No `dark={headerDark}` here (unlike SiteHeader above) — per direct
        // follow-up ("実績詳細でヘッダーカラーを#000に設定しても、表示ヘッ
        // ダーは#fff+ブレンドモードのままにしておいてほしい"): this summoned
        // header should always stay the default white text + blend mode,
        // regardless of this project's own CMS headerColor choice — only the
        // always-in-flow SiteHeader above (which is itself already `noBlend`
        // unconditionally on this page, so `dark` there only ever affects its
        // plain, unblended text color) should follow that per-project
        // #000/#fff setting.
        footer={<HeaderSummon />}
      >

        {/* Title + meta band — date sits at the page's own literal left edge
           (Figma node 1346:183's own `left-[24px]`, not CONTENT_ML), title at
           CONTENT_ML, category/role/"View Website" right-aligned near
           --edge-right-inset (Figma nodes 1346:181/182/1349:333). Every piece
           anchors to `bottom-0` (not `top-0`) so they all share one common
           bottom edge with the title — per direct follow-up ("hero画像上の
           テキストは下面揃えに"): anchoring from the top instead left each
           smaller-text line sitting at a different visual height than the
           much taller title line, since text-box-trim only tightens each
           element's own box, it doesn't align separate elements' boxes to
           each other. */}
        <div className="relative mt-[calc(280px*var(--scale))] w-full">
          <p
            className={`absolute bottom-0 left-[24px] font-(family-name:--font-courier) text-[length:calc(14px*var(--scale))] whitespace-nowrap tracking-[calc(-0.7px*var(--scale))] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${
              headerDark ? "text-black" : "text-white"
            }`}
          >
            {project.date}
          </p>
          {/* Title and the category/role/link row share one flex row rather
             than each being absolutely positioned against opposite edges —
             per direct follow-up with a screenshot ("カテゴリーが長い場合、
             ウィンドウ幅が狭いとタイトルと被ることがある。ロールも長い場合が
             あるので、それぞれが1024pxまでは被らないように改行するなどで対応
             する仕様にして").

             The meta row used to be `absolute right-[24px] bottom-0`, so its
             left edge simply extended further left as its text got longer,
             with nothing stopping it from running under the title —
             SATOYAMA TERRACE's category does exactly that on a narrow
             window. In normal flow with `justify-between` the two can't
             overlap at any width by construction, rather than only down to
             some tested breakpoint: the title keeps its intrinsic width
             (`shrink-0`) and the meta row takes what's left, wrapping inside
             itself.

             `items-end` reproduces what the shared `bottom-0` anchoring did
             — both boxes still sit on one common bottom edge, which is what
             the earlier "hero画像上のテキストは下面揃えに" follow-up asked
             for. The date stays absolutely positioned at the page's literal
             left edge, outside this row: it sits left of CONTENT_ML, so it
             was never part of the overlap and shouldn't start affecting the
             title's position now. */}
          <div
            className="flex items-end justify-between"
            style={{ marginLeft: CONTENT_ML, marginRight: "24px", gap: HERO_TITLE_META_GAP }}
          >
            {/* ScrambleText reveal — per direct follow-up ("実績タイトルをス
               クランブルテキストで表示する"), same character-cascade reveal
               mobile-project-list.tsx's own titles already use, wrapped in its
               own tiny client component (project-title-scramble.tsx) since
               this page itself is an async Server Component. */}
            <p
              className={`shrink-0 text-[length:calc(30px*var(--scale))] leading-[1.5] font-medium whitespace-nowrap [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${
                headerDark ? "text-black" : "text-white"
              }`}
            >
              <ProjectTitleScramble text={project.title} />
            </p>
          {/* category/role/"View Website" now share one row (per direct
             follow-up: "この文字列の右端に「View Website」を入れる") instead
             of "View Website" sitting as its own separately-positioned
             element further right — it's simply the last item in this same
             flex row, at the same 110px gap as category→role, so the whole
             group's right edge lands together. Right offset is a literal
             24px (not --edge-right-inset, the grid-based inset SiteHeader/
             SiteFooter use) per direct follow-up ("右端に24pxマージン"),
             matching this same page's own KV side margins and twoColumn gap
             — this detail page's own edge margin, distinct from the rest of
             the site's header/footer convention. Still underlined with the
             hover-sweep animation (`underline-sweep`, the same treatment
             every other external link on this site already uses) since it
             leaves the site (target="_blank"). translateY(4px) nudge — per
             direct follow-up with a screenshot ("PCの実績詳細のタイトル右の
             カテゴリとroleの下面をタイトルの下面に目視で合わせて"): plain
             `bottom-0` alone left this row's own visual text bottom sitting
             noticeably above the title's (title is now `font-medium`, whose
             glyphs render slightly differently than the row's own regular
             weight, throwing off the shared-bottom-edge assumption this
             layout otherwise relies on) — a manual eyeballed correction, not
             a value derived from any spec. 9px → 8px → 7px → 4px per three
             further follow-ups ("1px行き過ぎかも、1px上に戻して", "もう1px
             上にして", then "4pxに修正して"). */}
          <div
            className={`flex min-w-0 flex-wrap items-baseline justify-end text-[length:calc(14px*var(--scale))] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${
              headerDark ? "text-black" : "text-white"
            }`}
            // columnGap, not the `gap` shorthand: `gap` also sets row-gap, so
            // once this row wrapped, its two lines were pushed apart by the
            // full inter-item gap (40px at the time) — the category/role line
            // ended up floating far above the title instead of sitting one
            // line above "View Website". Reported with a screenshot ("狭い時
            // 添付みたいになってるけど"). rowGap 0 leaves the wrapped lines on
            // their natural leading.
            style={{
              transform: "translateY(calc(4px * var(--scale)))",
              columnGap: HERO_META_ITEM_GAP,
              rowGap: 0,
            }}
          >
            {/* Each value stays on one line (`whitespace-nowrap`); the row
               itself wraps between them (`flex-wrap`) when they no longer fit
               side by side, so "View Website" drops to a second line before
               anything breaks mid-phrase. An earlier version let the values
               themselves wrap instead, which split the category in the middle
               of "…Merchandise, Signs, / Typeface" — the same number of lines,
               read as broken text. Gaps tighten before either happens (see
               HERO_META_ITEM_GAP); the widest single value (the 335px
               category) still fits the 548px available at 1024px on its own,
               so no value ever overflows. */}
            <p className="whitespace-nowrap">{project.category}</p>
            <p className="whitespace-nowrap">{project.role}</p>
            {/* websiteUrl を一度ローカルに取り出しているのは、下の三項の
               else 側で TypeScript が detail の絞り込みを保てないため
               （detail?.websiteUrl での判定だけだと "detail is possibly
               undefined" になる）。 */}
            {websiteUrl &&
              // --underline-offset: calc(-0.1em + 5px) — 3px (per direct
              // follow-up "View websiteの下線の位置を3px上にする") plus a
              // further 2px ("FVエリアのview websiteの下線位置を2px上げる"),
              // same per-instance override pattern as .underline-sweep's own
              // shared default (see globals.css) — only this FV/hero-area
              // link moves; the later recap row's own "View Website" (Link
              // field) keeps the shared default, unaffected.
              (isLinkableWebsiteUrl(websiteUrl) ? (
                <ViewWebsiteLink
                  href={websiteUrl}
                  className="shrink-0 whitespace-nowrap"
                  arrowSize="calc(8px*var(--scale))"
                  gap="calc(8px*var(--scale))"
                  style={{ "--underline-offset": "calc(-0.1em + 5px)" } as React.CSSProperties}
                />
              ) : (
                // URL でない値（"Archived" など）はリンクにせず、書かれた
                // 文字をそのまま出す — isLinkableWebsiteUrl の doc comment 参照。
                <p className="shrink-0 whitespace-nowrap">{websiteUrl}</p>
              ))}
            </div>
          </div>
        </div>

        {detail ? (
          <>
            {/* KV — inset 24px from both edges (per explicit spec: "KV：両
               サイドに24px余白"), unlike the gallery's own "full" width blocks
               below, which run genuinely edge to edge. Parallax-scrolled (per
               direct follow-up "kvをパララックスさせて") — see
               components/works-hero-parallax.tsx's own doc comment. */}
            <div className="mt-[calc(24px*var(--scale))] w-full px-[24px]">
              <ProjectHeroParallax
                image={detail.hero.pc.image}
                imageSrcSet={detail.hero.pc.imageSrcSet}
                aspect={detail.hero.pc.aspect}
                mask={detail.hero.pc.mask}
              />
            </div>

            {/* ml-174px = 3 grid columns — 2 columns (116px, per direct
               follow-up "Overviewの日英は右にグリッド2個分移動") plus a
               further 1 column (58px, per direct follow-up "Overviewの日英
               を右に1マス移動"); JA width 10 grid columns (580px, per direct
               follow-up "日本語の幅を10マス分に"); EN width 434px minus 1
               grid column (376px, per direct follow-up "英語を幅を1マス分
               小さく") — all baked into BilingualSection now. */}
            <BilingualSection caption="(Overview)" ja={detail.overviewJa} en={detail.overviewEn} dark={headerDark} />

            {/* mt-150px — matches the Overview section's own top margin
               above it, per direct follow-up ("overviewの下マージンも150px
               に"). "(Idea)"/"(Outcome)" blocks (ProjectGalleryBlock's own
               "idea"/"outcome" types) render as a BilingualSection right
               inline, wherever they fall in `detail.gallery`'s own order —
               per direct follow-up ("画像も含めて表示位置を自由に変更できる
               ようにしたい。例えばCMSの管理画面の入力の並び順にページ自体
               も表示する仕様にするとか"): no more fixed splice-point/index
               logic, this array's own order *is* the page's own order.
               `tightSpacing` — see BilingualSection's own doc comment for why
               140px here needs a different margin value (116px) than
               Overview's plain 150px.

               suppressTopPadding/suppressTopMargin below both key off the
               same `i === 0 || hasOwnVerticalSpacing(detail.gallery[i - 1])`
               condition — per direct follow-up ("実績詳細でinsetとOverview
               とIdeaとOutcome、それぞれが上下で続いた場合はどちらかから
               paddingを無しにしてマージンが空きすぎないように調整する"):
               this drops the CURRENT block's own leading-edge spacing
               whenever whatever comes immediately before it also carries its
               own trailing spacing — either another gallery block
               (hasOwnVerticalSpacing) or, for the very first gallery item
               (i === 0), the Overview section above (whose own trailing
               rhythm comes from this whole wrapper's own mt-150, always
               present regardless of what the first gallery item turns out to
               be). See hasOwnVerticalSpacing/BilingualSection's own
               suppressTopMargin doc comments for the fuller "why the second
               block, not the first" reasoning. */}
            <div className="mt-[calc(150px*var(--scale))] flex w-full flex-col items-stretch gap-[calc(24px*var(--scale))]">
              {detail.gallery.map((block, i) => {
                const suppressLeadingSpacing = i === 0 || hasOwnVerticalSpacing(detail.gallery[i - 1]);
                if (block.type === "idea" || block.type === "outcome") {
                  return (
                    <BilingualSection
                      key={i}
                      caption={block.caption}
                      ja={block.ja}
                      en={block.en}
                      tightSpacing
                      suppressTopMargin={suppressLeadingSpacing}
                      dark={headerDark}
                    />
                  );
                }
                if (block.type === "text") {
                  return (
                    <TextBlock key={i} caption={block.caption} body={block.body} bodyEn={block.bodyEn} dark={headerDark} />
                  );
                }
                return (
                  <GalleryBlockView
                    key={i}
                    block={block}
                    defaultBackground={backgroundColor}
                    // Top padding is dropped in two cases: the long-standing
                    // "previous block already brought its own spacing" rule
                    // (which a colour-set block opts out of, so a deliberate
                    // band keeps its breathing room), and — per direct
                    // follow-up "insetで同じ色の背景色を指定した画像が縦に
                    // 続くときは下段の上マージンを無しにして" — whenever the
                    // block above is *also an inset* painting the same colour,
                    // where the two should read as one field rather than two.
                    // The "also an inset" half matters: a content block can
                    // share the colour without sharing the inset's generous
                    // padding, and there this block keeps its own — per direct
                    // follow-up ("contentとinsetの同背景色の場合はinsetのほうの
                    // 上マージンはありで").
                    suppressTopPadding={
                      isInsetGalleryBlock(block) &&
                      ((i > 0 &&
                        isInsetGalleryBlock(detail.gallery[i - 1]) &&
                        sharesBandColor(block, detail.gallery[i - 1], backgroundColor)) ||
                        (suppressLeadingSpacing && !hasOwnBackground(block)))
                    }
                    // The gallery's own last block drops its trailing padding —
                    // per direct follow-up ("insetが並びの一番下にくる場合、
                    // 下マージンを無くして"). Only "inset" widths have any to
                    // drop, so this is a no-op for every other width.
                    //
                    // ただしその inset がCMSで独自の背景色を持っている場合は
                    // 残す — per direct follow-up ("実績詳細の一番下の画像が
                    // insetで背景色付きの場合は下paddingは残して")。色の付いた
                    // 帯が見えている状態なので、下だけ padding が無いと画像が
                    // 帯の下端に貼り付いて見える。背景色を指定していない inset
                    // はページ地色と同じ帯＝見えないので、従来どおり落とす。
                    suppressBottomPadding={i === detail.gallery.length - 1 && !hasOwnBackground(block)}
                    // ...and some neighbour pairings meet flush, with the
                    // list's own gap cancelled — see shouldCollapseGap.
                    collapseGapAbove={i > 0 && shouldCollapseGap(block, detail.gallery[i - 1])}
                    dark={headerDark}
                  />
                );
              })}
            </div>

            {/* Category/Role/Date/Link recap row (Figma node 1349:390's own
               top half, above its Line5 divider — the border-t on the
               (Credit) row just below renders that same divider) — per
               direct follow-up ("creditの上に添付の項目追加"), positioned at
               CREDIT_BLOCK_ML/CREDIT_FIELD_LEFT_PX's own literal offsets
               rather than an even flex spread, per further follow-up
               ("Creditとその上の要素を...グリッド幅やマージンをデザインに
               合わせて"). */}
            <div className="relative mt-[calc(140px*var(--scale))]" style={{ marginLeft: CREDIT_BLOCK_ML, width: CREDIT_BLOCK_WIDTH }}>
              <MetaField label="Category" dark={headerDark}>
                <p
                  className={`text-[length:calc(14px*var(--scale))] whitespace-nowrap [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${
                    headerDark ? "text-black" : "text-white"
                  }`}
                >
                  {project.category}
                </p>
              </MetaField>
              <MetaField label="Role" leftPx={CREDIT_FIELD_LEFT_PX.role} dark={headerDark}>
                <p
                  className={`text-[length:calc(14px*var(--scale))] whitespace-nowrap [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${
                    headerDark ? "text-black" : "text-white"
                  }`}
                >
                  {project.role}
                </p>
              </MetaField>
              <MetaField label="Date" leftPx={CREDIT_FIELD_LEFT_PX.date} dark={headerDark}>
                {/* Plain Akzidenz-Grotesk Next Regular (site default, no
                   font class needed) — per direct follow-up ("その左の日付
                   フォントはAkzidenz-Grotesk Next Regularに"), reverting the
                   Courier Prime this previously had. */}
                <p
                  className={`text-[length:calc(14px*var(--scale))] whitespace-nowrap [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${
                    headerDark ? "text-black" : "text-white"
                  }`}
                >
                  {project.date}
                </p>
              </MetaField>
              {/* Whole field hidden (not just its value) when there's no
                 website URL — per direct request ("view websiteのurlが無い
                 場合はcredit上のLinkは隠して"), an empty "Link" label with
                 no value shouldn't render at all. */}
              {detail.websiteUrl && (
                <MetaField label="Link" alignRight dark={headerDark}>
                  {isLinkableWebsiteUrl(detail.websiteUrl) ? (
                    <ViewWebsiteLink
                      href={detail.websiteUrl}
                      textClassName="[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
                      // 共有既定値（-0.1em）から 1px 下げる。FV 側は逆に
                      // 上げてあり（上の doc comment 参照）、両者は独立。
                      style={{ "--underline-offset": "calc(-0.1em - 1px)" } as React.CSSProperties}
                      arrowSize="calc(8px*var(--scale))"
                      gap="calc(8px*var(--scale))"
                      className={`text-[length:calc(14px*var(--scale))] whitespace-nowrap ${
                        headerDark ? "text-black" : "text-white"
                      }`}
                    />
                  ) : (
                    <p
                      className={`text-[length:calc(14px*var(--scale))] whitespace-nowrap [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${
                        headerDark ? "text-black" : "text-white"
                      }`}
                    >
                      {detail.websiteUrl}
                    </p>
                  )}
                </MetaField>
              )}
            </div>

            <div
              className={`mt-[calc(140px*var(--scale))] border-t pt-[calc(140px*var(--scale))] ${
                headerDark ? "border-black/10" : "border-white/20"
              }`}
              style={{ marginLeft: CREDIT_BLOCK_ML, width: CREDIT_BLOCK_WIDTH }}
            >
              <div className={`relative text-[length:calc(14px*var(--scale))] ${headerDark ? "text-black" : "text-white"}`}>
                <p
                  className={`font-(family-name:--font-courier) text-[length:calc(14px*var(--scale))] tracking-[calc(-0.7px*var(--scale))] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both] ${
                    headerDark ? "text-black/50" : "text-white/50"
                  }`}
                >
                  (Credit)
                </p>
                {/* Invisible sizer, in normal flow, matching the *tallest*
                   credit column's own row count — per direct follow-up
                   ("creditの右に入ってるclientやPhotographer含めたエリアの
                   下マージンを140pxにする"): every credit column below is
                   `absolute` (needed for their literal pixel left-offsets,
                   same reason as the recap row above), so none of them
                   otherwise contribute to this box's real height — without
                   this, the box's rendered height was just the "(Credit)"
                   label's own single line, so the 140px gap to Next Project
                   below was measured from there instead of from the true,
                   much taller bottom of columns like Producer/Developer/.../
                   Photographer. */}
                {/* Both groups sit in the *same* single grid cell, so this
                   box's own height resolves to the taller of the two rather
                   than either one alone — needed now that the right-hand
                   group is a vertical stack of every column past the first
                   (see the real columns below), whose combined height can
                   easily exceed the left column's. Overlapping them in one
                   cell (rather than laying them out side by side) keeps this
                   sizer from adding any width of its own. */}
                <div aria-hidden className="invisible grid">
                  <div
                    className="col-start-1 row-start-1 flex flex-col items-start gap-[calc(8px*var(--scale))]"
                    style={{ width: CREDIT_COLUMN_WIDTH }}
                  >
                    {/* `?? []` — dtlCredit is optional in the CMS, and an
                       unset value yields an empty creditColumns array (see
                       lib/projects.ts). Nothing gates this whole Credit
                       block on that, so index 0 genuinely can be undefined;
                       the previous `.reduce()` here had the same latent
                       crash (reduce with no initial value on an empty
                       array). */}
                    {(detail.creditColumns[0] ?? []).map((row, i) => (
                      // Same trim classes as the real, visible columns below
                      // — per direct follow-up ("Credit下マージンが220pxく
                      // らいあるので140pxに"): without them, this sizer's
                      // untrimmed natural leading made it ~80px taller than
                      // the real content across 7 rows, pushing the 140px
                      // gap below out to ~220px. Keyed by index, not
                      // `row.label` — two rows in the same column can share
                      // the same label (e.g. two "Front-end Developer"
                      // credits), which React reported as a duplicate-key
                      // error ("Encountered two children with the same key,
                      // `Front-end Developer`"). leading-[19px] — see the real
                      // columns' own identical class below for why.
                      <p key={i} className="leading-[calc(19px*var(--scale))] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
                        {row.label}: {row.value}
                      </p>
                    ))}
                  </div>
                  {/* Right-hand group — mirrors the real stack below exactly
                     (same 30px between blocks, 8px between rows) so its
                     measured height matches what actually renders. */}
                  <div
                    className="col-start-1 row-start-1 flex flex-col items-start gap-[calc(30px*var(--scale))]"
                    style={{ width: CREDIT_COLUMN_WIDTH }}
                  >
                    {detail.creditColumns.slice(1).map((column, ci) => (
                      <div key={ci} className="flex flex-col items-start gap-[calc(8px*var(--scale))]">
                        {column.map((row, ri) => (
                          <p
                            key={ri}
                            className="leading-[calc(19px*var(--scale))] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
                          >
                            {row.label}: {row.value}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Two absolutely-positioned groups, not one per column: the
                   first credit column sits alone on the left
                   (CREDIT_FIELD_LEFT_PX.creditCol1), and *every* column past
                   it is stacked vertically inside one shared box on the right
                   (creditCol2). Previously each column got its own
                   `absolute top-0` box, so with only 2 columns it looked
                   right by coincidence — but a third column landed at the
                   exact same left/top as the second and simply drew on top of
                   it. Stacking columns 2..n in one flow-laid-out wrapper is
                   what makes 3+ columns (e.g. Satoyama Terrace) read as
                   separate blocks running down the right-hand side.

                   gap-[30px] between blocks vs. gap-[8px] between rows within
                   a block (SP's own equivalent in
                   components/mobile-project-detail.tsx uses 20px/8px; only
                   the row gap is deliberately shared). The 8px row gap *is*
                   the real line spacing here: this 14px text's own trim-both
                   boxes have no natural leading left to widen. */}
                <div
                  className="absolute top-0 flex flex-col items-start gap-[calc(8px*var(--scale))]"
                  style={{
                    left: `calc(${CREDIT_FIELD_LEFT_PX.creditCol1}px * var(--grid-scale))`,
                    width: CREDIT_COLUMN_WIDTH,
                  }}
                >
                  {/* `?? []` — see the sizer's own note above. */}
                  {(detail.creditColumns[0] ?? []).map((row, ri) => (
                    // Keyed by index, not `row.label` — see the invisible
                    // sizer's own comment above for why (duplicate labels,
                    // e.g. two "Front-end Developer" credits, aren't unique).
                    // leading-[19px]: the gap above only covers the
                    // *between*-<p> spacing; the *within*-<p> wrapped-line
                    // spacing (for any value long enough to wrap to 2 lines
                    // inside one <p>) would otherwise default to the
                    // browser/font's own "normal" leading (~21px at 14px) —
                    // text-box-trim only trims a block's outer edges, not
                    // spacing between its own wrapped lines, so it doesn't
                    // touch this.
                    <p key={ri} className="leading-[calc(19px*var(--scale))] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]">
                      <span className={headerDark ? "text-black/50" : "text-white/50"}>{row.label}: </span>
                      {row.value}
                    </p>
                  ))}
                </div>
                {detail.creditColumns.length > 1 && (
                  <div
                    className="absolute top-0 flex flex-col items-start gap-[calc(30px*var(--scale))]"
                    style={{
                      left: `calc(${CREDIT_FIELD_LEFT_PX.creditCol2}px * var(--grid-scale))`,
                      width: CREDIT_COLUMN_WIDTH,
                    }}
                  >
                    {detail.creditColumns.slice(1).map((column, ci) => (
                      <div key={ci} className="flex flex-col items-start gap-[calc(8px*var(--scale))]">
                        {column.map((row, ri) => (
                          <p
                            key={ri}
                            className="leading-[calc(19px*var(--scale))] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
                          >
                            <span className={headerDark ? "text-black/50" : "text-white/50"}>{row.label}: </span>
                            {row.value}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          // No real detail content for this project yet — see this
          // component's own top-level doc comment.
          <p
            className="mt-[calc(80px*var(--scale))] text-[length:calc(14px*var(--scale))] text-white/50 [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"
            style={{ marginLeft: CONTENT_ML }}
          >
            Full case study coming soon.
          </p>
        )}

        {/* Next project + footer — cream background, distinct from this
           project's own body color above (Figma node 1349:388). Two-column,
           matching that node exactly: caption + linked title share one row
           (DetailCaption's own fixed-width column already lines the title up
           at CONTENT_ML, same trick the Overview/Credit rows above use), the
           category/role/date recap sits on its own row directly below,
           indented to that same CONTENT_ML — and a large thumbnail sits to
           the right, not stacked underneath. */}
        {/* pt-24px (not 120px) — per direct follow-up ("イメージの上マージ
           ンが24pxになってない"): the thumbnail's own 24px top margin is
           measured from this cream section's own top edge independently of
           the text column (matching Figma node 1349:373's own top-24, vs.
           the text's own top-120 — two separate offsets, not one shared
           row start) — an earlier version put both in one `items-start` flex
           row and stacked the image's own extra mt-24 *on top of* a shared
           pt-120, landing the image 144px down instead of 24px. The text
           column now carries its own extra mt-96 (120 - 24) to reach the
           same 120px-from-section-top position it had before. */}
        <div className="mt-[calc(140px*var(--scale))] w-full pt-[24px] pb-[28px]" style={{ backgroundColor: CREAM }}>
          {/* Extracted into its own client component (next-project-teaser
             .tsx) — per direct follow-up ("next projectのリンクエリアに
             カーソルが乗ったら下線アニメーションが走るようにして"), hovering
             any of the title/meta/thumbnail links now replays the title's
             underline-sweep; see that component's own doc comment for why a
             plain CSS `group` ancestor can't cleanly do this (its bounding
             box would also cover the "Next Project" caption and the dead gap
             between the text column and the thumbnail) and why that needs
             real event handlers, which this async Server Component can't
             attach directly. */}
          <NextProjectTeaser
            href={`/projects/${slugify(next.title)}`}
            title={next.title}
            category={next.category}
            role={next.role}
            date={next.date}
            image={nextThumb?.image}
            imageSrcSet={nextThumb?.imageSrcSet}
            aspect={nextThumb?.aspect}
          />

          {/* mt — 300 → 360（いずれも直接の指示。"Next Projectエリアとフッター
             のマージンを300pxに" → "実績詳細のフッター上のマージンも360pxに
             して"）。トップ/About のフッター上マージンと同じ値。 */}
          <div className="mt-[calc(360px*var(--scale))]" style={{ marginLeft: CONTENT_ML, width: "var(--content-width-fluid)" }}>
            <SiteFooter theme="dark" />
          </div>
        </div>
      </ProjectDetailReveal>

      {/* SP — Figma node 1353:654 ("sp_projects_detail"), per direct
         follow-up ("SPの詳細ページも実装進めて"). See that component's own
         top-level doc comment for the full design-to-code mapping. */}
      <MobileProjectDetail project={project} next={next} detail={detail} />
    </div>
  );
}
