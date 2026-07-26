"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useLenis } from "lenis/react";

/**
 * Lenis (smooth-scroll.tsx) is created once in the root layout and persists
 * across client-side route changes (it isn't torn down/recreated per page).
 * It computes its scrollable height/limit from the document, but swapping
 * in a differently-tall page via Next.js navigation isn't itself a
 * "resize" — so without this, the *previous* page's scroll limit can stick
 * around and cap how far the new page actually scrolls (e.g. bouncing back
 * partway down a taller/shorter page after navigating to it repeatedly).
 * Calling `resize()` after every route change keeps Lenis's measurements in
 * sync with whatever's actually mounted. The rAF gives the new page one
 * paint to lay out before Lenis re-measures.
 */
export function LenisRouteResize() {
  const pathname = usePathname();
  const lenis = useLenis();

  useEffect(() => {
    const frame = requestAnimationFrame(() => lenis?.resize());
    return () => cancelAnimationFrame(frame);
  }, [pathname, lenis]);

  return null;
}
