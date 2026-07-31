"use client";

import { useEffect, useRef } from "react";
import { withBasePath } from "@/lib/base-path";

/**
 * Live-tunable parameters, exposed on `window.andmadeDissolve` while the egg
 * runs — per direct follow-up ("コンソールで調整できるようにしてほしい").
 * Every field is read fresh each frame, so DevTools edits apply immediately:
 *
 *   andmadeDissolve.stepAlpha = 0.5
 *   andmadeDissolve.gradient = ["#000", "#ededed", "#151515", "#fff"]
 *
 * `gradient` colors are what you SEE (dark → bright). The canvas paints
 * their inverses because it sits under the egg's white difference layer —
 * handled internally so tuning isn't a puzzle about complements.
 */
export type DissolveParams = {
  /** Logo width as a fraction of the viewport. Rebuilds on change. */
  logoWidthVw: number;
  /** Blur baked into the mark (canvas px) — the softness the gradient map
   *  carves its contour bands out of. Rebuilds on change. */
  blurPx: number;
  /** The mark's distance from the top of the window, CSS px. */
  topOffsetPx: number;
  /** Where the bleed ends: this far above the bottom of the window, CSS px. */
  bottomOffsetPx: number;
  /** Vertical interval between the bleed's echo copies, CSS px. */
  stepPx: number;
  /** Opacity of the bleed's copies (each fades further with distance). */
  stepAlpha: number;
  /** Film grain strength 0..1 (a GPU overlay across the whole frame). */
  grain: number;
  /** Background speckle strength 0..1 (GPU overlay). */
  bgNoise: number;
  /** Cursor response: vertical bend + glow strength. */
  cursorForce: number;
  /** Frame interval, ms. */
  grainIntervalMs: number;
  /** Gradient-map stops, dark→bright, as seen on screen. A dark stop between
   *  two bright ones is what produces the contour banding. */
  gradient: string[];
  /** Whole-element opacity 0..1. (A cursor-following opacity spotlight was
   *  tried here and removed per "カーソル位置で透過変えるのは無しで".) */
  opacity: number;
};

const DEFAULT_PARAMS: DissolveParams = {
  // 0.86 → 1.05 — per direct follow-up ("背面ロゴのサイズを105%くらい大きく"):
  // wider than the viewport itself, so the mark bleeds off both side edges.
  logoWidthVw: 1.05,
  blurPx: 6,
  // 50/50 → 60/0 — per the same follow-up ("画面上60pxから画面下0pxまで
  // 伸ばして"): the bleed now runs all the way to the window's bottom edge.
  topOffsetPx: 60,
  bottomOffsetPx: 0,
  stepPx: 14,
  stepAlpha: 0.4,
  grain: 0.55,
  bgNoise: 0.35,
  cursorForce: 1.2,
  grainIntervalMs: 100,
  gradient: ["#000000", "#ededed", "#151515", "#ffffff"],
  opacity: 0.3,
};

const NOISE_TILE_SIZE = 512;

/**
 * The Konami easter egg's background — ONE huge ANDMADE wordmark (105% of
 * the viewport width, bleeding off both sides), 60px from the top of the
 * window, whose underside bleeds downward in stepped, fading echoes all the
 * way to the window's bottom edge — a fixed composition, per direct
 * follow-ups ("グラデーションマスクはなしにしてカーソル位置で長さが変わる
 * 見え方も無しにしよう", then "背面ロゴのサイズを105%くらい大きく / 画面上
 * 60pxから画面下0pxまで伸ばして"), which removed the previous cursor-driven
 * length and its soft cut mask. The cursor still bends the field vertically
 * and lights it up beneath the pointer — those responses were explicitly
 * kept.
 *
 * Weight (three rounds of "重い" later, the structure is now):
 * - The film grain and background speckle are GPU pattern draws, no longer
 *   part of the per-pixel loop — that loop now only reads scene alpha and
 *   writes LUT colours, roughly half its former work per pixel.
 * - The CPU pass runs ONLY when its inputs actually changed (cursor moved,
 *   tail length eased). When the pointer is still, a tick is five GPU draws
 *   and zero pixel work — the grain keeps flickering via pattern offsets.
 * - getImageData reads from a `willReadFrequently` (software) scene canvas,
 *   so it's a memcpy, not a GPU pipeline stall.
 * - The region drawImage-composites over the background (see below), so the
 *   loop skips unlit pixels entirely (alpha 0 instead of computing bg).
 *
 * The rectangular seam ("ロゴの周りに四角のノイズ枠") came from the previous
 * version computing its own background *inside* the processed region with a
 * formula that ONLY approximately matched the GPU pattern outside it. Now
 * the region's unlit pixels stay transparent and the result is composited
 * with drawImage (which blends, unlike putImageData), so the background is
 * one seamless pass everywhere — there is no boundary to see.
 *
 * Colour under inversion: the LUT is inverted at build time (this sits under
 * the egg's white difference layer), so `gradient` is the palette as seen.
 *
 * Stacking (`fixed inset-0 -z-10`) and lifecycle (egg-mounted only, full
 * teardown, every failure path renders nothing) unchanged — see KonamiGlitch.
 */
export function KonamiDissolveLogo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const params: DissolveParams = { ...DEFAULT_PARAMS, gradient: [...DEFAULT_PARAMS.gradient] };
    const w = window as Window & { andmadeDissolve?: DissolveParams };
    w.andmadeDissolve = params;
    console.info(
      "%c[Konami Dissolve] window.andmadeDissolve で調整できます (発動中のみ・即時反映)",
      "color:#ff2d78",
      "\n例: andmadeDissolve.stepAlpha=0.5; andmadeDissolve.grain=0.7;\n    andmadeDissolve.gradient=['#000','#ededed','#151515','#fff'] (画面で見える色・暗→明)\n",
      params
    );

    let disposed = false;
    let frame: number | null = null;
    let lastRoll = 0;

    let width = 0;
    let height = 0;
    let logoBitmap: HTMLCanvasElement | null = null;
    let builtLogoWidthVw = 0;
    let builtBlurPx = -1;
    let scene: HTMLCanvasElement | null = null;
    let sceneCtx: CanvasRenderingContext2D | null = null;
    /** Region-sized staging canvas — the CPU pass renders the LUT-mapped
     *  texture here, then gets composited (with grain etched in). */
    let staging: HTMLCanvasElement | null = null;
    let stagingCtx: CanvasRenderingContext2D | null = null;
    /** Region-sized scratch canvas: staging + grain (source-atop), rebuilt
     *  on the GPU each composite so the flickering grain never needs a CPU
     *  pass of its own. */
    let masked: HTMLCanvasElement | null = null;
    let maskedCtx: CanvasRenderingContext2D | null = null;
    let out: ImageData | null = null;
    /** Fingerprint of the last CPU pass's inputs — when unchanged, the pass
     *  is skipped and the staging canvas reused as-is. */
    let lastPassKey = "";
    /** Composite bookkeeping — a frame only redraws when something moved. */
    let forceComposite = false;
    let lastComposedBucket = -1;

    let darkPattern: CanvasPattern | null = null;
    let lightPattern: CanvasPattern | null = null;

    // Eased cursor, canvas coordinates — starts centred (neutral).
    let mouseX = 0;
    let mouseY = 0;
    let mouseTargetX = 0;
    let mouseTargetY = 0;

    const logo = new Image();
    // withBasePath — new Image() の src は Next が書き換えない文字列
    // （lib/base-path.ts 参照）。
    logo.src = withBasePath("/andmade-logo.svg");

    function hash(x: number, y: number, seed: number) {
      let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }

    /** One speckle tile, two patterns: dark speckles brighten the screen's
     *  background once inverted; light speckles etch grain into the mark's
     *  brights. Alpha carries the per-pixel noise. */
    function buildPattern(colorValue: number): CanvasPattern | null {
      const tile = document.createElement("canvas");
      tile.width = NOISE_TILE_SIZE;
      tile.height = NOISE_TILE_SIZE;
      const tctx = tile.getContext("2d");
      if (!tctx) return null;
      const img = tctx.createImageData(NOISE_TILE_SIZE, NOISE_TILE_SIZE);
      for (let i = 0; i < NOISE_TILE_SIZE * NOISE_TILE_SIZE; i += 1) {
        img.data[i * 4] = colorValue;
        img.data[i * 4 + 1] = colorValue;
        img.data[i * 4 + 2] = colorValue;
        img.data[i * 4 + 3] = (hash(i % NOISE_TILE_SIZE, (i / NOISE_TILE_SIZE) | 0, colorValue + 1) * 256) | 0;
      }
      tctx.putImageData(img, 0, 0);
      return ctx!.createPattern(tile, "repeat");
    }
    darkPattern = buildPattern(0);
    lightPattern = buildPattern(255);

    /** 256-entry gradient LUT, inverted for the difference layer. */
    function buildLut(stops: string[]): Uint8ClampedArray {
      const lut = new Uint8ClampedArray(256 * 3);
      const parsed = stops.map((hex) => {
        const s = hex.replace("#", "");
        const v = s.length === 3 ? s.split("").map((ch) => ch + ch).join("") : s;
        const n = parseInt(v, 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      });
      const last = Math.max(1, parsed.length - 1);
      for (let i = 0; i < 256; i += 1) {
        const t = (i / 255) * last;
        const lo = Math.min(last, Math.floor(t));
        const hi = Math.min(last, lo + 1);
        const f = t - lo;
        for (let ch = 0; ch < 3; ch += 1) {
          const value = parsed[lo][ch] + (parsed[hi][ch] - parsed[lo][ch]) * f;
          lut[i * 3 + ch] = 255 - value;
        }
      }
      return lut;
    }

    const rebuildLogo = () => {
      if (!logo.complete || logo.naturalWidth === 0) return;
      const logoWidth = Math.max(1, Math.floor(width * params.logoWidthVw));
      const logoHeight = Math.max(1, Math.floor(logoWidth * (logo.naturalHeight / logo.naturalWidth)));
      const pad = Math.ceil(params.blurPx * 2);
      const bmp = document.createElement("canvas");
      bmp.width = logoWidth + pad * 2;
      bmp.height = logoHeight + pad * 2;
      const bctx = bmp.getContext("2d");
      if (bctx) {
        bctx.filter = params.blurPx > 0 ? `blur(${params.blurPx}px)` : "none";
        bctx.drawImage(logo, pad, pad, logoWidth, logoHeight);
      }
      logoBitmap = bmp;
      builtLogoWidthVw = params.logoWidthVw;
      builtBlurPx = params.blurPx;
      lastPassKey = "";
    };

    const rebuild = () => {
      if (disposed) return;
      width = Math.max(1, window.innerWidth);
      height = Math.max(1, window.innerHeight);
      canvas.width = width;
      canvas.height = height;
      scene = document.createElement("canvas");
      scene.width = width;
      scene.height = height;
      sceneCtx = scene.getContext("2d", { willReadFrequently: true });
      staging = null;
      stagingCtx = null;
      out = null;
      lastPassKey = "";
      mouseX = mouseTargetX = width / 2;
      mouseY = mouseTargetY = height / 2;
      rebuildLogo();
    };

    const render = (now: number) => {
      frame = requestAnimationFrame(render);
      if (!logoBitmap || !sceneCtx || !scene) return;

      if (params.logoWidthVw !== builtLogoWidthVw || params.blurPx !== builtBlurPx) rebuildLogo();
      if (!logoBitmap || !sceneCtx) return;

      canvas.style.opacity = String(Math.max(0, Math.min(1, params.opacity)));

      // Cursor easing runs every rAF so the bend/glow trail smoothly.
      mouseX += (mouseTargetX - mouseX) * 0.06;
      mouseY += (mouseTargetY - mouseY) * 0.06;

      // ── Geometry — fixed composition ────────────────────────────────────
      const lw = logoBitmap.width;
      const lh = logoBitmap.height;
      const cx = Math.floor((width - lw) / 2);
      const topY = Math.floor(params.topOffsetPx);
      const step = Math.max(4, params.stepPx);
      // The bleed runs from the mark down to bottomOffsetPx above the
      // window's bottom edge.
      const tailLen = Math.max(0, height - params.bottomOffsetPx - (topY + lh));
      const tailCount = Math.floor(tailLen / step);

      const reach = Math.ceil(params.cursorForce * 32) + 4;
      const rx = Math.max(0, cx - reach);
      const ry = Math.max(0, topY - reach);
      const rw = Math.min(width - rx, lw + reach * 2);
      const rh = Math.min(height - ry, lh + tailCount * step + reach * 2);
      if (rw <= 0 || rh <= 0) return;

      // ── CPU pass — only when inputs changed, at most once per grain
      //    interval. The composition is fixed (no length animation), so in
      //    practice this runs only while the cursor is moving. ─────────────
      const passKey = [
        Math.round(mouseX / 3),
        Math.round(mouseY / 3),
        params.stepAlpha,
        params.stepPx,
        params.topOffsetPx,
        params.bottomOffsetPx,
        params.cursorForce,
        params.gradient.join(","),
      ].join("|");

      if (passKey !== lastPassKey && now - lastRoll >= params.grainIntervalMs) {
        lastRoll = now;
        lastPassKey = passKey;
        const lut = buildLut(params.gradient);

        sceneCtx.clearRect(rx, ry, rw, rh);
        for (let i = tailCount; i >= 1; i -= 1) {
          sceneCtx.globalAlpha =
            Math.max(0, Math.min(1, params.stepAlpha)) * (1 - i / (tailCount + 1));
          sceneCtx.drawImage(logoBitmap, cx, topY + i * step);
        }
        sceneCtx.globalAlpha = 1;
        sceneCtx.drawImage(logoBitmap, cx, topY);

        const src = sceneCtx.getImageData(rx, ry, rw, rh).data;

        // Cursor bend + glow (separable gaussians, vertical only).
        const bulge = params.cursorForce * 32;
        const sigma2 = 2 * Math.pow(150, 2);
        const dirY = (mouseY - height / 2) / (height / 2);
        const colShiftY = new Float32Array(rw);
        const colGlow = new Float32Array(rw);
        const rowGlow = new Float32Array(rh);
        for (let x = 0; x < rw; x += 1) {
          const g = Math.exp(-Math.pow(rx + x - mouseX, 2) / sigma2);
          colShiftY[x] = g * bulge * dirY;
          colGlow[x] = g;
        }
        for (let y = 0; y < rh; y += 1) {
          rowGlow[y] = Math.exp(-Math.pow(ry + y - mouseY, 2) / sigma2);
        }
        const glowStrength = params.cursorForce * 90;

        if (!staging || staging.width !== rw || staging.height !== rh) {
          staging = document.createElement("canvas");
          staging.width = rw;
          staging.height = rh;
          stagingCtx = staging.getContext("2d");
          masked = document.createElement("canvas");
          masked.width = rw;
          masked.height = rh;
          maskedCtx = masked.getContext("2d");
          out = null;
        }
        if (!stagingCtx) return;
        if (!out) out = stagingCtx.createImageData(rw, rh);

        const data = out.data;
        data.fill(0); // unlit pixels stay transparent — the background shows through
        let di = 0;
        for (let y = 0; y < rh; y += 1) {
          const rg = rowGlow[y];
          for (let x = 0; x < rw; x += 1, di += 4) {
            const sy = (y + colShiftY[x]) | 0;
            if (sy < 0 || sy >= rh) continue;
            const a = src[(sy * rw + x) * 4 + 3];
            if (a <= 2) continue;
            let value = a + (((rg * colGlow[x] * glowStrength * a) / 255) | 0);
            if (value > 255) value = 255;
            const c = value * 3;
            data[di] = lut[c];
            data[di + 1] = lut[c + 1];
            data[di + 2] = lut[c + 2];
            data[di + 3] = 255;
          }
        }
        stagingCtx.putImageData(out, 0, 0);
        forceComposite = true; // repaint with the fresh texture
      }

      // ── Composite (all GPU) — runs when the texture or the grain tick
      //    changed; otherwise the frame is already on screen. ──────────────
      const bucket = (now / params.grainIntervalMs) | 0;
      if (!forceComposite && bucket === lastComposedBucket) return;
      forceComposite = false;
      lastComposedBucket = bucket;

      const lut0 = buildLut(params.gradient);
      const ox = (bucket * 97) & (NOISE_TILE_SIZE - 1);
      const oy = (bucket * 61) & (NOISE_TILE_SIZE - 1);
      const bg = Math.max(0, Math.min(1, params.bgNoise));
      const grain = Math.max(0, Math.min(1, params.grain));

      // Background: base colour + speckle, one seamless pass everywhere.
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgb(${lut0[0]}, ${lut0[1]}, ${lut0[2]})`;
      ctx.fillRect(0, 0, width, height);
      if (darkPattern && bg > 0) {
        ctx.save();
        ctx.globalAlpha = bg * 0.2;
        ctx.translate(-ox, -oy);
        ctx.fillStyle = darkPattern;
        ctx.fillRect(0, 0, width + NOISE_TILE_SIZE, height + NOISE_TILE_SIZE);
        ctx.restore();
      }

      // The mark: LUT texture with the flickering grain etched into it —
      // no length mask anymore, the composition is fixed (per direct
      // follow-up "グラデーションマスクはなしにして").
      if (staging && masked && maskedCtx) {
        maskedCtx.clearRect(0, 0, rw, rh);
        maskedCtx.drawImage(staging, 0, 0);
        if (lightPattern && grain > 0) {
          // source-atop: the grain only lands on the mark's own pixels,
          // etching its brights the way the in-loop version did — per direct
          // follow-up ("ノイズ感はさっきのほうが良かった"): a whole-frame
          // overlay fogged the background instead.
          maskedCtx.save();
          maskedCtx.globalCompositeOperation = "source-atop";
          maskedCtx.globalAlpha = grain * 0.45;
          maskedCtx.translate(-oy, -ox);
          maskedCtx.fillStyle = lightPattern;
          maskedCtx.fillRect(0, 0, rw + NOISE_TILE_SIZE, rh + NOISE_TILE_SIZE);
          maskedCtx.restore();
        }
        ctx.drawImage(masked, rx, ry);
      }
      ctx.globalAlpha = 1;
    };

    function handleMouse(event: MouseEvent) {
      mouseTargetX = event.clientX;
      mouseTargetY = event.clientY;
    }

    let resizeTimer: number | null = null;
    function handleResize() {
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(rebuild, 200);
    }

    logo.decode().then(
      () => {
        if (disposed) return;
        rebuild();
        frame = requestAnimationFrame(render);
      },
      () => {
        /* logo failed to load — render nothing, egg unaffected */
      }
    );
    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", handleMouse, { passive: true });

    return () => {
      disposed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouse);
      if (w.andmadeDissolve === params) delete w.andmadeDissolve;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 hidden h-full w-full lg:block"
    />
  );
}
