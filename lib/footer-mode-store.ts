/**
 * Tiny external store broadcasting whether the current page has scrolled to
 * (near) its own true bottom — i.e. whether MobileMenu's pill should grow
 * into footer-equivalent content (see that component's own `footerMode`
 * doc comment). Needed because MobileMenu, as of the persistence refactor
 * (mounted once in app/layout.tsx, never remounted across client-side
 * navigation — see mobile-menu.tsx's own doc comment), can no longer receive
 * this as a direct prop from whichever page component happens to be mounted
 * underneath it (mobile-home.tsx, mobile-about.tsx) — those page components
 * themselves genuinely do unmount/remount on every navigation, so there's no
 * stable prop-passing relationship between them and this now-persistent
 * singleton anymore. Each page's own Lenis-tick scroll handler calls
 * setFooterReady with its own page-specific definition of "at the bottom"
 * (see each page's own doc comment for what that means there); MobileMenu
 * subscribes via useSyncExternalStore. Every page that writes here also
 * resets it to `false` on its own unmount (see each page's own cleanup
 * effect), so navigating away mid-footerMode doesn't leave a stale `true`
 * behind for whatever page mounts next, before that page's own first real
 * scroll tick has a chance to report its own correct value.
 */
type Listener = () => void;

let footerReady = false;
const listeners = new Set<Listener>();

export function setFooterReady(value: boolean) {
  if (footerReady === value) return;
  footerReady = value;
  listeners.forEach((listener) => listener());
}

export function subscribeFooterReady(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getFooterReady() {
  return footerReady;
}

/** useSyncExternalStore's own getServerSnapshot — SSR/first-paint always
 *  reads `false` (never actually reached in practice here, since this
 *  boolean is inherently a client-only, post-scroll concept, but required by
 *  useSyncExternalStore's own API). */
export function getFooterReadyServerSnapshot() {
  return false;
}
