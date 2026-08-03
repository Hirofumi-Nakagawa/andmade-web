"use client";

import { useCallback, useEffect, useRef } from "react";
import { useLenis } from "lenis/react";
import type Lenis from "lenis";
import { fullViewportHeightPx, installViewportHeightVar } from "@/lib/viewport-height";
import { useFadeIn } from "@/components/use-fade-in";

/**
 * About page's animated "colour blend" background — the production port of
 * bg-lab.html (the standalone verification tool), embedded per direct
 * follow-up ("これでabout背景にくみこんで") with the exact settings the user
 * tuned and pasted from the lab's own 設定をコピー output (see SETTINGS
 * below — including the literal seed, so the composition itself matches what
 * was approved, not just the parameters).
 *
 * Replaces the static-photo AboutBackground + flat pink #E897B4 design (that
 * component is untouched on disk, just no longer rendered — same parking
 * convention its own doc history already records for the previous shader
 * era).
 *
 * Scroll behavior — per the user's own words when asked how to integrate
 * ("スクロールしていくと、[C1]以外の要素が小さくなっていって、画面全体が
 * 徐々に[C1]になる（ノイズはそのままで）"): a `u_settle` uniform (0 at
 * the top of the page, 1 from the halfway scroll point on, same
 * fraction/easing the previous shader era's wash used) slides every colour
 * layer's own smoothstep threshold, so the *regions* the other colours
 * occupy spatially contract — contour lines receding, "elements getting
 * smaller" — rather than a flat crossfade. C1 (SETTINGS.colors[1], the
 * settle target — #36b6dd per direct follow-up "スクロールで全体が#36b6dd
 * になるように調整して") is the layer the others yield to. The top band both
 * shrinks (range → 0) and fades for the same reading. Contrast eases to 1.0
 * in step so the fully-settled screen is *exactly* C1's own literal hex,
 * not a contrast-shifted version of it. Grain is deliberately
 * NOT tied to settle at all ("ノイズはそのままで") — it keeps animating over
 * the flat colour forever.
 *
 * Everything except res/time/mouse/settle is baked into the shader as
 * compile-time constants (no per-frame uniform traffic for static values);
 * retune in bg-lab.html and re-paste here.
 */

/** Verbatim from the lab's 設定をコピー JSON (palette name dropped — the
 *  colours themselves are custom). blurAngle=90 means the streak axis is
 *  plain vertical, i.e. the lab's rotation matrix is the identity — dropped
 *  from the port entirely. octaves=2 is unrolled into fbm2() below (the
 *  lab's own loop, two iterations, same 2.03/(17,9) lacunarity constants,
 *  normalised by the summed amplitude 0.75). */
const SETTINGS = {
  colors: ["#87b1db", "#438ed0", "#dfa7da", "#85a7dd", "#d6e3f6"],
  speed: 0.15,
  scale: 3.5,
  warp: 1.2,
  streak: 3.5,
  contrast: 1.15,
  cursorStrength: 0.1,
  grain: 0.06,
  grainSize: 1,
  grainFps: 12,
  renderScale: 0.7,
  // seed: no longer a fixed lab snapshot — per direct follow-up ("毎回模様は
  // ランダムになるようにして"), a fresh Math.random() value is picked once
  // per mount instead (see the init effect below), so every visit to the
  // page gets its own composition. All other parameters stay as tuned.
  topColor: "#ebfdff",
  topRange: 0.9,
  topMix: 1,
  edgeSoft: 0.1,
  edgeNoise: 0.01,
  edgeNoiseScale: 1,
  // にじみグレインのストリーク軸(縦)方向の伸び — ラボのedgeStretch。
  edgeStretch: 2,
  // 境界線 — 色面の境目に沿って引かれる細い線(ラボの「境界線」そのまま)。
  // lineBlur=1(全ボケプロファイル)はsmoothstep(0, width)そのものなので
  // パラメータとしては焼き込まず、線マスクの式に直接現れている。
  lineColor: "#ebfdff",
  lineWidth: 0.03,
  lineAlpha: 0.5,
  lineCoverage: 0.3,
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

/** Same document-scroll fraction + easing the previous shader era's pink
 *  wash used (about-hero-background.tsx's own WASH_FULL_PROGRESS_FRACTION /
 *  PROGRESS_EASE_POWER) — settle reaches 1 at the halfway point of the whole
 *  page, with a gentle start. */
const SETTLE_FULL_PROGRESS_FRACTION = 0.5;
const SETTLE_EASE_POWER = 2;

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
uniform float u_settle; // 0=ラボそのままの見た目, 1=画面全体がC1一色(+グレイン)
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
// smoothstep半幅: ラボの「境界の幅」edgeSoft=${SETTINGS.edgeSoft} を従来の半幅0.25/0.225に掛けたもの。
const float HW  = ${glf(0.25 * SETTINGS.edgeSoft)};
const float HW4 = ${glf(0.225 * SETTINGS.edgeSoft)};
const vec3 C0 = ${glslColor(SETTINGS.colors[0])};
const vec3 C1 = ${glslColor(SETTINGS.colors[1])}; // settleで全体がこの色に収束する
const vec3 C2 = ${glslColor(SETTINGS.colors[2])};
const vec3 C3 = ${glslColor(SETTINGS.colors[3])};
const vec3 C4 = ${glslColor(SETTINGS.colors[4])};
const vec3 TOP_COLOR  = ${glslColor(SETTINGS.topColor)};
const float TOP_RANGE = ${glf(SETTINGS.topRange)};
const float TOP_MIX   = ${glf(SETTINGS.topMix)};
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
// ラボのfbm(octaves=2)を展開したもの — 2層目が細部の起伏を少しだけ足す。
// 振幅合計0.75で正規化(値域の中心が層数に依らずずれないように)。
float fbm2(vec2 p) {
  float v = 0.5 * noise(p);
  v += 0.25 * noise(p * 2.03 + vec2(17.0, 9.0));
  return v / 0.75;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  // s は「色面がどれだけ単色に寄っているか」。2つの入力を最大値で合成する:
  //   u_settle … スクロールで 0→1（グラデが縮んで C1 一色になる）
  //   u_reveal … 登場時に 0→1（1-u_reveal なので、最初は単色でそこから開く）
  // per direct follow-up ("スクロールした際にグラデが消えて単色になる逆の
  // 感じで、グラデが表示される感じにしたい") —— 別のクロスフェードを足すの
  // ではなく、収束に使っているのと同じ仕組みを逆向きに再生している。
  // グレインは s に依存しないので、単色の間もノイズは乗ったまま。
  float s = max(u_settle, 1.0 - u_reveal);

  // カーソル反応(ラボと同一): 触れた場所の揺らぎだけが局所的に歪む —
  // カーソルからのガウス減衰内でサンプル位置を放射方向に押し出す。
  vec2 mp = u_mouse - 0.5;
  mp.x *= aspect;
  vec2 dvec = (uv - 0.5) * vec2(aspect, 1.0) - mp;
  float infl = exp(-dot(dvec, dvec) / (2.0 * 0.15 * 0.15));

  vec2 p = uv;
  p.x *= aspect;
  p += dvec * infl * CURSOR;
  p.y /= 1.0 + STREAK;    // 縦ストリーク(blurAngle=90 = 回転なし)
  p = p * SCALE + u_seed;

  float t = u_time * SPEED;

  // ドメインワープ2段(ラボと同一、octaves=2 = fbm2)。
  vec2 q = vec2(fbm2(p + t * 0.10),
                fbm2(p + vec2(5.2, 1.3) - t * 0.07));
  vec2 r = vec2(fbm2(p + WARP * q + vec2(1.7, 9.2) + t * 0.15),
                fbm2(p + WARP * q + vec2(8.3, 2.8) - t * 0.12));
  float f = fbm2(p + WARP * r);

  // 境界のにじみ(ディゾルブ、ラボと同一) — フィルムグレインと同じfpsで明滅。
  // EDGE_STRETCHでグレイン座標を縦(ストリーク軸)に引き伸ばし、にじみが
  // 縦方向に尾を引くように(blurAngle=90なので回転はなし)。
  float eFrame = floor(u_time * GRAIN_FPS);
  vec2 egp = gl_FragCoord.xy;
  egp.y /= 1.0 + EDGE_STRETCH;
  egp = floor(egp / EDGE_NOISE_PX);
  float en = mix(hash(egp + fract(eFrame * 0.1031) * vec2(19.3, 7.7)),
                 hash(egp * 0.37 + 13.7), 0.5);
  float dn = (en - 0.5) * EDGE_NOISE;

  // 色レイヤー: settleで各smoothstepの中心をスライドさせ、C1「以外」の
  // 領域を空間的に収縮させる(等高線が引いていく = 要素が小さくなっていく
  // 見え方 — 全面クロスフェードとは別物)。C0はC1に食われる方向(中心を
  // 下げる)、C2/C3/C4は場の最大値の外へ(中心を上げる)。移動量は各場の
  // 値域 + にじみ幅を確実に越える大きさ。中心値は下の境界線でも使うので変数に。
  float t1 = 0.40 - 1.2 * s;
  float t2 = 0.60 + 1.5 * s;
  float t3 = 0.70 + 1.5 * s;
  float t4 = 0.775 + 1.6 * s;
  vec3 col = mix(C0, C1, smoothstep(t1 - HW, t1 + HW, f + dn));
  col = mix(col, C2, smoothstep(t2 - HW, t2 + HW, q.x + dn) * 0.85);
  col = mix(col, C3, smoothstep(t3 - HW, t3 + HW, r.y + dn) * 0.75);
  col = mix(col, C4, smoothstep(t4 - HW4, t4 + HW4, q.y * f * 1.6 + dn) * 0.6);

  // コントラストはsettleで1.0へ戻す — 収束後の全面色が「コントラスト補正
  // 済みのC1もどき」ではなく、正確にC1（settle先の指定色）そのものになるように。
  col = (col - 0.5) * mix(CONTRAST, 1.0, s) + 0.5;

  // 境界線(ラボと同一の手法): 各レイヤーのsmoothstep中心=色面の境目からの
  // 距離がLINE_WIDTH内のところに線を引く。中心値はsettleでスライド済みの
  // t1..t4を使うので、線も収縮していく境界に追従し、収束時には色面ごと
  // 消える(settle後の全面C1に線は残らない)。コントラスト適用後に乗せるので
  // 線の色は指定hexそのまま。
  float e1 = 1.0 - smoothstep(0.0, LINE_WIDTH, abs(f + dn - t1));
  float e2 = 1.0 - smoothstep(0.0, LINE_WIDTH, abs(q.x + dn - t2));
  float e3 = 1.0 - smoothstep(0.0, LINE_WIDTH, abs(r.y + dn - t3));
  float e4 = 1.0 - smoothstep(0.0, LINE_WIDTH, abs(q.y * f * 1.6 + dn - t4));
  float lineM = max(max(e1, e2), max(e3, e4));
  // カバー率(ラボと同一): 低周波ノイズでマスクし、境界の2割くらいにだけ
  // 線を残す。境目がワープで動くので線の付く区間もゆっくり移り変わる。
  float covN = noise(p * 1.5 + vec2(31.7, 7.9));
  lineM *= 1.0 - smoothstep(LINE_COVERAGE - 0.08, LINE_COVERAGE + 0.08, covN);
  col = mix(col, LINE_COLOR, lineM * LINE_ALPHA);

  // 画面上部の色帯: スクロールで範囲を縮めつつフェード(こちらも「小さく
  // なって消える」読みに合わせる)。max()はrange→0でのsmoothstep(1,1,x)の
  // ゼロ割れ回避。
  //
  // ★ ここだけ s ではなく u_settle を直接使う — per direct follow-up
  //   ("Aboutの上部の色もはフェードインと同時に表示させて")。s は
  //   u_reveal も含んだ合成値なので、それを使うと上部の色帯だけグラデと
  //   同じタイミングで遅れて出てくる。この帯は canvas のフェードインと
  //   同時に見えていてほしいので、登場アニメの影響を受けないようにする。
  //   スクロール時に縮んで消える挙動は u_settle 側でそのまま維持される。
  float topRange = TOP_RANGE * (1.0 - u_settle);
  float topM = smoothstep(1.0 - max(topRange, 0.001), 1.0, uv.y);
  col = mix(col, TOP_COLOR, topM * TOP_MIX * (1.0 - u_settle));

  // フィルムグレイン — settleに一切依存しない(「ノイズはそのままで」)。
  float gFrame = floor(u_time * GRAIN_FPS);
  vec2 gp = floor(gl_FragCoord.xy / GRAIN_PX);
  float g = hash(gp + fract(gFrame * 0.1031) * vec2(37.7, 17.3)) - 0.5;
  col += g * GRAIN;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/**
 * ステータスバー / ツールバー周辺の色を、背景のスクロール状態に追従させる。
 *
 * 背景canvas自体は lib/viewport-height.ts の実測値でツールバー背面まで
 * 届くようになったので、地色が覗く問題はそちらで解決している。これが担うのは
 * canvas が塗れない残りの部分:
 *   - `<meta name="theme-color">` … Safari がUI周辺のティントに使う
 *   - `--status-bar-mask` … 上部ステータスバーのマスク色
 *     (components/status-bar-mask.tsx)
 *   - html/body の背景色 … オーバースクロール時のラバーバンド領域
 * どれも単色しか持てないが、この背景は「上部は淡い色 → スクロールすると C1 に
 * 収束する」という決まった変化をするので、その2色間を settle で補間すれば
 * 画面の上端・下端どちらでも隣接する実際の色とほぼ一致する。
 */
const UI_COLOR_FROM = SETTINGS.topColor; // ページ上部：グラデ上端の淡い色
const UI_COLOR_TO = SETTINGS.colors[1]; // 収束先：settle 完了時の全面色

/** 直前に適用した値。同じ色を毎tick書き込んでも無駄なので差分だけ反映する。 */
let appliedUiColor: string | null = null;
/** 初回に上書きする前の theme-color。アンマウント時に戻すため保持する。 */
let previousThemeColor: string | null = null;

function mixHex(a: string, b: string, t: number): string {
  const parse = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const ch = (x: number, y: number) =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${ch(ar, br)}${ch(ag, bg)}${ch(ab, bb)}`;
}

function syncBrowserUiColor(settle: number) {
  // 1/32 に量子化 — 1pxスクロールごとに meta を書き換えると Safari 側が
  // 追従しきれずちらつくため。見た目には連続に見える粒度。
  const stepped = Math.round(Math.min(Math.max(settle, 0), 1) * 32) / 32;
  const color = mixHex(UI_COLOR_FROM, UI_COLOR_TO, stepped);
  if (color === appliedUiColor) return;
  appliedUiColor = color;

  document.documentElement.style.setProperty("--status-bar-mask", color);

  // html/body の背景色 — オーバースクロール(ラバーバンド)で見える領域。
  // canvas はビューポートに固定なので、そこを超えて引っ張られた分は
  // 文書の地色が出る。既定のクリームのままだと明らかに浮くので合わせる。
  document.documentElement.style.backgroundColor = color;
  document.body.style.backgroundColor = color;

  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) return;
  if (previousThemeColor === null) previousThemeColor = meta.getAttribute("content");
  meta.setAttribute("content", color);
}

function restoreBrowserUiColor() {
  document.documentElement.style.removeProperty("--status-bar-mask");
  document.documentElement.style.removeProperty("background-color");
  document.body.style.removeProperty("background-color");
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta && previousThemeColor !== null) meta.setAttribute("content", previousThemeColor);
  appliedUiColor = null;
  previousThemeColor = null;
}

export function AboutBlendBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // ページ表示時のフェードイン — per direct follow-up
  // ("aboutとstudiesとcontactのページが表示されるとき、背景は
  //   フェードインで表示させて")。
  const shown = useFadeIn();
  // Ref, not state — settle updates every scroll tick and is only ever read
  // inside the rAF loop below; putting it in state would re-render this
  // component (and re-run nothing useful) 60x/sec while scrolling.
  const settleRef = useRef(0);

  // useCallback — a fresh function reference every render would re-fire
  // lenis-react's own effect on every render, not just real scroll ticks —
  // same convention as every other useLenis caller in this codebase (see
  // mobile-home.tsx's own handleLenisTick doc comment for the history).
  const handleLenisScroll = useCallback((lenis: Lenis) => {
    const linear = Math.min(lenis.progress / SETTLE_FULL_PROGRESS_FRACTION, 1);
    const settle = linear ** SETTLE_EASE_POWER;
    settleRef.current = settle;
    syncBrowserUiColor(settle);
  }, []);
  const lenis = useLenis(handleLenisScroll);

  // 初期表示ぶん（スクロールする前）の1回。アンマウント時は元の色に戻す。
  useEffect(() => {
    syncBrowserUiColor(settleRef.current);
    return restoreBrowserUiColor;
  }, []);

  useEffect(() => {
    // iOS Safari only composites this page's own real pixels behind the
    // status bar / top safe area once the page has scrolled off exactly 0 —
    // ported verbatim from AboutHeroBackground/AboutBackground's own
    // identical fix (see either one's doc comment on this quirk): a 1px
    // nudge off the very top on load makes Safari show this canvas's real
    // pixels there instead of a sampled fallback colour.
    if (!CSS.supports("-webkit-touch-callout: none")) return;

    const frame = requestAnimationFrame(() => {
      if (window.scrollY === 0) {
        window.scrollTo(0, 1);
        lenis?.scrollTo(1, { immediate: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [lenis]);

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
    // pattern/reason as flower-shader-background.tsx's own init effect).
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
    const uSettle = gl.getUniformLocation(program, "u_settle");

    // Picked once per mount (i.e. once per visit to this page, since this
    // component remounts on navigation) — per direct follow-up ("毎回模様は
    // ランダムになるようにして"). Same 0..100 range the lab's own シード変更
    // button uses. Set once here, never re-uploaded per frame.
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
      // Grain/dissolve pixel sizes are computed off gl_FragCoord (buffer
      // pixels), matching what the lab showed at this same renderScale.
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
      // Same exponential smoothing constant as the lab, so the cursor warp
      // follows at the approved pace.
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
      gl.uniform1f(uSettle, settleRef.current);
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
