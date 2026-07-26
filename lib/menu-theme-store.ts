/**
 * Tiny external store letting a specific page override MobileMenu's own
 * *closed* pill color scheme — same "store, not a prop" reasoning as
 * lib/footer-mode-store.ts (see that file's own doc comment): MobileMenu is
 * a persistent singleton (mounted once in app/layout.tsx), with no stable
 * prop-passing relationship to whichever page happens to be mounted
 * underneath it at any given moment.
 *
 * app/not-found.tsx is the first (and so far only) page that needs this:
 * every other page's closed Menu pill is solid black with a
 * white "Menu" label, but the 404 page's own photo backdrop calls for the
 * opposite (white pill, black label) instead. Deliberately only covers the
 * *closed* pill — mobile-menu.tsx keeps the expanded nav panel's own black
 * background and white text unchanged regardless of this flag (that panel's
 * content — nav links, Now Playing, Inquiries/Social, copyright — is all
 * styled white-on-black throughout; retheming it too was never asked for
 * and out of scope here).
 *
 * Resets to `false` on the writing page's own unmount, same convention as
 * footerReady, so navigating away doesn't leave the light pill active on
 * whatever page mounts next before that page's own effect has a chance to
 * set its own correct value.
 */
type Listener = () => void;

let lightMenuPill = false;
const listeners = new Set<Listener>();

export function setLightMenuPill(value: boolean) {
  if (lightMenuPill === value) return;
  lightMenuPill = value;
  listeners.forEach((listener) => listener());
}

export function subscribeLightMenuPill(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLightMenuPill() {
  return lightMenuPill;
}

/** useSyncExternalStore's own getServerSnapshot — SSR/first-paint always
 *  reads `false` (never actually reached in practice here, since which page
 *  is mounted is inherently a client-only concept, but required by
 *  useSyncExternalStore's own API) — mirrors getFooterReadyServerSnapshot. */
export function getLightMenuPillServerSnapshot() {
  return false;
}
