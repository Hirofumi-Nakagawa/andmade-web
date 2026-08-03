"use client";

import { useEffect, useRef } from "react";
import { fullViewportHeightPx, installViewportHeightVar } from "@/lib/viewport-height";

/**
 * Full-viewport animated WebGL background — ported from the standalone
 * verification mock (flower-shader-mock.html) built earlier per direct
 * follow-up ("花のような模様がAboutとContactページの背景で動いてる感じにし
 * たいんだけど...まずは検証としてページに埋め込まずにどこか別の場所でモック
 * を作ってくれる？"). This component is the first real embed of that mock,
 * on the Contact page only for now ("この値で、背景画像は添付を使ってcontact
 * ページ背景に組み込んでみて").
 *
 * Unlike the mock, there is no on-screen control panel here — every uniform
 * below is a fixed constant in SETTINGS, snapshotted directly from the
 * mock's own panel after the user tuned it there (Color Melt Strength 0.75/
 * Radius 0.132/Speed 0.33/Noise Scale 1.9, Image Opacity 0.25, Saturation
 * 1.23, Contrast 1.08, Follow Strength 0.14, Cursor Glow 0, Smoothing 0.03,
 * Noise Intensity 0.02, Noise Scale(px) 4.7, Grain Flicker 0.15, Moving Edge
 * Blur Strength 0.55/Speed 0.2/Radius 0.018). If these ever need retuning,
 * the easiest path is reopening the mock, dragging sliders, then copying
 * the new values back in here (or wiring in the same on-screen panel here
 * too, if this becomes a recurring need).
 *
 * The corner blur / color melt / grain / cursor-reactivity shader logic
 * itself (sceneColor, edgeBlurMask, valueNoise, coverUV/pToUV) is unchanged
 * from the mock — see that file's own comments for the reasoning behind
 * each technique (sequential "over" blob compositing was removed entirely
 * per a later follow-up, "画像で編集前提なので、ブロブとか不要なものは無く
 * して", leaving image + melt/blur/grain/cursor only). The mock's own
 * "Flowing Streak Blur" pass was dropped entirely here — per direct
 * follow-up ("結構動作に負荷かかってる？"), its baked-in strength was 0
 * (pure wasted GPU work, no visual effect) — see sceneColor's own comment
 * in the fragment shader below for the exact savings. */

const VERT_SRC = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// A function (not a plain string) — `samples`/`meltSamples` get interpolated
// directly into the two `const int` declarations below, since GLSL ES 1.00
// loop bounds must be compile-time constants (no uniform-driven loop count).
// Per direct follow-up ("まだだいぶ重いな"): a global reduction to these
// same two numbers already happened twice before purely for Contact's own
// sake (see each one's own comment below) — going lower still on Contact
// risked visibly softening its own already-tuned corner-blur/melt look for
// no reason Contact itself asked for, so this is now callable with different
// counts per page instead of a single shared global constant. Contact's own
// call site still passes the same 4/6 defaults it always used (unchanged);
// About's passes lower values (see about-hero-background.tsx's own
// SHADER_SAMPLES/SHADER_MELT_SAMPLES).
function buildFragSrc(samples: number, meltSamples: number) {
  return `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;
uniform float u_cursorStrength;
uniform float u_cursorGlow;
uniform float u_noiseIntensity;
uniform float u_noiseScale;
uniform float u_noiseFlicker;
uniform float u_frame;
uniform float u_edgeBlurStrength;
uniform float u_edgeBlurSpeed;
uniform float u_blurRadius;
uniform float u_saturation;
uniform float u_contrast;
uniform vec3 u_bgColor;
uniform sampler2D u_image;
uniform vec2 u_imageSize;
uniform float u_imageOpacity;
uniform float u_meltStrength;
uniform float u_meltRadius;
uniform float u_meltSpeed;
uniform float u_meltScale;
uniform float u_imageOffsetY;
uniform float u_imageOverscan;
uniform float u_maxVerticalScale;
uniform float u_meltWobble;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

// Smooth (bilinear-interpolated, cosine-eased) value noise built on top of
// hash() — used only to drive the organic "melt" sample offsets below.
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

vec2 aspectP(vec2 uv) {
  vec2 p = uv - 0.5;
  p.x *= u_resolution.x / u_resolution.y;
  return p;
}

// Inverse of aspectP — recovers plain 0..1 screen-space uv from a p-space
// coordinate, INCLUDING whatever blur/melt offset was added to it before
// sceneColor was called with it (see main() below) — that's what makes the
// image blur/melt, reusing the exact same multi-tap sampling main() already
// does for the corner/flow/melt passes.
vec2 pToUV(vec2 p) {
  vec2 uv = p;
  uv.x /= u_resolution.x / u_resolution.y;
  return uv + 0.5;
}

// Maps screen uv onto image uv the same way CSS background-size: cover
// does — image fills the frame entirely on whichever axis would otherwise
// show empty space, cropping the other axis instead of stretching it.
// offsetY (0..1) picks WHERE within that vertical crop slack to sit — 0
// is topmost, 1 is bottommost, 0.5 is the original always-centered
// behavior — per direct follow-up ("背景画像のy座標を表示度に毎回ランダムに
// 設定できる？"). When there's no vertical crop at all (scale.y == 1, the
// image's own aspect ratio happens to leave no vertical slack against the
// current canvas), mix() collapses to exactly 0.5 regardless of offsetY, so
// this is always safe to pass a random value into.
//
// overscan (1.0 = plain cover, unchanged default behavior; <1.0 crops in a
// little further than a bare "cover" fit needs) — per direct follow-up
// ("両サイドのピクセルにブラーかけるとかで解決できない？"): the root cause
// of the "画像端が伸びる" artifact is sceneColor's own cursor-driven UV
// shift (see cursorOffset below) occasionally pushing imgUV outside the
// image's real 0..1 texture range on whichever axis a plain "cover" fit
// leaves zero crop slack on — texture2D's CLAMP_TO_EDGE wrap then just
// repeats that edge's own last pixel column/row outward, reading as a
// stretch. Scaling "scale" down slightly reserves a small margin of already-
// cropped (but still real, sampleable) image on every side specifically for
// the cursor offset to move into, so it never actually reaches the texture's
// true edge at realistic cursor positions — fixing the artifact at its
// source rather than hiding it under extra blur (which was the other option
// considered; this is both cheaper (no additional samples at all, just one
// extra multiply) and a strictly better fix, since blur can only disguise a
// same-frame stretch, not prevent it).
// maxVerticalScale (1.0 = no forced cap, Contact's own unchanged behavior) —
// per direct follow-up ("背景画像中央揃えになってる感じがするけど"): on a
// narrow/portrait canvas against this photo's own portrait aspect ratio,
// scale.y above already computes out to exactly 1.0 (zero vertical crop —
// the image's full height fits with no slack at all), which makes offsetY
// a complete no-op regardless of its value (see this function's own doc
// comment on that mix() collapsing to 0.5 in exactly that case) — About's
// own "always show the top" request had genuinely nothing to act on there.
// Clamping scale.y to a cap below 1.0 whenever the natural aspect-ratio
// math alone wouldn't otherwise crop anything guarantees real vertical
// slack always exists for offsetY to move within, on any canvas/image
// combination.
vec2 coverUV(vec2 uv, vec2 canvasSize, vec2 texSize, float offsetY, float overscan, float maxVerticalScale) {
  float canvasAspect = canvasSize.x / canvasSize.y;
  float texAspect = texSize.x / texSize.y;
  vec2 scale;
  if (canvasAspect < texAspect) {
    scale = vec2(canvasAspect / texAspect, 1.0);
  } else {
    scale = vec2(1.0, texAspect / canvasAspect);
  }
  scale.y = min(scale.y, maxVerticalScale);
  scale *= overscan;
  // mix(1.0 - scale.y*0.5, scale.y*0.5, offsetY) — NOT the other way around.
  // gl_FragCoord (and so screen uv.y, via pToUV above) is 0 at the bottom of
  // the screen and 1 at the top (standard GL convention, unflipped) — but
  // the image texture is uploaded with UNPACK_FLIP_Y_WEBGL=true (below, so
  // the photo itself doesn't render upside down), which makes texture v=1
  // the TOP of the actual photo and v=0 the BOTTOM. So the screen's top
  // (uv.y=1) needs to land near texture v=1 (also top) for the image to
  // read right-side-up, and that same top-of-screen point is exactly what
  // offsetY=0 ("topmost") needs to anchor. That means offsetY=0 should push
  // center.y toward the HIGH end of its valid range, not the low end — the
  // previous version had this backwards (offsetY=0 pushed center.y low,
  // which actually crops the photo's own top and reveals more of its
  // bottom), causing a real, reported "still looks centered/not top-
  // aligned" regression at this line's original mix() argument order.
  vec2 center = vec2(0.5, mix(1.0 - scale.y * 0.5, scale.y * 0.5, offsetY));
  return (uv - 0.5) * scale + center;
}

vec3 sceneColor(vec2 p, float t) {
  vec2 mouseP = aspectP(u_mouse);
  vec2 cursorOffset = mouseP * u_cursorStrength;

  vec2 imgUV = coverUV(pToUV(p + cursorOffset), u_resolution, u_imageSize, u_imageOffsetY, u_imageOverscan, u_maxVerticalScale);
  vec3 imgColor = texture2D(u_image, imgUV).rgb;
  vec3 col = mix(u_bgColor, imgColor, u_imageOpacity);

  float distToCursor = length(p - mouseP);
  float glow = exp(-(distToCursor * distToCursor) / (2.0 * 0.06 * 0.06)) * u_cursorGlow;
  col += vec3(1.0) * glow;

  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(luma), col, u_saturation);
  col = (col - 0.5) * u_contrast + 0.5;
  return col;
}

float edgeBlurMask(vec2 uv, float t) {
  vec2 corners[4];
  corners[0] = vec2(0.0, 0.0);
  corners[1] = vec2(1.0, 0.0);
  corners[2] = vec2(0.0, 1.0);
  corners[3] = vec2(1.0, 1.0);
  float mask = 0.0;
  for (int i = 0; i < 4; i++) {
    float phase = t * u_edgeBlurSpeed * 6.2831853 + float(i) * 1.5707963;
    float w = 0.5 + 0.5 * sin(phase);
    float d = distance(uv, corners[i]);
    mask += w * (1.0 - smoothstep(0.05, 0.95, d));
  }
  return clamp(mask, 0.0, 1.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = aspectP(uv);
  float t = u_time;

  vec3 base = sceneColor(p, t);

  vec3 blurred = vec3(0.0);
  // 4 (was 6) — per direct follow-up ("まだ重いからもっと調整して"): one
  // fewer pair of samples here is a minor, hard-to-notice softness change
  // on an already-blurred corner effect, for a real cut in per-pixel cost.
  // Now a build-time parameter (see buildFragSrc's own doc comment above)
  // rather than a hardcoded literal — Contact still gets 4 here unchanged.
  const int SAMPLES = ${samples};
  for (int i = 0; i < SAMPLES; i++) {
    float sampleAngle = (float(i) / float(SAMPLES)) * 6.2831853;
    vec2 offs = vec2(cos(sampleAngle), sin(sampleAngle)) * u_blurRadius;
    blurred += sceneColor(p + offs, t);
  }
  blurred /= float(SAMPLES);

  float cornerMask = edgeBlurMask(uv, t) * u_edgeBlurStrength;
  vec3 color = mix(base, blurred, cornerMask);

  // The mock's own "Flowing Streak Blur" pass (6 more sceneColor/texture2D
  // samples per pixel) is deliberately not ported here — per direct
  // follow-up ("結構動作に負荷かかってる？"), its baked-in production
  // strength was 0 (see this file's own settings history), so it was pure
  // wasted GPU work with zero visual effect. Bring it back from
  // flower-shader-mock.html if a future tuning pass wants it active again.
  //
  // Total sceneColor evaluations per pixel: 1 (base) + SAMPLES (corner
  // blur) + MELT_SAMPLES (melt) — 21 in the very first embed (flow blur
  // included, sample counts at their mock defaults), 11 now, after removing
  // the dead flow pass and trimming both remaining sample counts (see each
  // one's own comment) — a real cut in per-pixel work with no visual
  // change to grain/noise fidelity, unlike an internal render-resolution
  // downscale that was tried and reverted (see resize()'s own comment in
  // this file's JS half) for softening the grain texture.

  // 6 (was 8) — same trade-off as SAMPLES above, on the now-dominant melt
  // effect; per direct follow-up ("まだ重いからもっと調整して"). Now a
  // build-time parameter too — see buildFragSrc's own doc comment above;
  // Contact still gets 6 here unchanged.
  const int MELT_SAMPLES = ${meltSamples};
  vec3 melted = vec3(0.0);
  for (int i = 0; i < MELT_SAMPLES; i++) {
    float fi = float(i);
    float nOff = valueNoise(p * u_meltScale + vec2(fi * 3.7, t * u_meltSpeed * 0.6));
    // u_meltWobble (0 = Contact's own unchanged behavior) — per direct
    // follow-up on About's own usage ("画像をローテーションさせてるだけで
    // 動いてるように見せてるけど、ちょっと単調"): with this at 0, angle
    // below advances at a perfectly constant rate (t * u_meltSpeed) for
    // every sample, so the whole ring of melt sample points just spins like
    // a clock hand — reusing nOff (already computed for the radius below,
    // so this costs one extra sin() per sample, not a whole extra
    // valueNoise() call) to also jitter the angle means each sample
    // speeds up/slows down/reverses slightly as nOff itself evolves over
    // time, instead of sweeping at one constant rate — sin(nOff *
    // 6.2831853 + fi) keeps the jitter bounded to +-1 and gives every
    // sample its own phase (via + fi) so they don't all wobble in unison.
    float angle = fi * 2.399963 + t * u_meltSpeed + sin(nOff * 6.2831853 + fi) * u_meltWobble;
    float radius = u_meltRadius * (0.35 + 0.65 * nOff);
    vec2 offs = vec2(cos(angle), sin(angle)) * radius;
    melted += sceneColor(p + offs, t);
  }
  melted /= float(MELT_SAMPLES);
  color = mix(color, melted, u_meltStrength);

  vec2 grainCoord = floor(gl_FragCoord.xy / max(u_noiseScale, 1.0));
  float flickerStep = floor(u_frame * u_noiseFlicker);
  float n1 = hash(grainCoord + flickerStep * 17.0);
  float n2 = hash(grainCoord * 0.5 + 91.7 + flickerStep * 5.0);
  float n = mix(n1, n2, 0.35);
  color += (n - 0.5) * u_noiseIntensity;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;
}

/** Snapshotted verbatim from the mock's own control panel — see this file's
 *  own top doc comment for the exact values and where they came from. */
const SETTINGS = {
  cursorStrength: 0.14,
  cursorGlow: 0.0,
  cursorSmooth: 0.03,
  noiseIntensity: 0.02,
  noiseScale: 4.7,
  noiseFlicker: 0.15,
  edgeBlurStrength: 0.55,
  edgeBlurSpeed: 0.2,
  blurRadius: 0.018,
  saturation: 1.23,
  contrast: 1.08,
  imageOpacity: 0.25,
  meltStrength: 0.75,
  meltRadius: 0.132,
  meltSpeed: 0.33,
  meltScale: 1.9,
} as const;

/** #000 — per direct follow-up ("contactページの背景色は#000のままで"),
 *  overriding the mock's own tan (#f2ecdd) default so the page keeps its
 *  existing black background: shown mixed in under the image (imageOpacity
 *  is 0.25, not 1, so this stays the dominant color) and as the fallback
 *  color for the brief moment before the image finishes loading. Now this
 *  component's own default only — see the `bgColor` prop below, added per
 *  direct follow-up embedding this same effect on About too with its own
 *  distinct color ("Aboutの背景もcontactと同じように演出を付けて...背景色と
 *  グラデは#E08DA7に変更"). */
const BG_COLOR: [number, number, number] = [0, 0, 0];

const UNIFORM_NAMES = [
  "u_resolution", "u_time", "u_mouse",
  "u_cursorStrength", "u_cursorGlow", "u_noiseIntensity", "u_noiseScale",
  "u_noiseFlicker", "u_frame", "u_edgeBlurStrength", "u_edgeBlurSpeed",
  "u_blurRadius",
  "u_saturation", "u_contrast", "u_bgColor",
  "u_image", "u_imageSize", "u_imageOpacity",
  "u_meltStrength", "u_meltRadius", "u_meltSpeed", "u_meltScale",
  "u_imageOffsetY", "u_imageOverscan", "u_maxVerticalScale", "u_meltWobble",
] as const;

type Props = {
  /** Public path (e.g. "/images/contact/melt-bg.jpg") to the source photo —
   *  sampled through the same blur/melt/grain machinery as everything else. */
  imageSrc: string;
  /** [r, g, b] each 0..1 — mixed in under the image (see BG_COLOR's own doc
   *  comment above) and used as the fallback color before the image loads.
   *  Defaults to BG_COLOR (Contact's own #000) — per-page override added for
   *  app/about/page.tsx's own #E08DA7. */
  bgColor?: [number, number, number];
  /** When true, skips the actual per-frame draw work (uniform updates +
   *  drawArrays) — the rAF loop itself keeps running (so this can resume
   *  instantly, with no re-init cost) but stops doing the expensive
   *  fragment-shader work every frame. Added for app/about/page.tsx's own
   *  AboutHeroBackground wrapper, per direct follow-up ("ピンク透過100%で覆
   *  われたら背景の演出はoff"): once its own scroll-driven pink wash overlay
   *  reaches full opacity, this canvas is completely hidden underneath it
   *  anyway, so there's nothing gained by still paying for the animation. */
  paused?: boolean;
  /** Plain CSS `translateY` offset (px) applied to the canvas itself — for
   *  AboutHeroBackground's own scroll-driven parallax drift (see that
   *  component's own doc comment). 0 (Contact's own usage) means no offset
   *  at all, i.e. today's plain full-viewport-pinned behavior, unchanged. */
  parallaxOffsetPx?: number;
  /** 0..1 — how much of `sceneColor`'s own mix comes from the real photo vs.
   *  `bgColor` (see SETTINGS.imageOpacity's own doc comment: Contact's own
   *  0.25 default deliberately keeps the photo subtle/subordinate to its
   *  flat black background). Overridable per caller — added per direct
   *  follow-up on About's own usage ("ブレンド無しにして...イメージの色をそ
   *  のまま使う"): 1 removes the `bgColor` tint entirely, letting the photo's
   *  own real colors (still passed through the melt/blur/grain/saturation/
   *  contrast machinery below, just not flattened toward a constant color
   *  first) show through undiluted. */
  imageOpacity?: number;
  /** How fast the "melt" sample offsets drift over time — SETTINGS.meltSpeed
   *  is the dominant source of this whole effect's motion (see the melt loop
   *  in FRAG_SRC). Overridable per caller — added per direct follow-up on
   *  About's own usage ("背景の動きはもう少しゆっくりにして"). */
  meltSpeed?: number;
  /** 0 = no jitter (Contact's own unchanged behavior — the melt sample ring
   *  sweeps at one perfectly constant angular rate, see the melt loop in
   *  FRAG_SRC). >0 perturbs each sample's own angle over time via noise
   *  instead of a fixed rate, reading as organic speeding-up/slowing-down
   *  drift rather than a plain rotation. Overridable per caller — added per
   *  direct follow-up on About's own usage ("画像をローテーションさせてる
   *  だけで動いてるように見せてるけど、ちょっと単調だから調整して"). */
  meltWobble?: number;
  /** How strongly the cursor position shifts the sampled image UV (see
   *  `cursorOffset` in FRAG_SRC's own `sceneColor`). Overridable per caller —
   *  added per direct follow-up on About's own usage ("画面端までカーソルを
   *  もっていくと両サイドの画像のピクセルが横に伸びてるように見える...カー
   *  ソルの反応も少し弱めに"): a smaller value both reads as a gentler cursor
   *  reaction and keeps the UV shift at extreme cursor positions further from
   *  the photo's own texture edges, where `CLAMP_TO_EDGE` wrapping visibly
   *  stretches/repeats the edge pixels once the shift gets large enough. */
  cursorStrength?: number;
  /** Sample radius for the corner blur pass (see `blurred` in `main()`).
   *  Overridable per caller — added per direct follow-up on About's own usage
   *  ("ブラーをもう少しかけて"). */
  blurRadius?: number;
  /** How strongly the corner blur pass mixes in over the base scene (see
   *  `cornerMask`/`color = mix(base, blurred, cornerMask)` in `main()`).
   *  Overridable per caller — added alongside `blurRadius` above, same
   *  follow-up. */
  edgeBlurStrength?: number;
  /** Grain amount mixed into the final color (see the `n - 0.5` term at the
   *  end of `main()`). Overridable per caller — added per direct follow-up on
   *  About's own usage ("ノイズをもう少しだけ強くして"). */
  noiseIntensity?: number;
  /** 1 = plain "cover" fit (Contact's own unchanged behavior), <1 crops in a
   *  little further, reserving a safety margin the cursor-driven UV shift can
   *  move into without ever reaching the image's real texture edge — see
   *  coverUV's own doc comment in FRAG_SRC for the full reasoning. Added per
   *  direct follow-up on About's own usage ("両サイドのピクセルにブラーかけ
   *  るとかで解決できない？"): fixes the edge-stretch artifact at its root
   *  instead of just reducing `cursorStrength` (which About had briefly done,
   *  down to 0, giving up the cursor reactivity entirely — this restores it). */
  imageOverscan?: number;
  /** 1 = no forced cap (Contact's own unchanged behavior) — caps
   *  coverUV's own aspect-ratio-derived vertical crop scale, guaranteeing
   *  real vertical slack for `imageOffsetY` to move within even on a
   *  canvas/image aspect-ratio combination that would otherwise leave none
   *  at all (see coverUV's own doc comment in FRAG_SRC). Added per direct
   *  follow-up on About's own usage ("背景画像中央揃えになってる感じがする
   *  けど"). */
  maxVerticalScale?: number;
  /** Corner-blur sample count — see buildFragSrc's own doc comment (a
   *  compile-time shader constant, not a uniform, so changing this recompiles
   *  the shader). Defaults to 4, Contact's own unchanged value. Added per
   *  direct follow-up on About's own usage ("まだだいぶ重いな"). */
  samples?: number;
  /** Melt-effect sample count — same mechanism/reasoning as `samples` above,
   *  on the (per that file's own doc comment) now-dominant melt pass.
   *  Defaults to 6, Contact's own unchanged value. */
  meltSamples?: number;
  /** 0..1 — see coverUV's own doc comment for how this maps onto the image's
   *  actual vertical crop range (0 topmost, 1 bottommost, 0.5 centered).
   *  Undefined (Contact's own usage) keeps the original behavior: a fresh
   *  Math.random() value picked once per mount. A fixed value overrides that
   *  per-mount randomness entirely — added per direct follow-up on About's
   *  own usage ("aboutの背景画像の表示位置はランダムにせず、上面合わせで表
   *  示"): About now always passes 0 (topmost) instead. */
  imageOffsetY?: number;
  className?: string;
};

export function FlowerShaderBackground({
  imageSrc,
  bgColor = BG_COLOR,
  paused = false,
  parallaxOffsetPx = 0,
  imageOpacity = SETTINGS.imageOpacity,
  meltSpeed = SETTINGS.meltSpeed,
  meltWobble = 0,
  cursorStrength = SETTINGS.cursorStrength,
  blurRadius = SETTINGS.blurRadius,
  samples = 4,
  meltSamples = 6,
  edgeBlurStrength = SETTINGS.edgeBlurStrength,
  noiseIntensity = SETTINGS.noiseIntensity,
  imageOverscan = 1,
  maxVerticalScale = 1,
  imageOffsetY: imageOffsetYProp,
  className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Ref (not read directly in the render loop below) — see `paused` prop's
  // own doc comment: avoids putting `paused` in the big init effect's own
  // dependency array, which would otherwise tear down and recreate the
  // entire WebGL program/texture/listeners on every single opacity-driven
  // pause/resume toggle instead of just skipping a frame's draw call.
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    // 実測値を --viewport-height に流し込む（lib/viewport-height.ts 参照）。
    // CSS 側の height: var(--viewport-height) がこれを読む。
    const uninstallViewportVar = installViewportHeightVar();
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const glContext = (canvasEl.getContext("webgl") ?? canvasEl.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!glContext) return;

    // Re-bound with explicit non-null types — TS's control-flow narrowing
    // from the guards above doesn't extend into the nested function
    // declarations below (compile/resize/render/handlePointerMove), even
    // though these are all `const` and only ever called synchronously
    // within this same effect.
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
    const fs = compile(gl.FRAGMENT_SHADER, buildFragSrc(samples, meltSamples));
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

    // Placeholder 1x1 opaque pixel bound at init so texture2D() never reads
    // an unbound/undefined sampler even before the real photo has loaded.
    const imageTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, imageTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(uniforms.u_image ?? null, 0);

    let imageSize: [number, number] = [1, 1];
    let disposed = false;

    // Picked once per mount (i.e. once per page visit, since this component
    // remounts on navigation to Contact) — per direct follow-up ("背景画像
    // のy座標を表示度に毎回ランダムに設定できる？"). See coverUV's own
    // comment for how this 0..1 value maps onto the actual valid vertical
    // crop range, whatever that ends up being for the current canvas/image
    // aspect ratio combination. `imageOffsetYProp` overrides this per-mount
    // randomness with a fixed value when the caller passes one — see that
    // prop's own doc comment (added for About's own "上面合わせで表示"
    // follow-up).
    const imageOffsetY = imageOffsetYProp ?? Math.random();

    const img = new Image();
    img.onload = () => {
      if (disposed) return;
      gl.bindTexture(gl.TEXTURE_2D, imageTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      imageSize = [img.naturalWidth, img.naturalHeight];
    };
    img.src = imageSrc;

    const mouseTarget: [number, number] = [0.5, 0.5];
    const mouseSmoothed: [number, number] = [0.5, 0.5];
    function handlePointerMove(e: PointerEvent) {
      mouseTarget[0] = e.clientX / window.innerWidth;
      mouseTarget[1] = 1.0 - e.clientY / window.innerHeight;
    }
    window.addEventListener("pointermove", handlePointerMove);

    function resize() {
      // Full native resolution (dpr capped at 2, no further render-scale
      // downscaling) — a smaller internal buffer was tried as a perf lever,
      // but per direct follow-up ("ノイズの感じは前回の状態に戻してほしい")
      // it visibly softened/blurred the grain texture once the browser
      // upscaled that smaller buffer back up to the full display size
      // (grain is computed per *buffer* pixel via gl_FragCoord — shrink the
      // buffer and each grain cell ends up covering more real screen area,
      // and bilinear upscaling smooths its hard edges besides). Grain itself
      // is cheap to compute either way (two hash() calls, no texture
      // sampling), so there was no real perf reason to keep the buffer
      // smaller at the cost of how the grain reads — the load reduction
      // instead comes from fewer sceneColor/texture2D samples per pixel
      // (see SAMPLES/MELT_SAMPLES above) and dropping the dead flow-blur
      // pass entirely, neither of which touches grain fidelity at all.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      const viewportHeight = fullViewportHeightPx();
      canvas.height = viewportHeight * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener("resize", resize);
    resize();

    const startTime = performance.now();
    let frame = 0;
    let rafId = 0;

    function render() {
      // `paused` — see this component's own top-level doc comment on the
      // prop. The loop itself keeps scheduling frames (cheap) so resuming
      // is instant; only the actual draw work below is skipped.
      if (!pausedRef.current) {
        frame++;
        const t = (performance.now() - startTime) / 1000;

        mouseSmoothed[0] += (mouseTarget[0] - mouseSmoothed[0]) * SETTINGS.cursorSmooth;
        mouseSmoothed[1] += (mouseTarget[1] - mouseSmoothed[1]) * SETTINGS.cursorSmooth;

        gl.uniform2f(uniforms.u_resolution ?? null, canvas.width, canvas.height);
        gl.uniform1f(uniforms.u_time ?? null, t);
        gl.uniform2f(uniforms.u_mouse ?? null, mouseSmoothed[0], mouseSmoothed[1]);
        gl.uniform1f(uniforms.u_cursorStrength ?? null, cursorStrength);
        gl.uniform1f(uniforms.u_cursorGlow ?? null, SETTINGS.cursorGlow);
        gl.uniform1f(uniforms.u_noiseIntensity ?? null, noiseIntensity);
        gl.uniform1f(uniforms.u_noiseScale ?? null, SETTINGS.noiseScale);
        gl.uniform1f(uniforms.u_noiseFlicker ?? null, SETTINGS.noiseFlicker);
        gl.uniform1f(uniforms.u_frame ?? null, frame);
        gl.uniform1f(uniforms.u_edgeBlurStrength ?? null, edgeBlurStrength);
        gl.uniform1f(uniforms.u_edgeBlurSpeed ?? null, SETTINGS.edgeBlurSpeed);
        gl.uniform1f(uniforms.u_blurRadius ?? null, blurRadius);
        gl.uniform1f(uniforms.u_saturation ?? null, SETTINGS.saturation);
        gl.uniform1f(uniforms.u_contrast ?? null, SETTINGS.contrast);
        gl.uniform1f(uniforms.u_imageOpacity ?? null, imageOpacity);
        gl.uniform2f(uniforms.u_imageSize ?? null, imageSize[0], imageSize[1]);
        gl.uniform1f(uniforms.u_imageOffsetY ?? null, imageOffsetY);
        gl.uniform1f(uniforms.u_imageOverscan ?? null, imageOverscan);
        gl.uniform1f(uniforms.u_maxVerticalScale ?? null, maxVerticalScale);
        gl.uniform1f(uniforms.u_meltStrength ?? null, SETTINGS.meltStrength);
        gl.uniform1f(uniforms.u_meltRadius ?? null, SETTINGS.meltRadius);
        gl.uniform1f(uniforms.u_meltSpeed ?? null, meltSpeed);
        gl.uniform1f(uniforms.u_meltWobble ?? null, meltWobble);
        gl.uniform1f(uniforms.u_meltScale ?? null, SETTINGS.meltScale);
        gl.uniform3f(uniforms.u_bgColor ?? null, bgColor[0], bgColor[1], bgColor[2]);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      rafId = requestAnimationFrame(render);
    }
    render();

    return () => {
      uninstallViewportVar();
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);
    };
    // bgColor's own 3 primitives (not the array itself) — a caller passing a
    // literal `[r, g, b]` inline (as app/about/page.tsx now does) creates a
    // new array identity every render; depending on the array reference
    // directly would re-run this whole effect (recompiling the shader,
    // restarting the animation) on every unrelated parent re-render instead
    // of only when the actual color changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
  }, [imageSrc, bgColor[0], bgColor[1], bgColor[2], imageOpacity, meltSpeed, meltWobble, cursorStrength, blurRadius, edgeBlurStrength, noiseIntensity, imageOverscan, maxVerticalScale, samples, meltSamples, imageOffsetYProp]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
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
        // parallaxOffsetPx — see this component's own doc comment on the
        // prop. `transform` here is plain layout-independent compositing (no
        // effect on this canvas's own `position: fixed` sizing/placement,
        // which stays pinned to the full viewport regardless), so this is
        // safe to update on every scroll tick with no re-render cost beyond
        // this one style value.
        transform: parallaxOffsetPx ? `translateY(${parallaxOffsetPx}px)` : undefined,
      }}
    />
  );
}
