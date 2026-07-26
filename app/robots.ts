import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// File-based metadata convention, mirroring app/manifest.ts's own established
// pattern in this codebase — auto-served at /robots.txt with no further
// wiring needed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
