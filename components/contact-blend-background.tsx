"use client";

import { useEffect, useRef } from "react";
import { fullViewportHeightPx, installViewportHeightVar } from "@/lib/viewport-height";
import { useFadeIn } from "@/components/use-fade-in";

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
  grain: 0.06,
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

/** 背景の登場は2段階 — per direct follow-up
 *  ("aboutとcontactの背景はフェードインしてからグラデが現れるようにして"、
 *   "ノイズが乗ってる状態でフェードインして、…グラデが表示される感じ")。
 *   ① canvas 自体の opacity フェードイン（下の style）。この時点では
 *      色面は単色だが、グレインは乗っているので「紙が現れる」ように見える。
 *   ② グラデが開く（シェーダーの u_reveal）。別のクロスフェードではなく、
 *      スクロール収束(u_settle)と同じしきい値スライドを逆再生している。
 *  ②は①の途中から重ねて始める（REVEAL_DELAY_MS < FADE_MS）。 */
const FADE_MS = 450;
/** グラデの開始はフェードインと同時（遅延なし）— per direct follow-up
 *  ("フェードインとグラデの表示を同時タイミングにして")。
 *  経緯: 当初は「フェード完了後」→ 遅いので FADE_MS の 3割 → 2割 → 1割 と
 *  詰めていき、最終的に 0（同時）に落ち着いた。定数自体は残してあるので、
 *  また遅らせたくなったら値を戻すだけでよい。 */
const REVEAL_DELAY_MS = 0;
/** グラデが開き切るまでの時間。1100 → 1400 → 1150（"速度を少しだけ上げて"）。 */
const REVEAL_MS = 1150;

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
uniform float u_reveal; // 0=単色, 1=本来の色面（登場アニメ用）
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

  // 色レイヤー。しきい値を s でスライドさせることで、単色から色面が開いて
  // いく登場アニメになる — per direct follow-up ("aboutページでスクロール
  // した際にグラデが消えて単色になる逆の感じで、グラデが表示される感じに
  // したい。contactも同様")。About 側のスクロール収束(u_settle)と同じ
  // オフセット量・同じ向きで、こちらは登場時に1回だけ逆再生する。
  // s = 1 で C1 一色、s = 0 で本来の色面。
  // グレインは s に依存しないので、単色の間もノイズは乗ったまま。
  float s = 1.0 - u_reveal;
  float t1 = 0.40 - 1.2 * s;
  float t2 = 0.60 + 1.5 * s;
  float t3 = 0.70 + 1.5 * s;
  float t4 = 0.775 + 1.6 * s;
  vec3 col = mix(C0, C1, smoothstep(t1 - HW, t1 + HW, f + dn));
  col = mix(col, C2, smoothstep(t2 - HW, t2 + HW, q.x + dn) * 0.85);
  col = mix(col, C3, smoothstep(t3 - HW, t3 + HW, r.y + dn) * 0.75);
  col = mix(col, C4, smoothstep(t4 - HW4, t4 + HW4, q.y * f * 1.6 + dn) * 0.6);

  // 収束時の全面色が「コントラスト補正済みのC1もどき」にならないよう、
  // s に合わせてコントラストを 1.0 へ戻す（About と同じ扱い）。
  col = (col - 0.5) * mix(CONTRAST, 1.0, s) + 0.5;

  // 境界線(ラボと同一): 各レイヤーの境目に沿った線 + 低周波ノイズの
  // カバー率マスク(境界の5割くらいにだけ付き、付く区間は時間で移り変わる)。
  float e1 = 1.0 - smoothstep(0.0, LINE_WIDTH, abs(f + dn - t1));
  float e2 = 1.0 - smoothstep(0.0, LINE_WIDTH, abs(q.x + dn - t2));
  float e3 = 1.0 - smoothstep(0.0, LINE_WIDTH, abs(r.y + dn - t3));
  float e4 = 1.0 - smoothstep(0.0, LINE_WIDTH, abs(q.y * f * 1.6 + dn - t4));
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
  // ページ表示時のフェードイン — per direct follow-up
  // ("aboutとstudiesとcontactのページが表示されるとき、背景は
  //   フェードインで表示させて")。
  const shown = useFadeIn();

  useEffect(() => {
    // 実測値を --viewport-height に流し込む（lib/viewport-height.ts 参照）。
    // CSS 側の height: var(--viewport-height) がこれを読む。
    const uninstallViewportVar = installViewportHeightVar();
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
    const uReveal = gl.getUniformLocation(program, "u_reveal");

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
      const viewportHeight = fullViewportHeightPx();
      canvas.height = Math.max(1, Math.round(viewportHeight * dpr * SETTINGS.renderScale));
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
      // t は秒。REVEAL_DELAY_MS 待ってから REVEAL_MS かけて 0→1。
      const revealT = Math.min(Math.max((t * 1000 - REVEAL_DELAY_MS) / REVEAL_MS, 0), 1);
// s（= 1 - u_reveal）が実際に見た目を動かすのは 0.33 以下の範囲だけ
      // —— それより上ではしきい値が色の値域の外にあり、どの色も出てこない。
      //
      // ここのチューニングは2点でつまずいた:
      //  1. 素直に u_reveal を 0→1 で動かすと、時間の大半を「何も起きない
      //     0.33〜1」に使ってしまう。ease-out の指数を上げても、見える変化が
      //     さらに前へ詰まるだけだった（3 → 6 → 12 で "あまり変わってない"）。
      //  2. S_START を絞って可視範囲だけを走査させた上で指数を上げると、
      //     今度は可視範囲を通過し終わるのが早すぎて、残り時間は何も動かない
      //     ＝「急に止まってる感」になった。
      // 対処: 開始値を可視範囲の境界すぐ上まで下げ（0.42）、イージングを
      // smootherstep（6t⁵-15t⁴+10t³）にする。この曲線は t=0 と t=1 の両端で
      // 速度も加速度も 0 なので、動き出しと止まりの両方が滑らかになる。
      // 可視範囲の通過に全体の6割強を使い、最後まで動きが残る。
      const S_START = 0.36;
      // ease-out（1-(1-t)^k）。smootherstep は両端の速度が 0 になるため
      // 止まり際は滑らかになったが、開き始めまで遅くなってしまった
      // （"フェードイン途中からグラデが表示されるタイミングが遅くなった"）。
      // この式は t=0 で速度が最大、t=1 で 0 —— 開始は即時、終わりだけ滑らか。
      // 指数を 2.2 と低めにしてあるのは、高くすると動きが前に詰まって
      // 「途中で止まった」ように見えるため（12 まで上げて確認済み）。
      const eased = 1 - Math.pow(1 - revealT, 2.2);
      gl.uniform1f(uReveal, 1 - S_START * (1 - eased));
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      rafId = requestAnimationFrame(render);
    }
    render();

    return () => {
      uninstallViewportVar();
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
        // top/left のみ。`inset: 0` だと bottom も指定されることになり、
        // 明示した height と過剰指定になる（どちらが勝つかは実装依存）。
        top: 0,
        left: 0,
        width: "100vw",
        // var(--viewport-height) — lib/viewport-height.ts が JS の実測値を
        // <html> に書き込む。ビューポート系のCSS単位(svh/dvh/lvh)はこの端末では
        // すべて 664 に解決されツールバー背面に届かないことが実測で確定した
        // ため、単位ではなく実測px（モバイルでは screen.height = 812）を使う。
        // フォールバックの 100dvh は JS 実行前の一瞬と、JS 無効時のため。
        height: "var(--viewport-height, 100dvh)",
        display: "block",
        pointerEvents: "none",
        opacity: shown ? 1 : 0,
        transition: `opacity ${FADE_MS}ms ease-out`,
      }}
    />
  );
}
