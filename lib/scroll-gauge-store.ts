/**
 * Tiny external store letting a page suppress the scroll-progress gauge
 * (components/scroll-progress-gauge.tsx) — same "store, not a prop" reasoning
 * as lib/menu-theme-store.ts and lib/footer-mode-store.ts: the gauge is a
 * persistent singleton mounted once in app/layout.tsx, with no stable
 * prop-passing relationship to whichever page is mounted under it.
 *
 * app/not-found.tsx is the only writer, and only because a 404 can't be
 * recognised by pathname: Next.js renders not-found for whatever URL was
 * requested, so a bad project slug arrives as `/projects/whatever` and would
 * otherwise satisfy the gauge's own /projects/ allowlist (see gaugeModeFor
 * there). The 404 page saying so directly is the only reliable signal.
 *
 * Resets to `false` on the writing page's own unmount, same convention as the
 * other two stores, so navigating away can't leave the gauge suppressed on
 * whatever mounts next.
 */
type Listener = () => void;

let gaugeSuppressed = false;
const listeners = new Set<Listener>();

export function setScrollGaugeSuppressed(value: boolean) {
  if (gaugeSuppressed === value) return;
  gaugeSuppressed = value;
  listeners.forEach((listener) => listener());
}

export function subscribeScrollGaugeSuppressed(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getScrollGaugeSuppressed() {
  return gaugeSuppressed;
}

/** useSyncExternalStore's own getServerSnapshot — SSR always reads `false`
 *  (which page is mounted is a client-only concept), mirroring
 *  getLightMenuPillServerSnapshot. */
export function getScrollGaugeSuppressedServerSnapshot() {
  return false;
}
