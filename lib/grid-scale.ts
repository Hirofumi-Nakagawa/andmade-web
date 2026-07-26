/**
 * --grid-scale, recomputed in JS (see the CSS custom property in
 * globals.css — must be kept in sync with that formula). Used by
 * app/page.tsx for hover-preview sizing (Tx mode).
 */
export function getGridScale() {
  return Math.max(1024 / 1440, window.innerWidth / 1440);
}
