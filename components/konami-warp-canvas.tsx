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

/** 紙モード（ホバー）のクアッドの張り出し（px、全辺共通）。回転（±6.5°の
 *  コーナー変位）・スライド（〜31px）・しなり（〜44px）の登場アニメーション
 *  中の最大はみ出しをカバーする。スクロール用の QUAD_MARGIN_* と別なのは
 *  値の由来が違うだけ。かつてはこの矩形がそのまま黒地＋カウンター反転の
 *  矩形になり、広げるほど背後の3Dロゴを隠したが、紙の形どおりのマスク方式
 *  （JSX のマスクキャンバスの doc comment 参照）になってからは単なる描画の
 *  余地で、見た目には何も出ない。 */
const HOVER_QUAD_MARGIN_PX = 96;

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
// 34 → 26（直接の指示 "イメージの紙っぽい歪みをもう少しだけ抑えめにして"）。
const HOVER_CURL_PX = 26;
const HOVER_CURL_DAMP = 4.2;
const HOVER_CURL_FREQ = 2.2;
const HOVER_SCALE_START = 0.9;

/** How long the intensity must sit at exactly 0 before the canvas hands the
 *  list back to the real DOM (see the component doc comment for why it hands
 *  back at all). Short enough that hover comes back the moment scrolling
 *  feels finished, long enough that the flicker of a momentary v=0 sample
 *  mid-gesture doesn't cause a swap-thrash. */
const REST_HANDOFF_MS = 200;

/** Img グリッドを採用してから最初のキャプチャまでの待ち（ms）— per direct
 *  follow-up ("エッグ時にImgを選択すると、サムネが表示されるときにちゃんと
 *  順に表示されず左上3つめ以降一瞬遅延して表示される挙動がある")。
 *  captureImages は全サムネを CORS で読み直し、1枚のアトラスへ drawImage
 *  してから GL へアップロードする（マスク方式でパイプラインが2本になって
 *  からは2回）。この同期処理がメインスレッドを塞ぐと、グリッドの登場
 *  カスケード（project-thumbnail-grid.tsx の per-index setTimeout）が
 *  その間だけ止まり、3枚目以降がまとめて遅れて出る。キャプチャが要るのは
 *  「スクロールして歪みが効き始めるとき」なので、カスケード（可視域の
 *  数枚 ≒ 数百ms + 800ms のワイプ）が終わるまで待って構わない。 */
const IMAGES_FIRST_CAPTURE_DELAY_MS = 1400;

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
/** 1 のとき「紙の形どおりのアルファで白だけを出す」マスク描画（紙モード
 *  専用のカウンター反転 — 本文の uMaskOnly 分岐と JSX のマスクキャンバスの
 *  doc comment 参照）。 */
uniform float uMaskOnly;

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
    // 縁の半透明ピクセルを2値化する — per direct follow-up ("イメージの縁が
    // 0.5pxほど白く見える")。本体（z -5）とマスク（z -4）の二段 difference
    // は半透明の画素で線形に合成されず、バイリニア補間で生まれる縁 1px の
    // 中間アルファが「明るい縁」として浮く。縁を binary にすればこの経路
    // 自体が消える。フェード（uAlpha）はこの後で全面一律に掛かる — 同じ
    // 非線形は出るが 225ms の遷移中の全面なので知覚されない。
    if (col.a < 0.5) {
      gl_FragColor = vec4(0.0);
      return;
    }
    col.rgb /= col.a;
    col.a = 1.0;
    // たわみに沿う簡易シェーディング（uCurl が 0 に戻ると消える）。
    col.rgb *= clamp(1.0 - (uCurl / 40.0) * nx * 0.9, 0.82, 1.18);
    col *= uAlpha;
    // uMaskOnly = 1: マスク用キャンバス（z -4 の difference）としての描画。
    // 紙が実際に塗ったピクセルとまったく同じアルファの「白」を出す —
    // 反転レイヤー（z-9997）に一度反転される紙を、紙の形どおりの二重反転で
    // 素の色に戻すため。かつては矩形の counterDiv + クアッド全面の黒地で
    // 同じことをしていたが、黒地が背後の3Dロゴを矩形に隠して目立った —
    // per direct follow-up ("とにかく黒地を目立たせたくない。できれば
    // 表示したくない")。紙の形そのものをマスクにすれば地の充填が不要になる。
    if (uMaskOnly > 0.5) {
      gl_FragColor = vec4(col.a);
      return;
    }
    // uMaskOnly = 0: 紙本体。透明地のまま素の色で描く。
    gl_FragColor = col;
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
  /** マスク用キャンバス（紙の形どおりのカウンター反転）— JSX 側の doc
   *  comment 参照。 */
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!canvas || !maskCanvas) return;

    /** 1枚ぶんの GL 一式。本体（素の色で描く）とマスク（紙の形どおりの白 —
     *  JSX のマスクキャンバスの doc comment 参照）で同じシェーダーを2つの
     *  キャンバスに張るため、コンテキスト・プログラム・テクスチャをまとめて
     *  2セット作る。 */
    const createPipeline = (host: HTMLCanvasElement) => {
      const gl = host.getContext("webgl", {
        alpha: true,
        antialias: false,
        // The texture arrives premultiplied (below) and the shader composites
        // in premultiplied space, so the drawing buffer has to agree.
        premultipliedAlpha: true,
        depth: false,
        stencil: false,
      });
      if (!gl) return null;
      const program = createProgram(gl);
      if (!program) return null;
      const quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      return {
        canvas: host,
        gl,
        program,
        quad,
        texture,
        aPos: gl.getAttribLocation(program, "aPos"),
        uRect: gl.getUniformLocation(program, "uRect"),
        uUvQuad: gl.getUniformLocation(program, "uUvQuad"),
        uStrength: gl.getUniformLocation(program, "uStrength"),
        uViewport: gl.getUniformLocation(program, "uViewport"),
        uMode: gl.getUniformLocation(program, "uMode"),
        uCurl: gl.getUniformLocation(program, "uCurl"),
        uScale: gl.getUniformLocation(program, "uScale"),
        uTheta: gl.getUniformLocation(program, "uTheta"),
        uShift: gl.getUniformLocation(program, "uShift"),
        uAlpha: gl.getUniformLocation(program, "uAlpha"),
        uDir: gl.getUniformLocation(program, "uDir"),
        uPxToUv: gl.getUniformLocation(program, "uPxToUv"),
        uClamp: gl.getUniformLocation(program, "uClamp"),
        uUnderline: gl.getUniformLocation(program, "uUnderline"),
        uTex: gl.getUniformLocation(program, "uTex"),
        uMaskOnly: gl.getUniformLocation(program, "uMaskOnly"),
      };
    };

    const main = createPipeline(canvas);
    const maskPipe = createPipeline(maskCanvas);
    // どちらか一方でも作れなければ何もしない — 片方だけで動かすと、紙が
    // 反転されたまま（マスク欠け）か、何も見えない（本体欠け）になる。
    if (!main || !maskPipe) return;
    const pipelines = [main, maskPipe];

    /** キャプチャ結果を両方のパイプラインのテクスチャへ流し込む。 */
    const uploadTexture = (source: TexImageSource) => {
      for (const p of pipelines) {
        p.gl.bindTexture(p.gl.TEXTURE_2D, p.texture);
        p.gl.texImage2D(p.gl.TEXTURE_2D, 0, p.gl.RGBA, p.gl.RGBA, p.gl.UNSIGNED_BYTE, source);
      }
    };

    const maxTextureSize = main.gl.getParameter(main.gl.MAX_TEXTURE_SIZE) as number;

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
        // 画像の箱いっぱいに白地を敷いてから写真を乗せる — per direct
        // follow-up ("Dotsの透過pngだけ背面に画像幅分#fffを付けて（エッグ時
        // だけ）")。透過 png（Dots）は地が無いとエッグの黒背景が透けて
        // しまう。判定はせず全箱に敷く: 不透明な写真では白地は完全に隠れて
        // 無害で、透過画像だけに効く。このアトラスはエッグ中の canvas 描画
        // 専用なので、通常時の DOM 表示（透過のまま）には影響しない。
        ctx.fillStyle = "#fff";
        ctx.fillRect(TEXTURE_PAD_X + b.x, TEXTURE_PAD_Y + b.y, b.w, b.h);
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
      uploadTexture(cnv);
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
      uploadTexture(next.canvas);
    };

    /** 残像（現行以外のホバープレビュー）をキャンバスより背面へ沈める/戻す
     *  — per direct follow-up ("ホバーで選択中の画像が少しだけ薄い（100%に
     *  なってない）" → 隠す対処をしたら "一つ前のイメージが背面に残らなく
     *  なってる")。紙モードのキャンバスは一覧より背面（z -5）に居るため、
     *  DOM のままの残像（z auto）が現行画像の**上**に来てしまい、不透明度
     *  10% の残像が現行の写真に薄いベールとして乗る — 通常時は DOM 順
     *  （残像が先、現行が後）で現行が上になるので起きない、背面描画特有の
     *  前後逆転。初版は残像を隠して対処したが「背面に残る」挙動ごと消えて
     *  しまったので、隠す代わりに z-index をキャンバスのさらに下（-6）へ
     *  落とす: 現行のクアッド（不透明）と重なる部分は現行の下に隠れ、
     *  重なっていない部分は従来どおり背面の残像として見える ＝ 通常時と
     *  同じ重なり順が復元される。
     *
     *  inline style で直接書く — 初版は属性 + globals.css のルールで
     *  実装したが「選択中のイメージの上にうっすら背面にあるはずのイメージ
     *  が見えてる」と再報告（スクリーンショット付き）: このプロジェクトで
     *  繰り返し起きている dev の生成CSS遅延（新規ルールが乗らない）を
     *  踏んだ可能性が高い。インラインなら CSS パイプラインを一切経由
     *  しない。React はこの要素の style に zIndex を持っていないので、
     *  差分適用と衝突しない。 */
    const setGhostsBelow = (below: boolean) => {
      document.querySelectorAll<HTMLElement>(".project-hover-preview").forEach((el) => {
        if (el === target) return;
        if (below) {
          if (el.style.zIndex !== "-6") el.style.zIndex = "-6";
        } else if (el.style.zIndex !== "") {
          el.style.removeProperty("z-index");
        }
      });
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
      setGhostsBelow(false);
      // Fresh snapshot while everything is idle (so no one feels the ~10ms),
      // baking in whatever changed since the last one — settled scramble,
      // hover leftovers, late data.
      capture();
    };

    const adopt = (next: HTMLElement | null) => {
      if (engaged) target?.removeAttribute(HIDDEN_ATTRIBUTE);
      engaged = false;
      hoverRevealStartedAt = 0;
      // 次のターゲットがホバーでない（Img グリッドへ移った・ホバーが完全に
      // 終わった）なら残像を戻す。次もホバーなら隠したまま — 一瞬でも
      // 戻すと、A→B とホバーを移した継ぎ目で A の残像がちらつく。
      if (!next || !next.hasAttribute(KONAMI_WARP_HOVER_ATTRIBUTE)) setGhostsBelow(false);
      target = next;
      raster = null;
      cards = [];
      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
        settleTimer = null;
      }
      if (next) {
        if (next.hasAttribute(KONAMI_WARP_IMAGES_ATTRIBUTE)) {
          // Img グリッドだけは初回キャプチャを遅らせる — 登場カスケードを
          // 塞がないため（IMAGES_FIRST_CAPTURE_DELAY_MS の doc comment
          // 参照）。settle 再キャプチャは行わない: あれはテキストの
          // スクランブルが落ち着くのを待つためのもので、画像アトラスには
          // 意味がなく、同じ重い処理をもう一度走らせるだけになる。
          settleTimer = window.setTimeout(() => {
            settleTimer = null;
            capture();
          }, IMAGES_FIRST_CAPTURE_DELAY_MS);
        } else {
          capture();
          settleTimer = window.setTimeout(() => {
            settleTimer = null;
            capture();
          }, SETTLE_RECAPTURE_MS);
        }
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

      // 紙モード中だけ一覧より背面へ（JSX のマスクキャンバスの doc comment 参照）。
      // Img グリッドのスクロール歪みは従来どおり反転レイヤーの上（9998）で
      // 素の色を描く。JSX の初期値も 9998。
      const desiredZ = hoverMode ? "-5" : "9998";
      if (canvas.style.zIndex !== desiredZ) canvas.style.zIndex = desiredZ;

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
        // 現行を描いている間、残像の DOM プレビューを隠し続ける（毎フレーム
        // なのは、ホバーが移って新しい残像が生まれても即座に対象へ入れる
        // ため — setGhostsBelow の doc comment 参照）。
        if (hoverMode && engaged) setGhostsBelow(true);
      } else if (engaged && now - lastMovingAt > REST_HANDOFF_MS) {
        disengage();
      }

      if (!engaged || !raster || !target) {
        if (canvasDirty) {
          for (const p of pipelines) {
            p.gl.clearColor(0, 0, 0, 0);
            p.gl.clear(p.gl.COLOR_BUFFER_BIT);
          }
          canvasDirty = false;
        }
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.floor(window.innerWidth * dpr);
      const height = Math.floor(window.innerHeight * dpr);

      const origin = target.getBoundingClientRect();

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
      const curl =
        hoverSign * hoverCurlAmp * Math.exp(-HOVER_CURL_DAMP * revealT) * Math.cos(revealT * Math.PI * HOVER_CURL_FREQ);

      const { padX, padY, cssWidth, cssHeight } = raster;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // 紙モードのはみ出し余白。黒地の充填は廃止済み — マスクキャンバスが
      // 紙の形どおりに反転を打ち消すので、余白は単なる描画の余地で、見た目
      // には何も出ない（per direct follow-up "とにかく黒地を目立たせたく
      // ない。できれば表示したくない"）。
      const marginX = hoverMode ? HOVER_QUAD_MARGIN_PX : QUAD_MARGIN_X;
      const marginY = hoverMode ? HOVER_QUAD_MARGIN_PX : QUAD_MARGIN_Y;

      /** カードごとのクアッド情報 — ジオメトリは本体とマスクで完全に同一で
       *  なければならない（1px でもずれると打ち消し損ねの縁が出る）ので、
       *  一度だけ計算して両方のパイプラインで使い回す。 */
      const quads: {
        rect: [number, number, number, number];
        uv: [number, number, number, number];
        clamp: [number, number, number, number];
        underline: [number, number];
      }[] = [];
      for (const card of cards) {
        // Screen box, expanded so the lean and the trail have room to draw.
        const sLeft = origin.left + card.x - marginX;
        const sRight = origin.left + card.x + card.w + marginX;
        const sTop = origin.top + card.y - marginY;
        const sBottom = origin.top + card.y + card.h + marginY;
        if (sBottom < 0 || sTop > vh) continue;
        // This card's underline band, ±1px for antialiasing bleed — see
        // uUnderline in the fragment shader. (-2, -1) = no underline.
        const underline = raster.underlines.find(
          (u) => u.y >= padY + card.y - 2 && u.y <= padY + card.y + card.h + 2
        );
        quads.push({
          rect: [
            (sLeft / vw) * 2 - 1,
            1 - (sBottom / vh) * 2,
            (sRight / vw) * 2 - 1,
            1 - (sTop / vh) * 2,
          ],
          // Same box in texture space. The texture's origin sits padX left
          // of and padY above the target's own top-left corner.
          uv: [
            (padX + card.x - marginX) / cssWidth,
            (padY + card.y + card.h + marginY) / cssHeight,
            (padX + card.x + card.w + marginX) / cssWidth,
            (padY + card.y - marginY) / cssHeight,
          ],
          clamp: [
            (padX + card.x - CLAMP_MARGIN_X) / cssWidth,
            (padY + card.y - CLAMP_MARGIN_Y) / cssHeight,
            (padX + card.x + card.w + CLAMP_MARGIN_X) / cssWidth,
            (padY + card.y + card.h + CLAMP_MARGIN_Y) / cssHeight,
          ],
          underline: underline
            ? [(underline.y - 1) / cssHeight, (underline.y + underline.h + 1) / cssHeight]
            : [-2, -1],
        });
      }

      for (const p of pipelines) {
        const isMask = p !== main;
        const g = p.gl;
        if (p.canvas.width !== width || p.canvas.height !== height) {
          p.canvas.width = width;
          p.canvas.height = height;
        }
        g.viewport(0, 0, width, height);
        g.clearColor(0, 0, 0, 0);
        g.clear(g.COLOR_BUFFER_BIT);
        // マスクは紙モード専用 — Img のスクロール歪みは反転レイヤーの上
        // （z 9998）で素の色を描くので、打ち消しは要らない。クリアだけ。
        if (isMask && !hoverMode) continue;
        g.useProgram(p.program);
        g.bindBuffer(g.ARRAY_BUFFER, p.quad);
        g.enableVertexAttribArray(p.aPos);
        g.vertexAttribPointer(p.aPos, 2, g.FLOAT, false, 0, 0);
        g.uniform1f(p.uStrength, strength);
        g.uniform1f(p.uMode, hoverMode ? 1 : 0);
        g.uniform1f(p.uMaskOnly, isMask ? 1 : 0);
        g.uniform1f(p.uCurl, hoverMode ? curl : 0);
        g.uniform1f(p.uTheta, hoverMode ? hoverSign * hoverThetaAmp * undone : 0);
        g.uniform1f(p.uShift, hoverMode ? hoverShiftAmp * undone : 0);
        g.uniform1f(p.uScale, hoverMode ? HOVER_SCALE_START + (1 - HOVER_SCALE_START) * revealE : 1);
        g.uniform1f(p.uAlpha, hoverMode ? Math.min(1, revealT / 0.3) : 1);
        g.uniform2f(p.uViewport, vw, vh);
        g.uniform1f(p.uDir, directionRef.current || -1);
        g.uniform2f(p.uPxToUv, 1 / cssWidth, 1 / cssHeight);
        g.activeTexture(g.TEXTURE0);
        g.bindTexture(g.TEXTURE_2D, p.texture);
        g.uniform1i(p.uTex, 0);
        for (const q of quads) {
          g.uniform4f(p.uRect, q.rect[0], q.rect[1], q.rect[2], q.rect[3]);
          g.uniform4f(p.uUvQuad, q.uv[0], q.uv[1], q.uv[2], q.uv[3]);
          g.uniform4f(p.uClamp, q.clamp[0], q.clamp[1], q.clamp[2], q.clamp[3]);
          g.uniform2f(p.uUnderline, q.underline[0], q.underline[1]);
          g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
        }
      }
      canvasDirty = true;
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
      setGhostsBelow(false);
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
      for (const p of pipelines) {
        p.gl.deleteTexture(p.texture);
        p.gl.deleteBuffer(p.quad);
        p.gl.deleteProgram(p.program);
      }
    };
  }, [intensityRef, directionRef]);

  return (
    <>
      {/* 本体キャンバス。zIndex は render ループがモードで切り替える
          （インラインの 9998 は初期値 = Img グリッド用）:
          - Img のスクロール歪み: 9998 — 反転レイヤー（z-9997）の**上**、
            デバッググリッド（9999）の下 — per direct follow-up ("まだ色が
            沈んでる")。以前は 9996（反転の下）で、写真をテクスチャの段階で
            invert しておき difference に戻させる相殺をしていたが、invert は
            sRGB で、difference の合成はディスプレイの色空間（P3 など）で
            行われるため、広色域環境では往復が厳密に元へ戻らず彩度と明度が
            わずかに沈む。反転の上に出して素の色をそのまま描けば、往復自体が
            無くなる。
          - Txt のホバー紙モード: -5 — 一覧のテキストより背面 — per direct
            follow-up ("エッグ時のtxtのホバー時のイメージは一覧より背面に
            表示して")。反転レイヤーの下に入るぶんの色反転は、下のマスク
            キャンバスとの二重反転で素の色に戻す。
          inline style なのは z-[9998] が新規の arbitrary クラスで、この
          プロジェクトで繰り返し起きている生成CSSの遅延に踏まれないため
          （scroll-progress-gauge.tsx と同じ理由）。
          `pointer-events-none` keeps the real list underneath clickable.
          konami-viewport-fill — エッグ切り替えの板の3D回転中のビューポート
          固定（konami-wipe.tsx の pinViewportFills 参照）。 */}
      <canvas
        ref={canvasRef}
        aria-hidden
        className="konami-viewport-fill pointer-events-none fixed inset-0 hidden h-full w-full lg:block"
        style={{ zIndex: 9998 }}
      />
      {/* マスクキャンバス — 紙モード（Txt ホバー）専用の「紙の形どおりの
          カウンター反転」。本体（紙モードで z -5、素の色）は全面反転レイヤー
          （z-9997）の下に居るため、そのままでは紙が一度色反転されてしまう。
          ここに紙とまったく同じアルファの白を difference で重ねると、紙の
          画素だけが二重反転で素の色に戻る（二重とも合成段階の反転なので
          色沈みも起きない）。以前は矩形の div（counterDiv）+ クアッド全面の
          黒地充填で同じことをしていたが、黒地が背後の3Dロゴを矩形に隠して
          目立った — per direct follow-up ("とにかく黒地を目立たせたくない。
          できれば表示したくない")。紙の形そのものをマスクにすれば地の充填が
          不要になり、ロゴの線は紙の真下以外すべて見えたままになる。
          z -4 = 本体（紙モードで -5）の上、本文（auto）の下。Img の
          スクロール歪みでは常に空（render ループ参照）。 */}
      <canvas
        ref={maskCanvasRef}
        aria-hidden
        className="konami-viewport-fill pointer-events-none fixed inset-0 hidden h-full w-full lg:block"
        style={{ zIndex: -4, mixBlendMode: "difference" }}
      />
    </>
  );
}
