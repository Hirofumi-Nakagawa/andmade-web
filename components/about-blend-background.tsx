"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLenis } from "lenis/react";
import type Lenis from "lenis";
import { fullViewportHeightPx, installViewportHeightVar } from "@/lib/viewport-height";
import { useFadeIn } from "@/components/use-fade-in";
import {
  getAboutGradient,
  getAboutGradientServerSnapshot,
  resetAboutGradient,
  subscribeAboutGradient,
  type AboutGradientVariant,
} from "@/lib/about-gradient-store";

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
/** バリアント切替時のフェードアウト時間（直接の指示「切り替え時にパッと
 *  切り替わっているのでフェードアウトも加えて」）。
 *
 *  流れは「今のグラデが消える → 差し替わる → 新しいグラデが出る」。
 *  戻り（フェードイン）は FADE_MS を使い回す — ページ初回表示と同じ
 *  速さにして、切替後の出方を初回表示に揃えるため（グラデが開く
 *  REVEAL_MS もそちらに合わせて頭から再生される）。
 *  消えるほうだけ短いのは、待たされる時間を増やさないため
 *  （300ms → 200ms。直接の指示「もう少しだけ速く」）。 */
const SWITCH_FADE_OUT_MS = 200;
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

/* ============================================================================
   バリアント 2 / 3 — FV の「Change Grad. 1 2 3」で切り替わる別案
   ============================================================================
   1（上の SETTINGS / FRAG_SRC）は従来どおり一切変えていない。2 と 3 は
   bg-lab.html の B（溶け合い）/ C（水彩）モードの移植で、パラメータは
   ラボで詰めた値そのまま（Smear（虹彩・淡地）/ Bloom（水彩・暖））。

   スクロール収束（u_settle）の扱いも 1 と揃えてある — 1 が「C1 以外の色面が
   縮んで消える」のに対し、
     2 … 地（C0 = サイトの背景色）の重みを上げていく。softmax なので重みが
         上がった色が面積を広げ、最後は地一色になる
     3 … 塗る面積のしきい値を上げていく。ウォッシュが縮んで紙（C0）に戻る
   どちらも「要素が小さくなっていく」読みで、全面クロスフェードではない。
   u_reveal（登場アニメ）も 1 と同じく s = max(settle, 1 - reveal) で共有。 */

const SETTINGS_2 = {
  // 地（= settle の収束先）は #eae8e3。出発点はサイトの背景色 #f6f6f4
  // だったが、色面が淡いぶん地まで明るいと白飛びして見えるので一段
  // 濃くしてある（直接の指示）。bg-lab の Smear（虹彩・淡地）と同値。
  colors: ["#eae8e3", "#ef7fc2", "#a7b2ea", "#1fc9d4", "#f6341f"],
  speed: 0.1,
  scale: 3.5,
  warp: 2,
  streak: 2,
  contrast: 1.5,
  saturation: 1.15,
  cursorStrength: 0.15,
  // グレインだけ他バリアントの 0.06 から外して 0.08（直接の指示）。
  grain: 0.08,
  grainSize: 1,
  grainFps: 12,
  renderScale: 0.7,
  // 上部へ溶かす色は地と同じ。ここだけ明るいと画面上端が浮く。
  topColor: "#eae8e3",
  topRange: 0.5,
  topMix: 0.75,
  edgeNoise: 0.1,
  edgeNoiseScale: 2,
  edgeStretch: 4,
  bleed: 0.05,
  drip: 0.4,
  spread: 0.35,
  ground: 0.18,
  /** 混色の濁り止め。0 で素の重み付き平均（＝離れた色相が混ざるとグレーに
   *  落ちる）、1 で濁ったぶんを全部地の色へ抜く。シェーダー側の
   *  「混色の濁り止め」ブロック参照。 */
  clean: 0.85,
} as const;

const SETTINGS_3 = {
  colors: ["#fff7e5", "#ff441a", "#f352ff", "#ff75ba", "#2e93ff"],
  speed: 0.08,
  scale: 2.8,
  warp: 0.5,
  streak: 0,
  contrast: 1,
  saturation: 1,
  cursorStrength: 0.15,
  grain: 0.06,
  grainSize: 1,
  grainFps: 12,
  // 1 → 0.7（直接の指示「挙動が重い」への対処）。ラボで詰めたときは 1
  // だったが、1 だと 1440x900 / DPR2 で 5.18M ピクセルを毎フレーム塗る
  // ことになり（他バリアントは 2.54M）、ウォッシュ4枚ぶんのノイズ計算と
  // 合わさって実測 33fps まで落ちていた。0.7 で他バリアントと同じ
  // 2.54M・60fps に揃う。
  //
  // グレインの粒は内部解像度に対する大きさなので、下げると画面上では
  // 粗くなる — が、その粗さは 1 / 2 と同じ条件になるということでもある
  // （3つを並べたときの見え方は揃う）。
  renderScale: 0.7,
  topColor: "#ffffff",
  topRange: 0.5,
  topMix: 0.5,
  edgeNoise: 0.08,
  edgeNoiseScale: 1.5,
  edgeStretch: 0,
  // 0.05 → 0.14（紙をもっと多く）→ 0.19（増やしすぎたので少し戻す）。
  // いずれも直接の指示。しきい値への写像の上端は bg-lab 側で 0.78 →
  // 0.92 に広げてある（下の THR 参照）。
  coverage: 0.19,
  bloom: 0.2,
  edge: 0.2,
  opacity: 0.74,
  granule: 0.58,
  washes: 4,
  breath: 0.1,
  stack: 0.15,
  mixSharp: 0.55,
} as const;

/** バリアント2/3 で共通の前置き（ユニフォーム宣言とノイズ関数）。
 *  1 の FRAG_SRC とは別に持っている — 1 を触らずに済ませるため。 */
const COMMON_SRC = `
precision highp float;
uniform vec2  u_res;
uniform float u_time;
uniform vec2  u_mouse;
uniform float u_settle;
uniform float u_reveal;
uniform float u_seed;

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
// ラボの fbm(octaves=2) を展開したもの（1 の fbm2 と同一）。
float fbm2(vec2 p) {
  float v = 0.5 * noise(p);
  v += 0.25 * noise(p * 2.03 + vec2(17.0, 9.0));
  return v / 0.75;
}
// その色の鮮やかさ（最大成分と最小成分の差）。混色で濁ったかどうかの
// 判定に使う — グレーに寄るほど 0 に近づく。
float chroma(vec3 c) {
  return max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
}
vec3 satAdjust(vec3 c, float s) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(l), c, s);
}
`;

const FRAG_SRC_2 = `${COMMON_SRC}
const float SPEED    = ${glf(SETTINGS_2.speed)};
const float SCALE    = ${glf(SETTINGS_2.scale)};
const float WARP     = ${glf(SETTINGS_2.warp)};
const float STREAK   = ${glf(SETTINGS_2.streak)};
const float CONTRAST = ${glf(SETTINGS_2.contrast)};
const float SAT      = ${glf(SETTINGS_2.saturation)};
const float CURSOR   = ${glf(SETTINGS_2.cursorStrength)};
const float GRAIN     = ${glf(SETTINGS_2.grain)};
const float GRAIN_PX  = ${glf(SETTINGS_2.grainSize)};
const float GRAIN_FPS = ${glf(SETTINGS_2.grainFps)};
const float EDGE_NOISE    = ${glf(SETTINGS_2.edgeNoise)};
const float EDGE_NOISE_PX = ${glf(SETTINGS_2.edgeNoiseScale)};
const float EDGE_STRETCH  = ${glf(SETTINGS_2.edgeStretch)};
const float BLEED  = ${glf(SETTINGS_2.bleed)};
const float DRIP   = ${glf(SETTINGS_2.drip)};
const float SPREAD = ${glf(SETTINGS_2.spread)};
const float GROUND = ${glf(SETTINGS_2.ground)};
const float CLEAN  = ${glf(SETTINGS_2.clean)};
const vec3 C0 = ${glslColor(SETTINGS_2.colors[0])}; // 地 = settleの収束先
const vec3 C1 = ${glslColor(SETTINGS_2.colors[1])};
const vec3 C2 = ${glslColor(SETTINGS_2.colors[2])};
const vec3 C3 = ${glslColor(SETTINGS_2.colors[3])};
const vec3 C4 = ${glslColor(SETTINGS_2.colors[4])};
const vec3 TOP_COLOR  = ${glslColor(SETTINGS_2.topColor)};
const float TOP_RANGE = ${glf(SETTINGS_2.topRange)};
const float TOP_MIX   = ${glf(SETTINGS_2.topMix)};
// settle で地の重みに足す量。
// s=1 で**必ず**地一色になる必要があるので、他の色との場の差が最大
// （fbm の値域 0..1 なので 1.0）になった場合でも地が勝つ量にしてある。
// 0.45 だと、たまたま地の場が低く他の色が高い帯だけ色が残っていた
// （実測で確認）。1.3 なら差の最大 1.0 を確実に上回る。
//
// ただし softmax は指数なので、線形に足すと早々に飽和して「序盤で白く
// なり切って、あとは何も動かない」になる（1.3 を線形で足すと s=0.5 で
// 既に全面が地だった。実測で確認）。実際に見た目が動くのは 0〜0.6 あたり
// なので、s を2乗して序盤をゆるくし、終盤で確実に振り切らせる。
const float SETTLE_GROUND = 1.3;

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  float s = max(u_settle, 1.0 - u_reveal);

  vec2 mp = u_mouse - 0.5;
  mp.x *= aspect;
  vec2 dvec = (uv - 0.5) * vec2(aspect, 1.0) - mp;
  float infl = exp(-dot(dvec, dvec) / (2.0 * 0.15 * 0.15));

  vec2 p = uv;
  p.x *= aspect;
  p += dvec * infl * CURSOR;
  p.y /= 1.0 + STREAK;

  float t = u_time * SPEED;

  // 垂れ（スキージ）: 軸直交方向だけに依存するノイズを軸方向のオフセットに。
  float d = fbm2(vec2(p.x * SCALE * 0.7, t * 0.25 + 40.0));
  p.y -= (d - 0.5) * DRIP;

  vec2 q0 = p * SCALE + u_seed;
  vec2 w = vec2(fbm2(q0 + t * 0.10),
                fbm2(q0 + vec2(5.2, 1.3) - t * 0.07));
  vec2 sp = q0 + WARP * w;

  // 境界のにじみ（1 と同一の手法）。
  float eFrame = floor(u_time * GRAIN_FPS);
  vec2 egp = gl_FragCoord.xy;
  egp.y /= 1.0 + EDGE_STRETCH;
  egp = floor(egp / EDGE_NOISE_PX);
  float en = mix(hash(egp + fract(eFrame * 0.1031) * vec2(19.3, 7.7)),
                 hash(egp * 0.37 + 13.7), 0.5);
  float dn = (en - 0.5) * EDGE_NOISE;

  // 5色それぞれの場。倍率を変えて塊の大きさをばらけさせる（ラボと同一）。
  float f0 = fbm2(sp * 0.78) + dn + GROUND + SETTLE_GROUND * s * s;
  float f1 = fbm2(sp * 1.13 + vec2(11.3,  4.1)) + dn + SPREAD *  0.10;
  float f2 = fbm2(sp * 0.91 + vec2( 3.7, 19.5)) + dn + SPREAD * -0.06;
  float f3 = fbm2(sp * 1.37 + vec2(23.1,  8.8)) + dn + SPREAD *  0.04;
  // C4（このパレットでは朱）。出現量をめぐって何度か往復したので経緯を残す。
  //
  // 当初は係数 -0.12 / 倍率 0.64。倍率が小さい＝塊が大きいので、出るときは
  // 画面を縦断するような面積で出てしまい「赤が多い」。係数だけ下げて
  // (-0.30 → -0.50 → -0.40) 面積を絞ると、今度はそもそも出ないシードが
  // 増えて「あまり出ていない」。**係数は出る/出ないの頻度を動かすが、
  // 出たときの塊の大きさは倍率が決めている**ので、係数だけでは
  // 「よく出るが塊にならない」に届かなかった。
  //
  // 倍率を 0.64 → 1.30 に上げて塊そのものを小さくし、そのうえで係数を
  // 当初の -0.12 に戻してある。単体で描いて6シード分数えた結果:
  //   -0.40 / 0.64 … 平均 0.51%、出たシード 2/6（最大 2.5%）
  //   -0.12 / 0.64 … 出るときは 9.9% の塊（これが「多い」と言われた状態）
  //   -0.12 / 1.30 … 平均 1.55%、出たシード 5/6（最大 2.7%）← これ
  float f4 = fbm2(sp * 1.30 + vec2( 7.9, 31.2)) + dn + SPREAD * -0.12;

  // softmax。最大値を引いてから exp に入れる（オーバーフロー回避。引いた分は
  // 正規化で相殺されるので結果は変わらない）。
  float m = max(max(max(f0, f1), max(f2, f3)), f4);
  float w0 = exp((f0 - m) / BLEED);
  float w1 = exp((f1 - m) / BLEED);
  float w2 = exp((f2 - m) / BLEED);
  float w3 = exp((f3 - m) / BLEED);
  float w4 = exp((f4 - m) / BLEED);
  float sum = w0 + w1 + w2 + w3 + w4;
  vec3 col = (C0 * w0 + C1 * w1 + C2 * w2 + C3 * w3 + C4 * w4) / sum;

  // ---- 混色の濁り止め ----
  // 重み付き平均は RGB 上の線形補間なので、離れた色相どうし（朱と
  // ターコイズなど）が混ざると互いを打ち消してグレーに落ちる。これが
  // 「重なりが濁って汚い暗い色味になる」の正体（直接の指示）。
  //
  // 混ぜる前の鮮やかさ（各色のクロマを同じ重みで平均したもの）と、
  // 混ぜた後の鮮やかさを比べ、落ちたぶんだけ**地の色**へ寄せる。
  //   ・近い色相どうし（桃と藤）は混ぜても鮮やかさが落ちないので素通り
  //   ・遠い色相どうしはグレーではなく淡い地色に抜ける＝濁らない
  // グレーに落とすより地色に抜くほうが、色面どうしが地の上に重なって
  // 見えるぶん水彩に近い読みになる。
  float chromaBefore = (chroma(C0) * w0 + chroma(C1) * w1 + chroma(C2) * w2
                      + chroma(C3) * w3 + chroma(C4) * w4) / sum;
  float dull = clamp((chromaBefore - chroma(col)) / max(chromaBefore, 0.001), 0.0, 1.0);
  col = mix(col, C0, dull * CLEAN);

  // 何色が実際に効いているか（逆参加率）。混ざっている所ほどコントラストを
  // 弱める — 全面に均一に掛けると混色でできた中間色まで持ち上がるため。
  vec3 n0 = vec3(w0, w1, w2) / sum;
  vec2 n1 = vec2(w3, w4) / sum;
  float spread = 1.0 / max(dot(n0, n0) + dot(n1, n1), 1e-4);
  float cw = mix(CONTRAST, 1.0, clamp((spread - 1.0) / 3.0, 0.0, 1.0));
  // コントラストの軸は 0.5 ではなく**地の色 C0**。
  // 0.5 を軸にすると、明るい地色（#eae8e3 ≒ 0.92）が
  // (0.92 - 0.5) * 1.5 + 0.5 = 1.13 で振り切れて白にクリップされる —
  // 地の色を指定しても FV が真っ白に見えていたのはこれ（直接の指示
  // 「2のグラデの色も eae8e3 に」への対処）。C0 を軸にすれば地は
  // そのまま C0 で出て、他の色だけが C0 から離れる方向に開く。
  // settle では 1.0 へ戻す — 収束後の全面色が「補正済みの C0 もどき」
  // ではなく C0 そのものになるように。
  col = (col - C0) * mix(cw, 1.0, s) + C0;
  col = satAdjust(col, mix(SAT, 1.0, s));

  // 画面上部の色帯（1 と同じく u_settle のみに追従。登場アニメの影響は受けない）。
  float topRange = TOP_RANGE * (1.0 - u_settle);
  float topM = smoothstep(1.0 - max(topRange, 0.001), 1.0, uv.y);
  col = mix(col, TOP_COLOR, topM * TOP_MIX * (1.0 - u_settle));

  float gFrame = floor(u_time * GRAIN_FPS);
  vec2 gp = floor(gl_FragCoord.xy / GRAIN_PX);
  float g = hash(gp + fract(gFrame * 0.1031) * vec2(37.7, 17.3)) - 0.5;
  col += g * GRAIN;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const FRAG_SRC_3 = `${COMMON_SRC}
const float SPEED    = ${glf(SETTINGS_3.speed)};
const float SCALE    = ${glf(SETTINGS_3.scale)};
const float WARP     = ${glf(SETTINGS_3.warp)};
const float STREAK   = ${glf(SETTINGS_3.streak)};
const float CONTRAST = ${glf(SETTINGS_3.contrast)};
const float SAT      = ${glf(SETTINGS_3.saturation)};
const float CURSOR   = ${glf(SETTINGS_3.cursorStrength)};
const float GRAIN     = ${glf(SETTINGS_3.grain)};
const float GRAIN_PX  = ${glf(SETTINGS_3.grainSize)};
const float GRAIN_FPS = ${glf(SETTINGS_3.grainFps)};
const float EDGE_NOISE    = ${glf(SETTINGS_3.edgeNoise)};
const float EDGE_NOISE_PX = ${glf(SETTINGS_3.edgeNoiseScale)};
const float EDGE_STRETCH  = ${glf(SETTINGS_3.edgeStretch)};
const float BLOOM    = ${glf(SETTINGS_3.bloom)};
const float EDGE     = ${glf(SETTINGS_3.edge)};
const float OPACITY  = ${glf(SETTINGS_3.opacity)};
const float GRANULE  = ${glf(SETTINGS_3.granule)};
const float BREATH   = ${glf(SETTINGS_3.breath)};
const float STACK    = ${glf(SETTINGS_3.stack)};
const float MIX_POW  = ${glf(Math.round((1 + SETTINGS_3.mixSharp * 3) * 1e4) / 1e4)};
// 塗る面積のしきい値（ラボの mix(0.78, 0.34, coverage) を焼き込んだもの）。
const float THR = ${glf(Math.round((0.92 + (0.34 - 0.92) * SETTINGS_3.coverage) * 1e4) / 1e4)};
const int WASHES = ${SETTINGS_3.washes};
const vec3 C0 = ${glslColor(SETTINGS_3.colors[0])}; // 紙 = settleの収束先
const vec3 C1 = ${glslColor(SETTINGS_3.colors[1])};
const vec3 C2 = ${glslColor(SETTINGS_3.colors[2])};
const vec3 C3 = ${glslColor(SETTINGS_3.colors[3])};
const vec3 C4 = ${glslColor(SETTINGS_3.colors[4])};
const vec3 TOP_COLOR  = ${glslColor(SETTINGS_3.topColor)};
const float TOP_RANGE = ${glf(SETTINGS_3.topRange)};
const float TOP_MIX   = ${glf(SETTINGS_3.topMix)};
// settle でしきい値に足す量。
// しきい値が fbm の値域の上端（1.0）＋滲み幅ぶんを超えるとウォッシュが
// 完全に消えて紙だけになる。THR + これ が**ちょうど**そこに届く量にする
// ——大きすぎると途中で収束し切ってしまい、スクロールの後半は何も
// 動かない（1.2 だと s=0.2 あたりで紙になっていた。実測で確認）。
//   必要量 = 1.0 + BLOOM - THR = 1.0 + 0.2 - 0.810 ≒ 0.39
const float SETTLE_THR = 0.41;

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  float s = max(u_settle, 1.0 - u_reveal);

  vec2 mp = u_mouse - 0.5;
  mp.x *= aspect;
  vec2 dvec = (uv - 0.5) * vec2(aspect, 1.0) - mp;
  float infl = exp(-dot(dvec, dvec) / (2.0 * 0.15 * 0.15));

  vec2 p = uv;
  p.x *= aspect;
  p += dvec * infl * CURSOR;
  p.y /= 1.0 + STREAK;
  vec2 q0 = p * SCALE + u_seed;

  float t = u_time * SPEED;
  vec2 w = vec2(fbm2(q0 + t * 0.08),
                fbm2(q0 + vec2(5.2, 1.3) - t * 0.06));
  vec2 sp = q0 + WARP * w;

  float eFrame = floor(u_time * GRAIN_FPS);
  vec2 egp = gl_FragCoord.xy;
  egp.y /= 1.0 + EDGE_STRETCH;
  egp = floor(egp / EDGE_NOISE_PX);
  float en = mix(hash(egp + fract(eFrame * 0.1031) * vec2(19.3, 7.7)),
                 hash(egp * 0.37 + 13.7), 0.5);
  float dn = (en - 0.5) * EDGE_NOISE;

  // 紙の目。細かいノイズ（繊維）と粗いムラ（水たまり）を混ぜる。
  float fine   = noise(gl_FragCoord.xy / 2.5);
  float coarse = fbm2(sp * 0.6 + vec2(61.3, 17.9));
  float granule = 1.0 + (mix(fine, coarse, 0.5) - 0.5) * GRANULE * 1.2;

  // 顔料は吸収（-log(色)）の空間で、重み付き平均を取ってから一度だけ乗せる。
  // 1枚ずつ乗算していくと重なった所で吸収が青天井に積み上がって黒く潰れる。
  vec3 absorb = vec3(0.0);
  float wSum = 0.0;
  float dSum = 0.0;
  float dMax = 0.0;

  for (int i = 0; i < 4; i++) {
    if (i >= WASHES) break;

    vec2 off = vec2(13.1, 5.7) * float(i + 1) + vec2(0.0, 7.3);
    float field = fbm2(sp * (0.8 + 0.22 * float(i)) + off) + dn;

    // 呼吸（輪郭がじわじわ出入りする）＋ settle（しきい値が上がって
    // 塗り面が縮み、最後は紙だけになる）。
    float thr = THR + SETTLE_THR * s
              - BREATH * sin(u_time * SPEED * 2.0 + float(i) * 1.9);

    float b = max(BLOOM, 0.01);
    float body = smoothstep(thr - b, thr + b, field);
    // 乾き際の縁に顔料が溜まるぶん。
    float e = (field - thr) / (b * 0.75);
    float rim = exp(-e * e);
    float dens = max((body + rim * EDGE) * granule, 0.0) * OPACITY;

    vec3 pig = i == 0 ? C1 : (i == 1 ? C2 : (i == 2 ? C3 : C4));
    float ww = pow(dens, MIX_POW);
    absorb += (-log(max(pig, vec3(0.004)))) * ww;
    wSum += ww;
    dSum += dens;
    dMax = max(dMax, dens);
  }

  vec3 col = C0;  // 紙
  if (dSum > 0.0) {
    vec3 mixedAbsorb = absorb / max(wSum, 1e-5);
    float thickness = mix(dMax, dSum, STACK);
    col *= exp(-mixedAbsorb * thickness);
  }

  col = (col - 0.5) * mix(CONTRAST, 1.0, s) + 0.5;
  col = satAdjust(col, mix(SAT, 1.0, s));

  float topRange = TOP_RANGE * (1.0 - u_settle);
  float topM = smoothstep(1.0 - max(topRange, 0.001), 1.0, uv.y);
  col = mix(col, TOP_COLOR, topM * TOP_MIX * (1.0 - u_settle));

  float gFrame = floor(u_time * GRAIN_FPS);
  vec2 gp = floor(gl_FragCoord.xy / GRAIN_PX);
  float g = hash(gp + fract(gFrame * 0.1031) * vec2(37.7, 17.3)) - 0.5;
  col += g * GRAIN;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/** バリアントごとの描画設定。配列の添字は variant - 1。 */
const VARIANTS = [
  {
    frag: FRAG_SRC,
    renderScale: SETTINGS.renderScale,
    /** ページ上部（グラデ上端）の色 → 収束先の色。ブラウザUIの色に使う。 */
    uiFrom: SETTINGS.topColor,
    uiTo: SETTINGS.colors[1],
    /** 登場アニメで s をどこから動かすか（下の S_START の doc comment 参照）。 */
    sStart: 0.36,
  },
  {
    frag: FRAG_SRC_2,
    renderScale: SETTINGS_2.renderScale,
    uiFrom: SETTINGS_2.topColor,
    uiTo: SETTINGS_2.colors[0],
    // 2 / 3 は s の 0..1 全域が見た目に効く（1 のようにしきい値が色の値域の
    // 外に出て「何も起きない区間」ができる構造ではない）ので、頭から動かす。
    sStart: 1,
  },
  {
    frag: FRAG_SRC_3,
    renderScale: SETTINGS_3.renderScale,
    uiFrom: SETTINGS_3.topColor,
    uiTo: SETTINGS_3.colors[0],
    sStart: 1,
  },
] as const;

/** バリアントごとの「スクロールし切ったときの全面色」。配列の添字は
 *  variant - 1。ページ下端のオーバースクロール領域の色に使う
 *  （components/about-body-background.tsx）。VARIANTS.uiTo と同じもので、
 *  外から読む用に名前を付けて出しているだけ。 */
export const ABOUT_SETTLE_COLORS = VARIANTS.map((v) => v.uiTo);

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

// バリアントごとに「上部の色」と「収束先の色」が違うので、どちらの色の間を
// 補間するかは呼び出し側から渡す（VARIANTS の uiFrom / uiTo）。
function syncBrowserUiColor(settle: number, variant: AboutGradientVariant) {
  const { uiFrom, uiTo } = VARIANTS[variant - 1];
  // 1/32 に量子化 — 1pxスクロールごとに meta を書き換えると Safari 側が
  // 追従しきれずちらつくため。見た目には連続に見える粒度。
  const stepped = Math.round(Math.min(Math.max(settle, 0), 1) * 32) / 32;
  const color = mixHex(uiFrom, uiTo, stepped);
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

/**
 * 文書（html / body）の背景色の変化を、切替のあいだだけなめらかにする。
 *
 * 切替中は canvas の不透明度が 0 まで落ちるので、その裏の文書の地色が
 * そのまま見える。バリアントごとに地色が違うため、差し替えた瞬間に色が
 * 飛んで見えていた（直接の指示「切り替え時に背景色もフェードインで」）。
 *
 * **常時は掛けない。** この色はスクロールのたびに書き換わる値でもあり
 * （syncBrowserUiColor の doc comment 参照）、transition を付けっぱなしに
 * するとスクロールに色が遅れて付いてくる。切替のあいだだけ有効にして、
 * 終わったら外す。null で解除。
 */
function setUiColorTransition(ms: number | null) {
  const value = ms === null ? null : `background-color ${ms}ms ease-out`;
  for (const el of [document.documentElement, document.body]) {
    if (value === null) el.style.removeProperty("transition");
    else el.style.setProperty("transition", value);
  }
}

function restoreBrowserUiColor() {
  setUiColorTransition(null);
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

  // FV の「Change Grad. 1 2 3」で選ばれているバリアント。
  const variant = useSyncExternalStore(subscribeAboutGradient, getAboutGradient, getAboutGradientServerSnapshot);
  // 描画ループは下の init effect の中で一度だけ組み立てるので、そこから
  // 現在値を読むための ref。state を直接読むとループを張り直すことになり、
  // 切り替えのたびに WebGL の初期化（＝シードと経過時間のリセット）が
  // 走ってしまう。
  const variantRef = useRef<AboutGradientVariant>(variant);
  // 内部解像度がバリアントで違うので、切り替わったら resize をやり直す
  // 必要がある。その関数を init effect から預かる。
  const resizeRef = useRef<(() => void) | null>(null);
  // 切り替えのたびに「グラデが開く」登場演出をやり直す（直接の指示
  // 「切り替え時に、1が最初に表示されるときと同じようにグラデが表示される
  // 仕様に」）。ここでは予約だけして、実際の起点時刻は描画ループ側が
  // 自分の時計から入れる（同じ時計を2か所で持たないため）。
  const replayRevealRef = useRef(false);

  // 切替中（フェードアウト中）は canvas の不透明度を 0 にする。
  const [switching, setSwitching] = useState(false);
  // 初回マウントはフェードアウトしない — そこは useFadeIn による
  // ページ初回表示のフェードインが担当しているので、二重に動かさない。
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      variantRef.current = variant;
      return;
    }
    // ① まず今のグラデを消す。この間も古いバリアントを描き続ける
    //    （描画を止めると最後のフレームで固まって見える）。
    setSwitching(true);
    const timers: number[] = [];
    timers.push(window.setTimeout(() => {
      // ② 見えなくなってから差し替える。内部解像度・ブラウザUIの色・
      //    登場演出の再生予約もこのタイミングで一緒に。ここで色を変えるのは、
      //    フェードアウト中にブラウザUIだけ先に新しい色へ飛ぶのを避けるため。
      // 文書の地色も canvas と同じ FADE_MS かけて新しい色へ送る。
      // transition を**先に**立ててから色を入れること（同じタスク内なら
      // スタイルの再計算は最後に1回なので、直前の色から補間が始まる）。
      setUiColorTransition(FADE_MS);
      variantRef.current = variant;
      resizeRef.current?.();
      replayRevealRef.current = true;
      syncBrowserUiColor(settleRef.current, variant);
      // ③ 戻す。下の style が opacity 1 / FADE_MS に切り替わる。
      setSwitching(false);
    }, SWITCH_FADE_OUT_MS));
    // フェードインが終わったら transition を外す — スクロール追従の色が
    // 遅れないように（setUiColorTransition の doc comment 参照）。
    timers.push(window.setTimeout(() => setUiColorTransition(null), SWITCH_FADE_OUT_MS + FADE_MS + 60));
    // 連打された場合は前の予約を捨てて測り直す（不透明度は 0 のまま）。
    return () => timers.forEach(window.clearTimeout);
  }, [variant]);

  // About を離れたら 1 に戻す（lib/about-gradient-store.ts の doc comment
  // 参照 — モジュールスコープの値はクライアント遷移をまたいで生き残るため）。
  useEffect(() => resetAboutGradient, []);

  // useCallback — a fresh function reference every render would re-fire
  // lenis-react's own effect on every render, not just real scroll ticks —
  // same convention as every other useLenis caller in this codebase (see
  // mobile-home.tsx's own handleLenisTick doc comment for the history).
  const handleLenisScroll = useCallback((lenis: Lenis) => {
    const linear = Math.min(lenis.progress / SETTLE_FULL_PROGRESS_FRACTION, 1);
    const settle = linear ** SETTLE_EASE_POWER;
    settleRef.current = settle;
    syncBrowserUiColor(settle, variantRef.current);
  }, []);
  const lenis = useLenis(handleLenisScroll);

  // 初期表示ぶん（スクロールする前）の1回。アンマウント時は元の色に戻す。
  useEffect(() => {
    syncBrowserUiColor(settleRef.current, variantRef.current);
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

    // Fullscreen triangle (one fewer vertex than a quad — same trick the lab
    // uses). Shared by all three programs.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    // Picked once per mount (i.e. once per visit to this page, since this
    // component remounts on navigation) — per direct follow-up ("毎回模様は
    // ランダムになるようにして"). Same 0..100 range the lab's own シード変更
    // button uses. Set once per program, never re-uploaded per frame.
    // バリアントを切り替えても同じ構図のまま見比べられるよう、3本で共有する。
    const seed = Math.random() * 100;

    // 3バリアントぶんまとめてコンパイルしておく。切り替えのたびにコンパイル
    // すると一瞬止まるため。頂点属性の位置はプログラムごとに取り直す
    // （同じソースでも 0 番に来る保証は無い）。
    const vs = compile(gl.VERTEX_SHADER, VERT_SRC);
    type Built = {
      program: WebGLProgram;
      uRes: WebGLUniformLocation | null;
      uTime: WebGLUniformLocation | null;
      uMouse: WebGLUniformLocation | null;
      uReveal: WebGLUniformLocation | null;
      uSettle: WebGLUniformLocation | null;
    };
    function build(frag: string): Built | null {
      const program = gl.createProgram();
      if (!program) return null;
      // compile() は失敗時に throw する。ここで受けておかないと、
      // バリアント1つのコンパイルが通らないだけで effect 全体が投げ、
      // React のエラー境界まで上がって **About ページごと真っ白**になる
      // （実際にシェーダーの編集ミスで一度そうなった）。背景が出ない
      // だけで済むよう、ここで止めて null を返す。
      let fs: WebGLShader;
      try {
        fs = compile(gl.FRAGMENT_SHADER, frag);
      } catch (error) {
        console.error(error);
        return null;
      }
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
        return null;
      }
      gl.useProgram(program);
      const posLoc = gl.getAttribLocation(program, "a_position");
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1f(gl.getUniformLocation(program, "u_seed"), seed);
      return {
        program,
        uRes: gl.getUniformLocation(program, "u_res"),
        uTime: gl.getUniformLocation(program, "u_time"),
        uMouse: gl.getUniformLocation(program, "u_mouse"),
        uReveal: gl.getUniformLocation(program, "u_reveal"),
        uSettle: gl.getUniformLocation(program, "u_settle"),
      };
    }
    const built = VARIANTS.map((v) => build(v.frag));
    // 1 すら作れない環境では描けるものが無いので何もしない（canvas は
    // 透明のまま＝ページの地色が見える）。
    if (!built[0]) return;
    // 型を明示して束ね直す — 上のガードによる絞り込みは、下の関数宣言
    // （render）の中までは効かない（このファイルの gl / canvas が同じ理由で
    // 再束縛されているのと同じ事情）。
    const fallback: Built = built[0];

    const mouseTarget: [number, number] = [0.5, 0.5];
    const mouseSmoothed: [number, number] = [0.5, 0.5];
    function handlePointerMove(e: PointerEvent) {
      mouseTarget[0] = e.clientX / window.innerWidth;
      mouseTarget[1] = 1.0 - e.clientY / window.innerHeight;
    }
    window.addEventListener("pointermove", handlePointerMove);

    function resize() {
      // renderScale (from the lab settings) shrinks the internal buffer
      // — the lab's own "軽い + タダでソフトになる" lever, kept as-tuned.
      // Grain/dissolve pixel sizes are computed off gl_FragCoord (buffer
      // pixels), matching what the lab showed at this same renderScale.
      // バリアントごとに値が違うので、切り替え時にもここを呼び直す。
      const renderScale = VARIANTS[variantRef.current - 1].renderScale;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(window.innerWidth * dpr * renderScale));
      const viewportHeight = fullViewportHeightPx();
      canvas.height = Math.max(1, Math.round(viewportHeight * dpr * renderScale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener("resize", resize);
    resize();
    // バリアント切替の effect から呼べるように預ける。
    resizeRef.current = resize;

    const startTime = performance.now();
    // 登場演出の起点（秒）。マウント時は 0、バリアント切替のたびに
    // そのときの経過時間へ進めて、グラデが開くところからやり直す。
    let revealStart = 0;
    let rafId = 0;

    function render() {
      const t = (performance.now() - startTime) / 1000;
      // Same exponential smoothing constant as the lab, so the cursor warp
      // follows at the approved pace.
      mouseSmoothed[0] += (mouseTarget[0] - mouseSmoothed[0]) * 0.04;
      mouseSmoothed[1] += (mouseTarget[1] - mouseSmoothed[1]) * 0.04;

      // 現在のバリアントのプログラムで描く。コンパイルに失敗したバリアント
      // （端末依存で起こりうる）は 1 にフォールバックして、真っ黒な画面に
      // ならないようにする。
      const active = built[variantRef.current - 1] ?? fallback;
      gl.useProgram(active.program);
      const { uRes, uTime, uMouse, uReveal, uSettle } = active;

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, t);
      gl.uniform2f(uMouse, mouseSmoothed[0], mouseSmoothed[1]);
      // t は秒。REVEAL_DELAY_MS 待ってから REVEAL_MS かけて 0→1。
      if (replayRevealRef.current) {
        replayRevealRef.current = false;
        revealStart = t;
      }
      const revealT = Math.min(Math.max(((t - revealStart) * 1000 - REVEAL_DELAY_MS) / REVEAL_MS, 0), 1);
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
      // バリアントごとに違う（VARIANTS の sStart）。上の説明は 1 の値
      // 0.36 がどこから来たかの経緯で、2 / 3 はしきい値が色の値域の外に
      // 出る構造ではないため 0..1 全域が効く＝1 を使う。
      const S_START = VARIANTS[variantRef.current - 1].sStart;
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
        opacity: shown && !switching ? 1 : 0,
        // 消えるときだけ短く。戻りはページ初回表示と同じ FADE_MS。
        transition: `opacity ${switching ? SWITCH_FADE_OUT_MS : FADE_MS}ms ease-out`,
      }}
    />
  );
}
