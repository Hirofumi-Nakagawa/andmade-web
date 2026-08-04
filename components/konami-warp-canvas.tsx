"use client";

import { useEffect, useRef } from "react";
import { rasterizeText, type TextRaster } from "@/lib/text-raster";

/** Marks the element whose text gets handed to the shader. Set on the project
 *  list's own <ul> (components/project-list.tsx) — queried rather than passed
 *  as a ref so this can stay mounted at the layout level without every
 *  component in between having to forward one. */
export const KONAMI_WARP_TARGET_ATTRIBUTE = "data-konami-warp";

/** Img（サムネイルグリッド）側のマーカー — per direct follow-up ("Img時も
 *  画面上下のグラスエフェクトが効くようにして")。テキストのラスタライズ
 *  （rasterizeText、Range 計測ベース）は画像を一切描かないため、こちらは
 *  captureImages()（各 <img> を CORS 再取得して canvas に敷き直す別経路）で
 *  テクスチャを作る。project-thumbnail-grid.tsx の <ul> に付く。 */
export const KONAMI_WARP_IMAGES_ATTRIBUTE = "data-konami-warp-images";

/** Txt モードのホバープレビュー画像のマーカー — per direct follow-up
 *  ("txt時にホバーしてイメージが表示されるとき、グラスエフェクトで湾曲して
 *  表示されるようにして")。この対象だけはスクロール強度に関係なく、
 *  表示されている間ずっと凸レンズの湾曲（シェーダーの uBulge 分岐）が
 *  かかる。project-hover-preview.tsx の「現在ホバー中」のエントリにだけ
 *  付く（残像側の薄いほうには付けない）。 */
export const KONAMI_WARP_HOVER_ATTRIBUTE = "data-konami-warp-hover";

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

/** ホバープレビューの登場アニメーション — per direct follow-up
 *  （gilhuybrecht.com の参照動画）。動画のフレーム分解で分かったリジッドな
 *  動き（数度傾いた紙が滑り込み、回転を戻しながら据わる）と、紙のしなり
 *  （曲げが戻りながら平らに着地 — "紙のしなりとかついてないんだけど" で
 *  復帰）を、シェーダー内で同時に掛ける。一度 CSS transform 版（回転のみ、
 *  曲げ無し）に置き換えたが、CSS では面を曲げられないためこちらに戻した。
 *
 *  要素（すべて easeOutBack で 0 へ。バックの過剰分が「一度反対に撓って
 *  から収まる」紙の弾性になる）:
 *   - 回転 THETA_DEG: 傾いて現れて、まっすぐに据わる
 *   - スライド SHIFT_PX: 下から滑り込む
 *   - 拡大 SCALE_START → 1
 *   - しなり CURL_PX: 円筒状の縦のたわみ（横中央が持ち上がる）＋
 *     たわみに沿う簡易シェーディング（平らに戻ると消える）
 *  透明度は前半 30% で上げ切る。 */
const HOVER_REVEAL_MS = 750;
/** 以下の3つは「基準値」— 実際の登場では毎回、向き（±）と振幅（70〜130%
 *  程度）が抽選で揺らぐ（render ループの hoverSign / hover*Amp 参照）。 */
const HOVER_THETA_DEG = -5;
const HOVER_SHIFT_PX = 26;
/** しなりの初期振幅（px）と、減衰振動のパラメータ — per direct follow-up
 *  ("ホバー時のしなりの気持ちよさをもっと出して")。しなりだけは easeOutBack
 *  （1回だけ小さく行き過ぎる）ではなく減衰振動 exp(-DAMP·t)·cos(FREQ·π·t)
 *  で駆動する: 最大のしなりから始まり、逆側へ一度大きく撓ね返り、小さく
 *  戻って平らに落ち着く＝約1往復半。ばねとして揺れるのがしなりの
 *  気持ちよさの本体なので、ここだけ振動が要る。回転・スライド・拡大は
 *  リジッドな据わりの動きなので easeOutBack のまま。 */
const HOVER_CURL_PX = 34;
const HOVER_CURL_DAMP = 4.2;
const HOVER_CURL_FREQ = 2.2;
const HOVER_SCALE_START = 0.9;

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
/** このフラグメントのビューポート内の位置（0..1、x 左→右 / y 上→下）。
 *  リキッドグラスの歪みは「画面の上下端からの距離」で決まるので、カードの
 *  ローカル座標ではなくスクリーン座標が要る。canvas は fixed inset-0 で
 *  ビューポートに一致しているため、クリップ座標から直接出せる。 */
varying vec2 vScreen;
void main() {
  vUv = mix(uUvQuad.xy, uUvQuad.zw, aPos);
  vec2 clip = mix(uRect.xy, uRect.zw, aPos);
  vScreen = vec2((clip.x + 1.0) * 0.5, (1.0 - clip.y) * 0.5);
  gl_Position = vec4(clip, 0.0, 1.0);
}
`;

/**
 * スクロール時のリキッドグラス効果 — per direct follow-up ("エッグ画面の
 * スクロール時のグリッチは無しで、…スクロール時に画面上下の要素がリキッド
 * グラスエフェクトで歪む演出を加えて"、参照は X の SwiftUI リキッドグラスの
 * 動画)。それまでこのシェーダーが描いていた RGB 色ずれ＋4段の残像トレイル
 * （CSS の .konami-glitch text-shadow の再現）は、この指示で丸ごと撤去した。
 * CSS 側の text-shadow も globals.css から同時に消してある。
 *
 * 効果の中身（参照動画をフレーム分解して合わせた。当初は「圧縮」で作ったが
 * 動画は逆＝引き伸ばしだったため作り直し — "上下の歪みはこの動画の感じ"）:
 * ビューポートの上下 BAND ぶんを「ガラスの縁」とみなし、そこに入った行を
 *   - 縦: サンプル位置を帯の内側の境界へ引き戻す → 境界付近のグリフが
 *     画面端に向かってタフィーのように引き伸ばされる（ピクセルストレッチ）
 *   - 横: 深さと横位置で位相の変わる波 → 液体越しの揺らぎ
 *   - 色: 伸びた部分のグリフに深さで色相の回る薄い虹色（分散）
 * で屈折させる。強度はいずれも uStrength（スクロール速度、0..1）×
 * 端からの距離の2乗。静止中は完全に無効果（uStrength=0）で、通常表示と
 * ピクセル一致する。
 *
 * Drawn once per card, not once for the whole list — sampling is clamped to
 * each card's own box (uClamp) so a bent row is always made of its own
 * glyphs, never a neighbouring row's.
 */
const FRAGMENT_SHADER = `
precision mediump float;

varying vec2 vUv;
varying vec2 vScreen;
uniform sampler2D uTex;
/** ビューポートの CSS px サイズ。スクリーン割合で測った距離を px に直して
 *  uPxToUv に渡すために要る。 */
uniform vec2 uViewport;
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
/** 1 のとき「紙しなり」モード（Txt のホバープレビュー用）。uCurl が反りの
 *  量（符号付き、easeOutBack で 0 を跨ぐ）、uScale が拡大率。JS 側が登場
 *  アニメーションに合わせて毎フレーム更新する — HOVER_CURL の doc comment
 *  参照。 */
uniform float uMode;
uniform float uCurl;
uniform float uScale;
/** 紙モードの回転（ラジアン）と縦スライド（見た目の移動量、CSS px）。 */
uniform float uTheta;
uniform float uShift;
/** 全体の不透明度（premultiplied なので rgba 全チャンネルに掛ける）。
 *  ホバーの登場アニメーション用。それ以外は常に 1。 */
uniform float uAlpha;

/** ガラスの縁とみなすビューポート上下の帯（ビューポート高さに対する割合）。 */
const float BAND = 0.2;
/** 引き伸ばしの最大係数。1.0 なら画面の真端のピクセルが帯の内側の境界の
 *  内容をそのまま映す（＝完全なピクセルストレッチ）。0.85 で入れたら
 *  "動きが極端" とのことだったので、通常のスクロールでは「端で少し尾を
 *  引く」程度に落とした。速いフリックでだけ大きく伸びる。 */
const float STRETCH = 0.45;
/** 液状の揺らぎ — 横方向の波の振幅（CSS px）と、画面横方向の波の本数。
 *  22px は文字が横に泳ぎすぎたので、係数を落として周期も緩くした。 */
const float RIPPLE_PX = 8.0;
const float RIPPLE_FREQ = 9.0;
/** 虹色の分散の強さ（0でオフ）。伸びた部分のグリフにだけ薄く色が乗る。 */
const float DISPERSION = 0.3;

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

void main() {
  // 紙モード（ホバープレビュー — HOVER_REVEAL_MS の doc comment 参照）。
  // 座標変換はすべて CSS px 空間で行う。正規化座標のまま回すと、カードの
  // 縦横比ぶん回転が歪む（横長の箱では5°が縦に潰れる）ため。
  if (uMode > 0.5) {
    vec2 c = (uClamp.xy + uClamp.zw) * 0.5;
    // 中心からの距離（CSS px）。
    vec2 d = (vUv - c) / uPxToUv;
    // 逆変換の順序は表示変換（曲げ → 回転 → 拡大 → 移動）の逆:
    // 1. 見た目の移動（下から滑り込む）を戻す
    d.y += uShift;
    // 2. 拡大を戻す
    d /= uScale;
    // 3. 回転を戻す（-θ の回転行列）
    float cs = cos(uTheta);
    float sn = sin(uTheta);
    d = vec2(d.x * cs + d.y * sn, -d.x * sn + d.y * cs);
    // 4. しなり: 横位置の2乗で縦にたわむ（中央が持ち上がり左右端が沈む）。
    float halfW = ((uClamp.z - uClamp.x) * 0.5) / uPxToUv.x;
    float nx = clamp(d.x / max(halfW, 1.0), -1.0, 1.0);
    d.y += uCurl * (1.0 - nx * nx);
    vec4 col = tap(c + d * uPxToUv);
    // たわみに沿う簡易シェーディング（uCurl が 0 に戻ると消える）。
    // premultiplied なので a には触れない。
    col.rgb *= clamp(1.0 - (uCurl / 40.0) * nx * 0.9, 0.82, 1.18);
    gl_FragColor = col * uAlpha;
    return;
  }

  // 端からの深さ 0..1（帯の内側の境界で 0、画面の真端で 1）。
  float topT = clamp((BAND - vScreen.y) / BAND, 0.0, 1.0);
  float botT = clamp((vScreen.y - (1.0 - BAND)) / BAND, 0.0, 1.0);
  float t = max(topT, botT);
  // 帯の内側の境界の位置（スクリーン割合）。ここが「ガラスの縁の根元」。
  float boundary = botT > topT ? 1.0 - BAND : BAND;

  // 3乗で立ち上げる — 境界では変位もその微分も 0 なので、歪みの始まりに
  // 継ぎ目が見えない。2乗から上げたのは "動きが極端" への調整の一部：
  // 帯の入り口側をさらに寝かせ、歪みを端の際に寄せることで、読んでいる
  // 画面中央寄りの行がほとんど乱れなくなる。
  // uStrength（スクロール速度 0..1）で全体をスケール。
  float k = t * t * t * uStrength;

  // 縦の引き伸ばし（参照動画の核）: サンプル位置を帯の内側の境界へ
  // 引き戻す。端のピクセルほど境界寄りの内容を映すので、境界付近の
  // グリフが帯の中へタフィーのように伸びる。uViewport.y を掛けるのは
  // スクリーン割合 → CSS px の変換（uPxToUv はCSS px→テクスチャUV）。
  float pull = (boundary - vScreen.y) * STRETCH * k * uViewport.y;

  // 液状の揺らぎ: 横位置と深さで位相をずらした波で、伸びが真っ直ぐな
  // 筋にならず水面越しのように揺れる。振幅も k に乗るので静止中は 0。
  float ripple = sin(vScreen.x * RIPPLE_FREQ + t * 5.0) * RIPPLE_PX * k;

  vec2 offsetPx = vec2(ripple, pull);
  vec4 col = tap(vUv + offsetPx * uPxToUv);

  // 分散: 伸びている部分のグリフに、深さで色相が回る薄い虹色を乗せる。
  // テクスチャは premultiplied なので rgb への加算は a を掛けた上で行う。
  // 参照動画で文字のストレッチに出る薄いスペクトルの再現。黒グリフ前提の
  // 「加算で色を付ける」方式なので、反転レイヤーを通った後は補色になる。
  vec3 rainbow = 0.5 + 0.5 * cos(t * 6.2832 + vec3(0.0, 2.094, 4.189));
  col.rgb += rainbow * col.a * DISPERSION * k;
  col *= uAlpha;

  // uDir / uUnderline は旧グリッチ（トレイル）用の名残で、この効果では
  // 使わない。JS 側の書き込みは残っているが、未使用 uniform への書き込みは
  // location が null になり無視されるだけなので害はない。
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
    const uViewport = gl.getUniformLocation(program, "uViewport");
    const uMode = gl.getUniformLocation(program, "uMode");
    const uCurl = gl.getUniformLocation(program, "uCurl");
    const uScale = gl.getUniformLocation(program, "uScale");
    const uTheta = gl.getUniformLocation(program, "uTheta");
    const uShift = gl.getUniformLocation(program, "uShift");
    const uAlpha = gl.getUniformLocation(program, "uAlpha");
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
    /** 実DOMを隠すためのマーカー属性（CSS: html.konami-glitch
     *  [data-konami-warp-hidden] { opacity: 0 !important } — globals.css）。
     *
     *  以前は target.style.opacity を直接 "0" にしていたが、ホバー
     *  プレビューのラッパーは React が style.opacity を管理している
     *  （entered/targetOpacity）ため衝突した: engage 時に保存した値を
     *  adopt で書き戻すと、その間に React が変えた値（残像の 0.1）を
     *  古い "1" で上書きしてしまう — "一つ前の背面イメージの透過も100%の
     *  ままになってる" の原因。React の管理外の属性を付け外しする方式なら
     *  React の style 書き込みと一切干渉しない。 */
    const HIDDEN_ATTRIBUTE = "data-konami-warp-hidden";
    let raster: TextRaster | null = null;
    /** Card boxes measured at the same instant as the texture. */
    let cards: CardRect[] = [];
    /** True while the canvas owns the list (DOM hidden, quads drawing). */
    let engaged = false;
    let lastMovingAt = 0;
    /** ホバーの登場アニメーションが始まった時刻（0 = 未開始）。 */
    let hoverRevealStartedAt = 0;
    /** 登場1回ぶんの抽選値 — per direct follow-up ("紙のしなりの表示時の
     *  歪みを左右ランダムにしつつ、歪みの数値も少しランダムにして")。
     *  向き（±1。回転としなりの符号を揃えて反転 — 別々に反転させると
     *  「右に傾いた紙が左向きにしなる」という不自然な組み合わせが出る）と、
     *  各成分の振幅（基準値の 70〜130% 程度）を、リビール開始のたびに
     *  引き直す。ホバーするたび毎回少し違う紙の落ち方になる。 */
    let hoverSign = 1;
    let hoverCurlAmp = HOVER_CURL_PX;
    let hoverThetaAmp = (HOVER_THETA_DEG * Math.PI) / 180;
    let hoverShiftAmp = HOVER_SHIFT_PX;
    /** Whether the drawing buffer holds anything that would need clearing. */
    let canvasDirty = false;

    /** CORS 済み画像のキャッシュ（URL → 読み込み Promise）。Img/Txt を
     *  何度切り替えても同じ画像を再取得しない。 */
    const corsImageCache = new Map<string, Promise<HTMLImageElement>>();

    function loadCorsImage(url: string): Promise<HTMLImageElement> {
      let cached = corsImageCache.get(url);
      if (!cached) {
        cached = new Promise((resolve, reject) => {
          const image = new Image();
          // DOM 上の <img> は crossOrigin 無しで読まれており、そのまま
          // drawImage すると canvas が taint されて texImage2D が
          // SecurityError になる。microCMS のアセット配信（imgix）は
          // Access-Control-Allow-Origin: * を返すので、anonymous で
          // 読み直せばクリーンに描ける。ブラウザキャッシュには（Vary の
          // 都合で）乗らないことがあるが、初回の一度きり。
          image.crossOrigin = "anonymous";
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = url;
        });
        corsImageCache.set(url, cached);
      }
      return cached;
    }

    /** Img グリッド用のキャプチャ。DOM の <img> の位置に CORS 再取得した
     *  同じ画像を敷き直したテクスチャを作る。画像の読み込みを待つので
     *  async — 完了までは raster が null のままで、engage() が待つ
     *  （＝実DOMが見えたまま。歪みが少し遅れて効き始めるだけで壊れない）。 */
    const captureImages = async (grid: HTMLElement) => {
      const origin = grid.getBoundingClientRect();
      if (origin.width <= 0 || origin.height <= 0) return;
      const cssWidth = origin.width + TEXTURE_PAD_X * 2;
      const cssHeight = origin.height + TEXTURE_PAD_Y * 2;
      // グリッド（ページ全高）は 1.5 上限 — dpr2 のまま描くとテクスチャが
      // 数十MBになる。ホバープレビュー（1枚だけ、小さい）はフル dpr —
      // per direct follow-up ("ホバー画像の色味が沈んでるんだけど")：解像度
      // 不足＋下の低品質スムージングで、DOM 表示より眠く沈んで見えていた。
      const maxScale = grid.hasAttribute(KONAMI_WARP_HOVER_ATTRIBUTE) ? 2 : 1.5;
      const scale = Math.min(maxScale, window.devicePixelRatio || 1, maxTextureSize / cssWidth, maxTextureSize / cssHeight);
      if (!(scale > 0)) return;

      const imgs = Array.from(grid.querySelectorAll("img"));
      const boxes = imgs.map((img) => {
        const r = img.getBoundingClientRect();
        return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
      });
      const loaded = await Promise.all(
        imgs.map((img) => loadCorsImage(img.currentSrc || img.src).catch(() => null))
      );
      // 待っている間に切り替わっていたら破棄。
      if (disposed || target !== grid || !grid.isConnected) return;

      const cnv = document.createElement("canvas");
      cnv.width = Math.max(1, Math.floor(cssWidth * scale));
      cnv.height = Math.max(1, Math.floor(cssHeight * scale));
      const ctx = cnv.getContext("2d");
      if (!ctx) return;
      ctx.scale(scale, scale);
      // 元画像（microCMS 配信は 1500px 級）→ 表示サイズへの一段縮小は、
      // 既定の低品質スムージングだと細部が潰れて色が濁る。high はブラウザに
      // 多段的な縮小をさせる指定。
      ctx.imageSmoothingQuality = "high";
      // 事前の invert(1) は撤去 — キャンバス自体を反転レイヤーの上に移した
      // ため（レンダリング部の zIndex 9998 のコメント参照）、素の色を
      // そのまま描く。invert + difference の相殺往復（広色域ディスプレイで
      // 沈む）はもう発生しない。
      loaded.forEach((image, i) => {
        if (!image) return; // CORS 不許可などで読めなかった画像は抜け
        const b = boxes[i];
        // DOM 側は object-cover — テクスチャでも同じ切り抜きを再現する
        // （そのまま drawImage すると縦横比が箱に合わせて潰れる）。
        const boxRatio = b.w / b.h;
        const imgRatio = image.naturalWidth / image.naturalHeight;
        let sx = 0, sy = 0, sw = image.naturalWidth, sh = image.naturalHeight;
        if (imgRatio > boxRatio) {
          sw = image.naturalHeight * boxRatio;
          sx = (image.naturalWidth - sw) / 2;
        } else {
          sh = image.naturalWidth / boxRatio;
          sy = (image.naturalHeight - sh) / 2;
        }
        ctx.drawImage(image, sx, sy, sw, sh, TEXTURE_PAD_X + b.x, TEXTURE_PAD_Y + b.y, b.w, b.h);
      });

      // 1枚も描けなかったら raster を立てない — engage が実DOMを隠すのは
      // 「代わりに描けるものがある」ときだけ（空のテクスチャで隠すと画像が
      // 消えたように見える）。
      if (!loaded.some((image) => image !== null)) return;

      raster = { canvas: cnv, cssWidth, cssHeight, padX: TEXTURE_PAD_X, padY: TEXTURE_PAD_Y, underlines: [] };
      cards = boxes;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cnv);
    };

    const capture = () => {
      if (disposed || !target || !target.isConnected) return;
      // Img グリッドとホバープレビューは画像経路（KONAMI_WARP_IMAGES_ATTRIBUTE
      // の doc comment 参照）。async だが結果は同じ raster/cards/texture に
      // 入る。ホバー側の分岐が抜けていて rasterizeText（テキスト用、画像を
      // 描かない）に落ち、空のテクスチャで実DOMだけ隠れる＝「ホバー時に
      // イメージが表示されない」になっていた。
      if (
        target.hasAttribute(KONAMI_WARP_IMAGES_ATTRIBUTE) ||
        target.hasAttribute(KONAMI_WARP_HOVER_ATTRIBUTE)
      ) {
        void captureImages(target);
        return;
      }
      // ※ このテキスト経路は現在未使用（Txt のスクロール歪みは無効化済み）。
      // 再有効化する場合の注意: キャンバスは反転レイヤーの上（zIndex 9998）に
      // 移したので、黒グリフをそのまま描くと黒地に黒で見えなくなる。
      // テキストを白で描くか、キャンバスを元の 9996 に戻す判断が要る。
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
      target.setAttribute(HIDDEN_ATTRIBUTE, "");
    };

    const disengage = () => {
      if (!engaged) return;
      engaged = false;
      target?.removeAttribute(HIDDEN_ATTRIBUTE);
      // Fresh snapshot while everything is idle (so no one feels the ~10ms),
      // baking in whatever changed since the last one — settled scramble,
      // hover leftovers, late data.
      capture();
    };

    const adopt = (next: HTMLElement | null) => {
      if (engaged) target?.removeAttribute(HIDDEN_ATTRIBUTE);
      engaged = false;
      hoverRevealStartedAt = 0;
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
      // ホバープレビューを最優先で拾う（表示中は常に湾曲対象）。無ければ
      // Img グリッド。Txt 一覧はもう対象ではない（project-list.tsx 参照）。
      // isConnected だけでなく「マーカー属性がまだ付いているか」も見る —
      // ホバープレビューはホバーが次の行へ移ると、要素は残像として DOM に
      // 残ったまま KONAMI_WARP_HOVER_ATTRIBUTE だけが外れる（isCurrent が
      // 落ちる）。isConnected だけだと残像を掴み続けてしまう。
      const targetStale =
        !target ||
        !target.isConnected ||
        !(
          target.hasAttribute(KONAMI_WARP_HOVER_ATTRIBUTE) ||
          target.hasAttribute(KONAMI_WARP_IMAGES_ATTRIBUTE) ||
          target.hasAttribute(KONAMI_WARP_TARGET_ATTRIBUTE)
        );
      if (targetStale) {
        const found =
          document.querySelector<HTMLElement>(`[${KONAMI_WARP_HOVER_ATTRIBUTE}]`) ??
          document.querySelector<HTMLElement>(
            `[${KONAMI_WARP_TARGET_ATTRIBUTE}], [${KONAMI_WARP_IMAGES_ATTRIBUTE}]`
          );
        if (found !== target) adopt(found);
      }
      const hoverMode = target?.hasAttribute(KONAMI_WARP_HOVER_ATTRIBUTE) ?? false;

      const strength = Math.max(0, Math.min(1, intensityRef.current));
      if (hoverMode || strength > 0) {
        // ホバーモードは強度に関係なく常時ウォープ（見えている間ずっと
        // 湾曲している「ガラス板」なので、スクロールしていなくても効く）。
        lastMovingAt = now;
        engage();
        // ホバーの登場アニメーションの起点（HOVER_REVEAL_MS の doc comment
        // 参照）。engage が成立した＝テクスチャが用意できて canvas 側の描画に
        // 切り替わった最初のフレーム。adopt 時ではなくここなのは、CORS 画像の
        // 読み込み待ちをアニメーション時間に食い込ませないため。
        if (hoverMode && engaged && hoverRevealStartedAt === 0) {
          hoverRevealStartedAt = now;
          // 登場パラメータの抽選（宣言部の doc comment 参照）。
          hoverSign = Math.random() < 0.5 ? -1 : 1;
          hoverCurlAmp = HOVER_CURL_PX * (0.7 + Math.random() * 0.6);
          hoverThetaAmp = ((HOVER_THETA_DEG * Math.PI) / 180) * (0.7 + Math.random() * 0.6);
          hoverShiftAmp = HOVER_SHIFT_PX * (0.8 + Math.random() * 0.4);
        }
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
      // ホバーの登場アニメーション（HOVER_REVEAL_MS の doc comment 参照）。
      // easeOutBack: 1 を少し超えてから戻る = 回転・しなり・スライドが一度
      // 反対側にわずかに行き過ぎてから収まる。紙の弾性の要。
      const revealT = hoverMode
        ? Math.min(1, (now - hoverRevealStartedAt) / HOVER_REVEAL_MS)
        : 1;
      const back = revealT - 1;
      const revealE = 1 + 2.70158 * back * back * back + 1.70158 * back * back;
      const undone = 1 - revealE;
      // しなりは減衰振動（HOVER_CURL_PX の doc comment 参照）。
      // 振幅・向きは登場ごとの抽選値（hoverSign / hover*Amp）。定数を直接
      // 使っていた頃から式の形は同じで、係数だけ差し替わっている。
      const curl =
        hoverSign * hoverCurlAmp * Math.exp(-HOVER_CURL_DAMP * revealT) * Math.cos(revealT * Math.PI * HOVER_CURL_FREQ);
      gl.uniform1f(uMode, hoverMode ? 1 : 0);
      gl.uniform1f(uCurl, hoverMode ? curl : 0);
      gl.uniform1f(uTheta, hoverMode ? hoverSign * hoverThetaAmp * undone : 0);
      gl.uniform1f(uShift, hoverMode ? hoverShiftAmp * undone : 0);
      gl.uniform1f(uScale, hoverMode ? HOVER_SCALE_START + (1 - HOVER_SCALE_START) * revealE : 1);
      gl.uniform1f(uAlpha, hoverMode ? Math.min(1, revealT / 0.3) : 1);
      gl.uniform2f(uViewport, window.innerWidth, window.innerHeight);
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
      if (engaged) target?.removeAttribute(HIDDEN_ATTRIBUTE);
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
    // zIndex 9998 — 反転レイヤー（z-9997）の**上**、デバッググリッド（9999）の
    // 下 — per direct follow-up ("まだ色が沈んでる")。以前は 9996（反転の下）
    // で、写真をテクスチャの段階で invert しておき difference に戻させる
    // 相殺をしていたが、invert は sRGB で、difference の合成はディスプレイの
    // 色空間（P3 など）で行われるため、広色域環境では往復が厳密に元へ戻らず
    // 彩度と明度がわずかに沈む。反転の上に出して素の色をそのまま描けば、
    // 往復自体が無くなる（このキャンバスが描くのは写真だけなので、反転
    // したい内容はそもそも無い）。inline style なのは z-[9998] が新規の
    // arbitrary クラスで、このプロジェクトで繰り返し起きている生成CSSの
    // 遅延に踏まれないため（scroll-progress-gauge.tsx と同じ理由）。
    // `pointer-events-none` keeps the real list underneath clickable.
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 hidden h-full w-full lg:block"
      style={{ zIndex: 9998 }}
    />
  );
}
