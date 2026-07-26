"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ReactLenis, useLenis } from "lenis/react";

// Runs once, at module-evaluation time (as early as this client bundle can
// possibly run) rather than inside an effect — per direct follow-up
// ("pc,spともに毎回ページをリフレッシュする度にページ先頭から表示するよう
// にして"): browsers natively restore the previous scroll offset on a plain
// reload (and on back/forward navigation) unless told not to, which fought
// against the intended "always starts at the top" behavior. `manual` opts
// out of that restoration entirely, leaving the actual scroll position
// fully under this app's own control (see ScrollToTop below, which then
// explicitly sets it to 0 on every mount).
if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

/**
 * Forces the page to start at the very top on every mount — i.e. every
 * fresh page load/refresh (see the module-level scrollRestoration override
 * above for why the browser's own default no longer fights this) *and*
 * every client-side route change (`pathname` in the dependency array below)
 * — per direct follow-up reporting the project list and MENU both going
 * unresponsive specifically after navigating About → Top ("Aboutからトップ
 * に戻って一覧やMenuをタップするとやはり反応しない"): this component lives
 * in the root layout (mounted once, alongside SmoothScroll's own
 * `ReactLenis`, and never remounted by route changes — same as
 * site-intro.tsx), so with only `lenis` in the dependency array, this whole
 * effect only ever actually ran *once* per browser session, the moment
 * `useLenis()` first resolved a real instance early on — never again on any
 * later navigation. Next.js's own default client-side navigation *does*
 * reset the native `window` scroll position back to 0 on its own, but Lenis
 * intercepts and re-drives scrolling with its own separately-tracked virtual
 * offset, which nothing was telling to reset — landing on Top already
 * scrolled deep down (wherever About happened to be scrolled to) with
 * `lenis.scroll`/`lenis.progress` still reporting that same stale, large
 * value. mobile-home.tsx's own scroll-tick handler (`handleLenisTick`)
 * derives `activeIndex`/`footerReady` from exactly those values, so
 * everything downstream of them — which list row reads "active", whether
 * MobileMenu's footer-mode should be showing — starts out wrong the instant
 * the new page mounts, and Lenis's own next animation-frame tick is liable
 * to fight the native scroll position back toward its own stale internal
 * target rather than staying at the top Next.js just set. Re-running this
 * same reset on every `pathname` change (not just Lenis's own one-time
 * resolution) keeps the two in sync on every route change, not only the
 * very first one.
 *
 * Resets both the native `window` scroll position *and* Lenis's own internal
 * virtual-scroll state (`lenis.scrollTo(0, { immediate: true })`) — Lenis
 * intercepts and re-drives scrolling itself, so resetting only the native
 * position without also telling Lenis about it would leave its own tracked
 * offset out of sync, liable to snap back on the next scroll input. Waits
 * for `useLenis()` to actually resolve a real instance (it starts `null`,
 * populated once ReactLenis's own mount-time effect creates it) rather than
 * firing once unconditionally, so this can't race that setup and silently
 * no-op if it ran first.
 */
function ScrollToTop() {
  const lenis = useLenis();
  const pathname = usePathname();
  useEffect(() => {
    window.scrollTo(0, 0);
    lenis?.scrollTo(0, { immediate: true });
  }, [lenis, pathname]);
  return null;
}

/**
 * Site-wide inertia scrolling (matches the feel of justgowiththeflow.com).
 * Wraps the whole document scroll via Lenis's `root` mode.
 *
 * `anchors: true` is required — Lenis intercepts scroll wheel/touch input,
 * which also suppresses the browser's native instant-jump behavior for
 * `<a href="#...">` links (e.g. the footer's "Back to top", `href="#top"`)
 * without this option, so it has to explicitly opt back in to handling them.
 *
 * `lerp` controls the inertia strength (0-1, lower = smoother/more drag,
 * higher = snappier/less inertia). Lenis's default is 0.1; 0.13 here is a
 * slightly weaker/snappier feel than default, per request.
 */
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  return (
    <ReactLenis root options={{ anchors: true, lerp: 0.13 }}>
      <ScrollToTop />
      {children}
    </ReactLenis>
  );
}
