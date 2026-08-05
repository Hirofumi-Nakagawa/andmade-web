"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useLenis } from "lenis/react";
import type Lenis from "lenis";
import { KonamiGrain } from "@/components/konami-grain";
import { KonamiLogo3D } from "@/components/konami-logo-3d";
import { KonamiWarpCanvas } from "@/components/konami-warp-canvas";
import { KonamiWipe } from "@/components/konami-wipe";

/** ↑↑↓↓←→←→BA. Compared against `event.key`, so the letters are matched
 *  case-insensitively below (Shift or Caps Lock shouldn't break it). */
const SEQUENCE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

/** Below this viewport width the whole thing stays off. It needs a real
 *  keyboard to trigger at all, but this also keeps the effect off phones
 *  that happen to have one attached — the glitch is tuned against the PC
 *  tree's own type sizes and scroll feel. Matches the `lg` breakpoint this
 *  codebase splits its PC/SP trees on everywhere else. */
const MIN_VIEWPORT_PX = 1024;

/** Scroll velocity (px/frame, as Lenis reports it) that maps to a fully
 *  saturated glitch. Anything faster clamps to 1. Lower means the effect
 *  reaches full strength from an ordinary scroll rather than only from a
 *  hard flick — 45 needed a deliberate fast swipe before much happened. */
const VELOCITY_AT_FULL_GLITCH = 18;

/** How fast the glitch decays once scrolling stops — a plain exponential
 *  ease toward 0 applied per frame, so it settles smoothly instead of
 *  snapping off the instant velocity hits zero.
 *  0.82 → 0.9 — per direct follow-up ("グラスエフェクトをもっと滑らかに
 *  して")。リキッドグラスは残っても「ガラスが戻る」ようにしか見えないので、
 *  旧グリッチ時代（残ると壊れて見えるので速めに切っていた）より長く
 *  尾を引かせて、戻りをぬるっとさせている。 */
const GLITCH_DECAY = 0.9;

/** 立ち上がり側の低域通過係数（1フレームで目標へ寄る割合）— 同じ指示で
 *  追加。1.0 が旧来の「即値」。 */
const GLITCH_ATTACK = 0.16;

/** Below this the variable is pinned to exactly 0, so the browser can stop
 *  recalculating the (inherited, page-wide) text-shadow entirely rather than
 *  keeping it alive at an invisible fraction of a pixel forever. */
const GLITCH_EPSILON = 0.02;

/** The intensity is rounded to 1/this before being written to the DOM, and a
 *  write that lands on the same step as the previous one is skipped entirely.
 *
 *  Every write invalidates a text-shadow that the whole document inherits, so
 *  it costs a full-page repaint — with blurred shadows in that list (see
 *  .konami-glitch in globals.css) those repaints are expensive enough that
 *  doing one per animation frame made scrolling feel heavy. Quantising drops
 *  most of them: while the glitch decays, successive frames differ by
 *  fractions of a step and collapse into a single write, and a scroll held at
 *  a steady speed stops writing altogether.
 *
 *  16 steps is fine enough that the quantisation isn't visible — one step is
 *  ~1px of trail at the far end and well under a pixel everywhere else. */
const GLITCH_QUANTIZE_STEPS = 16;

/**
 * Konami-code easter egg — PC, top page only: type ↑↑↓↓←→←→BA and the page
 * inverts (photography excepted — see .konami-glitch img in globals.css)。
 * スクロール演出は、かつての RGB 色ずれ＋残像トレイル（CSS text-shadow ＋
 * canvas での再現）から、リキッドグラスの屈折（画面上下の帯に入った一覧の
 * 行がガラス越しに潰れる — konami-warp-canvas.tsx）へ置き換えた — per
 * direct follow-up ("スクロール時のグリッチは無しで…リキッドグラスエフェクト
 * で歪む演出を加えて")。この component が毎フレーム書く --konami-glitch
 * （スクロール強度 0..1）の仕組みはそのままで、読み手が CSS から canvas に
 * 変わっただけ。Entering the sequence again (or pressing Escape) turns it
 * back off.
 *
 * The inversion is a full-screen `mix-blend-mode: difference` layer over a
 * white fill, not a `filter: invert()` on an ancestor. That distinction
 * matters here: `filter` on an ancestor makes it the containing block for
 * every `position: fixed` descendant, which would break the header, the
 * MENU pill, the hover previews and the idle overlay all at once. A blended
 * overlay inverts whatever is painted beneath it while leaving layout and
 * positioning completely untouched.
 *
 * The glitch itself is driven by one inherited CSS custom property
 * (`--konami-glitch`, 0..1) rather than per-element JS, so a single style
 * write per frame drives the entire page — see .konami-glitch in
 * globals.css for what actually reads it. Text uses `text-shadow`
 * specifically because it inherits, so no element needs to be selected or
 * touched individually, and because it changes nothing about layout or
 * transforms — several elements on this site already animate their own
 * `transform`, and stacking another one on top of those would fight them.
 *
 * Scoped to "/" so it can't follow the visitor into a project detail page or
 * About: it's a joke about the top page, and the detail pages in particular
 * are full of client photography that shouldn't be tangled up in it. The
 * effect switches itself off on navigation rather than merely hiding, so
 * nothing is left behind on <html> for the next page to inherit.
 */
export function KonamiGlitch() {
  const pathname = usePathname();
  const isTopPage = pathname === "/";
  const [active, setActive] = useState(false);
  /** 切り替えトランジション（KonamiWipe — ページの板が立体的に倒れて
   *  はけ、反対側からもう一方のモードの面が起き上がる演出）の走行状態。
   *  null = 非走行 — per direct follow-up（Savee の立方体スクロール動画
   *  "表示中のデフォルト時の画面が立体的に左上にはけて、右下からダーク
   *  モードの画面が現れるイメージ"）。
   *
   *  KonamiWipe はもう何も描かない純粋なアニメーター（body の 3D
   *  transform を駆動する）。active の反転は板が最も倒れた折り返しの
   *  onSwitch で行う — 前半はライトの面、後半はダークの面が同じ板に
   *  乗って回る。エッグ本体（反転レイヤー・ロゴ・warp canvas）は active
   *  だけでゲートし、ワイプ中も普通にマウントされる — 板の中身として
   *  丸ごと回すため。 */
  const [wipeMode, setWipeMode] = useState<"on" | "off" | null>(null);
  /** How far into SEQUENCE the current run of keystrokes has matched. */
  const progressRef = useRef(0);
  /** Current glitch intensity, 0..1 — a ref, not state: it updates every
   *  frame while scrolling and only ever feeds a CSS variable, so putting it
   *  in state would re-render the whole component ~60 times a second for no
   *  rendered output at all. */
  const glitchRef = useRef(0);
  /** Mirrors `active` for the Lenis callback to read — that callback is kept
   *  reference-stable (see below), so it can't close over the state value. */
  const activeRef = useRef(active);
  /** Same trick for `isTopPage`, read by the key handler below (which is
   *  bound once on mount and must not be re-bound on every navigation). */
  const isTopPageRef = useRef(isTopPage);
  /** Same trick for `wipeMode` — ワイプ走行中の再入力（シーケンス2周目や
   *  Escape）を無視するために key handler が読む。走行中に受け付けると、
   *  onComplete の反転と二重になって切り替えが食い違う。 */
  const wipeModeRef = useRef(wipeMode);
  const decayFrameRef = useRef<number | null>(null);

  // Both mirrors are written in an effect rather than straight from the
  // render body: a ref assignment during render is a lint error here
  // (react-hooks/refs) and is genuinely unsafe under a re-render that gets
  // thrown away. Neither reader can run before this commits — the Lenis tick
  // and the keydown handler are both driven by events that happen after
  // paint — so nothing is lost by the one-commit delay.
  useEffect(() => {
    activeRef.current = active;
    isTopPageRef.current = isTopPage;
    wipeModeRef.current = wipeMode;
  }, [active, isTopPage, wipeMode]);

  /** Which way the trail currently points, as a Y multiplier: -1 draws it
   *  upward, +1 downward. Held separately from the magnitude so it keeps
   *  pointing the right way while the glitch decays, instead of snapping to
   *  a default the moment scrolling stops. Starts at -1 (upward), matching
   *  the downward scroll that any first interaction almost always is. */
  const trailDirectionRef = useRef(-1);
  /** Previous scroll offset, for deriving the direction below. */
  const prevScrollRef = useRef(0);

  /** Last values actually written to the DOM — see GLITCH_QUANTIZE_STEPS.
   *  NaN so the very first write can never be skipped as a no-op. */
  const writtenGlitchRef = useRef(Number.NaN);
  const writtenDirectionRef = useRef(Number.NaN);

  const writeGlitch = useCallback((value: number, trailDirection?: number) => {
    const clamped = value < GLITCH_EPSILON ? 0 : Math.min(1, value);
    // The *unrounded* value stays in glitchRef: it's what the decay below
    // multiplies each frame, and feeding the rounded one back would make the
    // decay stair-step (and stall outright once a step maps to itself).
    glitchRef.current = clamped;
    if (trailDirection) trailDirectionRef.current = trailDirection;

    const quantized =
      Math.round(clamped * GLITCH_QUANTIZE_STEPS) / GLITCH_QUANTIZE_STEPS;
    const direction = trailDirectionRef.current;
    if (quantized === writtenGlitchRef.current && direction === writtenDirectionRef.current) {
      return;
    }
    writtenGlitchRef.current = quantized;
    writtenDirectionRef.current = direction;

    const root = document.documentElement;
    root.style.setProperty("--konami-glitch", String(quantized));
    root.style.setProperty("--konami-glitch-dir", String(direction));
  }, []);

  // Leaving the top page turns it off outright — see this component's own
  // doc comment. Coming back requires entering the sequence again, which is
  // the point: it's meant to be found, not to persist as a mode.
  //
  // The disable is deliberate. react-hooks/set-state-in-effect exists to stop
  // effects that derive state which could have been computed during render —
  // but this isn't derivation, it's a one-way reset on navigation, and the
  // derived alternative (`active && isTopPage`) has different behaviour: it
  // would switch the egg straight back on when the visitor returned to "/",
  // since nothing would have cleared the flag in between.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    if (!isTopPage) setActive(false);
    // ワイプも打ち切る — 走行中に遷移すると、遷移先で onComplete が発火
    // してトップページ外でエッグの状態が動いてしまう（エッグは "/" 限定）。
    if (!isTopPage) setWipeMode(null);
  }, [isTopPage]);

  // --- sequence detection -------------------------------------------------
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isTopPageRef.current) return;
      if (window.innerWidth < MIN_VIEWPORT_PX) return;

      if (event.key === "Escape") {
        // ワイプ中は無視（wipeModeRef の doc comment 参照）。Escape 自体は
        // 従来どおり演出なしの即時オフ — 逃げ道は速いのが正しい。
        if (wipeModeRef.current) return;
        setActive(false);
        return;
      }

      const expected = SEQUENCE[progressRef.current];
      const pressed = event.key.length === 1 ? event.key.toLowerCase() : event.key;

      if (pressed === expected) {
        // 2打目以降（= 進行中のシーケンスを続ける入力）はブラウザの既定
        // 動作に流さない — per direct follow-up ("↑↑と入力して次に↓を
        // 入力するとき、ページが下スクロールに反応しないようにして")。
        // 矢印キーの既定動作はページスクロールなので、コナミコードの
        // 途中でページが上下してしまっていた。1打目だけは奪わない —
        // 「↑を1回押す」はまだ普通のキー操作かもしれず、通常のスクロール
        // 操作を壊さないため（1打目の↑で上に少し動くのは、コードを入力
        // する人はたいていページ最上部にいるので実害がない）。
        if (progressRef.current > 0) event.preventDefault();
        progressRef.current += 1;
        if (progressRef.current === SEQUENCE.length) {
          progressRef.current = 0;
          // 直接の即時反転はしない — ワイプを開始する（wipeMode の doc
          // comment 参照）。active の反転はワイプの折り返し（onSwitch）が
          // 行う。ワイプ走行中の完了入力は無視。
          if (!wipeModeRef.current) {
            setWipeMode(activeRef.current ? "off" : "on");
          }
        }
        return;
      }

      // A wrong key resets — but if it happens to be the sequence's own first
      // key, start a fresh run from 1 rather than 0. Without that, "↑↑↑↓↓..."
      // (an easy thing to do on a keyboard that repeats) would never match.
      progressRef.current = pressed === SEQUENCE[0] ? 1 : 0;
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // --- class + cleanup ----------------------------------------------------
  useEffect(() => {
    const root = document.documentElement;
    // Both properties are removed outright rather than zeroed, so the
    // write-skipping cache above has to be invalidated alongside them —
    // otherwise the first write after re-enabling could match the last value
    // from the previous run and be skipped, leaving the variables unset.
    if (!active) {
      root.classList.remove("konami-glitch");
      root.style.removeProperty("--konami-glitch");
      root.style.removeProperty("--konami-glitch-dir");
      glitchRef.current = 0;
      writtenGlitchRef.current = Number.NaN;
      writtenDirectionRef.current = Number.NaN;
      return;
    }
    root.classList.add("konami-glitch");
    return () => {
      root.classList.remove("konami-glitch");
      root.style.removeProperty("--konami-glitch");
      root.style.removeProperty("--konami-glitch-dir");
      writtenGlitchRef.current = Number.NaN;
      writtenDirectionRef.current = Number.NaN;
    };
  }, [active]);

  // --- scroll velocity -> glitch intensity --------------------------------
  // Reads Lenis's own velocity rather than differencing scrollY by hand, for
  // the same reason every other scroll-driven effect on this site does: it's
  // already smoothed and already ticking, so there's nothing extra to
  // measure or throttle.
  // Wrapped in useCallback and passed without a deps array — matching
  // mobile-home.tsx's own handleLenisTick convention: lenis-react re-invokes
  // the callback immediately whenever its *reference* changes, so a fresh
  // inline arrow every render would fire it constantly rather than only on
  // real scroll ticks.
  const handleLenisTick = useCallback(
    (lenis: Lenis) => {
      if (!activeRef.current) return;
      const velocity = Math.abs(lenis.velocity);
      const target = Math.min(1, velocity / VELOCITY_AT_FULL_GLITCH);
      // Direction is derived from the change in scroll offset rather than
      // from `lenis.velocity`/`lenis.direction`, whose sign convention isn't
      // documented either way — `scroll` is unambiguously "how far down the
      // page we are", so a positive delta is unambiguously downward.
      // The trail then points *opposite* to travel, the way a motion streak
      // lags behind the thing making it: scrolling down smears upward,
      // scrolling up smears downward.
      const delta = lenis.scroll - prevScrollRef.current;
      prevScrollRef.current = lenis.scroll;
      const trailDirection = delta > 0 ? -1 : delta < 0 ? 1 : 0;
      // 立ち上がりも減衰も低域通過で均す — per direct follow-up ("画面上下の
      // グラスエフェクトをもっと滑らかにして")。旧グリッチ時代は「立ち上がり
      // は即値・減衰のみ緩やか」（tearing らしさのための意図的な設計）だった
      // が、リキッドグラスでは速度の細かな揺れがそのまま歪みのビクつきに
      // なるため、上りにも補間を挟む。ATTACK は1フレームで目標へ寄る割合。
      if (target >= glitchRef.current) {
        writeGlitch(glitchRef.current + (target - glitchRef.current) * GLITCH_ATTACK, trailDirection);
      } else {
        writeGlitch(glitchRef.current * GLITCH_DECAY);
      }
    },
    [writeGlitch]
  );
  useLenis(handleLenisTick);

  // Lenis only ticks while it has something to do, so the decay above can
  // stall part-way once scrolling stops. This keeps easing it to 0 on its
  // own rAF until it actually gets there.
  useEffect(() => {
    if (!active) return;
    function step() {
      if (glitchRef.current > 0) writeGlitch(glitchRef.current * GLITCH_DECAY);
      decayFrameRef.current = requestAnimationFrame(step);
    }
    decayFrameRef.current = requestAnimationFrame(step);
    return () => {
      if (decayFrameRef.current !== null) cancelAnimationFrame(decayFrameRef.current);
    };
  }, [active, writeGlitch]);

  if (!active && wipeMode === null) return null;

  return (
    <>
      {/* エッグ本体は active だけでゲートする — ワイプ（板の3D回転）中も、
          折り返しで active が立った瞬間から板の中身として丸ごと回るため
          （wipeMode の doc comment 参照）。 */}
      {active && (
        <>
          {/* 3D wireframe の ANDMADE ロゴ背景 — per direct follow-up ("現状の
              背景は消して、代わりに…3D化して")。旧 KonamiDissolveLogo は退役
              （ファイルは残置）。negative-z の重なりで背景として読める点は
              同じ。
              ON のワイプ中はまだマウントしない — 頂点からの描き込み登場
              アニメーションは、板が据わり切ってダークモードが完全に表示
              されてから始める — per direct follow-up ("背面ロゴのアニメー
              ションスタートは、ダークモードの画が完全に表示されてからに
              して")。OFF のワイプ中は逆に出したままにする（解除で板が
              はけていく間、ダークの面からロゴだけ先に消えると不自然）。 */}
          {(wipeMode === null || wipeMode === "off") && <KonamiLogo3D />}

          {/* Warps the project list's text on scroll. Mounted only while the egg
              runs, and it tears itself down completely on unmount (texture, GL
              context and the list's own hidden state) — see its doc comment. It
              reads the same two refs that drive the CSS half, so the two stay in
              lockstep without a second velocity calculation.
              ロゴと同じく ON のワイプ完了までマウントしない — per direct
              follow-up ("エッグ切り替わり時に、一瞬止まる挙動あり。黒地を
              無くした対応をしたからかも"): マスク方式で WebGL コンテキストが
              2本になり、板の回転中（折り返しの active 反転直後）に生成＋
              シェーダーコンパイルが同期で走ってヒッチしていた。ワイプ完了後
              （静止画面）に初期化を移す。回転中はスクロールもホバーも実質
              起きないので、無くて困る瞬間はない。OFF のワイプ中は出した
              まま（ロゴと同じ理由）。 */}
          {(wipeMode === null || wipeMode === "off") && (
            <KonamiWarpCanvas intensityRef={glitchRef} directionRef={trailDirectionRef} />
          )}

          {/* z-[9997] — above the page, above the warp canvas (so the warped text
              gets inverted along with everything else), but deliberately below
              grid-overlay.tsx's own z-[9999] debug grid, so that stays readable
              while this is on. `hidden lg:block` mirrors the MIN_VIEWPORT_PX
              guard above for the case where the window is resized down while
              active. */}
          <div
            aria-hidden
            // konami-viewport-fill — 板の3D回転中のビューポート固定
            // （globals.css の html.konami-cube ルール参照）。
            className="konami-viewport-fill pointer-events-none fixed inset-0 z-[9997] hidden bg-white mix-blend-difference lg:block"
          />
        </>
      )}

      {/* Contact と同じ質感のフィルムグレイン — per direct follow-up
          ("エッグ時の黒背景にcontactと同じノイズをのせて")。ワイプ中も
          含め、エッグが立っている間ずっと乗せる（konami-grain.tsx）。 */}
      {active && <KonamiGrain />}

      {/* 切り替えの立体回転ワイプ（konami-wipe.tsx の doc comment 参照）。
          折り返し（板が最も倒れた瞬間）の onSwitch で active を反転し、
          据わり切ったら wipeMode を畳む。 */}
      {wipeMode !== null && (
        <KonamiWipe
          mode={wipeMode}
          onSwitch={() => setActive((current) => !current)}
          onComplete={() => setWipeMode(null)}
        />
      )}
    </>
  );
}
