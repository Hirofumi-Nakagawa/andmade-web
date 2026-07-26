"use client";

/**
 * The current year, computed on the visitor's own clock rather than
 * hardcoded — used everywhere "©2026" appears (site-footer.tsx,
 * app/contact/page.tsx, site-intro.tsx) so it becomes "©2027" on its own
 * once 2027 actually arrives, with no yearly code change needed. A small
 * "use client" component (rather than just inlining `new Date().getFullYear()`
 * directly in each spot) matters specifically for app/contact/page.tsx,
 * which is otherwise a plain Server Component: computing the year at
 * request/build time there could bake in whatever year the page last
 * happened to render/build in, rather than always reading the visitor's
 * actual current clock.
 */
export function CopyrightYear() {
  return <>{new Date().getFullYear()}</>;
}
