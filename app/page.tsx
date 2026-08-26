import { HomeView } from "@/components/home-view";
import { getRecentNews } from "@/lib/news";
import { getProjects, toListProject } from "@/lib/projects";

// `export const dynamic = "force-dynamic"` was here, keeping this page on a
// per-request CMS fetch. Removed for the static export (next.config.ts's own
// `output: "export"`): there's no server left to re-fetch on, so both the
// project list and the news items are read from microCMS at *build* time and
// baked into the emitted HTML. Content changes therefore need a rebuild +
// re-upload — the deliberate trade-off of hosting on a PHP-only server.
//
// getRecentNews() moved here too (it used to be fetched client-side from
// /api/news by recent-news.tsx / mobile-recent-news.tsx, a Route Handler that
// no longer exists in a static export). Threading it down as a prop also
// removes the brief empty-then-populated flash those fetches caused.
export default async function Home() {
  const [projects, news] = await Promise.all([getProjects(), getRecentNews()]);
  // 詳細ページ専用のフィールドは落として渡す — toListProject の doc
  // comment 参照（渡したものはすべて HTML に埋め込まれるため）。
  return <HomeView initialProjects={projects.map(toListProject)} news={news} />;
}
