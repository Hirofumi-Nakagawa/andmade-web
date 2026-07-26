"use client";

import { useEffect, useRef } from "react";

/**
 * Full-viewport animated film-grain overlay — a deliberately minimal spin-off
 * of flower-shader-background.tsx's own grain pass, per direct follow-up
 * ("contactと同じノイズをaboutにも適用して"): Contact's grain lives inline
 * inside FlowerShaderBackground's own fragment shader, added directly onto
 * its already-composited scene color (`color += (n - 0.5) * u_noiseIntensity`
 * in that file's `main()`) — but About went back to a plain static
 * `<Image>` (see about-background.tsx's own doc history: the shader version
 * was parked, not deleted, per "背景画像を元の静止画の状態に戻して...まだ続
 * きをどこかのタイミングでお願いするかも"), so there's no shader pass left
 * on that page to add this into inline. Reintroducing the *entire*
 * FlowerShaderBackground just for its own grain term would drag back in
 * everything About was specifically asked to move away from (melt, blur,
 * cursor reactivity, an image texture sampled through all of that) — this
 * component instead is a single-purpose WebGL canvas that does nothing but
 * grain: one hash() call pair per pixel, no texture, no mouse tracking, no
 * multi-sample loops, layered over whatever the rest of the page already
 * renders via CSS `mix-blend-mode: overlay` rather than being mixed into any
 * particular element's own color inline.
 *
 * `mix-blend-mode: overlay` (not the same additive `color +=` Contact's own
 * shader does) — CSS has no direct equivalent of adding/subtracting a signed
 * delta from arbitrary content underneath an element; `overlay` is the
 * standard technique for approximating exactly that with a plain mid-gray-
 * centered image (see e.g. this project's own app/studies/page.tsx doc
 * comment on its unrelated static noise.png tile, which uses `multiply`
 * instead — this deliberately doesn't reuse that same technique, since
 * `multiply` can only ever darken, while Contact's own noise term is signed
 * and both lightens and darkens): a pixel painted exactly `rgb(128,128,128)`
 * (this shader's own `g === 0` case) is a mathematical no-op under `overlay`
 * regardless of whatever's underneath (`overlay(base, 0.5) === base`,
 * verified directly: `base < 0.5 ? 2*base*0.5 : 1-2*(1-base)*0.5` both reduce
 * to `base`), and small deviations from that midpoint read as soft
 * lightening/darkening in either direction — closely matching what
 * Contact's own inline `+=` produces, without needing this canvas to know or
 * care what's actually rendered beneath it.
 *
 * `noiseIntensity`/`noiseScale`/`noiseFlicker` default to the exact same
 * values as flower-shader-background.tsx's own `SETTINGS` object (0.02/4.7/
 * 0.15) — per the literal follow-up asking for the *same* noise as Contact,
 * not a re-tuned one; overridable per caller if a future page wants this
 * same effect at different settings.
 */

const VERT_SRC = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAG_SRC = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_frame;
uniform float u_noiseIntensity;
uniform float u_noiseScale;
uniform float u_noiseFlicker;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

void main() {
  // Identical grain math to flower-shader-background.tsx's own FRAG_SRC
  // (grainCoord/flickerStep/n1/n2/n) — see this file's own top-level doc
  // comment for why the *output* differs (a signed delta around mid-gray,
  // composited via CSS mix-blend-mode: overlay, rather than added directly
  // to an in-shader scene color).
  vec2 grainCoord = floor(gl_FragCoord.xy / max(u_noiseScale, 1.0));
  float flickerStep = floor(u_frame * u_noiseFlicker);
  float n1 = hash(grainCoord + flickerStep * 17.0);
  float n2 = hash(grainCoord * 0.5 + 91.7 + flickerStep * 5.0);
  float n = mix(n1, n2, 0.35);
  float g = (n - 0.5) * u_noiseIntensity;
  gl_FragColor = vec4(vec3(0.5 + g), 1.0);
}
`;

const UNIFORM_NAMES = ["u_resolution", "u_frame", "u_noiseIntensity", "u_noiseScale", "u_noiseFlicker"] as const;

type GrainOverlayProps = {
  /** Matches flower-shader-background.tsx's own `SETTINGS.noiseIntensity`
   *  default (0.02) — see this file's own top-level doc comment. */
  noiseIntensity?: number;
  /** Matches flower-shader-background.tsx's own `SETTINGS.noiseScale`
   *  default (4.7) — grain "cell" size in device pixels. */
  noiseScale?: number;
  /** Matches flower-shader-background.tsx's own `SETTINGS.noiseFlicker`
   *  default (0.15) — how often (as a fraction of frames) the grain pattern
   *  jumps to a new random state. */
  noiseFlicker?: number;
  className?: string;
};

export function GrainOverlay({ noiseIntensity = 0.02, noiseScale = 4.7, noiseFlicker = 0.15, className }: GrainOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const glContext = (canvasEl.getContext("webgl") ?? canvasEl.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!glContext) return;

    const canvas: HTMLCanvasElement = canvasEl;
    const gl: WebGLRenderingContext = glContext;

    function compile(type: number, src: string) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("createShader failed");
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Shader compile error: ${info ?? "unknown"}`);
      }
      return shader;
    }

    const vs = compile(gl.VERTEX_SHADER, VERT_SRC);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uniforms: Partial<Record<(typeof UNIFORM_NAMES)[number], WebGLUniformLocation | null>> = {};
    UNIFORM_NAMES.forEach((name) => {
      uniforms[name] = gl.getUniformLocation(program, name);
    });

    function resize() {
      // Same dpr-capped-at-2, no render-scale-downscale approach as
      // flower-shader-background.tsx's own `resize()` — see that function's
      // own doc comment for why (a smaller buffer visibly softens grain).
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener("resize", resize);
    resize();

    let frame = 0;
    let rafId = 0;

    function render() {
      frame++;
      gl.uniform2f(uniforms.u_resolution ?? null, canvas.width, canvas.height);
      gl.uniform1f(uniforms.u_frame ?? null, frame);
      gl.uniform1f(uniforms.u_noiseIntensity ?? null, noiseIntensity);
      gl.uniform1f(uniforms.u_noiseScale ?? null, noiseScale);
      gl.uniform1f(uniforms.u_noiseFlicker ?? null, noiseFlicker);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      rafId = requestAnimationFrame(render);
    }
    render();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, [noiseIntensity, noiseScale, noiseFlicker]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100dvh",
        display: "block",
        pointerEvents: "none",
        mixBlendMode: "overlay",
      }}
    />
  );
}
