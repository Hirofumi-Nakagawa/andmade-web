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

/**
 * lastModified は「本当に中身が変わった時刻」だけに付ける。
 *
 * 以前は全 URL に `new Date()`（＝ビルド時刻）を入れていた。これは
 * 「毎回すべてのページが更新された」と宣言しているのと同じで、CMS を1件
 * 直すだけのビルドでも、月1回の依存更新のビルドでも、全ページの日付が
 * 一斉に動く。lastmod が当てにならないと分かるとクローラー側は丸ごと
 * 無視するので、付けていること自体が無意味になっていた。
 *
 * ・実績詳細（/projects/<slug>/）— その実績の microCMS の revisedAt。
 *   そのページの内容が実際に書き換わった時刻そのもの。
 * ・トップ（/）— 実績の revisedAt の最大値。トップは実績一覧なので、
 *   どれか1件でも変われば表示が変わる＝これが正しい更新時刻になる。
 * ・About / Contact / Studies — **付けない**。内容はコード側にあり、
 *   ビルド時刻からは「文章が変わったのか、依存を上げただけなのか」を
 *   区別できない。嘘の日付を書くより、省いてクローラーの判断に任せる
 *   （lastmod は任意項目で、無くても sitemap として正しい）。
 */
const DATED_ROUTE = "/";

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

  // 文字列のまま比較している — ISO 8601 の UTC 表記（microCMS が返す形）は
  // 辞書順と時刻順が一致するので、Date に通す必要がない。
  const newestRevisedAt = projects
    .map((project) => project.revisedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return [
    ...SITE_ROUTES.map((route) => ({
      url: `${SITE_URL}${route}`,
      // トップだけ日付を持つ（上の doc comment 参照）。undefined を入れても
      // Next は <lastmod> を出さないので、分岐はこれで足りる。
      lastModified: route === DATED_ROUTE && newestRevisedAt ? newestRevisedAt : undefined,
    })),
    ...projects.map((project) => ({
      url: `${SITE_URL}/projects/${slugify(project.title)}/`,
      lastModified: project.revisedAt,
    })),
  ];
}
