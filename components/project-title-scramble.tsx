"use client";

import { useEffect, useState } from "react";
import { ScrambleText } from "@/components/scramble-text";

/**
 * Scramble-reveals the project detail page's own title on mount — per direct
 * follow-up ("実績タイトルをスクランブルテキストで表示する"). A tiny client
 * wrapper around scramble-text.tsx (the page itself is an async Server
 * Component, so `active`'s mount timer can't live inline there), triggered by
 * its own mount timer (same requestAnimationFrame-after-mount technique as
 * reveal-on-mount.tsx) rather than sharing project-detail-reveal.tsx's own
 * `revealed` flag — this is a self-contained flourish independent of the
 * page's own background/slide entrance timing.
 */
export function ProjectTitleScramble({ text, className }: { text: string; className?: string }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setActive(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return <ScrambleText text={text} active={active} className={className} />;
}
