"use client";

import { useEffect, useRef } from "react";

/**
 * エッグ中の画面全体に乗せるフィルムグレイン — per direct follow-up
 * ("エッグ時の黒背景にcontactと同じノイズをのせて")。
 *
 * Contact の背景シェーダー（contact-blend-background.tsx）のグレイン段
 * （GRAIN 0.06 / GRAIN_PX 1 / GRAIN_FPS 12 — 1ピクセル粒のハッシュノイズを
 * 12fps で引き直して色に足す）と同じ見た目を、WebGL を立てずに再現する:
 * 乱数の粒を焼いたタイル1枚を用意し、毎ティック（12fps）ランダムな
 * オフセットで敷き詰め直す。タイルの中身は動かないが、位置が毎回飛ぶので
 * 目には毎フレーム引き直しと区別が付かない（フィルムグレインの定石）。
 *
 * 合成は screen ブレンド: 黒地では粒がそのまま淡く光り、白文字の上では
 * ほぼ無変化。エッグの画面は「黒地に白」の世界なので、Contact の
 * 「色に±で足す」と実質同じ読み味になる。振幅は Contact と同じ 0.06。
 *
 * z 9998 = 反転レイヤー（9997）とワイプ（9997）の上、デバッググリッド
 * （9999）の下。反転より上に居るので粒自体は反転されない（screen 用に
 * 正方向の粒だけ焼いてあるため、反転されると黒地が粒ぶん沈む逆効果に
 * なる）。エッグ専用なので konami-glitch.tsx が active の間だけ
 * マウントする。
 */

/** 粒の振幅（0..1）。Contact の SETTINGS.grain は 0.06 だが、あちらは
 *  ±両方向で色に足す方式なのに対し、こちらは screen の正方向のみで
 *  知覚上の振幅が半分になる — 0.06 では「いまいちわからない」との
 *  指摘（direct follow-up）を受けて 0.10 に。 */
const GRAIN = 0.1;
/** 引き直しの頻度 — Contact の SETTINGS.grainFps と同値。 */
const GRAIN_FPS = 12;
/** 乱数タイルの一辺（デバイスpx）。画面より小さくてよい（敷き詰める）が、
 *  小さすぎると繰り返しの模様が目に付く。 */
const TILE_PX = 512;

export function KonamiGrain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 乱数タイル: 各ピクセルに 0〜GRAIN の明るさの粒（screen で足される
    // 正方向のみ — コンポーネントの doc comment 参照）。
    const tile = document.createElement("canvas");
    tile.width = TILE_PX;
    tile.height = TILE_PX;
    const tileCtx = tile.getContext("2d");
    if (!tileCtx) return;
    const tileImg = tileCtx.createImageData(TILE_PX, TILE_PX);
    for (let i = 0; i < TILE_PX * TILE_PX; i++) {
      const v = Math.round(Math.random() * GRAIN * 255);
      tileImg.data[i * 4] = v;
      tileImg.data[i * 4 + 1] = v;
      tileImg.data[i * 4 + 2] = v;
      tileImg.data[i * 4 + 3] = 255;
    }
    tileCtx.putImageData(tileImg, 0, 0);
    const pattern = ctx.createPattern(tile, "repeat");
    if (!pattern) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
      canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    let frame: number | null = null;
    let lastTick = -Infinity;
    const render: FrameRequestCallback = (now) => {
      frame = requestAnimationFrame(render);
      if (now - lastTick < 1000 / GRAIN_FPS) return;
      lastTick = now;
      // タイルをランダムな位置ずらしで敷き直す＝粒の引き直しに見える。
      // 写真やホバー画像の矩形も含めて**全面均一**に乗せる — 一時期
      // 「画像が薄く見える」対策で写真の矩形を抜いていたが、真因は残像の
      // 重なり（konami-warp-canvas.tsx の setGhostsBelow で解決済み）で、
      // 抜いた矩形はノイズが乗らないぶん純黒のまま残り、ノイズで僅かに
      // 明るい背景に対して黒く浮いて見えていた — per direct follow-up
      // ("ノイズを乗せた分、黒が目立つので、ノイズ背景に合わせた色に
      // 変更して")。均一に乗せれば「合わせる」べき色差そのものが無くなる
      // （Contact の背景グレインも全面一律）。
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(-Math.floor(Math.random() * TILE_PX), -Math.floor(Math.random() * TILE_PX));
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, canvas.width + TILE_PX, canvas.height + TILE_PX);
      ctx.restore();
    };
    frame = requestAnimationFrame(render);

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    // zIndex 9998 / screen — コンポーネントの doc comment 参照。inline
    // なのは他の konami 系と同じ理由（生成CSSの遅延回避）。
    // konami-viewport-fill — 板の3D回転中のビューポート固定（globals.css の
    // html.konami-cube ルール参照。無いと回転中グレインが縦に伸びる）。
    <canvas
      ref={canvasRef}
      aria-hidden
      className="konami-viewport-fill pointer-events-none fixed inset-0 hidden h-full w-full lg:block"
      style={{ zIndex: 9998, mixBlendMode: "screen" }}
    />
  );
}
