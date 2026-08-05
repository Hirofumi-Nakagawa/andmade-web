"use client";

import { useEffect, useRef } from "react";

/**
 * エッグ切り替えのトランジション — ブロブ状の反転がランダムに画面を
 * 覆っていき、覆われた場所は**その場で**エッグ（ダークモード）の見た目に
 * なる。全面を覆い切ったら本物のエッグに差し替えて終わり。剥がしの動きは
 * 無い — per direct follow-up（w-wired.com のスクリーンショット付き →
 * "ブロブレイヤーをマスクにするイメージ"）。
 *
 * このキャンバスは「エッグの全面反転レイヤー（konami-glitch.tsx の
 * z-9997 の白 difference div）をブロブの形に切り抜いたもの」そのもの:
 * 白 + mix-blend-difference で、同じ z 9997 に置かれる。親はワイプ開始の
 * 時点で html の konami-glitch クラスまで先に立てる（ON方向は active を
 * 即 true にする）ので、写真の相殺反転（.konami-glitch img { invert }）や
 * アイドルレイヤーの前面化（.konami-glitch-no-blend、z 9998 = この
 * キャンバスより上）も最初から効いている。つまりブロブの内側は本物の
 * エッグと画素単位で同じ構成 — 初版の「z 10000 の黒/白ベタで全部を機械的に
 * 反転する」方式で出た「写真とアイドルレイヤーが一瞬反転して見える」
 * （per direct follow-up "反転表示が一瞬出るの気になるな。アイドルレイヤー
 * も一瞬反転されて出る"）は、アイドルレイヤーがこのキャンバスの上に
 * 居ることで構造的に起きなくなった。
 *
 * mode="off"（エッグ解除）は同じ絵の反対再生ではなく反転マスクの反転:
 * 全面白（＝現行の反転レイヤーと同一）から始めて、ブロブの形に穴を開けて
 * いく。穴の場所はライトモードに戻って見え、全面が穴になったら親が
 * active を落として本当に解除する。
 *
 * 写真（サムネイル等）はワイプの反転対象から除外する — per direct
 * follow-up ("img時でエッグ発動させるとサムネが一瞬反転してからブロブ
 * レイヤーがかぶる")。写真はライトモードでもエッグ定常でも原色（定常側は
 * .konami-glitch img { invert } と全面 difference の相殺）なので、遷移中の
 * どの瞬間も原色のままが正しい。だが CSS フィルタは空間的にマスクできない
 * ため、クラスを立てた瞬間に未反転領域の写真だけがネガに見えてしまって
 * いた。対処は二段: ①ワイプ中は konami-wiping クラス（globals.css）で
 * 相殺反転そのものを保留し、②このキャンバスが毎フレーム、可視の
 * img/video の矩形の alpha を 0 に抜いて difference の対象からも外す。
 * ①+② で写真は常に素通し＝常に原色。矩形単位なので、ブロブが写真を
 * またぐフレームでは写真だけ四角く原色が残るが、それは「覆われた場所は
 * ダークモードの見た目（＝写真は原色）」の先取りでもある。
 * 除外の例外（矩形を抜かないもの）:
 *  - .konami-glitch-no-blend 内（アイドルレイヤー）— このキャンバスより
 *    上（z 9998）に居るのでそもそも反転されない。抜くと透過部分の背景に
 *    未反転の四角が空く。
 *  - .project-hover-preview 内（Txt ホバーの残像）— ラッパーが半透明で、
 *    抜くと透けた背景の四角が未反転で残る。残像は不透明度 10% なので
 *    反転されても実質見えない。
 *  - src が .svg の img（フッターのロゴマーク等）— 透過画像なので同じく
 *    四角が空く。こちらは相殺反転側（globals.css）も保留しないので、
 *    定常時と同じ扱いのまま。
 *
 * トレードオフとして残るもの（許容）: 3Dロゴ背景と warp canvas はワイプ中
 * マウントしない（ロゴは黒線で描かれており、まだ反転が全面でない画面では
 * 未反転領域に黒いワイヤーフレームが素で見えてしまう）ので、切り替えの
 * 瞬間にロゴがポンと出る/消える。また ON ワイプ中の未反転領域は
 * --background が一足先に #fff になるぶん、クリーム（#f6f6f4）よりわずかに
 * 白い。どちらも「反転すべきでないものが反転して見える」よりずっと軽い。
 *
 * ブロブの形はしきい値ノイズ: 起動のたびに乱数で滑らかな2Dノイズ場を作り、
 * 「ノイズ値 < しきい値」のピクセルだけを対象にする。しきい値を 0→1 に
 * 動かすとノイズの谷から湧いて有機的に繋がりながら広がる(参照画像の
 * 見え方)。解像度は 1/PIXEL_SIZE に落として image-rendering: pixelated で
 * 拡大 — 毎フレーム全ピクセルのしきい値判定をするため軽くする意味と、
 * 参照画像の数px単位で段付いた輪郭の再現を兼ねる。
 */

/** 覆い切るまでの時間と、覆い切ってから切り替えるまでの保持（ms）。
 *  保持は「全面反転の絵」を確実に1フレーム以上見せてから差し替えるための
 *  マージン。700 → 900 → 800（いずれも直接の指示）。 */
const COVER_MS = 800;
const HOLD_MS = 80;

/** ノイズ1ピクセルの表示サイズ（CSS px）。輪郭の段の粗さでもある。 */
const PIXEL_SIZE = 3;

/** ノイズのオクターブ（cell = 格子1マスの低解像度px数、amp = 寄与）。
 *  1つ目がブロブの大きさの主成分（44 × PIXEL_SIZE ≈ 130 CSS px）、
 *  2つ目が輪郭の細かい欠け・飛び地を足す。 */
const OCTAVES = [
  { cell: 44, amp: 1 },
  { cell: 14, amp: 0.45 },
] as const;

/** smoothstep — 格子の補間に。線形だと格子の菱形が輪郭に透ける。 */
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** 値ノイズ（乱数格子の平滑補間の重ね合わせ）を [0.01, 0.99] に正規化して
 *  返す。上限が 1 未満であることが「しきい値 1 で必ず全画素が対象」の保証。 */
function makeNoise(w: number, h: number): Float32Array {
  const field = new Float32Array(w * h);
  for (const { cell, amp } of OCTAVES) {
    const gw = Math.ceil(w / cell) + 2;
    const gh = Math.ceil(h / cell) + 2;
    const grid = new Float32Array(gw * gh);
    for (let i = 0; i < grid.length; i++) grid[i] = Math.random();
    for (let y = 0; y < h; y++) {
      const gy = y / cell;
      const y0 = Math.floor(gy);
      const fy = smooth(gy - y0);
      for (let x = 0; x < w; x++) {
        const gx = x / cell;
        const x0 = Math.floor(gx);
        const fx = smooth(gx - x0);
        const top = grid[y0 * gw + x0] + (grid[y0 * gw + x0 + 1] - grid[y0 * gw + x0]) * fx;
        const bottom =
          grid[(y0 + 1) * gw + x0] + (grid[(y0 + 1) * gw + x0 + 1] - grid[(y0 + 1) * gw + x0]) * fx;
        field[y * w + x] += amp * (top + (bottom - top) * fy);
      }
    }
  }
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < field.length; i++) {
    if (field[i] < min) min = field[i];
    if (field[i] > max) max = field[i];
  }
  const range = max - min || 1;
  for (let i = 0; i < field.length; i++) {
    field[i] = 0.01 + (0.98 * (field[i] - min)) / range;
  }
  return field;
}

export function KonamiWipe({
  mode,
  onComplete,
}: {
  /** "on" = 反転ブロブが増えていく（エッグ起動）。"off" = 全面反転から
   *  ブロブ状に穴が開いていく（エッグ解除）。 */
  mode: "on" | "off";
  /** 覆い切って（"off" は開け切って）HOLD_MS 置いたら一度だけ呼ばれる。
   *  親はここで本物のエッグへの差し替え（"off" なら active を落とす）と、
   *  このコンポーネントを外すのを**同じハンドラで**行う — 同一コミットに
   *  入ることで、キャンバスと本物の反転レイヤーが隙間なく入れ替わる。 */
  onComplete: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // コールバックとモードは ref 経由で読む — 親の再レンダリングで参照が
  // 変わっても走行中のアニメーションを作り直さないため（deps を空に保つ。
  // mode は走行中に変わらない前提だが、初回値の閉じ込めで十分）。
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });
  const modeRef = useRef(mode);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const on = modeRef.current === "on";
    // ノイズはこれまでどおり低解像度（1/PIXEL_SIZE）だが、表示用の
    // キャンバスはフル解像度にして、低解像度のブロブを smoothing 無しの
    // drawImage で PIXEL_SIZE 倍に引き伸ばす。以前は低解像度バッファを
    // CSS で全画面に引き伸ばしていたが、その方式だと ①バッファ幅×3 と
    // ビューポート幅のわずかな差で拡大率が 3 からずれて座標が画面端ほど
    // 流れる ②写真の「抜き」も 3px グリッドに丸まる、の合わせ技で、抜きの
    // 矩形がサムネごとに 2〜3px ずれて見えていた — per direct follow-up
    // ("img時のサムネ位置が揃ってなくて変")。フル解像度なら抜きは
    // clearRect で CSS px 精度、ブロブの段付き（3px）は維持される。
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    canvas.width = Math.max(1, Math.floor(vw * dpr));
    canvas.height = Math.max(1, Math.floor(vh * dpr));
    const w = Math.max(1, Math.ceil(vw / PIXEL_SIZE));
    const h = Math.max(1, Math.ceil(vh / PIXEL_SIZE));
    const ctx = canvas.getContext("2d");
    const low = document.createElement("canvas");
    low.width = w;
    low.height = h;
    const lowCtx = low.getContext("2d");
    let frame: number | null = null;
    if (!ctx || !lowCtx) {
      // 2D コンテキストが取れない環境ではワイプ無しで即座に切り替える —
      // 演出は消えるが機能（エッグの反転）は損なわない。
      frame = requestAnimationFrame(() => onCompleteRef.current());
      return () => {
        if (frame !== null) cancelAnimationFrame(frame);
      };
    }

    const noise = makeNoise(w, h);
    const img = lowCtx.createImageData(w, h);
    const data = img.data;
    // 反転レイヤーの白（difference の相手）。rgb を先に全部 255 にして
    // おき、毎フレームは alpha だけ書き換える。
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    }
    ctx.imageSmoothingEnabled = false; // 段付きの輪郭のまま拡大する
    const start = performance.now();
    const easeInOut = (t: number) => t * t * (3 - 2 * t);

    const render: FrameRequestCallback = (now) => {
      const elapsed = now - start;
      if (elapsed >= COVER_MS + HOLD_MS) {
        onCompleteRef.current();
        return;
      }
      const threshold = elapsed < COVER_MS ? easeInOut(elapsed / COVER_MS) : 1;
      for (let i = 0; i < noise.length; i++) {
        const inBlob = noise[i] < threshold;
        // on: ブロブの内側が反転（白）。off: ブロブの内側が穴（透明）。
        data[i * 4 + 3] = inBlob === on ? 255 : 0;
      }
      lowCtx.putImageData(img, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // 低解像度1ピクセル = 画面の PIXEL_SIZE px、を dpr 込みで正確に。
      ctx.drawImage(low, 0, 0, w * PIXEL_SIZE * dpr, h * PIXEL_SIZE * dpr);

      // 写真の矩形を反転対象から抜く（コンポーネントの doc comment 参照）。
      // フル解像度の clearRect なので実測位置にぴったり合う。毎フレーム
      // 実測するのは、ワイプ中もスクロールできる（Lenis は止めていない）
      // ため。対象は高々数十枚で、矩形読みは1枚あたりマイクロ秒オーダー。
      for (const el of document.querySelectorAll<HTMLElement>("img, video")) {
        if (el.closest(".konami-glitch-no-blend, .project-hover-preview")) continue;
        if (
          el instanceof HTMLImageElement &&
          (el.currentSrc || el.src).split("?")[0].endsWith(".svg")
        ) {
          continue;
        }
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
        ctx.clearRect(r.left * dpr, r.top * dpr, r.width * dpr, r.height * dpr);
      }

      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    // zIndex 9997 — 本物の全面反転レイヤー（konami-glitch.tsx）と同じ座。
    // アイドルレイヤー等の .konami-glitch-no-blend（9998）より下に居ること
    // が肝心（コンポーネントの doc comment 参照）。inline なのは他の
    // konami 系と同じ理由（生成CSSの遅延回避）。hidden lg:block も本物の
    // 反転レイヤーに合わせる。バッファはフル解像度（effect 参照）なので
    // image-rendering は不要になった。
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 hidden h-full w-full lg:block"
      style={{ zIndex: 9997, mixBlendMode: "difference" }}
    />
  );
}
