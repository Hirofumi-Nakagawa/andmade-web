import { getMicrocmsClient, microcmsImageUrl } from "@/lib/microcms";

/** The 4 aspect ratios allowed for the hover-preview background image (see app/page.tsx). */
export type PreviewRatio = "portrait-3-2" | "landscape-3-2" | "portrait-3-4" | "landscape-8-5";

const PREVIEW_RATIO_CYCLE: PreviewRatio[] = [
  "portrait-3-2",
  "landscape-3-2",
  "portrait-3-4",
  "landscape-8-5",
];

/**
 * Width / height for each ratio — shared by the Txt-mode hover preview
 * (app/page.tsx) and the Img-mode thumbnails (project-image-grid.tsx), so
 * both always agree on what "portrait 3:2" etc. actually means.
 */
export const PREVIEW_RATIO_ASPECT: Record<PreviewRatio, number> = {
  "portrait-3-2": 2 / 3,
  "landscape-3-2": 3 / 2,
  "portrait-3-4": 3 / 4,
  "landscape-8-5": 8 / 5,
};

/**
 * Sample image for each ratio (public/images/previews/) — one placeholder
 * image per ratio, shared by every project using that ratio, until
 * microCMS supplies a real per-project image.
 */
export const PREVIEW_RATIO_IMAGE_SRC: Record<PreviewRatio, string> = {
  "portrait-3-2": "/images/previews/portrait-3-2.png",
  "landscape-3-2": "/images/previews/landscape-3-2.png",
  "portrait-3-4": "/images/previews/portrait-3-4.png",
  "landscape-8-5": "/images/previews/landscape-8-5.png",
};

/**
 * One image slot within a ProjectDetail gallery block — `image` is undefined
 * for every block below until the user supplies the real photo (per this
 * codebase's own placeholder-now/real-later convention, e.g.
 * PREVIEW_RATIO_IMAGE_SRC). `aspect` (width / height) is taken directly from
 * the Figma design (fileKey QJyha2u2z0nnA6UgJa0mOm, node 1346:255) so the
 * gray placeholder box already renders at the real, correctly-proportioned
 * size before any photo exists — swapping in `image` later doesn't change
 * the layout at all, just what's visibly inside it.
 */
export type ProjectGalleryImage = { image?: string; aspect: number };

/**
 * A single-image gallery block's own width, per the general (not just
 * Yatsumonji-specific) authoring rule given directly for this gallery
 * system:
 *   - "full" — the browser's own window width, edge to edge, no side margin.
 *   - "content" — this site's standard 24-column content width
 *     (`var(--content-width-fluid)`, the same span every other page's own
 *     header/footer/body already lines up to), no side padding of its own.
 *   - "inset" — a narrower 20-column-wide image (5/6 of "content") centered
 *     in a padded box with 100px top/bottom padding — `backgroundColor`
 *     controls that box's own fill (meant to be CMS-editable per block; see
 *     ProjectDetail's own `backgroundColor` for the page-wide default this
 *     falls back to when a block doesn't set its own).
 *   - "insetSmall" — a second, narrower "inset" variant, 8 grid columns wide
 *     (vs. "inset"'s own 20), primarily meant for the video
 *     block (a small, centered clip rather than a near-content-width one),
 *     though nothing stops an image block from using it too. Same padded/
 *     background-colored box as "inset" (GalleryMediaBlock's own doc
 *     comment), just narrower — see GRID_WIDTH_8 there for the exact px
 *     derivation. Not offered for "twoColumn" (see TwoColumnBlock — two
 *     images inside an 8-column box would be too cramped to be useful), so
 *     selecting it there just falls through to that block's own plain
 *     default layout instead of a dedicated treatment.
 * Real photography is expected to be authored as one already-composited flat
 * image per block — even a
 * multi-screenshot montage is one image file, not several placed side by
 * side by this renderer.
 */
export type ProjectGalleryWidth = "full" | "content" | "inset" | "insetSmall";

/**
 * One entry of ProjectDetail's image gallery (app/projects/[slug]/page.tsx) —
 * a still image, a video (e.g. the block directly under the KV/hero — per
 * explicit spec: "KV下の最初のグレー箇所には動画を入れる"), or an exact
 * two-image row whose widths flex so the gap between them is always 24px
 * ("2カラム（マージンが24pxになるように画像幅可変）"). Not meant to cover
 * every possible future layout — just what this gallery system's own rules
 * define today; extend when a future need calls for something new.
 */
export type ProjectGalleryBlock =
  | ({ type: "image"; width: ProjectGalleryWidth; backgroundColor?: string } & ProjectGalleryImage)
  | {
      type: "video";
      width: ProjectGalleryWidth;
      backgroundColor?: string;
      /** Undefined until a real file is supplied — renders the same gray
       *  placeholder box as a missing `image` above. */
      src?: string;
      poster?: string;
      aspect: number;
    }
  | {
      /** Exactly two images side by side (PC) — `width` follows the same
       *  ProjectGalleryWidth rule as image/video blocks, but only "inset"
       *  changes anything visually: "full"/"content" both keep the original
       *  fixed layout (24 grid columns wide, centered, a plain 24px gap
       *  between the two images, no background box). "inset"
       *  wraps the pair in the same full-bleed
       *  background/vertical-padding box the single-image "inset" variant
       *  uses (see GalleryMediaBlock), and each image narrows to 9 grid
       *  columns wide within its own 12-column half via asymmetric side
       *  padding — see TwoColumnBlock's own doc comment (app/projects/[slug]/
       *  page.tsx) for the exact numbers. SP ignores `width` entirely for
       *  this block type — every PC side-by-side pair always renders
       *  stacked vertically on SP regardless (see MobileGalleryBlockView's
       *  own doc comment), so this option only ever affects PC. */
      type: "twoColumn";
      width: ProjectGalleryWidth;
      images: [ProjectGalleryImage, ProjectGalleryImage];
    }
  // "idea"/"outcome" are two separate union members (not one member typed
  // `type: "idea" | "outcome"`) despite being otherwise identical shapes —
  // deliberately, so `block.type === "idea" || block.type === "outcome"`
  // (used throughout the render loops below) actually narrows `block` away
  // in the `else` branch. TypeScript's discriminated-union narrowing doesn't
  // fully exclude a single member whose own discriminant is itself a 2-value
  // union under that exact OR-of-equality-checks pattern — confirmed via a
  // minimal repro — even though narrowing *into* it works fine either way.
  | {
      /** A "(Idea)" bilingual text block, positioned freely within the
       *  gallery array itself rather than spliced in at a fixed index — per
       *  direct follow-up ("画像も含めて表示位置を自由に変更できるようにし
       *  たい"). `caption` is the literal rendered heading ("(Idea)"), same
       *  layout/spec as Overview's own BilingualSection — see
       *  app/projects/[slug]/page.tsx's own BilingualSection. */
      type: "idea";
      caption: string;
      ja: string[];
      en: string[];
    }
  | {
      /** Same shape as "idea" above, renders as "(Outcome)" instead. */
      type: "outcome";
      caption: string;
      ja: string[];
      en: string[];
    };

/**
 * Rich content for a project's own /projects/[slug] detail page — optional and
 * undefined for almost every placeholder project today, same
 * placeholder-now/CMS-later shape as `description` above. Grouped into its
 * own nested object (rather than flattened onto Project directly) since
 * these fields are meaningfully different from the list-page fields above:
 * they're read by exactly one page (the detail page), most projects don't
 * have them yet. Now backed by real microCMS fields on the *same* "projects"
 * endpoint rather than a separate content type — see buildProjectDetail() and
 * ProjectCmsContent's own doc comment further down for the exact field
 * mapping/dashboard setup.
 */
export type ProjectDetail = {
  /** This project's own page background — each project is expected to pick
   *  its own color,
   *  unlike the rest of the site, which shares one fixed palette per page.
   *  Applied to the whole PC tree (header down through the credit section —
   *  see app/projects/[slug]/page.tsx's own `flow-root` wrapper, needed so this
   *  color reaches all the way up through SiteHeader's own top margin
   *  instead of that margin collapsing through to the page's default
   *  background) and used as the fallback fill for any "inset"-width gallery
   *  block that doesn't set its own `backgroundColor`. */
  backgroundColor: string;
  /** Header/footer text color for this project's own page — "white"
   *  (default, matches every other project so far) or "black", selectable
   *  per project from the CMS dashboard.
   *  Drives PC's SiteHeader/HeaderSummon `dark` prop (dark =
   *  black text) and SP's own plain "ANDMADE Inc." header-logo text color.
   *  SP's MobileMenu pill has its own separate `menuColor` below, since that
   *  element's "color" is a background/pill fill rather than plain text, and
   *  it carries its own additional scroll-based flip behavior near the
   *  footer — see that field's own doc comment. */
  headerColor?: "white" | "black";
  /** SP's MobileMenu pill's own base/text color scheme while this project's
   *  page is scrolled through its main body — "black" (default, matches
   *  every other project/page sitewide: black pill, white text) or "white"
   *  (white pill, black text), set per project.
   *  Automatically flips to the sitewide-default black-pill/white-text
   *  scheme once scrolled into the Next Project/footer zone at the bottom of
   *  the page, regardless of this value — that zone's own cream background
   *  needs the dark pill for contrast. See
   *  components/mobile-project-detail.tsx's own handling. */
  menuColor?: "black" | "white";
  /** Full-bleed masked hero photo directly under the header (Figma node
   *  1346:177/1346:179 for PC, 1353:654's own KV frame for SP) — `pc`/`sp`
   *  are registered separately since PC's crop is inset 24px from both
   *  edges while SP's is a full-bleed 400×500 crop of (usually) the same
   *  source photo — each side can point at its own file/aspect/mask
   *  independently. `mask` is the soft-edge alpha mask Figma applies on top;
   *  omit to render the photo unmasked (a plain rectangle). */
  hero: {
    pc: ProjectGalleryImage & { mask?: string };
    sp: ProjectGalleryImage & { mask?: string };
  };
  /** Japanese overview copy — one paragraph per array entry, rendered in
   *  reading order (Figma node 1346:198). */
  overviewJa: string[];
  /** English overview copy — one paragraph per array entry (Figma node
   *  1346:199), shown side-by-side with overviewJa. */
  overviewEn: string[];
  /** "View Website" link target (Figma nodes 1349:333 / 1349:364) — the
   *  link itself only renders once this is set; omit while the live site
   *  URL isn't available yet. */
  websiteUrl?: string;
  /** This project's own image/video/twoColumn/idea/outcome content, in the
   *  exact order it should render, replacing an earlier design where
   *  "(Idea)"/"(Outcome)" were separate top-level fields spliced in at two
   *  fixed positions (gallery index 0/5) with a dedicated order-swap flag.
   *  Idea/Outcome are now just two more block types in this same array/CMS
   *  repeat field (see ProjectGalleryBlock's own "idea"/"outcome" variants and
   *  buildGalleryFromCms() below) — this codebase's own render loops
   *  (app/projects/[slug]/page.tsx, MobileProjectDetail) simply walk this
   *  array in order with no special-cased index/type logic left at all,
   *  so an editor can freely add, remove, or reorder any block — image,
   *  video, two-column, Idea, or Outcome — directly from the microCMS
   *  dashboard's own drag-and-drop repeat-field UI. */
  gallery: ProjectGalleryBlock[];
  /** Credit block (Figma node 1349:390's "(Credit)" section) — each inner
   *  array is one visual column; each row within it is one "Label: Value"
   *  line (e.g. `{ label: "Producer", value: "Tamami Maekawa (SHIFTBRAIN Inc.)" }`). */
  creditColumns: { label: string; value: string }[][];
};

export type Project = {
  title: string;
  category: string;
  role: string;
  date: string;
  /** Orientation/ratio of this project's real hover-preview image (once
   *  available) — each project has one specific prepared image, not a
   *  random one. Placeholder-cycled below until real images exist. */
  previewRatio: PreviewRatio;
  /** Real per-project thumbnail image URL from microCMS, once uploaded —
   *  undefined for placeholder/not-yet-uploaded projects, in which case
   *  getProjectImageSrc() below falls back to the shared PREVIEW_RATIO_IMAGE_SRC
   *  sample for this project's previewRatio. */
  imageSrc?: string;
  /** This project's own color, used for the Th-mode thumbnail color-wipe
   *  reveal (getProjectColor() below) — read directly from that same
   *  project's `dtlBgColor` microCMS field (its detail page's own background
   *  color, see ProjectDetail.backgroundColor's own doc comment), but
   *  independently of `detail?.backgroundColor` itself: `detail` as a whole
   *  only exists once a project clears the *entire* detail-page bar
   *  (dtlBgColor + both hero images + both overview texts all present
   *  together — see buildProjectDetail()'s own doc comment), so a project
   *  with just a background color typed in but no detail page finished yet
   *  would otherwise fall all the way through to the shared placeholder
   *  cycle instead of using the real color it already has. An earlier pass
   *  introduced a second, separate CMS field for this instead of reusing
   *  dtlBgColor — reverted in favor of just reading the one field that
   *  already exists. */
  color?: string;
  /** Per-project SEO description, meant to be authored/edited in microCMS
   *  and surfaced via that future detail page's own
   *  `generateMetadata({ params }) { ... return { description: project.description ?? DEFAULT_DESCRIPTION } }`
   *  — falling back to the root layout's own site-wide description
   *  (app/layout.tsx) whenever a given project hasn't had one written yet.
   *  Undefined here since the placeholder data below predates the actual
   *  microCMS projects endpoint (see this file's own top-of-array TODO) —
   *  once that's wired up, this becomes a real per-project CMS field
   *  instead of always undefined. */
  description?: string;
  /** This project's own /projects/[slug] detail-page content — see
   *  ProjectDetail's own doc comment. Undefined for every project except
   *  the one reference implementation (Yatsumonji Gakuen 70th) below until
   *  each project gets its own real detail content written. */
  detail?: ProjectDetail;
};

/** Resolves the thumbnail image actually shown for a project — its real
 *  microCMS image if uploaded, otherwise the shared sample for its
 *  previewRatio. Use this everywhere a thumbnail src is needed instead of
 *  reading PREVIEW_RATIO_IMAGE_SRC directly, so every call site automatically
 *  picks up real images as they get uploaded in microCMS. */
export function getProjectImageSrc(project: Project): string {
  return project.imageSrc ?? PREVIEW_RATIO_IMAGE_SRC[project.previewRatio];
}

/** Cycled by index for projects with no real `detail.backgroundColor` of
 *  their own yet — same "placeholder now, real later" convention
 *  PREVIEW_RATIO_IMAGE_SRC above already uses for images, since `detail` is
 *  currently only populated for the one reference project (Yatsumonji
 *  Gakuen 70th; see that constant's own doc comment). Distinct colors rather
 *  than one flat fallback so a grid of these placeholder projects still
 *  reads as "each has its own color" rather than visibly repeating. */
const PLACEHOLDER_PROJECT_COLORS = ["#1a2d8b", "#8b1a3d", "#1a8b5e", "#8b6f1a", "#4a1a8b", "#1a6f8b"];

/** Resolves the color used for a project's own Th-mode thumbnail color-wipe
 *  reveal (project-thumbnail-grid.tsx on PC, mobile-project-thumbnail-grid
 *  .tsx on SP) — that project's own real `color` (sourced directly from its
 *  `dtlBgColor` microCMS field, see Project.color's own doc comment) if set,
 *  else a placeholder cycled by its position in the list (see
 *  PLACEHOLDER_PROJECT_COLORS above), mirroring getProjectImageSrc's own
 *  "real data if present, otherwise a shared placeholder" fallback. */
export function getProjectColor(project: Project, index: number): string {
  return project.color || PLACEHOLDER_PROJECT_COLORS[index % PLACEHOLDER_PROJECT_COLORS.length];
}

/** Slugifies a project title for use in /projects/[slug] links (ASCII-only, punctuation stripped). */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** microCMS image-field response shape — a single uploaded asset. */
type MicrocmsImage = { url: string; width: number; height: number };

/** Resolves a microCMS select field's raw value into one of `allowed`,
 *  falling back to `fallback` when missing, mistyped, or an empty array —
 *  generalizes lib/studies.ts's own `resolveOrientation()`, which exists
 *  because a real production bug there showed microCMS can return a
 *  single-select field's value as `["value"]` (an array) rather than a
 *  plain string, even when the field itself is configured single-select —
 *  see that function's own doc comment for the full story. Used here for
 *  every select field on this project's detail content (headerColor,
 *  menuColor, and each gallery repeat-item's own Width), and also for the
 *  list-level previewRatio field below — an earlier version had a separate,
 *  narrower `isPreviewRatio()` type-guard that skipped this array-unwrap,
 *  which silently ignored a real project's previewRatio selection whenever
 *  microCMS happened to return it as `["landscape-8-5"]` instead of
 *  `"landscape-8-5"`, falling through to the index-cycled default instead —
 *  reported as an uploaded 8:5 image rendering portrait-cropped, since the
 *  cycled fallback landed on a portrait ratio for that entry.
 *
 *  Matching is case-insensitive and trims whitespace: the microCMS option
 *  had been typed
 *  as "Black" (capitalized, as a select option naturally reads in the
 *  dashboard UI) against this function's earlier exact-match check against
 *  lowercase "black", silently falling back to the default every time. Still
 *  returns the exact casing from `allowed` (not the CMS's own raw casing),
 *  so callers/types downstream are unaffected. */
function resolveSelect<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
  fallback: T
): T {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate == null) return fallback;
  const normalized = candidate.trim().toLowerCase();
  return allowed.find((option) => option.toLowerCase() === normalized) ?? fallback;
}

function asMicrocmsImage(value: unknown): MicrocmsImage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { url, width, height } = value as Record<string, unknown>;
  return typeof url === "string" && typeof width === "number" && typeof height === "number"
    ? { url, width, height }
    : undefined;
}

/** Splits a microCMS textarea field into paragraphs — one or more blank
 *  lines separate paragraphs (matching how anyone would naturally type
 *  multiple paragraphs into a plain textarea), each trimmed, empty ones
 *  dropped. Used for dtlOverviewJa/En below, and for the `galleryIdea`/
 *  `galleryOutcome` custom fields' own `ja`/`en` sub-fields (see
 *  buildGalleryFromCms()) — mirrors ProjectDetail.overviewJa's own "one
 *  paragraph per array entry" shape without needing a real repeater field. */
function splitParagraphs(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

/** Parses dtlCredit's own plain-text convention into
 *  ProjectDetail.creditColumns's real shape: blank line(s) separate
 *  columns, each remaining line within a column reads "Label: Value" (only
 *  the *first* colon splits label from value, so a value containing its own
 *  colon — e.g. a time or URL — still parses correctly). A line with no
 *  colon at all becomes a label with an empty value rather than being
 *  dropped, so a typo here is visibly wrong on the page instead of silently
 *  vanishing. Kept as a plain delimited textarea rather than a real microCMS
 *  repeat field (unlike dtlGallery below, which switched to one — see that
 *  field's own doc comment for why) since credit rows are plain label/value
 *  text with no images involved — a delimited textarea works
 *  here with zero loss of editing power, unlike the gallery. */
function parseCreditColumns(text: string | undefined): { label: string; value: string }[][] {
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map((columnText) =>
      columnText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const colonIndex = line.indexOf(":");
          return colonIndex === -1
            ? { label: line, value: "" }
            : { label: line.slice(0, colonIndex).trim(), value: line.slice(colonIndex + 1).trim() };
        })
    )
    .filter((column) => column.length > 0);
}

const GALLERY_WIDTHS = ["full", "content", "inset", "insetSmall"] as const;

/** One item of `dtlGallery` — microCMS's own repeat-field response shape:
 *  every item carries whichever custom field's own sub-fields were filled
 *  in for it, plus a `fieldId` saying *which* custom field it is (see
 *  microCMS's own repeat-field docs, "APIのレスポンス" section) — here,
 *  one of the 5 custom fields documented on ProjectCmsContent's own
 *  `dtlGallery` doc comment below (`galleryImage`/`galleryVideo`/
 *  `galleryTwoCol`/`galleryIdea`/`galleryOutcome` — the latter two added per
 *  direct follow-up "画像も含めて表示位置を自由に変更できるようにしたい",
 *  folding "(Idea)"/"(Outcome)" into this same repeat field instead of being
 *  separate fixed-position fields, so an editor can freely position them
 *  anywhere in the list). All 5 custom fields' own possible sub-fields are
 *  just unioned together as optional properties here, rather than a real
 *  discriminated union keyed on `fieldId` — simpler for what's really just
 *  a handful of defensive reads below (buildGalleryFromCms), not a large
 *  surface that would benefit from the type-checker narrowing on its own. */
type GalleryRepeatItem = {
  fieldId?: string;
  width?: string | string[];
  image?: MicrocmsImage;
  image1?: MicrocmsImage;
  image2?: MicrocmsImage;
  video?: string;
  poster?: MicrocmsImage;
  /** `galleryIdea`/`galleryOutcome` custom fields' own textarea sub-fields —
   *  see buildGalleryFromCms()'s own handling of those two fieldIds. */
  ja?: string;
  en?: string;
};

/** Builds ProjectDetail.gallery from `dtlGallery`, a real microCMS repeat
 *  field, replacing the earlier "12 numbered
 *  flat slots × ~5 fields each" scheme (~60 fields total, all created up
 *  front whether used or not) with a single repeat field the author adds
 *  to/reorders/removes from freely, one block at a time, choosing its type
 *  each time — see ProjectCmsContent's own `dtlGallery` doc comment for the
 *  exact 3-custom-field dashboard setup this expects. (The numbered-slot
 *  scheme existed in the first place only because microCMS's File field —
 *  tried for `dtlGal{N}Video` — needs a paid plan; custom/repeat fields
 *  turned out to have no such plan restriction, so there was never a real
 *  reason not to use them for the whole gallery.)
 *
 *  Every item is read defensively and simply skipped (not an error) if its
 *  own required upload is missing — e.g. a "galleryTwoCol" item with only
 *  one of its two images filled in. `aspect` is always derived from the
 *  uploaded image's own real width/height, same as before (no separate
 *  manual aspect field). Every "inset"-width block now shares this
 *  project's own `dtlBgColor` as its background automatically (see
 *  GalleryBlockView's own `defaultBackground` fallback in
 *  app/projects/[slug]/page.tsx) rather than setting its own — per the
 *  same follow-up, dropping the extra shared `dtlGal1BgColor` field this
 *  replaces entirely; a per-project background was already the single
 *  color every inset block was really going to share anyway. */
function buildGalleryFromCms(items: GalleryRepeatItem[] | undefined): ProjectGalleryBlock[] {
  if (!Array.isArray(items)) return [];
  const blocks: ProjectGalleryBlock[] = [];

  for (const item of items) {
    if (item.fieldId === "galleryIdea" || item.fieldId === "galleryOutcome") {
      // Both Ja and En required together — a one-sided pair reads as broken
      // rather than simply "not written yet" (same rule the old dedicated
      // idea/outcome fields used).
      const ja = splitParagraphs(item.ja);
      const en = splitParagraphs(item.en);
      if (ja.length === 0 || en.length === 0) continue;
      blocks.push({
        type: item.fieldId === "galleryIdea" ? "idea" : "outcome",
        caption: item.fieldId === "galleryIdea" ? "(Idea)" : "(Outcome)",
        ja,
        en,
      });
      continue;
    }

    const width = resolveSelect(item.width, GALLERY_WIDTHS, "content");

    if (item.fieldId === "galleryTwoCol") {
      const image1 = asMicrocmsImage(item.image1);
      const image2 = asMicrocmsImage(item.image2);
      if (!image1 || !image2) continue; // needs both images to render meaningfully
      blocks.push({
        type: "twoColumn",
        width,
        images: [
          { image: microcmsImageUrl(image1.url), aspect: image1.width / image1.height },
          { image: microcmsImageUrl(image2.url), aspect: image2.width / image2.height },
        ],
      });
      continue;
    }

    if (item.fieldId === "galleryVideo") {
      // Plain text field (a direct URL to an externally-hosted video file),
      // not microCMS's own File field: microCMS's File field type requires a
      // paid plan (unavailable on Hobby), so this instead expects a plain URL
      // typed/pasted in rather than a real upload through microCMS itself.
      // Cloudinary is the recommended host, since the number of videos grows
      // with every new project: upload the video there and paste its
      // delivery URL here. (An earlier version of
      // this comment suggested this project's own public/ folder instead,
      // fine for a one-off video but not once the count keeps growing.)
      const videoUrl = typeof item.video === "string" && item.video.trim() ? item.video.trim() : undefined;
      const poster = asMicrocmsImage(item.poster);
      if (!videoUrl && !poster) continue; // nothing set for this item at all
      blocks.push({
        type: "video",
        width,
        src: videoUrl,
        poster: poster ? microcmsImageUrl(poster.url) : undefined,
        // 16:9 fallback — a plain URL text field carries no width/height
        // metadata of its own, unlike an image field, so a poster-less video
        // item has no real source to derive an aspect ratio from.
        aspect: poster ? poster.width / poster.height : 16 / 9,
      });
      continue;
    }

    if (item.fieldId === "galleryImage") {
      const image = asMicrocmsImage(item.image);
      if (!image) continue;
      blocks.push({
        type: "image",
        width,
        image: microcmsImageUrl(image.url),
        aspect: image.width / image.height,
      });
    }
  }

  return blocks;
}

type ProjectCmsContent = {
  title: string;
  category: string;
  role: string;
  /** Free text, exactly as typed in microCMS — matches the site's own
   *  existing "Mon.YYYY" display format (e.g. "May.2026") verbatim, not a
   *  system publishedAt field: unlike lib/news.ts's own date (which doubles
   *  as both display text *and* the sort key), a project's own date is a
   *  distinct real-world concept (when the work happened) from when its
   *  entry happened to be published/edited in the CMS, and the placeholder
   *  list's own order is deliberately curated, not strictly chronological —
   *  so there's no shared value here that could double as both without
   *  fighting one or the other. */
  date: string;
  /** Select field (single-select), one of PREVIEW_RATIO_CYCLE's 4 option
   *  labels — optional, since existing entries predate this field; falls
   *  back to the index-cycled default when missing or mistyped. */
  previewRatio?: string | string[];
  /** Image field (single image) — optional, since existing entries predate
   *  this field; falls back to the shared PREVIEW_RATIO_IMAGE_SRC sample for
   *  this project's previewRatio when not uploaded yet. */
  image?: { url: string; height: number; width: number };

  // ---- /projects/[slug] detail-page fields — all optional; see
  // buildProjectDetail() below for exactly which ones are required together
  // before a project gets a real `detail` at all. ----
  /** Text field (a hex color, e.g. "#1a2d8b") — see ProjectDetail
   *  .backgroundColor's own doc comment. Required (together with the hero
   *  images and Overview text) for this project to get a real detail page
   *  at all. Also read independently at the list level for Project.color
   *  (see that field's own doc comment) — this same field doubles as both
   *  the detail page's own background *and* the Th-mode thumbnail
   *  color-wipe's color, so setting it once covers both, even before the
   *  rest of that project's detail page is finished. */
  dtlBgColor?: string;
  /** Select field, "white" or "black" — see ProjectDetail.headerColor's own
   *  doc comment. Optional; defaults to "white". */
  dtlHeaderColor?: string | string[];
  /** Select field, "black" or "white" — see ProjectDetail.menuColor's own
   *  doc comment. Optional; defaults to "black". */
  dtlMenuColor?: string | string[];
  /** Image fields — PC/SP each register their own KV photo independently
   *  (see ProjectDetail.hero's own doc comment); Mask is optional on each
   *  (a soft-edge alpha mask, leave unset for a plain unmasked rectangle).
   *  `aspect` is always derived from the uploaded image's own real
   *  width/height — no separate manual aspect field. */
  dtlHeroPcImg?: MicrocmsImage;
  dtlHeroPcMask?: MicrocmsImage;
  dtlHeroSpImg?: MicrocmsImage;
  dtlHeroSpMask?: MicrocmsImage;
  /** Text field (a URL) — optional; the "View Website" link disappears
   *  entirely when unset (see MetaField's own doc comment in
   *  app/projects/[slug]/page.tsx). */
  dtlWebsiteUrl?: string;
  /** Textarea fields — one or more blank lines separate paragraphs (see
   *  splitParagraphs() above). Required together with dtlBgColor/hero images
   *  for this project to get a real detail page. Idea/Outcome used to be a
   *  separate pair of textarea fields here too (`dtlIdeaJa`/`dtlIdeaEn`/
   *  `dtlOutcomeJa`/`dtlOutcomeEn`, plus a `dtlIdeaOutOrder` order-swap
   *  field) — removed, folded into the `dtlGallery` repeat field below
   *  instead (`galleryIdea`/`galleryOutcome` custom fields) so they can be
   *  freely positioned anywhere among the gallery blocks, not just at two
   *  fixed splice points. */
  dtlOverviewJa?: string;
  dtlOverviewEn?: string;
  /** Textarea field — see parseCreditColumns()'s own doc comment for the
   *  exact "blank line separates columns, 'Label: Value' per line"
   *  convention. Optional; an empty/unset value just means no Credit
   *  section (an empty creditColumns array). */
  dtlCredit?: string;

  /** A real microCMS repeat field (field ID `dtlGallery`, type "繰り返し")
   *  replacing an earlier "12 numbered
   *  flat slots" scheme that required creating ~60 fields up front whether
   *  used or not. See buildGalleryFromCms()'s own doc comment for the full
   *  story on why (custom/repeat fields turned out to have no plan
   *  restriction, unlike the File field this codebase originally reached
   *  for). Dashboard setup, one-time only:
   *
   *  1. Create 5 custom fields ("カスタム" field type) first:
   *     - `galleryImage` — a single still image. Sub-fields: `width`
   *       (select: "full" / "content" / "inset" / "insetSmall" — see
   *       ProjectGalleryWidth's own doc comment for what each does),
   *       `image` (image).
   *     - `galleryVideo` — a video. Sub-fields: `width` (select, same 4
   *       options — "insetSmall" was added specifically with this block in
   *       mind, a small centered clip rather than a near-content-width one),
   *       `video` (text — a direct URL to a video file hosted outside
   *       microCMS; not microCMS's own File field, which requires a paid
   *       plan, unavailable on Hobby), `poster` (image, optional — a thumbnail/
   *       poster frame; falls back to a plain 16:9 box if unset, since a URL
   *       alone carries no width/height to size the box with).
   *     - `galleryTwoCol` — a side-by-side (PC)/stacked (SP) image pair.
   *       Sub-fields: `width` (select, same 4 options — only "inset" changes
   *       anything visually; "insetSmall" isn't given a dedicated treatment
   *       here and falls through to the plain default layout instead, see
   *       ProjectGalleryWidth's own doc comment; SP ignores this field
   *       entirely regardless, see ProjectGalleryBlock's own "twoColumn" doc
   *       comment), `image1` (image), `image2` (image).
   *     - `galleryIdea` — a "(Idea)" bilingual text block. Sub-fields: `ja`
   *       (textarea), `en` (textarea). No `width` — always renders at the
   *       same fixed width as Overview's own BilingualSection.
   *     - `galleryOutcome` — same shape as `galleryIdea` (`ja`/`en`
   *       textareas), renders as "(Outcome)" instead. Added alongside
   *       `galleryIdea` — previously these were two separate
   *       dedicated textarea fields (`dtlIdeaJa`/`dtlIdeaEn`/`dtlOutcomeJa`/
   *       `dtlOutcomeEn`) spliced in at two fixed gallery positions; now
   *       they're just two more block types in this same repeat field, so an
   *       editor can place either of them anywhere in the list, or use both,
   *       or neither.
   *  2. Create one repeat field, field ID `dtlGallery`, referencing all 5
   *     custom fields above. No min/max needed (leave unlimited) unless you
   *     want to cap it.
   *
   *  Day to day, adding a gallery block is then just "＋フィールドを追加"
   *  on `dtlGallery`, picking which of the 5 block types it is, filling in
   *  just that one's own sub-fields, and reordering via drag handle — this
   *  same order is exactly the order everything renders on the page in, no
   *  more picking a specific numbered slot or leaving unused ones behind.
   *  "inset"-width blocks no longer have their own per-block background
   *  color field at all (see buildGalleryFromCms()'s own doc comment for
   *  why — they now always share this project's own `dtlBgColor`). */
  dtlGallery?: GalleryRepeatItem[];
};

/** microCMS list API request cap — comfortably above the current 33-project
 *  placeholder list, so every real project comes back in a single request
 *  (microCMS's own default `limit` is only 10 per request, which would
 *  otherwise silently truncate the list). Revisit if the real project count
 *  ever approaches this. */
const PROJECTS_FETCH_LIMIT = 100;

/**
 * Builds a project's real ProjectDetail from its own CMS content, or
 * `undefined` if it isn't configured yet, extending the same "projects"
 * endpoint's own
 * content (rather than a separate content type) with the detail-page fields
 * documented on ProjectCmsContent above.
 *
 * The bar for "this project has a real detail page at all": dtlBgColor,
 * dtlHeroPcImg, dtlHeroSpImg, dtlOverviewJa, and dtlOverviewEn must *all*
 * be present — matching every one of
 * ProjectDetail's own non-optional fields. Missing any of those means this
 * returns `undefined`, same as every placeholder project without a `detail`
 * today (app/projects/[slug]/page.tsx's own "Full case study coming soon."
 * fallback), rather than rendering a half-built detail page with holes in
 * it. Every other field (headerColor/menuColor/websiteUrl/gallery/
 * creditColumns) is independently optional/defaults sensibly once that bar
 * is met.
 */
function buildProjectDetail(content: ProjectCmsContent): ProjectDetail | undefined {
  const backgroundColor = content.dtlBgColor?.trim();
  const heroPc = asMicrocmsImage(content.dtlHeroPcImg);
  const heroSp = asMicrocmsImage(content.dtlHeroSpImg);
  const overviewJa = splitParagraphs(content.dtlOverviewJa);
  const overviewEn = splitParagraphs(content.dtlOverviewEn);

  if (!backgroundColor || !heroPc || !heroSp || overviewJa.length === 0 || overviewEn.length === 0) {
    return undefined;
  }

  const heroPcMask = asMicrocmsImage(content.dtlHeroPcMask);
  const heroSpMask = asMicrocmsImage(content.dtlHeroSpMask);

  return {
    backgroundColor,
    headerColor: resolveSelect(content.dtlHeaderColor, ["white", "black"] as const, "white"),
    menuColor: resolveSelect(content.dtlMenuColor, ["black", "white"] as const, "black"),
    hero: {
      pc: {
        image: microcmsImageUrl(heroPc.url),
        aspect: heroPc.width / heroPc.height,
        mask: heroPcMask ? microcmsImageUrl(heroPcMask.url) : undefined,
      },
      sp: {
        image: microcmsImageUrl(heroSp.url),
        aspect: heroSp.width / heroSp.height,
        mask: heroSpMask ? microcmsImageUrl(heroSpMask.url) : undefined,
      },
    },
    overviewJa,
    overviewEn,
    websiteUrl: content.dtlWebsiteUrl?.trim() || undefined,
    // Idea/Outcome are now just two more block types within this same
    // array — see buildGalleryFromCms()'s own "galleryIdea"/"galleryOutcome"
    // handling.
    gallery: buildGalleryFromCms(content.dtlGallery),
    creditColumns: parseCreditColumns(content.dtlCredit),
  };
}

/**
 * Real project list. Editable from the microCMS admin dashboard (a "projects"
 * endpoint — list API, one content = one project). `description` stays
 * undefined for every entry regardless of source — out of scope for this
 * pass, not yet a real CMS field.
 *
 * Falls back to an empty array (never fabricated placeholder data) whenever
 * the CMS client isn't configured, the endpoint is genuinely empty, or the
 * fetch fails — a real project list previously had a hand-authored dummy
 * fallback here, but that could show a different order/lineup than what's
 * actually registered in the CMS, which read as broken/inconsistent once
 * real content existed. Now the page just shows nothing rather than
 * something wrong. See app/page.tsx / components/home-view.tsx for how the
 * result is used.
 *
 * Expected microCMS "projects" endpoint shape (list API) — set this up in
 * the microCMS admin dashboard:
 *   - `title` (text field, required)
 *   - `category` (text field, required) — e.g. "Identity, Corporate site, VI"
 *   - `role` (text field, required) — e.g. "Art Direction, Design"
 *   - `date` (text field, required) — typed exactly as it should display,
 *     e.g. "May.2026" (see ProjectCmsContent's own `date` doc comment for why
 *     this is a plain typed field, not microCMS's own publishedAt).
 *   - `previewRatio` (select field, single-select, optional) — exactly 4
 *     options: "portrait-3-2", "landscape-3-2", "portrait-3-4",
 *     "landscape-8-5" (matching is case-insensitive — see resolveSelect's
 *     own doc comment — but spelling/hyphens still need to match). Controls
 *     the thumbnail's aspect ratio. Leave unset to keep the automatic
 *     index-cycled default.
 *   - `image` (image field, optional) — the real thumbnail shown in Th/Img
 *     view and the hover preview; should match its own previewRatio's
 *     aspect (e.g. a "portrait-3-2" image should be cropped/uploaded at a
 *     2:3 ratio) since it's displayed with object-fit: cover at that ratio.
 *     Leave unset to keep showing the shared sample image for that ratio.
 *     Served through microcmsImageUrl() (lib/microcms.ts) below, which
 *     converts it to WebP and caps its resolution on the fly — the original
 *     upload in the microCMS dashboard can stay whatever format/size it was.
 *   - Everything else (`dtl*`) is this project's own /projects/[slug]
 *     detail-page content — every one of those fields is documented directly
 *     on ProjectCmsContent's own doc comment above, field by field, since
 *     there are enough of them (including the dtlGallery repeat field's own
 *     custom-field setup) that duplicating that list here would just go
 *     stale. See
 *     buildProjectDetail()'s own doc comment for exactly which of them are
 *     required together before a project gets a real detail page at all.
 *
 * List order follows microCMS's own default (createdAt, newest first) — no
 * `orders` query override yet; manual drag-order control would need an
 * extra numeric "order" field.
 */
export async function getProjects(): Promise<Project[]> {
  const client = getMicrocmsClient();
  if (!client) return [];

  try {
    const response = await client.getList<ProjectCmsContent>({
      endpoint: "projects",
      queries: { limit: PROJECTS_FETCH_LIMIT },
    });

    return response.contents.map((content, index) => ({
      title: content.title,
      category: content.category,
      role: content.role,
      date: content.date,
      previewRatio: resolveSelect(
        content.previewRatio,
        PREVIEW_RATIO_CYCLE,
        PREVIEW_RATIO_CYCLE[index % PREVIEW_RATIO_CYCLE.length]
      ),
      imageSrc: content.image ? microcmsImageUrl(content.image.url) : undefined,
      color: content.dtlBgColor?.trim() || undefined,
      detail: buildProjectDetail(content),
    }));
  } catch {
    // Covers both "the 'projects' endpoint doesn't exist yet" (a 404 from
    // microCMS) and any genuine network/auth failure alike — either way,
    // fail to an empty list rather than fabricated placeholder content.
    return [];
  }
}

/** One project plus its neighbors in the list, as needed by
 *  app/projects/[slug]/page.tsx — `next` is the project immediately after it
 *  (wrapping around to the first project after the last one), used for that
 *  page's own "Next Project" teaser (Figma node 1349:376/1349:377). */
export type ProjectWithNext = { project: Project; next: Project };

/** Resolves a /projects/[slug] route param to its Project — undefined if no
 *  project's slugify(title) matches, in which case the calling page should
 *  render notFound(). Re-slugifies every project on each call rather than
 *  keeping a lookup table, matching the size of this list (currently a few
 *  dozen entries) — revisit if this ever needs to scale further. */
export async function getProjectBySlug(slug: string): Promise<ProjectWithNext | undefined> {
  const projects = await getProjects();
  const index = projects.findIndex((project) => slugify(project.title) === slug);
  if (index === -1) return undefined;
  return { project: projects[index], next: projects[(index + 1) % projects.length] };
}
