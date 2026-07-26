import type { MetadataRoute } from "next";
import { SITE_ROUTES, SITE_URL } from "@/lib/site";

// File-based metadata convention, mirroring app/manifest.ts's own established
// pattern in this codebase — auto-served at /sitemap.xml with no further
// wiring needed. SITE_ROUTES (lib/site.ts) is the single source of truth for
// which routes are real, indexable pages — app/not-found.tsx is deliberately
// excluded there.
export default function sitemap(): MetadataRoute.Sitemap {
  return SITE_ROUTES.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: new Date(),
  }));
}
