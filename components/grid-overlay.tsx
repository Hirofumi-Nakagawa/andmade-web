"use client";

import { useEffect, useState } from "react";

/**
 * Figma's layout grid spec, at the 1440px reference canvas: 24 columns,
 * 24px margin, 0px gutter. Column width = (1440 - 2*24) / 24 = 58px.
 */
const COLUMN_COUNT = 24;
const MARGIN_PX = 24;
const COLUMN_WIDTH_PX = 58;

/** SP layout grid (Figma node 975:44, "sp_index"): 12 columns, margin per
 *  globals.css's own `--sp-grid-margin` (originally 20px per spec, "グリッド
 *  は12マス...ページの両サイドマージンは20px", then 14px, then 4px, now back
 *  to 8px per direct follow-up "現状の両サイドの余白が8pxじゃなく4pxになっ
 *  てる？...余白は8pxまま" — see mobile-home.tsx's own SP_GRID_MARGIN_PX doc
 *  comment for the full history), 0px gutter. Column count only — the
 *  actual margin/width values below read directly from globals.css's own
 *  `--sp-grid-margin`/`--sp-grid-column-width`, the same variables every SP
 *  component's own left-content indent is built from (mobile-home.tsx /
 *  the SP footer), so this overlay and the real layout can never drift
 *  out of alignment with each other — including across the margin change
 *  above, which needed no update here at all (per direct follow-up,
 *  "shift+gで表示するグリッドもさっきの余白変更に合わせて修正して"): both
 *  sides already read the same variable. */
const SP_COLUMN_COUNT = 12;

/**
 * Debug grid overlay, toggled with Shift+G (same shortcut as
 * justgowiththeflow.com). Shows Figma's layout grid — PC: 24 columns, 24px
 * margin, 0px gutter, scaled with `--grid-scale` (fixed at the 1440px
 * reference size, fully fluid from 1024px up); SP: 12 columns, margin per
 * `--sp-grid-margin` (8px, see SP_COLUMN_COUNT's own doc comment above),
 * 0px gutter, fully fluid — per explicit request ("わかりやすいようにグリ
 * ッドを表示して") while fixing the SP list's own position against it. Both
 * variants share the same Shift+G visibility toggle and split at the same
 * `lg` breakpoint as the PC/SP page trees themselves (app/page.tsx). Purely
 * visual, `pointer-events-none`, safe to leave mounted in production.
 *
 * Off by default, only toggleable via Shift+G — an earlier version defaulted
 * to visible (SP layout review happens on an actual phone with no keyboard to
 * press Shift+G with), reverted per explicit follow-up ("グリッドは常時表示
 * 無しにして").
 */
export function GridOverlay() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.shiftKey && event.key.toLowerCase() === "g") {
        setVisible((current) => !current);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!visible) return null;

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-[9999] hidden lg:block" aria-hidden>
        {Array.from({ length: COLUMN_COUNT }, (_, column) => (
          <div
            key={column}
            className="absolute inset-y-0 bg-[#0022ff]/15 outline outline-1 outline-[#0022ff]/50"
            style={{
              left: `calc((${MARGIN_PX}px + ${COLUMN_WIDTH_PX}px * ${column}) * var(--grid-scale))`,
              width: `calc(${COLUMN_WIDTH_PX}px * var(--grid-scale))`,
            }}
          />
        ))}
      </div>

      <div className="pointer-events-none fixed inset-0 z-[9999] lg:hidden" aria-hidden>
        {Array.from({ length: SP_COLUMN_COUNT }, (_, column) => (
          <div
            key={column}
            className="absolute inset-y-0 bg-[#0022ff]/15 outline outline-1 outline-[#0022ff]/50"
            style={{
              left: `calc(var(--sp-grid-margin) + var(--sp-grid-column-width) * ${column})`,
              width: "var(--sp-grid-column-width)",
            }}
          />
        ))}
      </div>
    </>
  );
}
