import type { Metadata, Viewport } from "next";
import { Courier_Prime } from "next/font/google";
import localFont from "next/font/local";
import Script from "next/script";
import { DisablePinchZoom } from "@/components/disable-pinch-zoom";
import { GridOverlay } from "@/components/grid-overlay";
import { KonamiGlitch } from "@/components/konami-glitch";
import { IdleOverlay } from "@/components/idle-overlay";
import { LenisRouteResize } from "@/components/lenis-route-resize";
import { MobileMenu } from "@/components/mobile-menu";
import { NowPlayingProvider } from "@/components/now-playing-provider";
import { ScrollProgressGauge } from "@/components/scroll-progress-gauge";
import { SiteIntro } from "@/components/site-intro";
import { StatusBarMask } from "@/components/status-bar-mask";
import { SmoothScroll } from "@/components/smooth-scroll";
import { TabFaviconSwap } from "@/components/tab-favicon-swap";
import {
  INSTAGRAM_URL,
  OGP_IMAGE,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  TWITTER_HANDLE,
  X_URL,
} from "@/lib/site";
import "./globals.css";

const courierPrime = Courier_Prime({
  variable: "--font-courier-prime",
  subsets: ["latin"],
  weight: "400",
});

// Akzidenz-Grotesk Next / Helvetica / Arial have no Japanese glyphs, so any
// Japanese text (e.g. Spotify track titles) was falling through to the
// browser's own default CJK font instead. Gen Interface JP Light
// (https://gen.typesetting.jp/) slots in as the fallback for Japanese
// specifically — see --font-sans in globals.css. Briefly tried Regular
// (400) — reverted back to Light (300) per explicit follow-up
// ("やっぱりLightに戻そう"). Only one weight is ever actually loaded here,
// so every place that sets this font family also sets its own matching
// `font-light` class (see about/page.tsx and contact/page.tsx).
const genInterfaceJP = localFont({
  src: "../public/fonts/GenInterfaceJP-Light.woff2",
  variable: "--font-gen-interface-jp",
  weight: "300",
  display: "swap",
});

// Shared OGP share-card image (public/images/ogp.png, supplied directly by
// the user — a real, already-designed 1200x630 card, not a Claude-authored
// placeholder), reused verbatim for both `openGraph.images` and
// `twitter.images` below per direct request ("ogpとtwitter用画像はこれを使
// 用して")。かつては「どのページも openGraph/twitter を持たず全ページが
// このルート定義を丸ごと継承する」構成だったが、実績詳細ページだけは
// per-project の meta を CMS から設定できるようにしたため（per direct
// follow-up "各実績ページのmetaを設定できるようにして"）、定数自体は
// lib/site.ts へ移し、そちらの generateMetadata のフォールバックとも共有
// している。それ以外のページは引き続きここを丸ごと継承する。

// Organization structured data (schema.org) — read by search engines to
// build a Knowledge Panel / sitelinks-style entity for the company. Rendered
// as a plain <script type="application/ld+json"> below rather than via any
// dedicated Next.js API (there isn't one — JSON-LD is just emitted as inline
// page content). Logo uses the existing 512x512 PNG (public/web-app-manifest
// -512x512.png) rather than one of the SVG wordmarks: schema.org/Google's
// own guidance calls for a real raster image, not vector.
// Google Analytics 4 (GA4) measurement ID — per direct request. Replaces an
// earlier Universal Analytics ID (UA-93183118-1) supplied at first, which
// would have silently collected nothing: UA stopped processing hits in July
// 2023.
const GA_MEASUREMENT_ID = "G-2SHFHDT5ZJ";

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/web-app-manifest-512x512.png`,
  description: SITE_DESCRIPTION,
  sameAs: [INSTAGRAM_URL, X_URL],
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Root-level fallback canonical ("/" = the home page itself). Every other
  // route (About/Contact/Studies) sets its own `alternates.canonical`
  // instead of inheriting this one — Next.js's metadata merging replaces
  // `alternates` wholesale rather than merging it field-by-field, so without
  // a per-page override every route would otherwise incorrectly declare "/"
  // (the home page) as its own canonical URL.
  alternates: { canonical: "/" },
  // Per-page titles compose against this template (e.g. app/about/page.tsx's
  // own `title: "About"` becomes "About - ANDMADE Inc.") — per explicit
  // request: "トップ：ANDMADE Inc. / 下層：About - ANDMADE Inc. / 実績詳
  // 細：Dots by GEEK PICTURES - ANDMADE Inc." (name/section first, "-
  // ANDMADE Inc." suffix — corrected from an earlier "ANDMADE Inc. - %s"
  // ordering). Pages that don't set their own `metadata.title` (the top
  // page, app/page.tsx — a "use client" component, which can't export
  // `metadata` at all — and app/not-found.tsx, same reason) fall back to
  // `default` below, unchanged. Note this `template` only ever affects the
  // plain `<title>` tag, not `openGraph.title`/`twitter.title` below — those
  // are a separate, literal string with no template applied, per Next.js's
  // own metadata fields (see the `openGraph`/`twitter` objects below).
  title: { default: "ANDMADE Inc.", template: "%s - ANDMADE Inc." },
  description: SITE_DESCRIPTION,
  // Open Graph (Facebook, LINE, Slack, Discord, etc.) and Twitter Card
  // metadata — per direct follow-up asking whether the plain `description`
  // above would also show up in SNS share previews: it doesn't on its own
  // (that's a distinct SEO-only tag; OG/Twitter Card scrapers read these
  // dedicated fields instead, and Next.js has no automatic fallback from
  // one to the other when neither is set at all — verified directly against
  // Next.js's own metadata docs, since third-party sources claiming an
  // automatic fallback turned out not to match the official reference).
  // Reuses the exact same title/description/image everywhere (see
  // OGP_IMAGE's own doc comment above) rather than per-page variants.
  openGraph: {
    title: "ANDMADE Inc.",
    description: SITE_DESCRIPTION,
    url: "/",
    siteName: "ANDMADE Inc.",
    images: [OGP_IMAGE],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ANDMADE Inc.",
    description: SITE_DESCRIPTION,
    images: [OGP_IMAGE.url],
    site: TWITTER_HANDLE,
    creator: TWITTER_HANDLE,
  },
};

// maximumScale: 1 + userScalable: false — per direct follow-up ("スマホで
// ピンチアウトやダブルタップで拡大ができないようにして"): without an
// explicit `viewport` export, Next.js falls back to its own default
// (`width=device-width, initial-scale=1`, no scale limit), which still lets
// mobile browsers pinch-zoom and double-tap-zoom the page — the layout here
// is a fixed-px, hand-tuned SP design (see mobile-home.tsx's own doc
// comment: "SP is scroll-driven with fixed px units"), not one meant to be
// zoomed.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // viewport-fit=cover — without it, iOS reports every env(safe-area-inset-*)
  // as 0, which silently zeroed all the places this codebase already uses
  // them: mobile-project-detail.tsx's header padding, app/studies/page.tsx's
  // top/bottom insets, and now components/status-bar-mask.tsx, whose
  // status-bar cover was reported as not masking anything ("まだステータス
  // バー裏が表示されてる") for exactly this reason — its height computed to
  // 0. With cover, the page formally extends edge-to-edge (which iOS was
  // already rendering anyway, hence content showing through the status bar)
  // and the insets become real values.
  viewportFit: "cover",
  // theme-color — the actual fix for content ghosting through the iOS status
  // bar, after viewport-fit=cover alone still didn't mask it: in Safari's
  // bottom-tab-bar layout the page's viewport can start *below* the status
  // bar, env(safe-area-inset-top) stays 0, and what shows through up there is
  // Safari itself sampling the page behind its translucent chrome — a region
  // no page-drawn mask can reach. theme-color is the one lever the web has
  // over it: Safari tints that chrome backdrop with this colour instead.
  // Cream to match the site background; pages with their own background
  // retint it dynamically via <StatusBarMaskColor> (status-bar-mask.tsx).
  themeColor: "#f6f6f4",
};

/**
 * --scale-raw / --grid-scale を実測のビューポート幅から入れるスクリプト。
 * 中身の数値は globals.css の設計値と対応している:
 *   --scale-raw  = max(1, (幅 - (1440 - 1218)) / 1218)
 *   --grid-scale = max(1024 / 1440, 幅 / 1440)
 * 片方でも変えたら両方を合わせること。
 *
 * innerWidth を使うのは、CSS の 100vw と同じ「スクロールバーを含む幅」だから
 * （このサイトはスクロールバーを隠しているので実質同じだが、定義を合わせて
 * おく）。resize は passive で、値が変わったときだけ書き込む。
 */
const SCALE_VARS_SCRIPT = `(function(){
  var el = document.documentElement;
  var last = null;
  function apply(){
    var w = window.innerWidth;
    if (w === last) return;
    last = w;
    el.style.setProperty('--scale-raw', String(Math.max(1, (w - 222) / 1218)));
    el.style.setProperty('--grid-scale', String(Math.max(1024 / 1440, w / 1440)));
  }
  apply();
  window.addEventListener('resize', apply, { passive: true });
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning — 下の <head> のインラインスクリプトが
    // ハイドレーション前に <html> の style（--scale-raw / --grid-scale）を
    // 書くため、サーバーの HTML と一致しない。意図した差分なので抑制する
    // （<body> に付けているのと同じ理由・同じ1階層ぶんのスコープ）。
    <html
      suppressHydrationWarning
      lang="en"
      className={`${courierPrime.variable} ${genInterfaceJP.variable} h-full antialiased`}
    >
      <head>
        {/* --scale-raw / --grid-scale を入れる（globals.css の同名の
            doc comment 参照）。この2つは「ビューポート幅 ÷ 基準幅」という
            無単位の比で、CSS だけで書くには calc() の中で長さ同士を割る
            必要がある。Chrome / Safari は通すが Firefox は通さず、式ごと
            無効になってレイアウトが左端に潰れた（tan(atan2()) で除算を
            避ける書き方も Firefox では効かなかった）。ここで入れれば
            CSS 数学関数の対応状況に依存しない。

            <head> のインラインスクリプトなので body の描画前に走る＝
            初期値のままの1フレームが出ない。React も Lenis も待たない。 */}
        <script
          dangerouslySetInnerHTML={{
            __html: SCALE_VARS_SCRIPT,
          }}
        />
        {/* Akzidenz Grotesk Next (Regular/Medium) via Adobe Fonts — see --font-sans in globals.css. */}
        <link rel="stylesheet" href="https://use.typekit.net/xdb8vtp.css" />
        {/* Organization JSON-LD — see organizationJsonLd's own doc comment above. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </head>
      {/* suppressHydrationWarning — browser extensions (ColorZilla et al.)
          inject their own attributes into <body> before React loads
          (observed live: cz-shortcut-listen="true"), which trips React's
          server/client hydration comparison and shows a dev-overlay error on
          every load despite nothing being wrong with the page itself. The
          suppression is scoped to this one element's attributes only — React
          explicitly documents it as one level deep — so real mismatches
          anywhere inside the tree still get reported. */}
      <body suppressHydrationWarning className="min-h-full bg-(--color-background)">
        <DisablePinchZoom />
        <TabFaviconSwap />
        <SiteIntro />
        <NowPlayingProvider>
          <SmoothScroll>
            <LenisRouteResize />
            {children}
            {/* Persistent singleton — mounted once here, never unmounted by
                client-side navigation, unlike the per-page component tree in
                `{children}` above. Needs to stay inside SmoothScroll's own
                <ReactLenis root> (for useLenis — scroll lock, Back to top)
                and inside NowPlayingProvider (for its Now Playing card, same
                reason IdleOverlay below needs it) — see mobile-menu.tsx's
                own top-level doc comment for why this moved here from being
                rendered per-page inside mobile-home.tsx/mobile-about.tsx. */}
            <MobileMenu />
            {/* Konami-code easter egg — inside SmoothScroll because it reads
                scroll velocity via useLenis (which needs the <ReactLenis
                root> above), and a persistent singleton for the same reason
                MobileMenu is: it should survive client-side navigation
                rather than switching itself off on every route change. */}
            <KonamiGlitch />
            {/* Scroll-progress gauge along the top edge of the window, PC and
                SP alike. Inside SmoothScroll for the same reason as
                KonamiGlitch above — it reads scroll progress via useLenis —
                and a persistent singleton so it isn't torn down and rebuilt
                on every client-side navigation. */}
            <ScrollProgressGauge />
            {/* Covers the iOS status-bar region on SP so scrolled content
                can't show through the translucent system UI — see its own
                doc comment. */}
            <StatusBarMask />
          </SmoothScroll>
          {/* Needs to stay inside NowPlayingProvider — IdleNowPlaying reads
              useNowPlaying(), which otherwise falls back to the context's
              default `{ isPlaying: false }` value instead of the actual
              polled Spotify state (reported as the idle overlay's Now
              Playing card never showing even though the header's own
              "Playing" display worked fine). */}
          <IdleOverlay />
        </NowPlayingProvider>
        <GridOverlay />
        {/* Google Analytics (GA4) — next/script's `afterInteractive` defers
            loading until after the page becomes interactive, per Next.js's
            own recommended pattern for GA (rather than a plain <script> tag,
            which would block hydration). */}
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `}
        </Script>
      </body>
    </html>
  );
}
