"use client";

import { useEffect, useState } from "react";

/**
 * The strip's exact height — one shared source for the strip itself AND the
 * scroll gauge's offset (scroll-progress-gauge.tsx), so the two can never
 * drift apart (reported once as "プログレスバーの位置とステータスバーのマスク
 * の高さが合ってない" when they used different formulas).
 *
 * The 16px floor exists for exactly one browser: iOS Safari in its
 * bottom-bar layout, where env(safe-area-inset-top) is 0 yet Safari samples
 * the page's top strip and extends it up behind the translucent status bar
 * (see the strip's own style comment). Every other browser — iOS Chrome
 * included, whose top bar is opaque — has no such ghosting, and there the
 * floor showed up as a pointless blank band above the gauge (reported as
 * "iOSのchromeだとバー上に余白ができちゃってる"). So the floor is applied
 * only when the UA is genuinely iOS Safari; everyone else gets the plain
 * env() value, which is 0 wherever there's nothing to cover.
 *
 * A hook (initial value = plain env(), corrected in an effect) rather than a
 * computed constant, because the UA isn't knowable during SSR and computing
 * it at render would make the server and client render different styles.
 */
export function useStatusBarInset(): string {
  const [inset, setInset] = useState("env(safe-area-inset-top, 0px)");
  useEffect(() => {
    const ua = navigator.userAgent;
    const isIosDevice =
      /iPhone|iPad|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    // Every iOS browser is WebKit; the non-Safari ones mark themselves in
    // the UA instead (CriOS = Chrome, FxiOS = Firefox, EdgiOS = Edge,
    // GSA = Google app, OPT = Opera).
    const isIosSafari = isIosDevice && !/CriOS|FxiOS|EdgiOS|GSA|OPT\//.test(ua);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot sync from an external system (the UA string); not derivable during render without breaking SSR hydration
    if (isIosSafari) setInset("max(env(safe-area-inset-top, 0px), 16px)");
  }, []);
  return inset;
}

/**
 * Opaque strip covering the iOS status-bar region on SP, so scrolled content
 * doesn't show through the system UI's translucent backdrop — per direct
 * follow-up with a screenshot ("SPでヘッダー上のiOSのUI背面が透けてスクロー
 * ルした要素が見えるので、マスクで見えないように隠して"): iOS Safari renders
 * the page edge-to-edge behind the translucent status bar, so list rows
 * scrolling past were legible behind the clock and signal icons.
 *
 * Height is `env(safe-area-inset-top)`: exactly the obscured region on the
 * device at hand, and 0 wherever there isn't one (desktop, Android browsers
 * with opaque chrome), where this renders as nothing. `lg:hidden` besides —
 * the report and the problem are SP-specific.
 *
 * Colour comes from `--status-bar-mask` (globals.css defaults it to the
 * site-wide cream) rather than a literal, because not every page is cream:
 * Contact is black, Studies sage, each project detail its own CMS colour.
 * Pages with their own background render <StatusBarMaskColor> below to set
 * the variable for as long as they're mounted.
 *
 * z-[70] — above the in-flow page and the site header (z-50), below
 * MobileMenu's own expanded panel; the scroll gauge starts *below* this strip
 * (its own `top: env(safe-area-inset-top)`) so the two never overlap.
 */
export function StatusBarMask() {
  const inset = useStatusBarInset();
  return (
    <div
      aria-hidden
      // zIndex inline, not a z-[70] utility — same stale-stylesheet immunity
      // as the gauge's own zIndex (see scroll-progress-gauge.tsx); the two
      // MUST resolve together or the strip covers the gauge.
      className="pointer-events-none fixed inset-x-0 top-0 lg:hidden"
      // max(env, 16px): two failure modes, one strip.
      // - When iOS lays the page out edge-to-edge (env > 0), this is the full
      //   status-bar height and physically covers that region.
      // - When the layout viewport instead starts *below* the status bar
      //   (env = 0 — observed on-device even with viewport-fit=cover), the
      //   ghosting is Safari extending the page's own top strip upward behind
      //   its translucent chrome. Nothing can paint up there, but the strip
      //   Safari samples can be controlled: these 16px of page-coloured cover
      //   at the very top mean the extension shows the page colour, not the
      //   list text scrolling past. 16px sits inside every page's own top
      //   margin (the header starts 24px+ down), so it reads as background.
      style={{
        height: inset,
        background: "var(--status-bar-mask)",
        zIndex: 70,
      }}
    />
  );
}

/**
 * Sets the mask's colour for as long as the rendering page is mounted —
 * same page-scoped store pattern as setLightMenuPill/setScrollGaugeSuppressed
 * (a CSS variable on <html> standing in for the store, since a colour is all
 * this carries). Rendered by pages whose background isn't the default cream.
 *
 * Also retints `<meta name="theme-color">` to the same colour, and this is
 * the part that actually reaches the iOS status bar: in Safari's
 * bottom-tab-bar layout the page's viewport starts *below* the status bar
 * (env(safe-area-inset-top) is 0 even with viewport-fit=cover), so the
 * ghosting reported there ("ステータスバー裏が表示されてる") is Safari
 * sampling the page behind its own translucent chrome — outside anything the
 * page can paint over. theme-color is the one control the web has over that
 * backdrop; Safari applies changes to the tag live, so a per-page retint on
 * mount works. The root default is served by app/layout.tsx's own
 * `viewport.themeColor`; this restores whatever was there on unmount.
 */
export function StatusBarMaskColor({ color }: { color: string }) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--status-bar-mask", color);

    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previous = meta?.getAttribute("content") ?? null;
    meta?.setAttribute("content", color);

    return () => {
      root.style.removeProperty("--status-bar-mask");
      if (meta && previous !== null) meta.setAttribute("content", previous);
    };
  }, [color]);
  return null;
}
