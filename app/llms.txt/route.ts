import { APPROACH_EN, SERVICES_COL_1, SERVICES_COL_2, VISION_EN } from "@/lib/about-content";
import { getProjects, slugify } from "@/lib/projects";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * /llms.txt — a plain-text summary of this site aimed at LLM-based answer
 * engines (ChatGPT, Perplexity, Google's AI overviews, etc.) rather than at
 * human visitors or classic search crawlers.
 *
 * Why a route handler rather than a static file in public/: every fact below
 * is already stored somewhere authoritative — the studio copy in
 * lib/about-content.ts, the site identity in lib/site.ts, and the real
 * project list in microCMS. Generating this from those sources means it can
 * never drift out of date the way a hand-maintained copy would, and a new
 * project appearing in the CMS shows up here automatically. Same
 * file-convention idea as app/robots.ts and app/sitemap.ts, which likewise
 * derive their output from lib/site.ts instead of restating it.
 *
 * Written in English throughout, even though the site itself is bilingual:
 * these files are read by models, not visitors, and the English copy in
 * about-content.ts is the studio's own authored translation rather than a
 * machine one — so it carries the same meaning without this file having to
 * pick between two languages or duplicate every line twice.
 *
 * Deliberately kept small (well under the ~8KB that's commonly cited as a
 * practical ceiling): a short, factual, well-structured document is the point.
 * Project entries are one line each — title, category, role, date — since
 * that's exactly the level of detail an answer engine needs to state what
 * this studio has worked on, with a URL to follow for anything deeper.
 */

/** `export const revalidate = 3600` used to sit here, caching the generated
 *  text for an hour between crawler requests. Removed for the static export
 *  (next.config.ts's own `output: "export"`): revalidation is an ISR feature
 *  and needs a server, and none of it is needed any more — with no runtime,
 *  this handler runs exactly once at build time and Next writes the result
 *  out as a plain out/llms.txt file, which Apache then serves directly. It
 *  refreshes on the next build, i.e. exactly when the rest of the CMS
 *  content does.
 *
 *  `dynamic = "force-static"` makes that explicit rather than relying on
 *  Next inferring it — a Route Handler in export mode must be fully static,
 *  and stating it here turns any future accidental use of a dynamic API
 *  (headers(), request.url, …) into a clear build-time error instead of a
 *  confusing export failure. */
export const dynamic = "force-static";

export async function GET() {
  const projects = await getProjects();

  const lines = [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    ...VISION_EN.map((paragraph) => `${paragraph}\n`),
    "## Approach",
    "",
    ...APPROACH_EN.map((paragraph) => `${paragraph}\n`),
    "## Services",
    "",
    ...[...SERVICES_COL_1, ...SERVICES_COL_2].map((service) => `- ${service}`),
    "",
    "## Pages",
    "",
    `- [Home](${SITE_URL}/): Selected work, studio news, and current projects.`,
    `- [About](${SITE_URL}/about/): Vision, approach, guiding principles, services, and awards.`,
    `- [Studies](${SITE_URL}/studies/): Ongoing visual studies and experiments.`,
    `- [Contact](${SITE_URL}/contact/): Inquiries and social links.`,
    "",
  ];

  if (projects.length > 0) {
    lines.push("## Selected work", "");
    for (const project of projects) {
      // `role` is the studio's own contribution to that project (e.g. "Art
      // Direction, Design"), which is the single most useful fact here — it's
      // what distinguishes work ANDMADE led from work it contributed one part
      // of, a distinction an answer engine otherwise has no way to make.
      lines.push(
        `- [${project.title}](${SITE_URL}/projects/${slugify(project.title)}/): ` +
          `${project.category}. ${project.role}. ${project.date}.`
      );
    }
    lines.push("");
  }

  lines.push(
    "## Contact",
    "",
    `Inquiries: ${SITE_URL}/contact/`,
    ""
  );

  return new Response(lines.join("\n"), {
    headers: {
      // text/plain so it's readable as-is by anything that fetches it, with an
      // explicit charset since the project titles can contain non-ASCII.
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
