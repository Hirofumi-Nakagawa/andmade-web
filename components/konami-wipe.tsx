"use client";

import { useEffect, useRef } from "react";

/**
 * エッグ切り替えのトランジション — 表示中の画面が立体的に左上へ倒れて
 * はけ、右下からダークモードの画面が起き上がってくる — per direct
 * follow-up（Savee の立方体スクロールのスクリーンショット付き "切り替え
 * 演出は、表示中のデフォルト時の画面が貼付のように立体的に左上にはけて、
 * 右下からダークモードの画面が現れるイメージ 立方体の上面にデフォルトの
 * 画、側面にダークモードの画がある位置関係"）。それまでの中央回転カード
 * （同動画の平面回転の解釈）はこの指示で差し替え。
 *
 * これまでの演出（ブロブ/レンズ/水位線/ノイズ/回転カード）が全て
 * 「ページは静止したまま、上に difference のマスクを重ねる」方式だったのに
 * 対し、これは **ページの板そのものを CSS 3D で回す**:
 *
 *  - 前半: <body> を「立方体の上面になっていく」向き（対角軸の rotate3d）
 *    に倒しながら、左上へ退けて少し縮める。中身はライトモードのまま。
 *  - 折り返し: 板が最も倒れた瞬間に onSwitch → 親が active を反転。
 *    エッグの反転レイヤー・3Dロゴ・グレインは body の中に居るので、
 *    次のフレームから板の中身は丸ごとダークモードになっている。
 *  - 後半: 反対側（右下・逆向きの傾き）から同じ板が起き上がって据わる。
 *
 * 一枚の板の前半/後半で向きと中身が入れ替わるので、「上面（ライト）と
 * 側面（ダーク）が別の面である立方体の転がり」に見える。両面を同時に
 * 見せることはできない（ページは一枚しかない）ため、最も倒れた角度での
 * カットがその近似。
 *
 * 部分反転の瞬間が存在しない（板の中身は常にどちらかの完全な状態）ので、
 * これまでのワイプが背負っていた写真の除外機構 — konami-wiping クラスに
 * よる相殺反転の保留と、可視 img/video の矩形抜き — は丸ごと不要になり、
 * このコンポーネントは何も描画しない純粋なアニメーターになった。
 *
 * 既知の割り切り: <body> に transform が付いている間、position: fixed の
 * 子孫（ヘッダー・MENU ピル等）は body の箱基準に再配置される（transform
 * を持つ祖先は fixed の containing block になる）。ページ最上部で発動する
 * 限りビューポートと一致するので完全に正しく写るが、スクロールした状態で
 * 発動すると、回転中の板からヘッダー等の fixed 要素が一時的に外れる
 * （transform が外れた瞬間に戻る）。回転の中心は transform-origin を
 * 「現在のビューポート中心」に合わせてあるので、本文（in-flow の内容）は
 * スクロール位置に関わらず正しく回る。
 */

/** 全体の所要時間（ms）。前半（はけ）と後半（起き上がり）で半分ずつ。 */
const TOTAL_MS = 1200;

/** 最も倒れたときの角度（度）。90 に近いほど完全に寝るが、切り替えの
 *  カットは深い角度どうしのほうが立方体の稜線らしく繋がる。 */
const MAX_ANGLE_DEG = 78;

/** 回転軸 rotate3d(1, AXIS_Y, 0, θ) の Y 成分。0 だと純粋な前後倒れ
 *  （真上へはける）。負の値を混ぜると板の右側が先に沈む＝左上へはける
 *  対角の倒れ方になる。 */
const AXIS_Y = -0.45;

/** はけ側の平行移動量（ビューポート比）と、最も倒れたときの縮み。 */
const SHIFT_X_RATIO = 0.22;
const SHIFT_Y_RATIO = 0.3;
const MIN_SCALE = 0.8;

/** 遠近感（px）。小さいほどパースが強い。 */
const PERSPECTIVE_PX = 1600;

/** 板の外に見える舞台の背景色。参照動画のぼんやりした無彩色の余白。
 *  ライト→ダークどちらの面とも喧嘩しない中間の暗いグレー。 */
const BACKDROP_BG = "#161616";

export function KonamiWipe({
  mode,
  onSwitch,
  onComplete,
}: {
  /** "on" = ライトが左上へはけてダークが右下から。"off" = ON の**完全な
   *  逆再生** — per direct follow-up ("エッグ時に再度コナミコマンドを
   *  入力したときは、エッグ表示時の逆再生になるようにアニメーションして"):
   *  ダークが来た道（右下・同じ傾き）へ戻っていき、ライトが左上へはけた
   *  ときの姿勢から起き上がって戻る。実装はタイムラインを 1-t で逆向きに
   *  評価するだけ（render 内の T 参照）。 */
  mode: "on" | "off";
  /** 板が最も倒れた折り返しで一度だけ呼ばれる。親はここで active を反転
   *  する — 後半の板の中身がダークモード（"off" ならライト）になる。 */
  onSwitch: () => void;
  /** 板が据わり切ったら。親はこれでこのコンポーネントを外す。 */
  onComplete: () => void;
}) {
  // コールバックとモードは ref 経由で読む — 親の再レンダリング（折り返しの
  // active 反転で必ず起きる）でアニメーションを作り直さないため。
  const onSwitchRef = useRef(onSwitch);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onSwitchRef.current = onSwitch;
    onCompleteRef.current = onComplete;
  });
  const modeRef = useRef(mode);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const on = modeRef.current === "on";
    const shiftX = window.innerWidth * SHIFT_X_RATIO;
    const shiftY = window.innerHeight * SHIFT_Y_RATIO;

    const prev = {
      htmlBackground: html.style.background,
      perspective: html.style.perspective,
      perspectiveOrigin: html.style.perspectiveOrigin,
      transform: body.style.transform,
      transformOrigin: body.style.transformOrigin,
      willChange: body.style.willChange,
      clipPath: body.style.clipPath,
    };
    html.style.background = BACKDROP_BG;
    html.style.perspective = `${PERSPECTIVE_PX}px`;
    html.style.perspectiveOrigin = "50% 50%";

    // 板をビューポートの矩形に切り出す — per direct follow-up ("途中
    // カクカクして極端にコマ落ちしてうまく動作してない")。clip しないと
    // 回転する板 = ドキュメント全体（数千px）で、scale/3D回転の毎フレーム
    // 変化のたびにその全面を再ラスタライズしてコマ落ちしていた。clip すれば
    // 再ラスタライズは1画面ぶんで済み、見た目も「いま見えている画面が
    // 有限のカードとしてはける」参照動画の読み味そのものになる。
    const scrollY = window.scrollY;
    const docHeight = Math.max(body.scrollHeight, scrollY + window.innerHeight);
    const clipBottom = Math.max(0, docHeight - scrollY - window.innerHeight);
    body.style.clipPath = `inset(${scrollY}px 0px ${clipBottom}px 0px)`;

    /** fixed inset-0 の全面レイヤー（.konami-viewport-fill — 3Dロゴ・
     *  反転レイヤー・warp canvas・グレイン）をビューポート矩形に固定し直す。
     *  body に transform が付くと fixed の containing block が body
     *  （＝ドキュメント全体の箱）に変わり、inset-0 がドキュメント全高に
     *  引き伸ばされる — 3Dロゴはドキュメント中央（画面外）へ行き、
     *  グレインは縦に伸びる。毎フレーム掛け直すのは、対象の一部（エッグ
     *  本体）が折り返しの active 反転で**ワイプ中に**マウントされるため。
     *  CSS ルールではなくインラインなのは、dev の生成CSS遅延で新規ルールが
     *  効かないことが繰り返しあったため。 */
    const pinViewportFills = () => {
      document.querySelectorAll<HTMLElement>(".konami-viewport-fill").forEach((el) => {
        if (el.style.top === `${scrollY}px`) return;
        el.style.top = `${scrollY}px`;
        el.style.bottom = "auto";
        el.style.height = "100vh";
      });
    };
    const unpinViewportFills = () => {
      document.querySelectorAll<HTMLElement>(".konami-viewport-fill").forEach((el) => {
        el.style.removeProperty("top");
        el.style.removeProperty("bottom");
        el.style.removeProperty("height");
      });
    };
    // 回転の中心を「現在のビューポートの中心」に固定する — body の
    // transform-origin は既定では body の箱（＝ドキュメント全体）の中心で、
    // スクロールしていると画面外を軸に回ってしまう。
    body.style.transformOrigin = `50% ${window.scrollY + window.innerHeight / 2}px`;
    body.style.willChange = "transform";

    let switched = false;
    let frame: number | null = null;
    const start = performance.now();
    const easeInCubic = (t: number) => t * t * t;
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const restore = () => {
      html.style.background = prev.htmlBackground;
      html.style.perspective = prev.perspective;
      html.style.perspectiveOrigin = prev.perspectiveOrigin;
      body.style.transform = prev.transform;
      body.style.transformOrigin = prev.transformOrigin;
      body.style.willChange = prev.willChange;
      body.style.clipPath = prev.clipPath;
      unpinViewportFills();
    };

    const render: FrameRequestCallback = (now) => {
      const t = Math.min(1, (now - start) / TOTAL_MS);
      if (t >= 1) {
        restore();
        onCompleteRef.current();
        return;
      }
      // 中身の切り替え（active 反転）は再生方向に関わらず実時間の折り返しで。
      if (!switched && t >= 0.5) {
        switched = true;
        onSwitchRef.current();
      }
      // "off" は ON のタイムラインを 1-t で逆向きに評価する＝完全な逆再生
      // （mode の doc comment 参照）。前半/後半・イージングの向きも自動で
      // 鏡映になる。
      const T = on ? t : 1 - t;
      let angle: number;
      let tx: number;
      let ty: number;
      let scale: number;
      if (T < 0.5) {
        // ライト側の面: 倒しながら左上へ。加速していく easeIn — 折り返しで
        // 速度が乗ったまま面が切り替わるのが立方体の転がりの肝。
        const p = easeInCubic(T / 0.5);
        angle = MAX_ANGLE_DEG * p;
        tx = -shiftX * p;
        ty = -shiftY * p;
        scale = 1 - (1 - MIN_SCALE) * p;
      } else {
        // ダーク側の面: 右下から起き上がって据わる（OFF ではこの逆向き＝
        // 据わった状態から右下へ倒れていく）。
        const p = 1 - easeOutCubic((T - 0.5) / 0.5); // 1 → 0
        angle = -MAX_ANGLE_DEG * p;
        tx = shiftX * p;
        ty = shiftY * p;
        scale = 1 - (1 - MIN_SCALE) * p;
      }
      body.style.transform =
        `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) ` +
        `rotate3d(1, ${AXIS_Y}, 0, ${angle.toFixed(3)}deg) ` +
        `scale(${scale.toFixed(4)})`;
      pinViewportFills();
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      // 途中でアンマウントされた場合（ページ遷移での打ち切り等）も舞台を
      // 必ず元へ戻す。
      restore();
    };
  }, []);

  return null;
}
