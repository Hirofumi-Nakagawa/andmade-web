import type { Metadata, Viewport } from "next";
import { GrainOverlay } from "@/components/grain-overlay";
import { withBasePath } from "@/lib/base-path";
import { MobileStudies } from "@/components/mobile-studies";
import { RevealOnMount } from "@/components/reveal-on-mount";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StatusBarMaskColor } from "@/components/status-bar-mask";
import { StudiesBackground } from "@/components/studies-background";
import { StudiesGallery } from "@/components/studies-gallery";
import { getStudies } from "@/lib/studies";

// Composes against the root layout's own title template
// ("%s - ANDMADE Inc.") into "Studies - ANDMADE Inc.".
// `alternates.canonical` set explicitly here — Next.js's metadata merging
// replaces the parent's `alternates` object wholesale rather than merging
// field-by-field, so without this override the page would otherwise
// incorrectly inherit the root layout's own canonical ("/", the home page).
// description — per direct follow-up ("各ページのdescriptionを以下に変更
// して")。プレーンな meta description のみで、OGP/Twitter の description は
// 従来どおりルート（app/layout.tsx）のサイト共通文を丸ごと継承する。
export const metadata: Metadata = {
  title: "Studies",
  description:
    "グラフィック、アイデア、リサーチ、実験など、ANDMADEの思考と表現を収めたアーカイブ。プロジェクトの背景にある視点や試みを紹介しています。",
  alternates: { canonical: "/studies/" },
};

// viewportFit: "cover" — per direct follow-up ("studiesページをcontactページ
// と同じ表示エリアに変更して"): Contact's own SP tree shows a visible band at
// the very top (behind the iOS status bar) where the root layout's own
// default background (--background, #f6f6f4) peeks through, since neither
// page previously set viewport-fit=cover — that's not actually a
// Contact-specific quirk, just much more visible there against Contact's
// black background than here against this page's own muted sage green,
// where the same-size band blends in and reads as "seamless" purely by
// color coincidence. Rather than leave that as an unintentional, contrast-
// dependent inconsistency, this page now deliberately reproduces the same
// band: `viewport-fit=cover` extends the *layout* viewport up into the
// status-bar area, and the page's own background below (see the
// `top: "env(safe-area-inset-top)"` inner wrapper in the component body)
// stops short of painting into it, leaving the root's own default
// background visible there — same construction as the gap Contact already
// has, just applied on purpose instead of by accident.
export const viewport: Viewport = { viewportFit: "cover" };

/** `export const dynamic = "force-dynamic"` used to sit here, forcing a
 *  per-request CMS fetch to dodge Next's on-disk fetch Data Cache (which had
 *  served a stale `zoom` value across dev-server restarts — "studiesで
 *  squareを選択して入力したんだけど、zoomでportraitで表示される"). It's
 *  incompatible with the static export (next.config.ts's own
 *  `output: "export"`) and no longer needed: with no server at runtime,
 *  getStudies() below runs once at build time and its result is baked into
 *  the emitted HTML. The stale-cache hazard it guarded against only ever
 *  applied to a long-lived dev server; if it resurfaces during development,
 *  delete `.next/cache` (or add `{ next: { revalidate: 0 } }` at the fetch
 *  site) rather than reinstating this export. */

/** Studies page's own background color — per explicit spec ("背景色を
 *  #88988Dにして" → "#819387に変更"), a muted sage green, distinct from the
 *  rest of the site's cream `--color-background`. Scoped to just this page
 *  (not the shared CSS variable) since nowhere else asked for this color. */
const STUDIES_BACKGROUND_COLOR = "#819387";

/** ステータスバー帯の色 — per direct follow-up ("#88988Dよりほんの少しだけ
 *  濃い色に変えて")。「ページ地色より約6%暗い」関係を保って、地色の
 *  #819387 (129,147,135) から (121,138,127) に追従させた。ページ本体の
 *  地色とは別定数にしてあるのは、帯だけを一段落とした見え方にするため
 *  （本文側の地色は変えない）。 */
const STUDIES_STATUS_BAR_COLOR = "#798A7F";

/** Tiled background texture (public/images/noise.png, supplied directly by
 *  the user) — per direct follow-up ("背景砂嵐は無しで、代わりに添付のテク
 *  スチャをブレンドモード（乗算）かけた状態で背景にループで敷いて"),
 *  replacing the earlier procedurally-generated `feTurbulence` SVG grain
 *  (which also animated/"flickered" via .studies-noise-flicker in
 *  globals.css, the "砂嵐" this follow-up asks to remove) with this real
 *  photographed/scanned texture, tiled via plain `background-repeat` and
 *  layered with `mix-blend-mode: multiply` rather than the old `overlay` —
 *  multiply reads as an even, ink-like darkening wherever the texture has
 *  tone, rather than overlay's brightness-dependent contrast shift. No
 *  animation this time (no equivalent request for movement, unlike the old
 *  noise) — a plain static tile. */
// withBasePath — CSS の background-image: url() に文字列で渡すため、Next の
// basePath 自動付与が効かない（lib/base-path.ts 参照）。
const NOISE_TEXTURE_SRC = withBasePath("/images/noise.png");

/**
 * Studies page (Figma node 934:312) — a single, non-scrolling viewport (per
 * explicit confirmation: the page itself doesn't scroll; only the left
 * thumbnail rail and the center image move, both driven by
 * StudiesGallery's own shared state). `dark` on both SiteHeader and
 * SiteFooter — this page's own background sits with nothing behind it to
 * blend against (unlike Home, which wraps its own header/footer in a
 * `mix-blend-exclusion` ancestor over project thumbnails), so both render in
 * plain black text instead of the site's usual blended white.
 *
 * Async Server Component (unlike Home's own client-side fetch pattern — see
 * app/page.tsx) — this page already exports its own `metadata` above, which
 * requires staying a Server Component, so getStudies() is simply awaited
 * directly here rather than needing an /api/studies route + client
 * fetch/useState round-trip.
 */
export default async function Studies() {
  const studies = await getStudies();

  return (
    // Outer wrapper is the full (now status-bar-extended, per viewport-fit
    // above) screen height, with no background of its own — so the root
    // layout's own default background (--background) shows through above
    // the inner wrapper below, exactly matching the band Contact's own SP
    // tree shows. `overflow-hidden` stays on the *inner* wrapper only (see
    // below), same clipping this outer box always relied on.
    //
    // `h-dvh` (was `h-screen`, i.e. a static `100vh`) — per direct follow-up
    // that the band still wasn't showing even after confirming the
    // `viewport-fit=cover` meta tag itself was genuinely present ("縦の表示
    // エリアの問題なのでは？...Menuの下8pxまでしか表示されない"): `100vh` on
    // iOS Safari resolves against the *large* viewport (address bar fully
    // collapsed) regardless of what's actually visible right now — when the
    // address bar is docked/visible (this page's own resting state, since it
    // never scrolls), the box this sizes could end up taller than the
    // genuinely visible screen, or otherwise disagree with whatever Safari
    // is currently treating as "the viewport" for safe-area purposes, either
    // of which would produce exactly this "content stops short, doesn't
    // reach the real edges" symptom regardless of the `env(safe-area-inset-
    // *)` insetting below being otherwise correct. `100dvh` (dynamic
    // viewport height) instead always tracks whatever the *currently*
    // visible viewport actually is, live — components/mobile-contact.tsx's
    // own outer wrapper already uses this exact unit for the same reason.
    <div className="relative h-dvh w-full">
      {/* iOS のステータスバー領域をこのページの地色にする — per direct
         follow-up ("Studiesのヘッダー上のツールバーの背景色をcontactページと
         同じくページの背景色にしたい")。Contact が同じ仕組みで #000 を
         指定しているのと同じ扱い。
         viewport-fit=cover でページはステータスバー下まで広がるが、その帯の
         色は Safari が theme-color から決めるため、ページ側の要素では塗れない
         —— components/status-bar-mask.tsx に経緯あり。このコンポーネントが
         theme-color と上部マスクの色をまとめて差し替える。 */}
      <StatusBarMaskColor color={STUDIES_STATUS_BAR_COLOR} />
      {/* The page's actual sage-green content, unchanged from before except
         that it now insets `env(safe-area-inset-top)` from this outer box's
         own top and `env(safe-area-inset-bottom)` from its own bottom,
         instead of running flush edge-to-edge — every child below keeps its
         own existing literal top-offset math (StudiesGallery/SiteHeader/
         SiteFooter/MobileStudies), since this remains their nearest
         positioned ancestor either way; only *this* wrapper's own position
         within the taller, now-extended outer box changed. The bottom inset
         specifically (not just top) matters on real iOS Safari, where the
         *address bar* itself sits at the screen's bottom edge: without it,
         `viewport-fit=cover` extends this div's own green background down
         underneath that bottom chrome too ("まだアドレスバーに背景がかかっ
         てる"), which Contact's own (viewport-fit-less) SP tree never does
         either — insetting both edges keeps this page's real content inside
         the same "safe", non-chrome-covered area Contact's content always
         has, on both ends, with the newly-extended strip on *either* side
         left to the root layout's own default background, matching Contact
         exactly. */}
      <div
        className="absolute inset-x-0 overflow-hidden"
        style={{
          top: "env(safe-area-inset-top)",
          bottom: "env(safe-area-inset-bottom)",
          // 地色はこのラッパーではなく StudiesBackground に持たせている —
          // ここに書くと、フェードインさせたときに内包する本文まで一緒に
          // 薄くなってしまうため（per direct follow-up "背景はフェードインで
          // 表示させて"）。
        }}
      >
        <StudiesBackground color={STUDIES_BACKGROUND_COLOR} textureSrc={NOISE_TEXTURE_SRC} />
        {/* 動くフィルムグレイン — per direct follow-up ("studiesページの背景に
           下記値でノイズをのせて grain: 0.08, grainSize: 1, grainFps: 12")、
           bg-lab/About・Contact背景と同じ質感のノイズを静的テクスチャの上に
           重ねる。GrainOverlayのパラメータ体系への変換: grain→noiseIntensity
           (0.08そのまま)、grainSize→noiseScale (1px)、grainFps 12→
           noiseFlicker 0.2 (GrainOverlayはfpsでなく「rAFフレームの何割で
           更新するか」なので、60Hz基準で 12/60 = 0.2)。DOM順でこの位置
           (テクスチャの直後、ギャラリー/ヘッダー/フッターの前)に置くことで
           背景側にだけ乗り、コンテンツの上には出ない。 */}
        <GrainOverlay noiseIntensity={0.06} noiseScale={1} noiseFlicker={0.2} />

        {/* The gallery spans the *entire* page height (top-0 to bottom-0), not
           just the space between header and footer — its own thumbnail rail
           sits at x=0..82px (the literal left edge), and its counter/title
           readouts start at grid column 3 (198px), same as SiteHeader/
           SiteFooter's own left margin — horizontally, none of these four
           pieces ever overlap, so the rail is free to run the full height
           (matching Figma's own thumbnails, which span y=0 to 990 — nearly
           the entire 900px canvas and then some) without needing to carve out
           room for the header/footer above and below it. */}
        <div className="hidden lg:contents">
          <StudiesGallery studies={studies} />

          {/* z-10 — per direct follow-up ("ヘッダー・フッターは画像より上に
             くるようにする"): the zoomed center image (StudiesGallery above)
             can now grow to fill the entire window height with no reserved
             clearance at all (see ZOOM_VERTICAL_MARGIN_PX's own doc comment
             in studies-gallery.tsx), so on a short window it can genuinely
             sit underneath where the header/footer render. Plain DOM order
             already paints these two after (so visually on top of) the
             gallery among same-level "auto"-stacked elements, but an
             explicit z-index makes that guarantee hold regardless of any
             future stacking-context changes elsewhere on this page, rather
             than relying on DOM order alone. */}
          <div className="relative z-10">
            <SiteHeader dark />
          </div>

          {/* Slides up 24px while fading in on mount — the same treatment every
             other page's own content gets (RevealOnMount; see app/contact/page.tsx),
             per explicit request ("フッターは他ページのコンテンツ表示時と同様、
             少し下からスライドしながらフェードイン"). z-10 — see SiteHeader's
             own identical wrapper doc comment just above. */}
          <RevealOnMount className="absolute bottom-[28px] left-[calc(198px*var(--grid-scale))] z-10 w-[var(--content-width-fluid)]">
            <SiteFooter theme="dark" showBackToTop={false} />
          </RevealOnMount>
        </div>

        {/* SP counterpart (Figma node 1070:928) — see mobile-studies.tsx's own
           doc comment. No SiteFooter/SiteHeader here: MobileStudies renders its
           own "ANDMADE Inc." link directly, and the sitewide MENU pill
           (components/mobile-menu.tsx) is already mounted globally
           (app/layout.tsx), same convention as every other Mobile* page. */}
        <MobileStudies studies={studies} />
      </div>
    </div>
  );
}
