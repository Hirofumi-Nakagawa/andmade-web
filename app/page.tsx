import { HomeView } from "@/components/home-view";
import { getProjects } from "@/lib/projects";

// Always fetch fresh from the CMS on every request — matches the original
// client-side fetch's own `cache: "no-store"` intent (see home-view.tsx's
// own doc comment on HomeViewProps for why the fetch moved here).
export const dynamic = "force-dynamic";

export default async function Home() {
  const projects = await getProjects();
  return <HomeView initialProjects={projects} />;
}
