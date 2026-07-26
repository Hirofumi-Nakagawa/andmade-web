"use client";

import { useEffect } from "react";

/**
 * Blocks pinch-to-zoom and double-tap-to-zoom on touch devices — per direct
 * follow-up ("スマホでピンチアウトやダブルタップで拡大ができないようにし
 * て"), then a further one after the `viewport` export alone (app/layout.tsx:
 * `maximumScale: 1, userScalable: false`) turned out not to be enough
 * ("まだピンチインアウトができるな"): WebKit (Safari on iOS) has ignored
 * `user-scalable=no`/`maximum-scale=1` in the viewport meta tag since iOS 10,
 * deliberately, for accessibility reasons — Apple made pinch-zoom always
 * available regardless of what a page's own viewport meta requests. The
 * `viewport` export is still kept (harmless, and other engines like Android
 * Chrome do still honor it), but on iOS specifically the only way left to
 * actually block the gesture is intercepting it directly in JS.
 *
 * Two separate mechanisms, since no single event covers every zoom gesture
 * on every engine:
 * - `touchmove` with more than one active touch point — a pinch gesture
 *   itself, on any touch browser. `{ passive: false }` is required for
 *   `preventDefault()` to actually have any effect here (touch listeners are
 *   passive by default in modern browsers unless explicitly opted out).
 * - `gesturestart` — a Safari/WebKit-only event fired specifically at the
 *   start of a pinch gesture (not part of the standard Touch Events spec);
 *   preventing this stops iOS Safari's own native pinch-zoom before it
 *   begins, which the touchmove listener alone doesn't reliably catch on
 *   that engine.
 *
 * Double-tap-to-zoom is separately handled by `touch-action: manipulation`
 * already applied to individual tap targets (mobile-menu.tsx's MENU pill,
 * etc.) plus the `viewport` export's own `maximumScale: 1` (which, unlike
 * pinch, Android Chrome and most non-Safari engines do still respect for
 * double-tap) — this component focuses specifically on the pinch gesture
 * gap left by iOS Safari.
 *
 * Mounted once in the root layout (see app/layout.tsx) — same "no visual
 * output, just a global side effect" pattern as LenisRouteResize.
 */
export function DisablePinchZoom() {
  useEffect(() => {
    function blockMultiTouch(event: TouchEvent) {
      if (event.touches.length > 1) event.preventDefault();
    }
    function blockGesture(event: Event) {
      event.preventDefault();
    }

    window.addEventListener("touchmove", blockMultiTouch, { passive: false });
    // gesturestart/gesturechange/gestureend aren't in the standard DOM typings
    // (WebKit-only), so these are attached via a plain string event name cast.
    window.addEventListener("gesturestart", blockGesture as EventListener);
    window.addEventListener("gesturechange", blockGesture as EventListener);

    return () => {
      window.removeEventListener("touchmove", blockMultiTouch);
      window.removeEventListener("gesturestart", blockGesture as EventListener);
      window.removeEventListener("gesturechange", blockGesture as EventListener);
    };
  }, []);

  return null;
}
