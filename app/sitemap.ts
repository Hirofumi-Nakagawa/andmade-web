import type { MetadataRoute } from "next";
import { SITE_ROUTES, SITE_URL } from "@/lib/site";

// File-based metadata convention, mirroring app/manifest.ts's own established
// pattern in this codebase — auto-served at /sitemap.xml with no further
// wiring needed. SITE_ROUTES (lib/site.ts) is the single source of truth for
// which routes are real, indexable pages — app/not-found.tsx is deliberately
// excluded there.
// force-static — see app/robots.ts's own identical export for why the static
// export needs this on every function-based metadata route.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return SITE_ROUTES.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: new Date(),
  }));
}
