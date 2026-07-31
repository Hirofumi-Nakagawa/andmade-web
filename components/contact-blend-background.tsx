"use client";

import { useEffect, useRef } from "react";

/**
 * Contact page's animated "colour blend" background — the second production
 * port of bg-lab.html, embedded per direct follow-up ("contactの背景をこれに
 * してみて") with the exact settings pasted from the lab's own 設定をコピー
 * output (dark 黒ベース palette). Replaces the previous image-based
 * FlowerShaderBackground embed (that component is untouched on disk, just no
 * longer rendered anywhere — same parking convention as About's own retired
 * backgrounds).
 *
 * Deliberately a separate sibling of about-blend-background.tsx rather than
 * one shared configurable component: the two pages' shaders have genuinely
 * different compiled shapes (About: settle-driven threshold slide + top
 * band + 2-octave fbm + no rotation; here: static thresholds, no top band
 * (topRange=0), 4-octave fbm, a 90°-rotated streak axis (blurAngle=180)) —
 * parameterising all of that would mean shipping every branch to both pages.
 * Retune in bg-lab.html and re-paste here.
 *
 * No scroll behavior at all (unlike About's settle) — Contact is a
 * single-viewport page; the pattern just drifts continuously.
 */

/** Verbatim from the lab's 設定をコピー JSON. blurAngle=180 rotates the
 *  streak axis 90° from the default vertical — i.e. the stretch runs
 *  horizontally — so unlike About's port the lab's rotation matrix survives
 *  here (baked as ROT below, cos/sin evaluated at build time). octaves=4 is
 *  the lab's full fbm loop, normalised by its summed amplitude 0.9375.
 *  topRange=0 disables the top colour band outright, so that block isn't
 *  ported at all. */
const SETTINGS = {
  colors: ["#000000", "#141b1f", "#002324", "#00143d", "#0b1028"],
  speed: 0.15,
  scale: 3.2,
  // warp / grain / edgeStretch はAboutの背景と同値に揃えてある — per direct
  // follow-up ("grainとにじみの伸び、揺らぎの複雑さをaboutと同じにして")。
  // 片方を触るときはもう片方(about-blend-background.tsx)も合わせること。
  warp: 1.2,
  streak: 6,
  blurAngle: 180,
  contrast: 1.1,
  cursorStrength: 0.1,
  grain: 0.07,
  grainSize: 1,
  grainFps: 12,
  renderScale: 0.7,
  // seed: random per mount (not the JSON's fixed snapshot value) — same
  // convention About's own port uses per direct follow-up there ("毎回模様は
  // ランダムになるようにして"), so every visit gets its own composition.
  edgeSoft: 0.45,
  edgeNoise: 0.01,
  edgeNoiseScale: 1,
  edgeStretch: 2,
  lineColor: "#27272a",
  lineWidth: 0.03,
  lineAlpha: 0.5,
  lineCoverage: 0.5,
} as const;

/** GLSL float literal — always with a decimal point (GLSL ES 1.00 treats
 *  `6` as an int, and int/float mixing is a compile error). */
function glf(n: number): string {
  const s = String(n);
  return s.includes(".") || s.includes("e") ? s : `${s}.0`;
}

/** "#RRGGBB" → "vec3(r, g, b)" 0..1 literal. */
function glslColor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return `vec3(${glf(Math.round(r * 1e4) / 1e4)}, ${glf(Math.round(g * 1e4) / 1e4)}, ${glf(Math.round(b * 1e4) / 1e4)})`;
}

/** The lab's rot(radians(blurAngle - 90)) matrix, evaluated at build time —
 *  mat2(c, -s, s, c) in the lab's own JS-side column order. For
 *  blurAngle=180 this is a plain 90° rotation. Rounded so the emitted GLSL
 *  literals stay short (cos(π/2) is 6.1e-17 in JS float math, not 0). */
const ROT_RAD = ((SETTINGS.blurAngle - 90) * Math.PI) / 180;
const ROT_C = Math.round(Math.cos(ROT_RAD) * 1e6) / 1e6;
const ROT_S = Math.round(Math.sin(ROT_RAD) * 1e6) / 1e6;

const VERT_SRC = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAG_SRC = `
precision highp float;
uniform vec2  u_res;
uniform float u_time;
uniform vec2  u_mouse;  // uv, 左下原点, JS側でスムージング済み
uniform float u_seed;   // ノイズ空間のオフセット — マウント毎にランダム(模様の構図が毎回変わる)

const float SPEED    = ${glf(SETTINGS.speed)};
const float SCALE    = ${glf(SETTINGS.scale)};
const float WARP     = ${glf(SETTINGS.warp)};
const float STREAK   = ${glf(SETTINGS.streak)};
const float CONTRAST = ${glf(SETTINGS.contrast)};
const float CURSOR   = ${glf(SETTINGS.cursorStrength)};
const float GRAIN     = ${glf(SETTINGS.grain)};
const float GRAIN_PX  = ${glf(SETTINGS.grainSize)};
const float GRAIN_FPS = ${glf(SETTINGS.grainFps)};
const float EDGE_NOISE    = ${glf(SETTINGS.edgeNoise)};
const float EDGE_NOISE_PX = ${glf(SETTINGS.edgeNoiseScale)};
const float EDGE_STRETCH  = ${glf(SETTINGS.edgeStretch)};
// ストリーク軸の回転(blurAngle=${SETTINGS.blurAngle} → ${SETTINGS.blurAngle - 90}度) — ラボの R = rot(radians(角度-90))。
const mat2 ROT = mat2(${glf(ROT_C)}, ${glf(-ROT_S)}, ${glf(ROT_S)}, ${glf(ROT_C)});
// smoothstep半幅: ラボの「境界の幅」edgeSoft=${SETTINGS.edgeSoft} を従来の半幅0.25/0.225に掛けたもの。
const float HW  = ${glf(0.25 * SETTINGS.edgeSoft)};
const float HW4 = ${glf(0.225 * SETTINGS.edgeSoft)};
const vec3 C0 = ${glslColor(SETTINGS.colors[0])};
const vec3 C1 = ${glslColor(SETTINGS.colors[1])};
const vec3 C2 = ${glslColor(SETTINGS.colors[2])};
const vec3 C3 = ${glslColor(SETTINGS.colors[3])};
const vec3 C4 = ${glslColor(SETTINGS.colors[4])};
const vec3 LINE_COLOR  = ${glslColor(SETTINGS.lineColor)};
const float LINE_WIDTH = ${glf(SETTINGS.lineWidth)};
const float LINE_ALPHA = ${glf(SETTINGS.lineAlpha)};
const float LINE_COVERAGE = ${glf(SETTINGS.lineCoverage)};

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i),                 hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
             u.y);
}
// ラボのfbm(octaves=4、フル)そのまま — 振幅合計0.9375で正規化。
float fbm4(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.0, 9.0);
    a *= 0.5;
  }
  return v / 0.9375;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;

  // カーソル反応(ラボと同一): 触れた場所の揺らぎだけが局所的に歪む。
  vec2 mp = u_mouse - 0.5;
  mp.x *= aspect;
  vec2 dvec = (uv - 0.5) * vec2(aspect, 1.0) - mp;
  float infl = exp(-dot(dvec, dvec) / (2.0 * 0.15 * 0.15));

  vec2 p = uv;
  p.x *= aspect;
  p += dvec * infl * CURSOR;
  p = ROT * p;            // ストリーク軸を回転(180度 = 横方向の流れ)
  p.y /= 1.0 + STREAK;
  p = p * SCALE + u_seed;

  float t = u_time * SPEED;

  // ドメインワープ2段(ラボと同一)。
  vec2 q = vec2(fbm4(p + t * 0.10),
                fbm4(p + vec2(5.2, 1.3) - t * 0.07));
  vec2 r = vec2(fbm4(p + WARP * q + vec2(1.7, 9.2) + t * 0.15),
                fbm4(p + WARP * q + vec2(8.3, 2.8) - t * 0.12));
  float f = fbm4(p + WARP * r);

  // 境界のにじみ(ディゾルブ) — グレイン座標もストリーク軸に合わせて回転+
  // 引き伸ばし(EDGE_STRETCH)するので、にじみは横方向に尾を引く。
  float eFrame = floor(u_time * GRAIN_FPS);
  vec2 egp = ROT * gl_FragCoord.xy;
  egp.y /= 1.0 + EDGE_STRETCH;
  egp = floor(egp / EDGE_NOISE_PX);
  float en = mix(hash(egp + fract(eFrame * 0.1031) * vec2(19.3, 7.7)),
                 hash(egp * 0.37 + 13.7), 0.5);
  float dn = (en - 0.5) * EDGE_NOISE;

  // 色レイヤー(ラボと同一の閾値、settleのようなスクロール連動はなし)。
  vec3 col = mix(C0, C1, smoothstep(0.40 - HW, 0.40 + HW, f + dn));
  col = mix(col, C2, smoothstep(0.60 - HW, 0.60 + HW, q.x + dn) * 0.85);
  col = mix(col, C3, smoothstep(0.70 - HW, 0.70 + HW, r.y + dn) * 0.75);
  col = mix(col, C4, smoothstep(0.775 - HW4, 0.775 + HW4, q.y * f * 1.6 + dn) * 0.6);

  col = (col - 0.5) * CONTRAST + 0.5;

  // 境界線(ラボと同一): 各レイヤーの境目に沿った線 + 低周波ノイズの
  // カバー率マスク(境界の5割くらいにだけ付き、付く区間は時間で移り変わる)。
  float e1 = 1.0 - smoothstep(0.0, LINE_WIDTH, abs(f + dn - 0.40));
  float e2 = 1.0 - smoothstep(0.0, LINE_WIDTH, abs(q.x + dn - 0.60));
  float e3 = 1.0 - smoothstep(0.0, LINE_WIDTH, abs(r.y + dn - 0.70));
  float e4 = 1.0 - smoothstep(0.0, LINE_WIDTH, abs(q.y * f * 1.6 + dn - 0.775));
  float lineM = max(max(e1, e2), max(e3, e4));
  float covN = noise(p * 1.5 + vec2(31.7, 7.9));
  lineM *= 1.0 - smoothstep(LINE_COVERAGE - 0.08, LINE_COVERAGE + 0.08, covN);
  col = mix(col, LINE_COLOR, lineM * LINE_ALPHA);

  // フィルムグレイン。
  float gFrame = floor(u_time * GRAIN_FPS);
  vec2 gp = floor(gl_FragCoord.xy / GRAIN_PX);
  float g = hash(gp + fract(gFrame * 0.1031) * vec2(37.7, 17.3)) - 0.5;
  col += g * GRAIN;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export function ContactBlendBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const glContext = (canvasEl.getContext("webgl") ?? canvasEl.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!glContext) return;

    // Re-bound with explicit non-null types — TS's narrowing from the guards
    // above doesn't extend into the nested function declarations below (same
    // pattern/reason as about-blend-background.tsx's own init effect).
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

    // Fullscreen triangle (one fewer vertex than a quad — same trick the lab
    // uses).
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, "u_res");
    const uTime = gl.getUniformLocation(program, "u_time");
    const uMouse = gl.getUniformLocation(program, "u_mouse");

    // Random composition per mount — see SETTINGS' own seed note.
    gl.uniform1f(gl.getUniformLocation(program, "u_seed"), Math.random() * 100);

    const mouseTarget: [number, number] = [0.5, 0.5];
    const mouseSmoothed: [number, number] = [0.5, 0.5];
    function handlePointerMove(e: PointerEvent) {
      mouseTarget[0] = e.clientX / window.innerWidth;
      mouseTarget[1] = 1.0 - e.clientY / window.innerHeight;
    }
    window.addEventListener("pointermove", handlePointerMove);

    function resize() {
      // renderScale (0.7, from the lab settings) shrinks the internal buffer
      // — the lab's own "軽い + タダでソフトになる" lever, kept as-tuned.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(window.innerWidth * dpr * SETTINGS.renderScale));
      canvas.height = Math.max(1, Math.round(window.innerHeight * dpr * SETTINGS.renderScale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener("resize", resize);
    resize();

    const startTime = performance.now();
    let rafId = 0;

    function render() {
      const t = (performance.now() - startTime) / 1000;
      // Same exponential smoothing constant as the lab.
      mouseSmoothed[0] += (mouseTarget[0] - mouseSmoothed[0]) * 0.04;
      mouseSmoothed[1] += (mouseTarget[1] - mouseSmoothed[1]) * 0.04;

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, t);
      gl.uniform2f(uMouse, mouseSmoothed[0], mouseSmoothed[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      rafId = requestAnimationFrame(render);
    }
    render();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100dvh",
        display: "block",
        pointerEvents: "none",
      }}
    />
  );
}
