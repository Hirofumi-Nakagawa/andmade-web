"use client";

import { useEffect, useRef } from "react";
import { useLenis } from "lenis/react";
import { withBasePath } from "@/lib/base-path";

/**
 * エッグ実行中の背景 — 3D化した ANDMADE ロゴのワイヤーフレーム。
 *
 * per direct follow-up ("現状の背景は消して、代わりにANDMADEのロゴを0.5pxの
 * 白線アウトラインだけにして、ロゴ自体に厚みを持たせて3D化してスクロールと
 * カーソル位置に応じて回転や向きを変えるようにして")。それまでの
 * KonamiDissolveLogo（グラデーションマップのディゾルブ演出）はこの指示で
 * 差し替え。ファイル自体は他の退役コンポーネントと同じく残してある
 * （konami-glitch.tsx から参照を外しただけ）。
 *
 * 3D の作り: WebGL や three.js ではなく、CSS 3D transform の「スライス積層」。
 * ロゴの SVG（アウトラインのみ、stroke 0.5px）を SLICE_COUNT 枚、
 * translateZ を変えて重ね、perspective 付きの親を回すと押し出しに見える。
 *   - 現在は前面＋背面の2枚のみ（SLICE_COUNT の doc comment 参照 —
 *     側面の線を出さない指定のため、中間スライスは置かない）
 *   - 依存を増やさない（three.js はこのプロジェクトに無い）
 *   - 全スライスが GPU 合成の transform だけで動くので、エッグの他の演出
 *     （リキッドグラスの canvas、反転レイヤー）と並走しても軽い
 *
 * 回転の入力は2系統で、どちらも慣性付きの追従（低域通過）を挟む:
 *   - カーソル: 画面内の位置を [-1,1] に正規化 → 目標の rotateX/rotateY。
 *     カーソルに「向く」のではなく傾く。奥行きの見得を作る主成分。
 *   - スクロール: Lenis の velocity を Y 軸の回転速度に足す → スクロール中は
 *     くるくると回り、止めると惰性で減速して最寄りの静止姿勢に落ち着く…
 *     のではなく単に減速して止まる（姿勢のスナップはしない。背景の飾りで
 *     あって読ませる要素ではないため）。
 *
 * 反転レイヤー（konami-glitch.tsx の mix-blend-difference、z-[9997]）より
 * 下（-z-10）に置かれるので、ここで白い線を描くと画面上では黒い線に反転
 * される…が、エッグ中はページ背景も #000 に落ちている（--background: #fff が
 * 反転して #000）ため、白線のままだと消えてしまう。それを避けるには反転後に
 * 白になる色＝#000 を描けばよいが、「0.5pxの白線」という指定は見た目の話と
 * 解釈し、反転を通した結果が白線になるよう stroke は black にしてある。
 */

/** ロゴの元 SVG（public/andmade-logo.svg）の viewBox。パスは実行時に fetch で
 *  読み、stroke だけ差し替えて使う — パス文字列（7本、計1000文字超）をここへ
 *  複製すると、ロゴ改定時に2か所目の更新漏れが起きるため。 */
const LOGO_VIEWBOX = { w: 1410, h: 190 };

/** 厚みを構成するスライス数と、全体の厚み（px、transform の Z 空間）。
 *
 *  2枚 = 前面と背面のみ — per direct follow-up ("厚みの側面部分の線は出ない
 *  ようにして")。スライス積層では中間の枚数がそのまま「側面の壁」の見え方に
 *  なる（14枚入れていた頃は輪郭線の束が側面として立ち上がっていた）ので、
 *  中間を全部抜いて前後2枚の輪郭だけにすると、厚みは前後の輪郭のずれとして
 *  読めつつ側面の線は存在しなくなる。中空の押し出しの見え方。
 *
 *  厚みは 56 → 96px（直接の指示 "厚みをもう少し厚くして"）。 */
const SLICE_COUNT = 2;
const THICKNESS_PX = 96;

/** 線の透過。0.5 → 0.4 → 0.45（いずれも直接の指示）。前面のアウトラインと、
 *  エッジ線の手前側の端が読む。 */
const LINE_OPACITY = 0.45;
/** 奥（背面）側の透過 — per direct follow-up ("奥の線は手前の線よりも少し
 *  薄くして / 頂点を繋いでる線も奥にいくほど薄くして")。
 *
 *  どちらのスライスが「手前」かは固定ではない — スクロールで Y 軸回転が
 *  半周を跨ぐと裏面が視点側に来る（per direct follow-up "スクロールして
 *  ロゴが反転したら、裏面が手前になるので、スクロールに合わせて線の透過も
 *  調整して"）。そのため濃度は CSS 変数（--logo-line-a = 元の前面、
 *  --logo-line-b = 元の背面）として持ち、毎フレーム、現在の Y 回転角の
 *  cos から「どちらがどれだけ視点側か」を出して2値を連続的に入れ替える
 *  （tick() 内参照）。エッジ線のグラデーションも同じ変数を両端で読むので、
 *  反転すればフェードの向きも自動で追従する。この2定数はその両極の値。 */
// 0.22 → 0.17（直接の指示 "もう少しだけ奥を薄くして"）。
const LINE_OPACITY_BACK = 0.17;

/** ロゴの表示幅（ビューポート幅に対する割合）。背景の主役なので大きめ。
 *  62 → 74 → 80 → 82 → 84 → 85（いずれも直接の指示）。 */
const LOGO_WIDTH_VW = 85;

/** perspective（px）。小さいほどパースが強く付く。 */
const PERSPECTIVE_PX = 1100;

/** カーソルによる傾きの最大角（度）。X軸（上下の首振り）と Y軸（左右）。 */
const CURSOR_TILT_X_DEG = 26;
const CURSOR_TILT_Y_DEG = 34;

/** カーソル追従の低域通過係数（1フレームで目標へ寄る割合）。小さいほど
 *  ぬるっと遅れてついてくる。 */
const CURSOR_EASE = 0.06;

/** Lenis velocity（px/frame）→ Y軸回転速度（度/frame）の変換係数と、
 *  スクロールをやめたあとの減速率。 */
const SCROLL_SPIN_FACTOR = 0.12;
const SPIN_DECAY = 0.94;
/** 回転速度の上限（度/frame）。速いフリックでも1回転/秒程度に抑える。 */
const SPIN_MAX_DEG = 6;

/** 走り線（ロゴのライン上を光の筋が走って消える）の設定 — per direct
 *  follow-up ("3秒おきに、ロゴのライン上の複数箇所をランダムに線が走る
 *  アニメーションを加えて")。
 *  実装は SVG の stroke-dash アニメーション: ロゴと同じパスをもう1本重ね、
 *  pathLength="1000" で長さを正規化した上で「短い実線＋残り全部が空白」の
 *  dasharray を張り、stroke-dashoffset を動かすと実線部分だけがライン上を
 *  滑走する。opacity も同じキーフレームで出し入れするので、走りながら
 *  現れて走りながら消える。 */
// 3000 → 2000（直接の指示 "走り線は2秒に一回"）。
const SPARK_INTERVAL_MS = 2000;
/** 1バッチでパス（文字）ごとに走らせる本数 — per direct follow-up
 *  ("ロゴの線が走るアニメーションは、毎回全文字線が走るようにして")。
 *  以前は総本数だけ決めてパスをランダムに選んでいた（3〜6 → 6〜12 →
 *  8〜15 → 10〜15 → 12〜16 と増量してきた）ため、回によって線が走らない
 *  文字が出ていた。全パス×2本 = 14本/バッチで、従来の総本数レンジとも
 *  揃う。 */
const SPARKS_PER_PATH = 2;
/** 実線部分の長さの範囲（pathLength=1000 に対する割合千分率）。 */
const SPARK_DASH_MIN = 40;
const SPARK_DASH_MAX = 110;
/** 1本が走る距離の範囲（同じく千分率）と、走り切るまでの時間。 */
const SPARK_TRAVEL_MIN = 160;
const SPARK_TRAVEL_MAX = 320;
const SPARK_DURATION_MIN_MS = 1100;
const SPARK_DURATION_MAX_MS = 1700;
/** 走り線の濃さ。地のアウトライン（LINE_OPACITY 0.4）より明るくして
 *  「線の上を光が走った」と読めるようにする。 */
const SPARK_OPACITY = 0.9;

/** 登場アニメーション（線がランダムに頂点から描かれる — per direct
 *  follow-up "背面ロゴは、線がランダムに頂点から描かれて表示されるように
 *  して"）のパラメータ。パスごと・エッジ線ごとに delay と duration を
 *  この範囲で抽選するので、全体としては「あちこちの頂点から線が伸びて
 *  ロゴが組み上がる」見え方になる。 */
const DRAW_DELAY_MAX_MS = 450;
const DRAW_DURATION_MIN_MS = 500;
const DRAW_DURATION_MAX_MS = 900;
/** エッジ線（Z方向）は輪郭より少し遅れて伸ばす — 輪郭が先に「描かれて」
 *  から奥行きが繋がるほうが、組み上がりの順序として読める。 */
const DRAW_EDGE_EXTRA_DELAY_MS = 150;
/** 最初の走り線バッチを描き込み完了後まで遅らせる（ms）。描き込み中に
 *  走り線まで走ると、どれが輪郭でどれが演出か分からなくなる。 */
const INITIAL_SPARK_DELAY_MS = 1300;

/**
 * SVG パス文字列から頂点（各コマンドの終点）の絶対座標を集める。
 * このロゴが実際に使うコマンドは M/L/H/V/C/Z のみ（全て絶対座標）なので、
 * 汎用パーサではなくその6つだけを解釈する。C はベジェの終点だけを頂点と
 * みなす（制御点は輪郭上に無いため）。Z は M へ戻るだけで新しい頂点を
 * 生まない。連続する重複（Z 直前に始点と同じ点で終わる等）は捨てる。
 */
function parsePathVertices(d: string): { x: number; y: number }[] {
  const vertices: { x: number; y: number }[] = [];
  const tokens = d.match(/[MLHVCZ]|-?[\d.]+/g) ?? [];
  let x = 0;
  let y = 0;
  let i = 0;
  const num = () => Number.parseFloat(tokens[i++]);
  const push = () => {
    const last = vertices[vertices.length - 1];
    if (!last || Math.abs(last.x - x) > 0.5 || Math.abs(last.y - y) > 0.5) {
      vertices.push({ x, y });
    }
  };
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === "M" || cmd === "L") {
      x = num(); y = num(); push();
    } else if (cmd === "H") {
      x = num(); push();
    } else if (cmd === "V") {
      y = num(); push();
    } else if (cmd === "C") {
      i += 4; // 制御点2つを読み飛ばす
      x = num(); y = num(); push();
    }
    // Z は座標を変えない（次の M が来るだけ）ので何もしない
  }
  return vertices;
}

export function KonamiLogo3D() {
  const stageRef = useRef<HTMLDivElement>(null);
  const svgHostRefs = useRef<(HTMLDivElement | null)[]>([]);
  const edgesHostRef = useRef<HTMLDivElement>(null);
  /** カーソル位置の目標値と現在値（[-1, 1] 正規化）。 */
  const cursorTargetRef = useRef({ x: 0, y: 0 });
  const cursorRef = useRef({ x: 0, y: 0 });
  /** スクロール起因の累積回転角と現在の回転速度。 */
  const spinRef = useRef({ angle: 0, velocity: 0 });

  // Lenis の velocity を回転速度に足し込む。konami-glitch.tsx と同じく
  // 参照安定なコールバックで購読する（lenis-react は参照が変わるたびに
  // 即時再発火するため、インライン矢印関数だと毎レンダー呼ばれる）。
  const spin = spinRef;
  useLenis((lenis) => {
    const v = Math.max(-SPIN_MAX_DEG, Math.min(SPIN_MAX_DEG, lenis.velocity * SCROLL_SPIN_FACTOR));
    // 速いほうを採用（足し込みだと減速フレームで打ち消して震える）。
    if (Math.abs(v) > Math.abs(spin.current.velocity)) spin.current.velocity = v;
  });

  useEffect(() => {
    let disposed = false;
    let frame: number | null = null;
    /** fetch 済みのロゴのパス。走り線のスポーンが読む。 */
    let logoPaths: string[] = [];
    /** 最初の走り線バッチの遅延タイマー（INITIAL_SPARK_DELAY_MS 参照）。 */
    let initialSparkTimer: number | null = null;
    /** 輪郭 canvas の再描画関数（fetch 完了後にセットされる — 下記
     *  renderSlices の doc comment 参照）。tick() が描き込み登場を
     *  駆動し、resize 時の再描画にも使う。 */
    let renderSlices: ((elapsedMs: number | null) => void) | null = null;
    /** スライスの canvas と「元の前面かどうか」。tick() が毎フレーム、
     *  回転角から出した濃度を style.opacity へ**直接**書く — 初版は
     *  opacity: var(--logo-line-a/b) で CSS 変数に委ねたが、環境によって
     *  効かず「奥も同じ濃さ・回転しても入れ替わらない」と報告された
     *  （per direct follow-up "背景ロゴのルールが変わってる…"）。JS 直書き
     *  なら継承や変数解決に依存しない。エッジ線のグラデーションは SVG
     *  時代から実績のある変数方式のまま。 */
    let sliceCanvasInfo: { el: HTMLCanvasElement; isFront: boolean }[] = [];
    /** 走り線用の canvas（スライスごと、輪郭 canvas の上・不透明度1）と、
     *  その毎フレーム描画関数（tick() が呼ぶ）。輪郭側の canvas は要素
     *  opacity（0.45/0.17）が全体に掛かるため走り線を同居させられない —
     *  SPARK_OPACITY 0.9 が出せなくなる。 */
    const sparkCanvases: (HTMLCanvasElement | null)[] = [];
    let renderSparks: (() => void) | null = null;
    let sparkDirty = false;
    let entranceStartAt: number | null = null;
    let entranceTotalMs = 0;
    let entranceDone = false;

    const SVG_NS = "http://www.w3.org/2000/svg";

    /** 走り線の状態。WAAPI + SVG ではなく、tick() が毎フレーム
     *  スパーク用 canvas に自前で描く — per direct follow-up ("線が走る
     *  アニメーションが止まる瞬間だけ線が少し濃くなる" が fill:forwards・
     *  素の属性の不可視化・フェード前倒しのいずれでも解消しなかったため)。
     *  WAAPI はコンポジタ/メインスレッドの適用タイミングに終端の隙間が
     *  生まれ得るが、自前描画なら「その瞬間の不透明度」を毎フレーム
     *  こちらが計算して塗るだけなので、終端で明るくなる余地が構造的に
     *  無い。値のレンジ（SPARK_*）は WAAPI 版と同じ。 */
    type Spark = {
      slice: number;
      path: number;
      /** 開始位置・実線長・走行距離（いずれもパス全長に対する 0..1）。 */
      startNorm: number;
      dashNorm: number;
      travelNorm: number;
      born: number;
      duration: number;
    };
    let sparks: Spark[] = [];

    /** 走り線を1バッチ積む。実際の描画は tick() → renderSparks()。
     *  全パス（＝全文字）に SPARKS_PER_PATH 本ずつ — どの文字にも毎回
     *  必ず線が走る（per direct follow-up）。位置・向き・速さ・スライスは
     *  従来どおり1本ごとに抽選。 */
    function spawnSparks() {
      if (disposed || logoPaths.length === 0) return;
      const now = performance.now();
      for (let pathIndex = 0; pathIndex < logoPaths.length; pathIndex++)
      for (let n = 0; n < SPARKS_PER_PATH; n++) {
        sparks.push({
          slice: Math.floor(Math.random() * SLICE_COUNT),
          path: pathIndex,
          startNorm: Math.random(),
          dashNorm:
            (SPARK_DASH_MIN + Math.random() * (SPARK_DASH_MAX - SPARK_DASH_MIN)) / 1000,
          travelNorm:
            ((SPARK_TRAVEL_MIN + Math.random() * (SPARK_TRAVEL_MAX - SPARK_TRAVEL_MIN)) / 1000) *
            (Math.random() < 0.5 ? -1 : 1),
          born: now,
          duration:
            SPARK_DURATION_MIN_MS + Math.random() * (SPARK_DURATION_MAX_MS - SPARK_DURATION_MIN_MS),
        });
      }
    }

    // ロゴのパスを一度だけ読み、各スライスへ流し込む。fill を落として
    // stroke 0.5px に差し替える。vector-effect: non-scaling-stroke で、
    // ロゴの拡大（1410px → 62vw）後も線幅が 0.5px のまま保たれる。
    (async () => {
      try {
        const res = await fetch(withBasePath("/andmade-logo.svg"));
        const text = await res.text();
        if (disposed) return;
        const paths = [...text.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
        logoPaths = paths;
        // 輪郭線は SVG ではなく **canvas ビットマップ** として自前で描く —
        // per direct follow-up（"NとMの縦線がかすれて見えない" ほか、線が
        // 長さ方向に虫食いになるスクリーンショット複数回。コードが同一の
        // 昨夜のキャプチャでは綺麗 → Chrome が 3D transform 配下のベクター
        // （SVG）をレイヤー化する際のラスタライズ解像度が、セッションに
        // よって 1x に落ちる非決定的な挙動が根因と判断）。canvas なら線は
        // 最初から dpr 解像度のビットマップで、コンポジタがベクターを
        // 再ラスタライズする余地がない。最悪レイヤーが 1x に落ちても、
        // ビットマップのダウンサンプルは「わずかに薄くなる」だけで、
        // ベクター 1x ラスタライズのような虫食いにはならない。
        //
        // スライスの中身は2枚重ね:
        //  - <canvas>: 輪郭。濃度（従来の stroke-opacity:var(...)）は
        //    canvas 要素自体の opacity を同じ CSS 変数で駆動 — 単色の
        //    線しか無いので見た目は等価で、tick() の変数入れ替えにも
        //    そのまま追従する。
        //  - <svg>: 走り線（spawnSparks）専用のオーバーレイ。静的な
        //    パスを持たないので、ラスタライズ解像度の影響を受けるのは
        //    一瞬で流れる走り線だけ＝実害がない。
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        // 描き込み登場用に各パスの実長を測る（canvas の dash には SVG の
        // pathLength 正規化が無いので実寸で扱う）。getTotalLength は
        // detached な path 要素でも機能する。
        const measurePath = document.createElementNS(SVG_NS, "path") as SVGPathElement;
        const pathData = paths.map((d) => {
          measurePath.setAttribute("d", d);
          let len = 0;
          try {
            len = measurePath.getTotalLength();
          } catch {
            // 変換に失敗したら描き込みだけ諦めて全長扱いに（下の fallback）
          }
          return { path2d: new Path2D(d), len: len > 0 ? len : 4000 };
        });
        /** スライスごと・パスごとの描き込み抽選（WAAPI 版と同じレンジ —
         *  DRAW_* の doc comment 参照）。前面/背面で別々に引く。 */
        const drawPlans = svgHostRefs.current.map(() =>
          pathData.map(() => ({
            delay: Math.random() * DRAW_DELAY_MAX_MS,
            duration:
              DRAW_DURATION_MIN_MS +
              Math.random() * (DRAW_DURATION_MAX_MS - DRAW_DURATION_MIN_MS),
            fromEnd: Math.random() < 0.5,
          }))
        );

        const sliceCanvases: (HTMLCanvasElement | null)[] = [];
        sliceCanvasInfo = [];
        svgHostRefs.current.forEach((host, i) => {
          if (!host) return;
          // スライスの z（レンダリング側と同じ式）。正 = 元の前面。
          const z = (i / (SLICE_COUNT - 1) - 0.5) * THICKNESS_PX;
          // 1枚目 = 輪郭（要素 opacity で濃度制御）、2枚目 = 走り線
          // （不透明度1のまま。renderSparks が毎フレーム描く）。
          host.innerHTML =
            `<canvas style="position:absolute;inset:0;width:100%;height:100%"></canvas>` +
            `<canvas style="position:absolute;inset:0;width:100%;height:100%"></canvas>`;
          const canvases = host.querySelectorAll("canvas");
          const cnv = canvases[0] as HTMLCanvasElement | undefined;
          sliceCanvases[i] = cnv ?? null;
          sparkCanvases[i] = (canvases[1] as HTMLCanvasElement | undefined) ?? null;
          if (cnv) {
            const isFront = z > 0;
            // 初期濃度（tick が最初のフレームで正確な値に上書きする）。
            cnv.style.opacity = String(isFront ? LINE_OPACITY : LINE_OPACITY_BACK);
            sliceCanvasInfo.push({ el: cnv, isFront });
          }
        });

        const easeDraw = (t: number) => t * t * (3 - 2 * t);
        /** 全スライスの輪郭を描く。elapsedMs = 描き込み登場の経過時間、
         *  null = 全長（登場完了後の静止状態）。黒の半透明線が反転レイヤーを
         *  通って白線に見える理屈は従来の SVG 版と同じ。 */
        renderSlices = (elapsedMs) => {
          sliceCanvases.forEach((cnv, i) => {
            if (!cnv) return;
            const ctx = cnv.getContext("2d");
            if (!ctx) return;
            const rect = cnv.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            const w = Math.max(1, Math.round(rect.width * dpr));
            const h = Math.max(1, Math.round(rect.height * dpr));
            if (cnv.width !== w || cnv.height !== h) {
              cnv.width = w;
              cnv.height = h;
            }
            const sx = w / LOGO_VIEWBOX.w;
            const sy = h / LOGO_VIEWBOX.h;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, w, h);
            ctx.setTransform(sx, 0, 0, sy, 0, 0);
            ctx.strokeStyle = "#000";
            // 0.5 CSS px（従来の stroke-width / non-scaling-stroke と同値）を
            // transform 込みで維持する。
            ctx.lineWidth = (0.5 * dpr) / sx;
            pathData.forEach((pd, j) => {
              if (elapsedMs === null) {
                ctx.setLineDash([]);
                ctx.stroke(pd.path2d);
                return;
              }
              const plan = drawPlans[i]?.[j];
              if (!plan) return;
              const t = Math.min(1, Math.max(0, (elapsedMs - plan.delay) / plan.duration));
              if (t <= 0) return;
              const drawn = pd.len * easeDraw(t);
              // 実線 drawn + 残り全部が空白。fromEnd は dashOffset を負に
              // 振って、実線部分をパスの終端側に置く＝終点の頂点から伸びる。
              ctx.setLineDash([drawn, pd.len + 1]);
              ctx.lineDashOffset = plan.fromEnd ? drawn - pd.len : 0;
              ctx.stroke(pd.path2d);
            });
            ctx.setTransform(1, 0, 0, 1, 0, 0);
          });
        };
        /** 走り線の毎フレーム描画（spawnSparks / Spark 型の doc comment
         *  参照）。輪郭と同じ dpr 解像度・同じ座標系で、dash の1区間だけを
         *  進行に合わせた不透明度で塗る。不透明度はこちらが毎フレーム
         *  計算した値そのもの — 終端で明るくなる余地は無い。 */
        renderSparks = () => {
          const nowMs = performance.now();
          if (sparks.length) {
            sparks = sparks.filter((sp) => nowMs - sp.born < sp.duration);
          }
          if (sparks.length === 0) {
            // 全部消えたら一度だけクリアして、以降は触らない。
            if (sparkDirty) {
              sparkCanvases.forEach((cnv) => {
                const ctx = cnv?.getContext("2d");
                if (cnv && ctx) {
                  ctx.setTransform(1, 0, 0, 1, 0, 0);
                  ctx.clearRect(0, 0, cnv.width, cnv.height);
                }
              });
              sparkDirty = false;
            }
            return;
          }
          sparkDirty = true;
          sparkCanvases.forEach((cnv, i) => {
            if (!cnv) return;
            const ctx = cnv.getContext("2d");
            if (!ctx) return;
            const rect = cnv.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            const w = Math.max(1, Math.round(rect.width * dpr));
            const h = Math.max(1, Math.round(rect.height * dpr));
            if (cnv.width !== w || cnv.height !== h) {
              cnv.width = w;
              cnv.height = h;
            }
            const sx = w / LOGO_VIEWBOX.w;
            const sy = h / LOGO_VIEWBOX.h;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, w, h);
            ctx.setTransform(sx, 0, 0, sy, 0, 0);
            ctx.strokeStyle = "#000";
            ctx.lineWidth = (0.5 * dpr) / sx;
            for (const sp of sparks) {
              if (sp.slice !== i) continue;
              const t = Math.min(1, (nowMs - sp.born) / sp.duration);
              // 減速カーブ（WAAPI 版の cubic-bezier(0.33,0,0.2,1) の読み味）。
              const pe = 1 - Math.pow(1 - t, 2.6);
              // 不透明度の封筒: 進行 20% までで立ち上げ、55% まで保持、
              // 80% までに消し切る。ほぼ静止する尻尾（80%〜）は完全に
              // 不可視 — 「止まる瞬間に濃く見える」対策。
              let alpha: number;
              if (pe < 0.2) alpha = (pe / 0.2) * SPARK_OPACITY;
              else if (pe < 0.55) alpha = SPARK_OPACITY;
              else if (pe < 0.8) alpha = SPARK_OPACITY * (1 - (pe - 0.55) / 0.25);
              else alpha = 0;
              if (alpha <= 0.004) continue;
              const pd = pathData[sp.path];
              if (!pd) continue;
              const dash = Math.max(1, sp.dashNorm * pd.len);
              ctx.setLineDash([dash, pd.len]);
              ctx.lineDashOffset = -((sp.startNorm + sp.travelNorm * pe) * pd.len);
              ctx.globalAlpha = alpha;
              ctx.stroke(pd.path2d);
            }
            ctx.globalAlpha = 1;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
          });
        };

        entranceStartAt = performance.now();
        entranceTotalMs = DRAW_DELAY_MAX_MS + DRAW_DURATION_MAX_MS + 60;
        renderSlices(0);

        // 手前と奥のロゴの頂点同士を繋ぐエッジ線 — per direct follow-up
        // ("手前と奥のロゴの頂点同士を線で繋いで")。SVG は平面にしか描けない
        // ので、Z 方向の線は「幅 = 厚み、高さ 0.5px の div を rotateY(90°)
        // で Z 軸に寝かせる」CSS 3D で作る: rotateY(90°) は要素の X 軸を
        // -Z 軸へ写すので、中央原点の横線がそのまま前面(z=+厚み/2)と
        // 背面(z=-厚み/2)を貫く線分になる。left/top は viewBox 座標を
        // ステージに対する % に変換したもの（ステージごと回転するので、
        // 回転後も常に正しい頂点位置に居続ける）。
        // 頂点はコマンドの終点 = 輪郭の角。曲線（D の椀）は終点のみなので
        // 角の無い区間には線が付かない — ワイヤーフレームの結線としては
        // それが正しい見え方。
        const edgesHost = edgesHostRef.current;
        if (edgesHost) {
          edgesHost.innerHTML = paths
            .flatMap((d) => parsePathVertices(d))
            .map(
              ({ x, y }) =>
                // 濃さは単色 + opacity ではなく linear-gradient — 奥にいく
                // ほど薄くする指示のため。rotateY(90°) は要素のローカル +x を
                // -z（奥）へ写すので、"to right" のグラデーションがそのまま
                // 手前 → 奥のフェードになる。
                `<div style="position:absolute;left:${((x / LOGO_VIEWBOX.w) * 100).toFixed(3)}%;top:${((y / LOGO_VIEWBOX.h) * 100).toFixed(3)}%;width:${THICKNESS_PX}px;height:0.5px;background:linear-gradient(to right, rgba(0,0,0,var(--logo-line-a)), rgba(0,0,0,var(--logo-line-b)));transform:translate(-50%,-50%) rotateY(90deg);"></div>`
            )
            .join("");
          // エッジ線の登場: clip-path を右（＝rotateY(90°) 後の奥側）から
          // 開いて、手前の頂点から奥へ伸ばす。transform は translate +
          // rotateY を既に持っているので、scaleX ではなく clip で伸ばす
          // （transform-origin の調整が要らず、位置も傾きも一切触らない）。
          // 輪郭より少し遅らせて「面が描かれてから奥行きが繋がる」順にする。
          edgesHost.querySelectorAll("div").forEach((div) => {
            div.animate(
              [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }],
              {
                delay: DRAW_EDGE_EXTRA_DELAY_MS + Math.random() * DRAW_DELAY_MAX_MS,
                duration:
                  DRAW_DURATION_MIN_MS +
                  Math.random() * (DRAW_DURATION_MAX_MS - DRAW_DURATION_MIN_MS),
                easing: "ease-out",
                fill: "backwards",
              }
            );
          });
        }
        // 最初のバッチは描き込みが済んでから（INITIAL_SPARK_DELAY_MS の
        // doc comment 参照）。以降は下の interval が定期的に放つ。
        initialSparkTimer = window.setTimeout(spawnSparks, INITIAL_SPARK_DELAY_MS);
      } catch {
        // ロゴが読めなければ背景は単に無地のまま — エッグの他の要素は無傷。
      }
    })();

    const sparkTimer = window.setInterval(spawnSparks, SPARK_INTERVAL_MS);

    function handleMouse(event: MouseEvent) {
      cursorTargetRef.current = {
        x: (event.clientX / window.innerWidth) * 2 - 1,
        y: (event.clientY / window.innerHeight) * 2 - 1,
      };
    }
    window.addEventListener("mousemove", handleMouse, { passive: true });

    // リサイズで canvas の実解像度を取り直す（登場中は tick が毎フレーム
    // 描き直しているので、完了後だけ明示的に）。
    function handleResize() {
      if (entranceDone) renderSlices?.(null);
    }
    window.addEventListener("resize", handleResize);

    function tick() {
      if (disposed) return;
      // 輪郭の描き込み登場（renderSlices の doc comment 参照）。完了後は
      // 静止ビットマップのまま毎フレーム触らない — 触らないことが
      // 「コンポジタに再ラスタライズの口実を与えない」の一部でもある。
      if (renderSlices && !entranceDone && entranceStartAt !== null) {
        const elapsed = performance.now() - entranceStartAt;
        if (elapsed >= entranceTotalMs) {
          entranceDone = true;
          renderSlices(null);
        } else {
          renderSlices(elapsed);
        }
      }
      // 走り線（renderSparks の doc comment 参照）。
      renderSparks?.();
      const cursor = cursorRef.current;
      const target = cursorTargetRef.current;
      cursor.x += (target.x - cursor.x) * CURSOR_EASE;
      cursor.y += (target.y - cursor.y) * CURSOR_EASE;

      const s = spinRef.current;
      s.angle = (s.angle + s.velocity) % 360;
      s.velocity *= SPIN_DECAY;

      const stage = stageRef.current;
      if (stage) {
        // カーソルの傾き（X軸はカーソルYから、Y軸はカーソルXから）に、
        // スクロールの累積回転を Y軸へ重ねる。順序は tilt → spin：
        // 逆にするとスピンした状態の軸に対して傾くため、カーソルを
        // 動かしたときの見た目の方向が回転量によって変わってしまう。
        const yawDeg = cursor.x * CURSOR_TILT_Y_DEG + s.angle;
        stage.style.transform =
          `rotateX(${(-cursor.y * CURSOR_TILT_X_DEG).toFixed(2)}deg) ` +
          `rotateY(${yawDeg.toFixed(2)}deg)`;

        // 線の濃度をどちらの面が視点側かに追従させる（LINE_OPACITY_BACK の
        // doc comment 参照）。cos(yaw) = +1 で元の前面が真正面、-1 で裏面が
        // 真正面。(cos+1)/2 を混合比にして両極の間を連続に補間するので、
        // 90°（真横）でちょうど両面同じ濃さになり、切り替わりの瞬間は無い。
        const frontness = (Math.cos((yawDeg * Math.PI) / 180) + 1) / 2;
        const a = LINE_OPACITY_BACK + (LINE_OPACITY - LINE_OPACITY_BACK) * frontness;
        const b = LINE_OPACITY + (LINE_OPACITY_BACK - LINE_OPACITY) * frontness;
        stage.style.setProperty("--logo-line-a", a.toFixed(3));
        stage.style.setProperty("--logo-line-b", b.toFixed(3));
        // 輪郭 canvas は JS 直書き（sliceCanvasInfo の doc comment 参照）。
        for (const info of sliceCanvasInfo) {
          info.el.style.opacity = (info.isFront ? a : b).toFixed(3);
        }
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      window.clearInterval(sparkTimer);
      if (initialSparkTimer !== null) window.clearTimeout(initialSparkTimer);
      window.removeEventListener("mousemove", handleMouse);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    // -z-10 — KonamiDissolveLogo と同じ層。ページ本体より下、body 背景より上。
    // konami-viewport-fill — エッグ切り替えの板の3D回転中、fixed inset-0 の
    // 基準がドキュメント全体に変わってロゴが画面外の「ドキュメント中央」へ
    // 行ってしまうのを防ぐ（globals.css の html.konami-cube ルール参照）。
    <div
      aria-hidden
      className="konami-viewport-fill pointer-events-none fixed inset-0 -z-10 hidden items-center justify-center lg:flex"
      style={{ perspective: `${PERSPECTIVE_PX}px` }}
    >
      <div
        ref={stageRef}
        style={{
          width: `${LOGO_WIDTH_VW}vw`,
          aspectRatio: `${LOGO_VIEWBOX.w} / ${LOGO_VIEWBOX.h}`,
          transformStyle: "preserve-3d",
          willChange: "transform",
          // tick() が毎フレーム上書きする。ここは JS 初回実行前の
          // フォールバック（初期姿勢 = 正面向き）。
          ["--logo-line-a" as string]: String(LINE_OPACITY),
          ["--logo-line-b" as string]: String(LINE_OPACITY_BACK),
        }}
      >
        {/* Z方向のエッジ線のホスト。子の rotateY(90°) が平面に潰されない
            よう、ここにも preserve-3d が要る（既定の flat だと子の 3D
            transform が親平面へ投影されてエッジが消える）。 */}
        <div
          ref={edgesHostRef}
          className="absolute inset-0"
          style={{ transformStyle: "preserve-3d" }}
        />
        {Array.from({ length: SLICE_COUNT }, (_, i) => {
          const z = (i / (SLICE_COUNT - 1) - 0.5) * THICKNESS_PX;
          return (
            <div
              key={i}
              ref={(el) => {
                svgHostRefs.current[i] = el;
              }}
              className="absolute inset-0"
              style={{ transform: `translateZ(${z.toFixed(1)}px)` }}
            />
          );
        })}
      </div>
    </div>
  );
}
