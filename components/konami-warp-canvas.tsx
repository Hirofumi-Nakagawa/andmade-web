"use client";

import { useEffect, useRef } from "react";
import { rasterizeText, type TextRaster } from "@/lib/text-raster";

/** Marks the element whose text gets handed to the shader. Set on the project
 *  list's own <ul> (components/project-list.tsx) — queried rather than passed
 *  as a ref so this can stay mounted at the layout level without every
 *  component in between having to forward one. */
export const KONAMI_WARP_TARGET_ATTRIBUTE = "data-konami-warp";

/** Horizontal breathing room baked into the texture, CSS px per side, so the
 *  shader can shove glyphs sideways without running out of texture to sample.
 *  Comfortably larger than the 3px chromatic split. */
const TEXTURE_PAD_X = 72;

/** Vertical breathing room, CSS px per side. Must be ≥ CLAMP_MARGIN_Y so
 *  even the first row's sampling window stays inside the texture — the tilt
 *  displaces sampling vertically, and past the texture's real edge
 *  CLAMP_TO_EDGE repeats the edge row forever, which smeared the top row's
 *  glyph stems into tall vertical bars (the "バーコード状" corruption
 *  reported since the vertical tilt landed; see lib/text-raster.ts's own
 *  padY note). */
const TEXTURE_PAD_Y = 32;

/** The trail's furthest step, CSS px at full strength — the per-card quads
 *  are expanded by this (plus slack) so the trail has room to draw. Must
 *  match the largest ghost offset in the fragment shader.
 *
 *  (The per-card tilt that used to accompany the trail — several rounds of
 *  direction/axis tuning — was removed outright per direct follow-up
 *  "スクロール時の一覧の傾斜は無しにして". The trail and chromatic split
 *  remain.) */
const TRAIL_MAX_PX = 172;

/** How far past its card each quad extends on screen. X covers the chromatic
 *  split; Y covers the trail. */
const QUAD_MARGIN_X = 16;
const QUAD_MARGIN_Y = TRAIL_MAX_PX + 32;

/** How far outside its own box a card's *sampling* may reach. Deliberately
 *  much tighter than the quad margins: sampling is what keeps each card's
 *  ghosts sourced from its own glyphs — anything past this reads a neighbour
 *  card's text into this card's trail. Y needs room for the shear's 12px
 *  vertical throw plus glyph ascenders that paint slightly above the
 *  text-box-trimmed card top; the next row is a full ~100px row-gap away, so
 *  24px is still nowhere near a neighbour. X only has to cover the 3px
 *  chromatic split. */
const CLAMP_MARGIN_X = 12;
const CLAMP_MARGIN_Y = 24;

/** How long the intensity must sit at exactly 0 before the canvas hands the
 *  list back to the real DOM (see the component doc comment for why it hands
 *  back at all). Short enough that hover comes back the moment scrolling
 *  feels finished, long enough that the flicker of a momentary v=0 sample
 *  mid-gesture doesn't cause a swap-thrash. */
const REST_HANDOFF_MS = 200;

/** A second capture this long after adopting a target. The list re-runs its
 *  scramble-in reveal whenever it remounts (Img→Txt toggle), so a capture
 *  taken immediately freezes mid-scramble glyphs; this one catches the
 *  settled text. Cheap, so it runs unconditionally. */
const SETTLE_RECAPTURE_MS = 1800;

/** Re-rasterising is comparatively expensive (a few hundred Range
 *  measurements), and a drag-resize fires continuously, so it waits for the
 *  gesture to settle. */
const RESIZE_DEBOUNCE_MS = 250;

const VERTEX_SHADER = `
attribute vec2 aPos;
uniform vec4 uRect;
/** This quad's texture footprint, matching uRect corner for corner:
 *  (u at left, v at bottom, u at right, v at top). The flip between
 *  top-to-bottom texture rows and bottom-to-top clip space is baked into the
 *  values themselves, so no axis flip is needed here. */
uniform vec4 uUvQuad;
varying vec2 vUv;
void main() {
  vUv = mix(uUvQuad.xy, uUvQuad.zw, aPos);
  vec2 clip = mix(uRect.xy, uRect.zw, aPos);
  gl_Position = vec4(clip, 0.0, 1.0);
}
`;

/**
 * Everything the CSS version of the egg does to text, plus the per-card
 * tilt. The list's real text is hidden while this draws, so its inherited
 * `text-shadow` (.konami-glitch in globals.css) goes with it — the chromatic
 * split and the four-step motion trail are reproduced here so the list keeps
 * matching the rest of the page.
 *
 * Drawn once per card, not once for the whole list — the tilt pivots on each
 * card's own centre, and sampling is clamped to each card's own box (uClamp)
 * so a card's trail is always made of its own glyphs, never a neighbouring
 * row's.
 */
const FRAGMENT_SHADER = `
precision mediump float;

varying vec2 vUv;
uniform sampler2D uTex;
uniform float uStrength;
uniform float uDir;
/** One CSS pixel in UV units on each axis — lets the trail be specified in
 *  pixels so it matches the CSS trail's own step distances exactly. */
uniform vec2 uPxToUv;
/** Sampling window for this card, (minU, minV, maxU, maxV). */
uniform vec4 uClamp;
/** V range of this card's underline bar (minV, maxV), or (-2, -1) when the
 *  card has none — ghost taps skip samples inside it. CSS text-shadow never
 *  shadows the ::after underline, only glyphs; in the texture the underline
 *  is indistinguishable alpha, and ghosting it dragged solid full-width bars
 *  up through the title text (the reported "タイトルのバグ"). The direct tap
 *  still samples it, so the underline itself renders normally. */
uniform vec2 uUnderline;

const vec3 PINK = vec3(1.0, 0.0, 0.353);
const vec3 CYAN = vec3(0.0, 0.941, 1.0);

/** Outside this card's own window there is nothing — see uClamp above. The
 *  [0,1] bound is belt-and-braces on top of that: sampling past the
 *  texture's real edge hits CLAMP_TO_EDGE, which repeats the edge row
 *  forever and smears whatever ink sits there into solid streaks. */
vec4 tap(vec2 uv) {
  if (uv.x < uClamp.x || uv.x > uClamp.z || uv.y < uClamp.y || uv.y > uClamp.w) {
    return vec4(0.0);
  }
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  return texture2D(uTex, uv);
}

/** Premultiplied source-over. */
vec4 over(vec4 dst, vec4 src) {
  return src + dst * (1.0 - src.a);
}

/** Alpha at a sample point, with this card's underline band masked out —
 *  see uUnderline above. */
float tapA(vec2 s) {
  if (s.y > uUnderline.x && s.y < uUnderline.y) return 0.0;
  return tap(s).a;
}

/** A shadow drawn at offset d shows what the source has at p - d.
 *
 *  blurPx is the CSS text-shadow blur radius this step carries in
 *  .konami-glitch (globals.css), approximated with three vertical taps.
 *  This is the piece whose absence kept getting reported as the titles
 *  "bugging out" (三度の "まだ直ってない"): with zero blur every far step
 *  renders a *crisp, fully-legible duplicate* of the glyphs, and on the
 *  list's large bold titles a stack of three sharp copies reads as broken
 *  rendering — while the same offsets with the CSS radii read as one soft
 *  smear. Blurring only vertically is deliberate: the trail travels on Y, so
 *  that's the axis a motion smear spreads on, and it halves the tap count.
 *
 *  The length-based fade keeps a ghost invisible for its first ~12px of
 *  travel: at low strength it still overlaps its own glyph, and since the
 *  glyph paints opaquely on top, all that would show is its top edge poking
 *  past the glyph as a hard sliver. */
vec4 ghost(vec2 uv, vec2 offsetPx, float blurPx, vec3 color, float alpha) {
  vec2 s = uv - offsetPx * uPxToUv;
  float attach = min(1.0, length(offsetPx) / 12.0);
  float a = tapA(s);
  if (blurPx > 0.0) {
    vec2 b = vec2(0.0, blurPx * uPxToUv.y);
    a = a * 0.4 + (tapA(s - b) + tapA(s + b)) * 0.3;
  }
  a *= alpha * uStrength * attach;
  return vec4(color * a, a);
}

void main() {
  // No tilt/shear anymore — removed per direct follow-up ("スクロール時の
  // 一覧の傾斜は無しにして"); the cards stay put and only the trail moves.
  vec2 uv = vUv;

  // Every offset scales with uStrength, like the CSS trail's own
  // calc(var(--konami-trail) * Npx): ghosts grow out of the glyphs as
  // scrolling picks up and retract back into them as it settles. (Removed
  // once per "タイトルの文字上が伸びてるゴーストはおかしいから消して",
  // restored per the follow-up "そのゴーストは残してほしい" — the artifact
  // that prompted the removal was a separate bug, not the trail.)
  float reach = uStrength;
  float dir = uDir;

  // Back to front: the far end of the trail is painted first. Offsets,
  // alphas AND blur radii all match .konami-glitch's own CSS steps —
  // 18/52/104/172px at blur 0/6/14/26 — with blurs also scaled by reach so
  // they collapse along with the offsets at rest.
  vec4 col = ghost(uv, vec2(0.0, 172.0 * dir * reach), 26.0 * reach, CYAN, 0.18);
  col = over(col, ghost(uv, vec2(0.0, 104.0 * dir * reach), 14.0 * reach, vec3(1.0), 0.30));
  col = over(col, ghost(uv, vec2(0.0, 52.0 * dir * reach), 6.0 * reach, CYAN, 0.46));
  col = over(col, ghost(uv, vec2(0.0, 18.0 * dir * reach), 0.0, PINK, 0.60));
  col = over(col, ghost(uv, vec2(-3.0 * reach, 0.0), 0.0, PINK, 0.90));
  col = over(col, ghost(uv, vec2(3.0 * reach, 0.0), 0.0, CYAN, 0.90));
  col = over(col, tap(uv));

  gl_FragColor = col;
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext) {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertex || !fragment) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  // The shaders are only ever referenced by this program from here on, so
  // they can be released immediately — the program keeps them alive itself.
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

/** One card's box, in CSS px relative to the target's own top-left corner —
 *  measured at capture time alongside the texture, so the two always agree. */
type CardRect = { x: number; y: number; w: number; h: number };

type KonamiWarpCanvasProps = {
  /** Live 0..1 scroll intensity, owned by konami-glitch.tsx — the same value
   *  that drives the CSS half, passed as a ref rather than a prop so it can
   *  change every frame without re-rendering anything. */
  intensityRef: { current: number };
  /** Live -1 / +1 trail direction, from the same place. */
  directionRef: { current: number };
};

/**
 * Draws the project list's text with chromatic ghost trails that stretch out
 * of the glyphs with scroll speed and retract as scrolling settles, while
 * the Konami easter egg runs. (A per-card tilt used to accompany this;
 * removed per "スクロール時の一覧の傾斜は無しにして".) WebGL, because the
 * browser can't hand a rendered element to a shader, so the text is re-drawn
 * to a canvas (lib/text-raster.ts) and that becomes the texture.
 *
 * The canvas only *owns* the list while it is actually moving. At rest the
 * real DOM is shown and the canvas draws nothing; the moment the intensity
 * rises the DOM is hidden (opacity, so hit-testing and layout survive) and
 * the quads take over, and once the intensity has sat at 0 for
 * REST_HANDOFF_MS it hands back — taking a fresh capture on the way out so
 * the *next* takeover starts from whatever the DOM looks like by then. Both
 * swaps happen at strength ≈ 0, where the quads are a pixel-faithful copy of
 * the DOM, so they're invisible. This is what keeps the hover plates, the
 * underline sweep and the scramble reveal alive while the egg is on (they
 * only freeze mid-scroll, where nothing is hoverable anyway), and it is also
 * the cheap path: zero GL work and zero hidden-DOM weirdness at rest.
 *
 * The target is re-resolved whenever the current one leaves the document,
 * because the Txt/Img toggle unmounts the whole list: v1 of this component
 * held on to the first <ul> it found and kept drawing its stale texture over
 * the thumbnail grid after a toggle. When no target exists (Img view) it
 * idles, clearing whatever it last drew.
 *
 * Scroll tracking needs no synchronisation: the quads are positioned from the
 * target's own getBoundingClientRect() every frame, so they follow Lenis by
 * construction rather than by mirroring its offset.
 *
 * Every failure path (no GL, shader miscompile, empty capture) leaves the
 * page fully visible and simply never engages — the CSS half of the egg still
 * applies to the visible DOM, so the list degrades to glitching like
 * everything else instead of disappearing.
 */
export function KonamiWarpCanvas({ intensityRef, directionRef }: KonamiWarpCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      // The texture arrives premultiplied (below) and the shader composites in
      // premultiplied space, so the drawing buffer has to agree.
      premultipliedAlpha: true,
      depth: false,
      stencil: false,
    });
    if (!gl) return;

    const program = createProgram(gl);
    if (!program) return;

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(program, "aPos");
    const uRect = gl.getUniformLocation(program, "uRect");
    const uUvQuad = gl.getUniformLocation(program, "uUvQuad");
    const uStrength = gl.getUniformLocation(program, "uStrength");
    const uDir = gl.getUniformLocation(program, "uDir");
    const uPxToUv = gl.getUniformLocation(program, "uPxToUv");
    const uClamp = gl.getUniformLocation(program, "uClamp");
    const uUnderline = gl.getUniformLocation(program, "uUnderline");
    const uTex = gl.getUniformLocation(program, "uTex");

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;

    let disposed = false;
    let frame: number | null = null;
    let resizeTimer: number | null = null;
    let settleTimer: number | null = null;

    /** The <ul> currently mirrored, or null in Img view. */
    let target: HTMLElement | null = null;
    /** Its inline opacity from before engage() hid it. */
    let previousOpacity = "";
    let raster: TextRaster | null = null;
    /** Card boxes measured at the same instant as the texture. */
    let cards: CardRect[] = [];
    /** True while the canvas owns the list (DOM hidden, quads drawing). */
    let engaged = false;
    let lastMovingAt = 0;
    /** Whether the drawing buffer holds anything that would need clearing. */
    let canvasDirty = false;

    const capture = () => {
      if (disposed || !target || !target.isConnected) return;
      // assumeOpaque: the texture stands in for the list's *final* state, so
      // cards mid-reveal (or not yet revealed, or hover-dimmed) are drawn at
      // full opacity rather than baked in faded — see the option's own doc
      // comment in lib/text-raster.ts for the failure this prevents.
      const next = rasterizeText(target, {
        padX: TEXTURE_PAD_X,
        padY: TEXTURE_PAD_Y,
        maxTextureSize,
        assumeOpaque: true,
      });
      if (!next) return;
      raster = next;
      const origin = target.getBoundingClientRect();
      cards = Array.from(target.children, (li) => {
        const r = li.getBoundingClientRect();
        return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
      });
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, next.canvas);
    };

    const engage = () => {
      // No raster means capture failed — stay disengaged and let the visible
      // DOM take the CSS glitch instead. Never hide text we can't draw.
      if (engaged || !target || !raster) return;
      engaged = true;
      previousOpacity = target.style.opacity;
      target.style.opacity = "0";
    };

    const disengage = () => {
      if (!engaged) return;
      engaged = false;
      if (target) target.style.opacity = previousOpacity;
      // Fresh snapshot while everything is idle (so no one feels the ~10ms),
      // baking in whatever changed since the last one — settled scramble,
      // hover leftovers, late data.
      capture();
    };

    const adopt = (next: HTMLElement | null) => {
      if (engaged && target) target.style.opacity = previousOpacity;
      engaged = false;
      target = next;
      raster = null;
      cards = [];
      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
        settleTimer = null;
      }
      if (next) {
        capture();
        settleTimer = window.setTimeout(() => {
          settleTimer = null;
          capture();
        }, SETTLE_RECAPTURE_MS);
      }
    };

    const render: FrameRequestCallback = (now) => {
      frame = requestAnimationFrame(render);

      // The Txt/Img toggle unmounts the list wholesale, so the target has to
      // be re-resolved whenever the current one is gone. querySelector on a
      // miss is sub-microsecond; not worth a MutationObserver.
      if (!target || !target.isConnected) {
        const found = document.querySelector<HTMLElement>(`[${KONAMI_WARP_TARGET_ATTRIBUTE}]`);
        if (found !== target) adopt(found);
      }

      const strength = Math.max(0, Math.min(1, intensityRef.current));
      if (strength > 0) {
        lastMovingAt = now;
        engage();
      } else if (engaged && now - lastMovingAt > REST_HANDOFF_MS) {
        disengage();
      }

      if (!engaged || !raster || !target) {
        if (canvasDirty) {
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          canvasDirty = false;
        }
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.floor(window.innerWidth * dpr);
      const height = Math.floor(window.innerHeight * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      canvasDirty = true;

      const origin = target.getBoundingClientRect();

      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1f(uStrength, strength);
      gl.uniform1f(uDir, directionRef.current || -1);
      gl.uniform2f(uPxToUv, 1 / raster.cssWidth, 1 / raster.cssHeight);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uTex, 0);

      const { padX, padY, cssWidth, cssHeight } = raster;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      for (const card of cards) {
        // Screen box, expanded so the lean and the trail have room to draw.
        const sLeft = origin.left + card.x - QUAD_MARGIN_X;
        const sRight = origin.left + card.x + card.w + QUAD_MARGIN_X;
        const sTop = origin.top + card.y - QUAD_MARGIN_Y;
        const sBottom = origin.top + card.y + card.h + QUAD_MARGIN_Y;
        if (sBottom < 0 || sTop > vh) continue;

        gl.uniform4f(
          uRect,
          (sLeft / vw) * 2 - 1,
          1 - (sBottom / vh) * 2,
          (sRight / vw) * 2 - 1,
          1 - (sTop / vh) * 2
        );
        // Same box in texture space. The texture's origin sits padX left of
        // and padY above the target's own top-left corner.
        gl.uniform4f(
          uUvQuad,
          (padX + card.x - QUAD_MARGIN_X) / cssWidth,
          (padY + card.y + card.h + QUAD_MARGIN_Y) / cssHeight,
          (padX + card.x + card.w + QUAD_MARGIN_X) / cssWidth,
          (padY + card.y - QUAD_MARGIN_Y) / cssHeight
        );
        gl.uniform4f(
          uClamp,
          (padX + card.x - CLAMP_MARGIN_X) / cssWidth,
          (padY + card.y - CLAMP_MARGIN_Y) / cssHeight,
          (padX + card.x + card.w + CLAMP_MARGIN_X) / cssWidth,
          (padY + card.y + card.h + CLAMP_MARGIN_Y) / cssHeight
        );
        // This card's underline band, ±1px for antialiasing bleed — see
        // uUnderline in the fragment shader. (-2, -1) = no underline. The
        // stored underline coordinates are texture-space (padY included),
        // the card's are target-relative — hence the padY on the card side.
        const underline = raster.underlines.find(
          (u) => u.y >= padY + card.y - 2 && u.y <= padY + card.y + card.h + 2
        );
        if (underline) {
          gl.uniform2f(uUnderline, (underline.y - 1) / cssHeight, (underline.y + underline.h + 1) / cssHeight);
        } else {
          gl.uniform2f(uUnderline, -2, -1);
        }

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    };

    function handleResize() {
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(capture, RESIZE_DEBOUNCE_MS);
    }

    // Rasterising before the real faces have swapped in would bake the
    // fallback font into the texture — the same hazard project-grid-section.tsx
    // already re-measures for. (Adoption happens inside the loop's own first
    // frame.)
    document.fonts.ready.then(() => {
      if (disposed) return;
      frame = requestAnimationFrame(render);
    });
    window.addEventListener("resize", handleResize);

    return () => {
      disposed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      window.removeEventListener("resize", handleResize);
      if (engaged && target) target.style.opacity = previousOpacity;
      // The texture is the only large allocation here and is released
      // explicitly; the context itself is deliberately left alone.
      //
      // Calling WEBGL_lose_context.loseContext() here — the obvious way to
      // free the drawing buffer early — breaks the component outright under
      // React's development double-invoke. React runs the effect, tears it
      // down, then runs it again against the *same* <canvas> element, and a
      // canvas whose context has been lost hands that same dead context back
      // to the next getContext() call. The second, real run then fails to
      // compile a program against it and silently does nothing. Each mount
      // renders a fresh canvas element in production, so the context becomes
      // garbage along with it.
      gl.deleteTexture(texture);
      gl.deleteBuffer(quad);
      gl.deleteProgram(program);
    };
  }, [intensityRef, directionRef]);

  return (
    // z-[9996] — under the inversion layer (z-[9997]) so the warped text gets
    // inverted along with everything else, and under grid-overlay.tsx's debug
    // grid. `pointer-events-none` keeps the real list underneath clickable.
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[9996] hidden h-full w-full lg:block"
    />
  );
}
