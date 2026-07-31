import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// File-based metadata convention, mirroring app/manifest.ts's own established
// pattern in this codebase — auto-served at /robots.txt with no further
// wiring needed.

// force-static — required by the static export (next.config.ts's own
// `output: "export"`). Next treats a *function*-based metadata route as
// potentially dynamic unless told otherwise, and in export mode that's a hard
// build failure rather than a warning ("Failed to collect page data for
// /robots.txt", with the underlying cause hidden behind ignore-listed
// frames). This function reads nothing per-request, so pinning it static is
// both correct and what the emitted out/robots.txt already implies.
// Same one-liner is on app/sitemap.ts and app/manifest.ts for the same reason.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    // /llms.txt (app/llms.txt/route.ts) — a plain-text site summary for
    // LLM-based answer engines. There's no standardised robots.txt directive
    // pointing at it the way `Sitemap:` does for sitemaps, so this goes in
    // `host`-adjacent free-form territory: MetadataRoute.Robots has no field
    // for arbitrary lines, which is why it's simply *allowed* by the rule
    // above (crawlers that know to look for /llms.txt will find it) rather
    // than announced here.
  };
}
