"use client";

import { useEffect, useRef, useState } from "react";
import { CaseCounter } from "@/components/case-counter";
import { ProjectList } from "@/components/project-list";
import type { Project } from "@/lib/projects";

type ProjectGridSectionProps = {
  /** Fetched (or placeholder-fallback) project list — threaded down from
   *  app/page.tsx (see that file's own doc comment), forwarded to ProjectList
   *  and used for CaseCounter's own count, replacing this file's own previous
   *  direct `import { projects } from "@/lib/projects"`. */
  projects: Project[];
  /** Reports each project's title element (by index) up to app/page.tsx —
   *  used to play the underline-sweep animation on every title when the
   *  Tx/Th toggle is clicked (see app/page.tsx's own handleToggleClick). */
  onTitleRef?: (index: number, el: HTMLElement | null) => void;
  /** Reports hovering a project's title up to app/page.tsx (background preview). */
  onHoverTitle?: (index: number) => void;
  /** Reports leaving a project's title up to app/page.tsx (background preview). */
  onHoverEnd?: () => void;
  /** Index actually under the cursor right now (or null) — clears instantly
   *  on mouse leave, unlike the delayed hoveredIndex in app/page.tsx that
   *  drives the lingering background preview. Dims every other card to 70%. */
  activeIndex?: number | null;
};

/**
 * Wraps ProjectList + CaseCounter and measures the gap between the last
 * row's title and the grid's own bottom edge, then pulls the grid's bottom
 * up by exactly that much (negative margin). CaseCounter's sticky
 * containing block is this section, so shrinking it makes CaseCounter
 * release from "stuck" the moment the last row's title reaches it, instead
 * of only once the whole grid has scrolled past. lastTitleRef is also handed
 * to CaseCounter directly, so it can detect that same release moment itself.
 */
export function ProjectGridSection({
  projects,
  onTitleRef,
  onHoverTitle,
  onHoverEnd,
  activeIndex,
}: ProjectGridSectionProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const lastTitleRef = useRef<HTMLDivElement>(null);
  const [trailingHeight, setTrailingHeight] = useState(0);

  useEffect(() => {
    function measure() {
      const list = listRef.current;
      const lastTitle = lastTitleRef.current;
      if (!list || !lastTitle) return;
      const listBottom = list.getBoundingClientRect().bottom;
      const titleTop = lastTitle.getBoundingClientRect().top;
      setTrailingHeight(Math.max(0, listBottom - titleTop));
    }

    measure();
    window.addEventListener("resize", measure);

    // The measure() call above can run before Akzidenz Grotesk (loaded via
    // the Adobe Fonts <link> in app/layout.tsx) has actually finished
    // loading — row heights (and so this gap) shift slightly once the real
    // font swaps in for the browser's fallback. Re-measuring once every
    // requested font is actually ready corrects that silently, without
    // waiting for an actual window resize.
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) measure();
    });

    return () => {
      cancelled = true;
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div className="relative w-full">
      <div style={{ marginBottom: `-${trailingHeight}px` }}>
        <ProjectList
          projects={projects}
          listRef={listRef}
          lastTitleRef={lastTitleRef}
          onTitleRef={onTitleRef}
          onHoverTitle={onHoverTitle}
          onHoverEnd={onHoverEnd}
          activeIndex={activeIndex}
        />
      </div>
      <CaseCounter count={projects.length} lastTitleRef={lastTitleRef} />
    </div>
  );
}
