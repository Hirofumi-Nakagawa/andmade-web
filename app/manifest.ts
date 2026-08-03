import type { MetadataRoute } from "next";
import { withBasePath } from "@/lib/base-path";

/**
 * Web app manifest — Next.js's own file convention (this file, at
 * app/manifest.ts) is picked up automatically and served at /manifest.webmanifest,
 * with a matching <link rel="manifest"> injected into every page's <head>
 * with no further wiring needed. Icons here are the same andmade-mark.svg
 * circle-mark used for app/favicon.ico/app/apple-icon.png (see those files'
 * own comments), rasterized to the 192/512px sizes PWA install prompts and
 * Android home-screen icons expect — filenames match the
 * realfavicondgenerator.net convention the rest of this icon set was
 * generated from.
 */
// force-static — see app/robots.ts's own identical export for why the static
// export needs this on every function-based metadata route.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ANDMADE Inc.",
    short_name: "ANDMADE",
    description:
      "ANDMADE Inc.は、クライアントと共にモノづくりをする共創のスタンスで、ウェブ、CI・VI、ビジュアルに関わるグラフィックまで、包括的にアートディレクションとデザインを行っているデザインスタジオです。",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f6f4",
    theme_color: "#000000",
    icons: [
      {
        src: withBasePath("/web-app-manifest-192x192.png"),
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: withBasePath("/web-app-manifest-512x512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
