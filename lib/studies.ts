import { getMicrocmsClient, microcmsImageUrl } from "@/lib/microcms";
import { slugify } from "@/lib/projects";

/** Aspect-ratio category for a study's center-image media: the large center
 *  display isn't always the original fixed portrait box — some studies' own
 *  media is landscape or square instead. This only ever affects the *center*
 *  display's own shape (see studies-gallery.tsx, which sizes that box off
 *  `ORIENTATION_ASPECT_RATIO[study.orientation]`) — the left thumbnail rail
 *  always crops to its own fixed 82x110 box regardless of this value (see
 *  studies-thumbnail-rail.tsx's own doc comment on why that requires no code
 *  change at all).
 *
 *  `"wide"` covers 8:5 (1.6) footage, which sits meaningfully off both
 *  `"landscape"`'s own 4:3-ish ratio (≈1.333) and `"square"`'s 1:1 —
 *  `object-cover` would still *render* an 8:5 video fine inside the existing
 *  "landscape" box, just cropping noticeably more off its left/right edges
 *  than a dedicated ratio would. */
export type StudyOrientation = "portrait" | "landscape" | "square" | "wide";

/** width/height at the site's own 1440px Figma reference, one entry per
 *  orientation. "portrait" is exactly the original fixed 348x464 box
 *  (348/464); "landscape" is that same box transposed (464/348); "square"
 *  is 1:1; "wide" is 8:5 (1.6), for the wider-than-"landscape" video ratio
 *  above. Real photos rarely land on one of these ratios exactly (e.g.
 *  study01.jpg's own real 738x928 is 0.795, not exactly portrait's 0.75) —
 *  that's fine, since every display always renders its image via
 *  `object-cover` inside a box sized off *this* fixed ratio, cropping
 *  whatever the source photo's own real ratio happens to be to fit. */
export const ORIENTATION_ASPECT_RATIO: Record<StudyOrientation, number> = {
  portrait: 348 / 464,
  landscape: 464 / 348,
  square: 1,
  wide: 8 / 5,
};

/** Whether a study's center media is a still image or a video: a study is
 *  `"video"` whenever its CMS entry has the `video` field set (see
 *  `StudyCmsContent.video`/`getStudies()` below), `"image"` otherwise.
 *  Only the large center display (studies-center-image.tsx) branches on
 *  this — the thumbnail rail (studies-thumbnail-rail.tsx/mobile-studies-
 *  thumbnail-rail.tsx) always shows `imageSrc` regardless of `mediaType`,
 *  deliberately keeping that rail a lightweight static preview even for
 *  video studies (so a video study's CMS entry should still have its
 *  `image` field set too, as a poster/thumbnail — see `imageSrc`'s own doc
 *  comment). */
export type StudyMediaType = "image" | "video";

export type Study = {
  /** Figma's own copy here is just a placeholder ("XxxxxxXxxxx", node
   *  934:312). This field will eventually hold a real name tied to each
   *  individual study once a Studies microCMS endpoint exists (none does
   *  yet), so each entry below gets its own distinct placeholder string
   *  instead of repeating the same filler text. */
  title: string;
  /** The large "Study NN" index label shown alongside `title` in both
   *  studies-gallery.tsx (PC) and mobile-studies.tsx (SP) — an optional
   *  per-study override rather than always the auto-generated
   *  `Study ${index+1}`
   *  string. `undefined` (the common case — most studies have no reason to
   *  deviate from the plain running count) falls back to that same
   *  auto-generated label, computed from the study's own position in the
   *  resolved array exactly as before. Set this to override it with
   *  specific copy for one particular study (e.g. a real project code name)
   *  instead of just its sequence number. */
  label?: string;
  /** Fallback background color, shown behind `imageSrc` while it loads (or
   *  if it fails) — alternates #c4c4c4 / #d9d9d9 per Figma's own original
   *  placeholder rectangles, from back when there was no real photography at
   *  all and this was the *only* visual per study. Still used that way (see
   *  studies-center-image.tsx/studies-thumbnail-rail.tsx), just no longer the
   *  primary visual now that `imageSrc` below holds real images. */
  color: string;
  /** ASCII slug for a future per-study detail page (`/studies/[slug]`),
   *  derived the same way lib/projects.ts's own `/projects/[slug]` links are —
   *  reusing that exact same `slugify` helper rather than a second copy, so
   *  both content types stay consistent if either's slugging rules ever
   *  change. Not linked to anywhere yet (no detail page exists for Studies
   *  today), but already computed here so it's ready the moment one does. */
  slug: string;
  mediaType: StudyMediaType;
  orientation: StudyOrientation;
  /** Public path to this study's actual placeholder photo (public/images/
   *  studies/) — real photography, unlike the filler used for every other
   *  field on this type. Always
   *  rendered via `object-cover` inside each display's own fixed-aspect-ratio
   *  box (see studies-center-image.tsx/studies-thumbnail-rail.tsx), so a
   *  photo's own exact pixel ratio never needs to match `orientation`'s own
   *  fixed category precisely — it just gets cropped to fit, the same as any
   *  ordinary "cover" image treatment. Used for the thumbnail rail
   *  unconditionally (even for `mediaType: "video"` studies — see
   *  `StudyMediaType`'s own doc comment), and for the large center display
   *  too whenever `mediaType` is `"image"`. */
  imageSrc: string;
  /** The real video file's URL — only set when `mediaType` is `"video"`
   *  (undefined for plain image studies). An externally-hosted URL
   *  (Cloudinary recommended, matching lib/projects.ts's own
   *  `ProjectGalleryBlock`'s video `src`), not a microCMS-hosted file. Only
   *  the large center display (studies-center-image.tsx) ever reads this;
   *  the thumbnail rail always uses `imageSrc` regardless. */
  videoSrc?: string;
};

/** One distinct placeholder title per study (index order == display order,
 *  01 through 10) — filler, not real content.
 *
 * CMS readiness note: the studies array (whichever source it comes from — this
 * placeholder or getStudies()'s own real CMS fetch below) is the single
 * source of truth for both the rail/center-image content *and* the
 * "01 - 10" counter — that counter (studies-gallery.tsx) reads the array's
 * own `.length` directly, never a hardcoded 10, so the real microCMS
 * "studies" endpoint's own entry count already drives that "10" with no
 * further code changes needed anywhere else. Every consumer
 * (studies-gallery.tsx, studies-thumbnail-rail.tsx, etc.) receives the
 * resolved array as a `studies` prop (see app/studies/page.tsx) rather than
 * importing a module constant directly, since it's now fetched.
 */
const PLACEHOLDER_TITLES = [
  "Study 01",
  "Study 02",
  "Study 03",
  "Study 04",
  "Study 05",
  "Study 06",
  "Study 07",
  "Study 08",
  "Study 09",
  "Study 10",
];

const PLACEHOLDER_COLORS = ["#c4c4c4", "#d9d9d9"];

/** Each study's real `orientation`, measured directly from its own actual
 *  image file (public/images/studies/study01.jpg..study10.jpg — real
 *  dimensions checked, not guessed): studies 1-7 and 9 are portrait
 *  (960x1280 or close to it, ~0.75-0.8 width/height), 8 and 10 are landscape
 *  (1280x960, 1.33 width/height). No square photo happened to be among
 *  these 10 — `"square"` remains a fully supported category (see
 *  ORIENTATION_ASPECT_RATIO above), simply unused by this particular batch. */
const PLACEHOLDER_ORIENTATIONS: StudyOrientation[] = [
  "portrait", // study01.jpg — 738x928
  "portrait", // study02.jpg — 960x1280
  "portrait", // study03.jpg — 960x1280
  "portrait", // study04.jpg — 960x1280
  "portrait", // study05.jpg — 960x1280
  "portrait", // study06.jpg — 960x1280
  "portrait", // study07.jpg — 960x1280
  "landscape", // study08.jpg — 1280x960
  "portrait", // study09.jpg — 960x1280
  "landscape", // study10.jpg — 1280x960
];

/**
 * Placeholder content for the Studies page (Figma node 934:312), matching
 * that design's own "01/10" counter — 10 entries, sourced the same way as
 * lib/projects.ts's own placeholder array (title/color/slug/orientation are
 * still filler; `imageSrc` below points at real photos in
 * public/images/studies/, not a real CMS fetch).
 * Shown only until a real microCMS "studies" endpoint exists/has content —
 * getStudies() below falls back to this same array whenever the real
 * endpoint is unconfigured, missing, empty, or errors, since the gallery is
 * this page's only content, not optional/decorative. (lib/projects.ts's own
 * getProjects() used to follow this same never-empty-fallback convention via
 * a PLACEHOLDER_PROJECTS array, but that was removed once real CMS content
 * existed there — see that function's own doc comment for why; this page's
 * own placeholder hasn't been revisited the same way yet.)
 */
export const PLACEHOLDER_STUDIES: Study[] = Array.from({ length: 10 }, (_, i) => ({
  title: PLACEHOLDER_TITLES[i],
  color: PLACEHOLDER_COLORS[i % PLACEHOLDER_COLORS.length],
  slug: slugify(PLACEHOLDER_TITLES[i]),
  orientation: PLACEHOLDER_ORIENTATIONS[i],
  mediaType: "image",
  imageSrc: `/images/studies/study${String(i + 1).padStart(2, "0")}.jpg`,
}));

/** Mathematical modulo (unlike `%`, never returns a negative result) — used
 *  everywhere a cumulative, ever-growing/shrinking step counter needs
 *  mapping back onto a studies array's own fixed size, looping (see
 *  studies-gallery.tsx / studies-thumbnail-rail.tsx). */
export function mod(n: number, m: number) {
  return ((n % m) + m) % m;
}

const STUDY_ORIENTATIONS = new Set<string>(["portrait", "landscape", "square", "wide"]);

function isStudyOrientation(value: unknown): value is StudyOrientation {
  return typeof value === "string" && STUDY_ORIENTATIONS.has(value);
}

/** Resolves a CMS `orientation` field's raw value (`string | string[] |
 *  undefined` — see `StudyCmsContent.orientation`'s own doc comment for why
 *  it can be an array) into a real `StudyOrientation`, falling back to
 *  "portrait" if it's missing, mistyped, or an empty array. */
function resolveOrientation(value: string | string[] | undefined): StudyOrientation {
  const candidate = Array.isArray(value) ? value[0] : value;
  return isStudyOrientation(candidate) ? candidate : "portrait";
}

/** Field-ID/purpose mapping is the plain, unswapped one — `title` is the
 *  real title text, `label` is the optional "Study NN" override. This
 *  briefly read the *opposite* way, from back when the CMS schema's only
 *  text field was field ID `label` displaying as "タイトル", with no
 *  separate `title` field at all — reverted back to normal once the
 *  schema itself was corrected: a real, required `title` field now exists,
 *  and `label` (optional, display name "連番ラベル") went back to meaning
 *  the override.
 *
 *  This mismatch (code expecting one field to hold the real title while the
 *  actual CMS schema had since moved that data to the *other* field) is what
 *  caused a real bug, not just a cosmetic one: `slugify(content.label)`
 *  threw once `label` stopped reliably holding a value (it's optional in the
 *  schema, unlike `title`), which silently crashed this whole function's
 *  `try` block and fell back to PLACEHOLDER_STUDIES for *every* study,
 *  regardless of any CMS edit — including an `orientation: "square"`
 *  selection, since no placeholder study is ever square (see
 *  PLACEHOLDER_ORIENTATIONS above). That explains why a square selection
 *  kept rendering as portrait through cache-busting, hard refreshes, and
 *  republishing — none of those mattered because the real CMS data was
 *  never actually being read at all. */
type StudyCmsContent = {
  title: string;
  /** Text field, optional — overrides the auto-generated "Study NN" index
   *  label (see `Study.label`'s own doc comment). Leave unset/empty to keep
   *  the plain running count. */
  label?: string;
  /** Select field, one of "portrait"/"landscape"/"square"/"wide" — optional;
   *  falls back to "portrait" (the page's own default box shape) when missing or
   *  mistyped. Typed as `string | string[]` rather than just `string`: a
   *  real diagnostic log, taken while chasing a square entry that kept
   *  zooming as portrait even with `square` confirmed selected in the CMS,
   *  showed microCMS actually returning this
   *  field's value as `['square']` — an array, not a plain string — despite
   *  the field being configured as single-select in the schema. Whatever the
   *  exact reason (a schema/API quirk, or "複数選択" having been toggled on
   *  at some point), `isStudyOrientation`'s own `typeof value === "string"`
   *  check silently failed against an array and fell back to `"portrait"`
   *  with zero visible error — exactly the reported bug. See
   *  `resolveOrientation()` below, which now accepts either shape. */
  orientation?: string | string[];
  /** Image field (single image) — optional; falls back to one of the
   *  bundled public/images/studies/ sample photos (cycled by index) when
   *  not uploaded yet. Still used as the thumbnail-rail preview even for a
   *  study that also has `video` set below — see `Study.imageSrc`'s own doc
   *  comment. */
  image?: { url: string; height: number; width: number };
  /** Plain text field (a direct URL to an externally-hosted video file), NOT
   *  microCMS's own File field — matching lib/projects.ts's own `galleryVideo`
   *  block exactly (see that file's own `video` field doc comment): microCMS's
   *  File field type requires a paid plan (unavailable on this project's
   *  Hobby plan), so this expects a plain URL typed/pasted in instead, after
   *  uploading the actual video file to Cloudinary (or any other external
   *  host) and pasting its delivery URL here. Field ID `video`. When set
   *  (a non-empty string), this study's `mediaType` resolves to `"video"`
   *  and the large center display (studies-center-image.tsx) plays it
   *  directly (muted, autoplay, loop) in place of `image` — the thumbnail
   *  rail is unaffected either way (always `image`). */
  video?: string;
};

/** microCMS list API request cap — see lib/projects.ts's own
 *  PROJECTS_FETCH_LIMIT for why an explicit limit is needed at all
 *  (microCMS's own default is only 10 per request). */
const STUDIES_FETCH_LIMIT = 100;

/**
 * Real studies list — same CMS integration pattern as lib/news.ts/
 * lib/projects.ts. Editable from the microCMS admin dashboard (a "studies"
 * endpoint — list API, one content = one study).
 *
 * Expected microCMS "studies" endpoint shape (list API):
 *   - `title` (text field, required) — the real title text. The smaller of
 *     the two lines shown alongside each study on the PC gallery
 *     (studies-gallery.tsx: 14px, the *upper* line); on SP
 *     (mobile-studies.tsx) it's the *upper*, smaller (12px vs. 14px) line
 *     too, now that both trees agree on the ordering (see mobile-studies.tsx's
 *     own doc comment on this).
 *   - `label` (text field, optional, display name "連番ラベル" in the
 *     current schema) — overrides the *other* line, normally an
 *     auto-generated "Study 01", "Study 02"... index label derived from the
 *     entry's own position in the list (not editable by itself; there's no
 *     separate "number" to set — leaving this field blank just keeps that
 *     auto count). Set it to replace that line's text for one specific study
 *     instead.
 *   - `orientation` (select field, single-select, optional) — exactly 4
 *     options, labeled exactly (case-sensitive): "portrait", "landscape",
 *     "square", "wide" (8:5 — this 4th option has to be added to the select
 *     field's own settings in the microCMS dashboard, same as the existing
 *     3). Controls the center image's own box shape. Leave unset to default
 *     to "portrait".
 *   - `image` (image field, optional) — the real photo/still shown in the
 *     thumbnail rail always, and in the large center display too whenever
 *     `video` below is unset. Leave unset to keep showing one of the bundled
 *     sample photos. Served through microcmsImageUrl() (lib/microcms.ts)
 *     below, which converts it to WebP and caps its resolution on the fly —
 *     the original upload in the microCMS dashboard can stay whatever
 *     format/size it was. Still worth setting even on a study that also has
 *     `video` below, since the thumbnail rail never plays video.
 *   - `video` (text field, optional, field ID `video`) — a direct URL to a
 *     video file hosted externally (Cloudinary recommended, matching
 *     lib/projects.ts's own `galleryVideo` block — see that file's own field
 *     doc comment for why this is a plain text field rather than microCMS's
 *     File field: File requires a paid plan, unavailable on Hobby). When
 *     set, this study's large center display plays this video instead of
 *     `image` (muted, autoplay, loop — see studies-center-image.tsx). Leave
 *     unset for a plain image study (the common case).
 *
 * `color` (loading-state fallback background) and `slug` (future
 * `/studies/[slug]` detail page, not built yet) have no CMS equivalent —
 * both are still derived automatically (color cycled by index, slug from
 * `title` via the same slugify() lib/projects.ts uses). `mediaType` resolves
 * to `"video"` whenever `video` above is set, `"image"` otherwise.
 *
 * List order follows microCMS's own default (createdAt, newest first) — no
 * `orders` query override yet; manual drag-order control would need an extra
 * numeric "order" field.
 */
export async function getStudies(): Promise<Study[]> {
  const client = getMicrocmsClient();
  if (!client) return PLACEHOLDER_STUDIES;

  try {
    const response = await client.getList<StudyCmsContent>({
      endpoint: "studies",
      queries: { limit: STUDIES_FETCH_LIMIT },
    });

    if (response.contents.length === 0) return PLACEHOLDER_STUDIES;

    return response.contents.map((content, index) => {
      // Defensive fallback, not just a type-checker satisfier: `title` is
      // required in the CMS schema today, but the exact bug this file's own
      // `StudyCmsContent` doc comment describes was caused by exactly this
      // assumption silently going stale (a field the code trusted to always
      // have a value stopped being populated once the schema's real fields
      // shifted around) — `slugify(undefined)` would otherwise throw here
      // and crash this *entire* map for every study, not just the one
      // missing data, silently falling back to placeholder content with no
      // visible error. Falling back to the index-based placeholder title
      // instead keeps a schema hiccup on one entry from taking down the
      // whole real list.
      const title = content.title || PLACEHOLDER_TITLES[index % PLACEHOLDER_TITLES.length];
      return {
        title,
        label: content.label || undefined,
        color: PLACEHOLDER_COLORS[index % PLACEHOLDER_COLORS.length],
        slug: slugify(title),
        // Mirrors lib/projects.ts's own `galleryVideo` handling: `video` is a
        // plain text field (an externally-hosted URL, e.g. Cloudinary — see
        // `StudyCmsContent.video`'s own doc comment for why, not microCMS's
        // File field), so a present-but-blank string still counts as unset.
        mediaType: content.video?.trim() ? ("video" as const) : ("image" as const),
        orientation: resolveOrientation(content.orientation),
        imageSrc: content.image
          ? microcmsImageUrl(content.image.url)
          : `/images/studies/study${String((index % 10) + 1).padStart(2, "0")}.jpg`,
        // Not run through microcmsImageUrl() — that helper's WebP/resize
        // transform is image-only and microCMS-hosted-file-specific, neither
        // of which applies to an externally-hosted (e.g. Cloudinary) video
        // URL. Left `undefined` for plain image studies (the common case).
        videoSrc: content.video?.trim() || undefined,
      };
    });
  } catch (error) {
    // Covers both "the 'studies' endpoint doesn't exist yet" (a 404 from
    // microCMS) and any genuine network/auth failure alike — either way,
    // this page should still show *something* rather than an empty gallery.
    //
    // Temporary diagnostic log, added while the title/label field mismatch
    // above was still crashing this same try block: silently swallowing
    // *every* failure here, with zero visibility into *which* one is
    // actually happening, made it impossible to tell "this crashed" apart
    // from "this genuinely got 0 real results and correctly fell back," "the
    // request failed," etc. Check the terminal running `next dev` after
    // reloading the Studies page — remove this once whatever's actually
    // happening is confirmed.
    console.error("getStudies() fell back to placeholder data:", error);
    return PLACEHOLDER_STUDIES;
  }
}
