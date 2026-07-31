"use client";

import { useEffect, useState } from "react";
import { ProjectCard } from "@/components/project-card";
import { KONAMI_WARP_TARGET_ATTRIBUTE } from "@/components/konami-warp-canvas";
import type { Project } from "@/lib/projects";

type ProjectListProps = {
  /** Fetched (or placeholder-fallback) project list — threaded down from
   *  app/page.tsx, which owns the actual microCMS fetch (see that file's own
   *  doc comment). Replaces this file's own previous direct `import {
   *  projects } from "@/lib/projects"` now that the real list is async. */
  projects: Project[];
  /** Ref to the grid's own root element — used to measure its rendered height. */
  listRef?: React.Ref<HTMLUListElement>;
  /** Ref to the last row's title link — used to find exactly where it starts. */
  lastTitleRef?: React.Ref<HTMLDivElement>;
  /** Reports each project's title element (by index) up to app/page.tsx. */
  onTitleRef?: (index: number, el: HTMLElement | null) => void;
  /** Reports hovering a project's title up to app/page.tsx (background preview). */
  onHoverTitle?: (index: number) => void;
  /** Reports leaving a project's title up to app/page.tsx (background preview). */
  onHoverEnd?: () => void;
  /** Index actually under the cursor right now (or null) — dims every other card to 70%. */
  activeIndex?: number | null;
};

export function ProjectList({
  projects,
  listRef,
  lastTitleRef,
  onTitleRef,
  onHoverTitle,
  onHoverEnd,
  activeIndex,
}: ProjectListProps) {
  // Bumped once when site-intro.tsx's splash finishes displaying and
  // navigates here — folded into each card's own `key` below, so every
  // ProjectCard fully unmounts and remounts fresh (see project-card.tsx's
  // own comment on why a fresh mount, not an in-place reveal-state flip, is
  // what's needed to replay the entrance for cards that already revealed
  // themselves silently behind the splash).
  const [replayGeneration, setReplayGeneration] = useState(0);

  useEffect(() => {
    function handleIntroComplete() {
      setReplayGeneration((generation) => generation + 1);
    }
    window.addEventListener("andmade:intro-complete", handleIntroComplete);
    return () => window.removeEventListener("andmade:intro-complete", handleIntroComplete);
  }, []);

  return (
    <ul
      ref={listRef}
      // Marks this subtree as the Konami easter egg's warp target. Inert
      // unless the egg is running — see components/konami-warp-canvas.tsx,
      // which finds this by attribute rather than by a forwarded ref so no
      // component in between has to carry one.
      {...{ [KONAMI_WARP_TARGET_ATTRIBUTE]: "" }}
      className="grid content-start items-start"
      style={{
        gridTemplateColumns: "repeat(3, calc(220px * var(--grid-scale)))",
        columnGap: "calc(128px * var(--grid-scale))",
        rowGap: "calc(100px * var(--grid-scale))",
      }}
    >
      {projects.map((project, index) => (
        <ProjectCard
          key={`${project.title}-${replayGeneration}`}
          project={project}
          column={index % 3}
          lastTitleRef={index === projects.length - 1 ? lastTitleRef : undefined}
          onTitleRef={onTitleRef ? (el) => onTitleRef(index, el) : undefined}
          onHoverTitle={onHoverTitle ? () => onHoverTitle(index) : undefined}
          onHoverEnd={onHoverEnd}
          isDimmed={activeIndex != null && activeIndex !== index}
        />
      ))}
    </ul>
  );
}
