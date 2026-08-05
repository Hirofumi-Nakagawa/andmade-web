import type { MetadataRoute } from "next";
import { getProjects, slugify } from "@/lib/projects";
import { SITE_ROUTES, SITE_URL } from "@/lib/site";

// File-based metadata convention, mirroring app/manifest.ts's own established
// pattern in this codebase — auto-served at /sitemap.xml with no further
// wiring needed. SITE_ROUTES (lib/site.ts) is the single source of truth for
// which routes are real, indexable pages — app/not-found.tsx is deliberately
// excluded there.
// force-static — see app/robots.ts's own identical export for why the static
// export needs this on every function-based metadata route.
export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 実績詳細（/projects/<slug>/）も列挙する — per direct follow-up
  // ("googleのサイトクローラー用にデータ用意して")。それまでは SITE_ROUTES
  // の4ページのみで、CMS 由来の詳細ページがクローラに知らされていなかった
  // （トップの一覧リンクから辿れはするが、sitemap に無いページは発見も
  // 再クロールも遅くなる）。slug は generateStaticParams
  // (app/projects/[slug]/page.tsx) と同じ slugify(project.title) — 実際に
  // 書き出される HTML と同じ写像なので、存在しない URL を載せることは
  // 構造上できない。末尾スラッシュも SITE_ROUTES と同じ理由で付ける
  // （trailingSlash: true の実配信 URL に合わせ、301 を踏ませない）。
  //
  // getProjects() が空を返す事態（microCMS 未設定・通信失敗）はビルド全体
  // が generateStaticParams 側の明示チェックで落ちるので、ここで二重に
  // 検査はしない。
  const projects = await getProjects();

  return [
    ...SITE_ROUTES.map((route) => ({
      url: `${SITE_URL}${route}`,
      lastModified: new Date(),
    })),
    ...projects.map((project) => ({
      url: `${SITE_URL}/projects/${slugify(project.title)}/`,
      lastModified: new Date(),
    })),
  ];
}
