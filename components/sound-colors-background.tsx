"use client";

import { useEffect, useRef, useState } from "react";
import { withBasePath } from "@/lib/base-path";
import { fullViewportHeightPx, installViewportHeightVar } from "@/lib/viewport-height";
import { ScrambleText } from "@/components/scramble-text";
import { useNowPlaying } from "@/components/now-playing-provider";

/**
 * トップページの「今日聴いた曲の色が溜まっていく」背景。画面左から
 * 朝→夜の順に再生曲の色が蓄積され、About / Contact と揃えた質感
 * （カーソル追従・濁らない発色）で下辺に帯として出る。将来の
 * Colors of Sound（アーカイブページ）の下敷きでもある。
 *
 * データ:
 *   いまは public/recently-played.php（直近再生。最大50曲・新しい順）を
 *   そのまま使う。古い順に並べ替えて左から置くので、「左＝その日の早い
 *   時間、右＝いま」になる。日々の蓄積をサーバー側に貯める仕組み
 *   （cron + JSON）はまだ無いので、実質「直近50曲ぶんの足跡」。貯め始めた
 *   ら、同じ描画のまま入力の配列だけ差し替えればよい。
 *
 * 濁らせない工夫:
 *   1. ジャケから拾った色をそのまま使わず、HSL に変換して彩度・明度を
 *      VIVID_* の帯にクランプする。くすんだ色・暗い色も必ず発色の良い色に
 *      引き上がる。
 *   2. 重ね方は `screen`。減算的に混ざらないので、重なるほど明るくなる
 *      （通常の alpha 合成だと補色同士が灰色に沈む）。
 *
 * 質感（About / Contact と揃える）:
 *   （上部から背景色を被せるグラデは撤去済み。）
 *   （グレインも撤去済み。）
 *   - カーソル位置へゆっくり追従して色の塊が押し出される（About の
 *     cursorStrength と同じ読み味。lerp でスムージング）。
 */

/** 1曲から拾う色数。 */
const COLORS_PER_TRACK = 3;
/** 発色のクランプ幅 — この帯に入れることで濁りと沈みを構造的に防ぐ。
 *  0.90–1.00 → 0.82–0.92。彩度の上限だけを下げているので、濁り対策
 *  （下限を高く保つ）はそのまま効いている。 */
const VIVID_SATURATION = [0.82, 0.92] as const;
/** 明度は加算合成（下の描画部の doc comment 参照）の前提で暗めに —
 *  そのままだと2枚重なった時点で白へ抜けてしまう。単独では深い発色、
 *  重なった所で明るく光る、という配分。0.40–0.50 → 0.34–0.42（一部が
 *  明るすぎたため）。 */
const VIVID_LIGHTNESS = [0.34, 0.42] as const;
/** 縦線1本の広がり（曲どうしの間隔に対する倍率・下限 px）と不透明度。
 *  「広がり」は線の左右へのグラデの伸び — この値が大きいほど隣の線と
 *  混ざり合う領域が広くなる。
 *
 *  半径を「画面高の割合」から「隣の曲との間隔の倍率」に変えた理由 —
 *  画面中央近辺が白くなって見えなくなっていた。帯は高さ 70px
 *  ほどしかないのに半径が画面高の 30%（数百 px）あったため、画面中央では
 *  10曲以上が同じ場所に重なっていた。lighten（各チャンネルの最大値）は
 *  補色どうしが重なると (255,255,255) = 白になるので、重なりの多い中央
 *  だけが白く抜けていた。間隔基準にすれば重なるのは常に隣り合う数曲だけに
 *  なり、白飛びが起きない。 */
const BLOB_SPREAD = 2.8;
const BLOB_MIN_RADIUS_PX = 70;
const BLOB_ALPHA = 0.34;
/** 縁の色帯の形（EDGE_*）。
 *
 *  形の作り方:
 *  - 各画素で「画面下辺までの距離」を測り、band まで不透明・そこから
 *    feather かけて透明へ落とす（四辺 → 下辺のみに変更済み）。
 *  - その距離を **2オクターブの値ノイズ**で揺らす。単純な sin の重ねより
 *    起伏が不規則になり、短冊にも額縁にも見えない有機的な輪郭になる。
 *  - フェードは smoothstep を2回かけた曲線。内側の裾がより長く薄く伸びる
 *    ので、背景のクリームへ自然に溶ける。
 *  - マスクはカーソルにも反応する（距離場をカーソル方向へ押し出す）ので、
 *    色の塊だけでなく縁の輪郭そのものが動く。 */
// EDGE_BAND_PX: 6 → 1 → 6 → 20 → 6。不透明のまま残る厚み。
//
// EDGE_FEATHER_PX: 98 → 350。帯の見た目の
// 高さはほぼこの裾の長さで決まる — band の上端から上へ、この距離をかけて
// 透明へ落ちていく。
const EDGE_BAND_PX = 6;
// 98 → 350 → 120 → 110。
const EDGE_FEATHER_PX = 110;

/** 帯の基準線を可視下端よりさらに下げる量。22 → 0。0 のときは基準線＝いま見えている画面の
 *  下端そのもの。 */
const BAND_OFFSET_PX = 0;
/** 輪郭を揺らすノイズの振幅（px）と粗さ（大きいほど緩い起伏）。 */
const EDGE_NOISE_PX = 21;
const EDGE_NOISE_SCALE = 340;
/** カーソルが縁の輪郭を押し出す量（px）と、効きの広さ（画面比）。 */
/** 24 → 44 → 34 → 28 / 0.06 → 0.13 → 0.095 → 0.07（最後は直接の指定）。
 *  EDGE_* は縁の輪郭そのものの押し出し、CURSOR_* は色の塊の横移動。両方を
 *  同じ比率で上げ下げしている（いまは元の 1.15 倍あたり）。 */
const EDGE_CURSOR_PUSH_PX = 28;
const EDGE_CURSOR_FALLOFF = 0.34;
/** マスクを作る解像度（px、長辺）。拡大時のバイリニア補間がそのまま
 *  滑らかなフェードになるので、粗くて構わない。カーソル追従のため毎フレーム
 *  作り直すが、この解像度なら 1ms 未満で済む。 */
const MASK_RESOLUTION = 128;
/** 波形（下記 WAVE_*）が出ているときだけマスクの解像度を上げるぶん。
 *  ギザギザをやめて波長を長くしたので、以前ほどは要らない（96 → 32）。 */
const MASK_RESOLUTION_WAVE_BOOST = 32;

/** 再生中の「うねり」。
 *
 *  帯の縁（下辺からの距離）に、波長の違う正弦2本 + ゆっくりした値ノイズを
 *  重ねた変位を足す。当初は角のある三角波でギザギザにしていたが、うるさい
 *  ということで正弦に戻し、振幅も 26 → 12px に落としてある。ノイズは
 *  「同じ形が周期的に流れてくる」のを崩すためだけの薄い味付け。
 *
 *  再生が止まったら 0 へ戻す（WAVE_LERP でなめらかに出入りする）。 */
const WAVE_AMPLITUDE_PX = 12;
/** 正弦2本の波長（px）と流れる速さ（px/秒）。互いに素に近い比にして、
 *  同じ形が並んで見えないようにしている。 */
const WAVE_LENGTH_A_PX = 260;
const WAVE_SPEED_A = 70;
const WAVE_LENGTH_B_PX = 143;
const WAVE_SPEED_B = -110;
/** 不規則さを足すノイズの粗さと寄与率。 */
const WAVE_NOISE_SCALE = 190;
const WAVE_NOISE_MIX = 0.3;
/** 出入りのなめらかさ（1フレームあたりの追従率）。 */
const WAVE_LERP = 0.04;
/** カーソル追従の強さ（押し出し量の割合）と減衰の広さ。 */
const CURSOR_PUSH = 0.07;
const CURSOR_FALLOFF = 0.16;
/** 帯全体が右→左へ流れる速さ（画面幅ぶんを何秒かけて一周するか）と、
 *  1曲ごとの揺らぎ。向きの理由は描画部の drift の doc comment 参照。
 *
 *  流れは「配置そのものをずらして周期で剰余を取る」方式。左端から
 *  出ていったものが右端から入り直すので、継ぎ目なく無限にループする。
 *  そこに曲ごとの位相の違う遅い正弦を足して、全体が一様に平行移動して
 *  見えないようにしている（＝ランダムな揺らぎ）。 */
/** グレインの濃さと更新頻度。
 *  マスクのアルファを掛けるので、色のない場所には一切乗らない。
 *
 *  粒が粗く・きつく見えていた原因は解像度だった: マスクと同じ 128px 長辺で
 *  作って画面いっぱいに拡大していたため、1粒が 10px 以上の塊になっていた。
 *  About（about-blend-background.tsx の grain=0.06 / grainSize=1）に合わせ、
 *  **CSS 1px = 1粒**で作り直す。濃さも About と同程度まで落とす。
 *  12fps は About の grainFps と同じ（毎フレーム作り直さないので負荷も低い）。 */
const GRAIN_OPACITY = 0.12;
const GRAIN_FPS = 12;

/** 帯に添えるラベル（再生時刻 + アーティスト名）。
 *  1本を LABEL_HOLD_MS 見せて消し、LABEL_GAP_MS 後に別の曲へ。
 *  横位置は、その曲の縦線の現在位置（＝流れに追従）。 */
const LABEL_FONT_PX = 12;
/** 24 → 22。 */
const LABEL_BOTTOM_PX = 22;
const LABEL_HOLD_MS = 4200;
const LABEL_GAP_MS = 900;
/** 消えるときのフェード（600 → 260 → 160）。出るときはフェードせず、
 *  ScrambleText の文字の立ち上がりそのものが登場演出になる。 */
const LABEL_FADE_MS = 160;
/** ラベルの本数（＝同時に出得る上限）。
 *
 *  スロット0は常時、スロット1は自分のサイクルごとに LABEL_SECOND_CHANCE で
 *  出る/出ないを引き直す。両者は独立に回っていて出入りの時刻も揃えていない
 *  ので、「1本のときもあれば、途中から2本目が増える／先に片方が消える」
 *  という見え方になる。 */
const LABEL_SLOT_COUNT = 2;
/** スロット1がそのサイクルで出る確率。 */
const LABEL_SECOND_CHANCE = 0.45;
/** スロット1の出だしをスロット0からずらす量（ms）。以降は「出ない回」の
 *  待ち時間がサイクル長と違うぶん、自然に位相がずれ続ける。 */
const LABEL_SECOND_OFFSET_MS = 2400;
/** 2本が重なって読めなくならないための最小の横間隔（px）。近すぎる札は
 *  引き直す。 */
const LABEL_MIN_SEPARATION_PX = 260;

/** 引き出し線（貼付デザイン）。
 *
 *  帯の上のその曲の位置に 3px の■を置き、そこから縦に線を伸ばし、
 *  角で右へ折れて、その先にテキストを出す。テキストの2行は角の高さに
 *  対して縦中央に来る。
 *
 *  ■だけ不透明で、線は 40%。数値は貼付（2倍解像度のスクリーンショット）の
 *  実測から: ■ 3px / 線 1px / 上へ 20px（→ 15px）/ 右へ 20px /
 *  線の先からテキストまで 8px。 */
const LEADER_SQUARE_PX = 3;
const LEADER_LINE_PX = 1;
/** ■の中心に線を合わせるための左オフセット。 */
const LEADER_LINE_INSET_PX = (LEADER_SQUARE_PX - LEADER_LINE_PX) / 2;
const LEADER_UP_PX = 15;
const LEADER_RIGHT_PX = 20;
const LEADER_TEXT_GAP_PX = 8;
const LEADER_OPACITY = 0.4;
/** 線が伸びる時間。縦 → 横の順に引かれ、引き終わってから文字が
 *  スクランブルで組み上がる。 */
const LEADER_UP_MS = 240;
const LEADER_RIGHT_MS = 240;
/** 1行目に再生時刻、2行目にアーティスト名。
 *
 *  時刻は public/recently-played.php が返す `time`（日本時間 HH:MM）。
 *  デプロイ前は空だったので仮の文字列を出していたが、本番で
 *  実データが出ることを確認したので撤去した — 欠けているときに嘘の時刻を
 *  出すより、その行を出さないほうが安全（下の `label.time &&` で単に
 *  アーティスト名だけになる）。 */

/** 帯の出入り。
 *
 *  やめたもの: clip-path の左→右ワイプ（＝マスク）。境目が直線で動くので、
 *  どうしても「幕が開く」機械的な見え方になっていた。
 *
 *  いまの出方は about-blend-background.tsx と同じ2段構え:
 *    ① canvas 自体の opacity フェードイン（FADE_IN_MS）。
 *    ② グラデ自体が「開く」（REVEAL_MS）。帯の厚み（EDGE_BAND_PX）と裾の
 *       長さ（EDGE_FEATHER_PX）、色の濃さ（BLOB_ALPHA）を 0 から立ち上げる
 *       ので、画面下辺からグラデがにじみ出て濃くなっていく。
 *  イージングも About と同じ 1-(1-t)^2.2（出だしが最速、止まり際だけ滑らか）。
 *
 *  消えるときは②を逆再生せず、opacity だけを FADE_OUT_MS で落とす。 */
const FADE_IN_MS = 450;
const FADE_OUT_MS = 260;
const REVEAL_MS = 1150;
/** 登場中の「濁り」対策。
 *
 *  なぜ濁るか: 帯は加算合成（lighter）で重ねている。1枚あたりの濃度が高い
 *  ときは重なった所が白へ飽和して光って見えるが、濃度が低いと合計が「白の
 *  手前」＝ほぼ無彩色のグレーに着地する。色相を均等に散らしてあるぶん、
 *  薄い瞬間ほど平均に寄って灰色くなる（これは加算合成の性質で、色の選び方
 *  では避けられない）。
 *
 *  対策は2つの組み合わせ:
 *   ① 1枚あたりの濃度を 0 からではなく BAND_ALPHA_FLOOR から立ち上げる。
 *      薄すぎて灰色になる領域自体を通らない。上限までの残り幅で「ブワッ」と
 *      飽和する感じは保つ。
 *   ② 全体の見え方（マスクのアルファ）は別に、より速く立ち上げる
 *      （MASK_REVEAL_GAIN 倍）。合成後の結果を一律に薄くするだけなので
 *      色相の比率は変わらない — つまり「最終形と同じ発色のまま淡い」状態を
 *      経由して濃くなる。①がまだ薄い最初の数フレームはこれで隠れる。 */
const BAND_ALPHA_FLOOR = 0.45;
const MASK_REVEAL_GAIN = 1.6;

/** 画面が狭いときの密度補正。
 *
 *  帯の半径には下限（BLOB_MIN_RADIUS_PX）があるので、画面が狭いほど
 *  「1点に重なる帯の本数」が増える（PC 1440px で約4.4本、SP 390px では
 *  約8.4本）。加算合成なので重なりが倍になれば合計も倍 = 端から端まで
 *  飽和して白〜黄色に振り切れてしまう。1枚あたりの濃度を重なり本数の比で
 *  割り戻し、どの画面幅でも合計の濃さが PC と同じくらいになるようにする。 */
const REFERENCE_OVERLAP = 4.4;

/** キャンバスを画面の実測高さより下へどれだけはみ出させるか。
 *
 *  About の背面グラデと同じ `screen.height` 方式にしてもまだ下端で切れる、
 *  という報告が続いているので、そもそも「正しい高さを当てにいく」のを
 *  やめて、確実に足りる高さを与える方針に切り替えた。帯の基準線は
 *  window.innerHeight（＝いま見えている画面の下端）のままなので、はみ出した
 *  ぶんは帯の内側扱い＝ベタで埋まるだけ。見え感は変わらず、ツールバーが
 *  どんな高さでも隙間ができない。fixed かつ pointer-events-none なので、
 *  はみ出しても他に影響しない。 */
const CANVAS_OVERSHOOT_PX = 240; // 240 → 420 → 350 → 240 → 500 → 240（"もとに戻して"）

const DRIFT_CYCLE_SEC = 90;
const DRIFT_WOBBLE_PX = 90;
const DRIFT_WOBBLE_SEC = 26;
/** 揺らぎの最大速度を、全体の流れの何倍まで許すか（描画部の
 *  wobbleSpeedCap 参照）。1 未満なら帯が流れと逆へ戻ることはない。 */
const WOBBLE_SPEED_RATIO = 0.6;

const DEV_ENDPOINT = "https://andmade.jp/recently-played.php";
const ENDPOINT =
  process.env.NODE_ENV === "development" ? DEV_ENDPOINT : withBasePath("/recently-played.php");

type Rgb = { r: number; g: number; b: number };

function rgbToHsl({ r, g, b }: Rgb): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h * 360, s, l];
}

/** ジャケ1枚から「明るく発色の良い」3色を作る。色相だけ画像から借り、
 *  彩度・明度は VIVID_* に固定する（このファイルの doc comment 参照）。 */
async function vividColorsFromImage(url: string): Promise<string[] | null> {
  const image = await new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
  if (!image) return null;

  const size = 16;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, size, size);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, size, size).data;
  } catch {
    return null; // CORS で taint された場合
  }

  // 色相を 24 分割したヒストグラム（彩度で重み付け）。無彩色に近い画素は
  // 色相が不安定なので、重みがほぼ 0 になり自然に無視される。
  const bins = new Array(24).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    const [h, s] = rgbToHsl({ r: data[i], g: data[i + 1], b: data[i + 2] });
    bins[Math.floor(h / 15) % 24] += s * s;
  }

  // 上位の色相を、互いに離れたものから順に COLORS_PER_TRACK 個選ぶ。
  const order = bins
    .map((weight, index) => ({ weight, hue: index * 15 + 7.5 }))
    .sort((a, b) => b.weight - a.weight);
  const hues: number[] = [];
  for (const entry of order) {
    if (hues.length >= COLORS_PER_TRACK) break;
    const far = hues.every((h) => {
      const d = Math.abs(h - entry.hue);
      return Math.min(d, 360 - d) > 25;
    });
    if (far) hues.push(entry.hue);
  }
  // 色相が偏ったジャケット（単色ジャケなど）は、隣接色相で補う。
  while (hues.length < COLORS_PER_TRACK) {
    const base = hues[0] ?? Math.random() * 360;
    hues.push((base + 30 + hues.length * 26) % 360);
  }

  return hues.map((hue, i) => {
    const s = VIVID_SATURATION[0] + (i / COLORS_PER_TRACK) * (VIVID_SATURATION[1] - VIVID_SATURATION[0]);
    const l = VIVID_LIGHTNESS[0] + ((i + 1) % COLORS_PER_TRACK) * 0.04;
    return `hsl(${hue.toFixed(1)} ${(s * 100).toFixed(0)}% ${(l * 100).toFixed(0)}%)`;
  });
}

type SoundColorsBackgroundProps = {
  /** false にすると左へ畳まれて消える。呼び出し側（home-view.tsx）は
   *  ワイプが終わるまでマウントを保ってからアンマウントする。 */
  active?: boolean;
};

/**
 * ラベルに出す曲の「山札」を作る。404 の背景
 * （scenic-map-background.tsx）と同じ考え方。
 *
 * 直近再生は同じアーティストが何度も入る（実測 39曲 / ユニーク30組）ので、
 * まず**アーティスト名で畳んで**から Fisher–Yates でシャッフルする。畳む
 * ときの代表曲はその都度ランダムに選ぶので、一巡ごとに同じアーティストでも
 * 違う曲（＝違う帯の位置）に付く。
 */
function shuffledArtistDeck(tracks: { artist: string }[]): number[] {
  const byArtist = new Map<string, number[]>();
  tracks.forEach((track, index) => {
    // アーティスト名が空の曲は畳まず1件ずつ独立させる。
    const key = track.artist || `__untitled_${index}`;
    const list = byArtist.get(key);
    if (list) list.push(index);
    else byArtist.set(key, [index]);
  });
  const deck = Array.from(byArtist.values()).map((list) => list[Math.floor(Math.random() * list.length)]);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * ラベル本体 — ■ → 縦線 → 横線 → 文字の順に出る（LEADER_* の doc comment
 * 参照）。位置はすべて呼び出し側の fixed な箱（左下＝帯の上のその曲の位置）
 * からの絶対指定。
 *
 * 曲が変わると呼び出し側が key を変えてこれごと作り直すので、毎回この
 * 順番の最初から再生される。文字は「線を引き終わってから mount する」形に
 * している — ScrambleText は active=false のとき本文をそのまま出す仕様
 * なので、フラグで待たせると線を引いている間ずっと完成形が見えてしまう。
 */
function LabelLeader({ time, artist }: { time: string; artist: string }) {
  const [drawn, setDrawn] = useState(false);
  const [textMounted, setTextMounted] = useState(false);

  useEffect(() => {
    // 1フレーム置いてから伸ばす（最初から伸びた状態だと transition が
    // 走らない）。
    const frame = requestAnimationFrame(() => setDrawn(true));
    const timer = window.setTimeout(() => setTextMounted(true), LEADER_UP_MS + LEADER_RIGHT_MS);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, []);

  /** 角（縦線の上端 = 横線）の高さ。■の上端から LEADER_UP_PX 上。 */
  const cornerBottom = LEADER_SQUARE_PX + LEADER_UP_PX - LEADER_LINE_PX;

  return (
    <>
      <span
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          width: LEADER_SQUARE_PX,
          height: LEADER_SQUARE_PX,
          backgroundColor: "currentColor",
        }}
      />
      <span
        style={{
          position: "absolute",
          left: LEADER_LINE_INSET_PX,
          bottom: LEADER_SQUARE_PX,
          width: LEADER_LINE_PX,
          height: LEADER_UP_PX,
          backgroundColor: "currentColor",
          opacity: LEADER_OPACITY,
          transformOrigin: "bottom",
          transform: `scaleY(${drawn ? 1 : 0})`,
          transitionProperty: "transform",
          transitionDuration: `${LEADER_UP_MS}ms`,
          transitionTimingFunction: "cubic-bezier(0, 0, 0.2, 1)",
        }}
      />
      <span
        style={{
          position: "absolute",
          left: LEADER_LINE_INSET_PX,
          bottom: cornerBottom,
          width: LEADER_RIGHT_PX,
          height: LEADER_LINE_PX,
          backgroundColor: "currentColor",
          opacity: LEADER_OPACITY,
          transformOrigin: "left",
          transform: `scaleX(${drawn ? 1 : 0})`,
          transitionProperty: "transform",
          transitionDuration: `${LEADER_RIGHT_MS}ms`,
          // 縦を引き終わってから折れる。
          transitionDelay: `${LEADER_UP_MS}ms`,
          transitionTimingFunction: "cubic-bezier(0, 0, 0.2, 1)",
        }}
      />
      {textMounted && (
        // 2行の箱を横線の高さに対して縦中央に置く（bottom で線の中心に
        // 合わせ、translateY(50%) で箱の中心をそこへ）。
        <div
          style={{
            position: "absolute",
            left: LEADER_LINE_INSET_PX + LEADER_RIGHT_PX + LEADER_TEXT_GAP_PX,
            bottom: cornerBottom + LEADER_LINE_PX / 2,
            transform: "translateY(50%)",
          }}
        >
          {/* 時刻 → 改行 → アーティスト名。ScrambleText は1行単位なので
              2つ並べる。 */}
          {time && (
            <div>
              <ScrambleText text={time} active />
            </div>
          )}
          {artist && (
            <div>
              <ScrambleText text={artist} active />
            </div>
          )}
        </div>
      )}
    </>
  );
}

export function SoundColorsBackground({ active = true }: SoundColorsBackgroundProps) {
  /** 再生中かどうか（WAVE_* の doc comment 参照）。描画ループからは ref
   *  経由で読む — 毎フレーム再レンダーさせないため。 */
  const nowPlaying = useNowPlaying();
  const playingRef = useRef(false);
  useEffect(() => {
    playingRef.current = nowPlaying.isPlaying;
  }, [nowPlaying.isPlaying]);
  /** 波形の効き具合（0..1）。playingRef へなめらかに追従する。 */
  const waveRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** 曲ごとの3色 + ラベル用メタ（古い順 = 左から右）。 */
  const tracksRef = useRef<{ colors: string[]; artist: string; time: string }[]>([]);
  /** 各曲の縦線の現在の x（描画のたびに更新）。 */
  const lineXRef = useRef<number[]>([]);
  /** ラベル追従用の x — 縦線と同じだが「曲ごとの揺らぎ（wobble）」を
   *  含まない。wobble は振幅 90px / 周期 26s なので、その速さ（最大
   *  ≒21.7px/s）が全体の流れ（画面幅 / 90s ≒ 21.3px/s）を上回る瞬間が
   *  あり、ラベルが流れと逆へ戻って見えていた。揺らぎを抜けば、流れの
   *  向き（いまは右→左）に単調に進む。 */
  const lineDriftXRef = useRef<number[]>([]);
  /** いま出しているラベル（スロットごと。null = そのスロットは非表示）。 */
  const [labels, setLabels] = useState<
    ({ index: number; time: string; artist: string; shown: boolean } | null)[]
  >(() => Array.from({ length: LABEL_SLOT_COUNT }, () => null));
  /** 左からのワイプ（REVEAL_MS の doc comment 参照）。マウント直後の1フレーム
   *  だけ閉じた状態で描いてから開く — 最初から開いた状態だと transition が
   *  走らない。 */
  /** ラベル（日付 + アーティスト名）は PC のみ。判定は
   *  PC/SP ツリーの分岐と同じ lg（1024px）。 */
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(query.matches);
    const frame = requestAnimationFrame(update);
    query.addEventListener("change", update);
    return () => {
      cancelAnimationFrame(frame);
      query.removeEventListener("change", update);
    };
  }, []);

  // --viewport-height（実測のフル画面高さ）を <html> に流し込む。About の
  // 背面グラデと同じ仕組み（lib/viewport-height.ts）。複数箇所から呼んでも
  // 同じ値を書くだけなので競合しない。
  //
  // 併せて canvas の style.height にも直接同じ値を書く。CSS 変数だけに頼ると
  // 「変数が入る前の最初の1フレームは 100dvh（＝ツールバーを除いた高さ）」に
  // なり、その高さでバッファが確保された状態が残り得るため。実寸を直接入れておけば変数の適用タイミングに依存しない。
  useEffect(() => {
    const uninstall = installViewportHeightVar();
    const apply = () => {
      const canvas = canvasRef.current;
      if (canvas) canvas.style.height = `${fullViewportHeightPx() + CANVAS_OVERSHOOT_PX}px`;
    };
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    window.visualViewport?.addEventListener("resize", apply);
    return () => {
      uninstall();
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
      window.visualViewport?.removeEventListener("resize", apply);
    };
  }, []);

  const [openedOnce, setOpenedOnce] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setOpenedOnce(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const shown = active && openedOnce;
  /** グラデが開き始めた時刻（REVEAL_MS の doc comment ②）。マウント時刻では
   *  なく「最初の曲の色が用意できたフレーム」を起点にする — ジャケの取得と
   *  デコードに1秒以上かかることがあり、マウント基準だと何も描けないうちに
   *  開き終わって、色が出た瞬間ポンと出てしまうため。 */
  const revealStartRef = useRef<number | null>(null);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  /** ラベル用の山札（shuffledArtistDeck 参照）。前から1枚ずつ引き、尽きたら
   *  引き直す。lastArtistRef は継ぎ目（一巡の最後と次の一巡の最初）で同じ
   *  アーティストが連続しないようにするためだけの控え。 */
  const deckRef = useRef<number[]>([]);
  const lastArtistRef = useRef<string | null>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 });
  /** 縁マスク用のオフスクリーン canvas（毎フレーム作り直さないよう保持）。 */
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  /** マスクのアルファ（色が乗っている度合い）— グレインを「色のある所だけ」
   *  に乗せるために保持する。 */
  const maskAlphaRef = useRef<Float32Array | null>(null);
  /** グレイン層のオフスクリーン canvas。 */
  const grainCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // 直近再生を取り、古い順に並べ替えて色を作る。
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(ENDPOINT, { cache: "no-store" });
        if (!res.ok) return;
        const data: unknown = await res.json();
        const raw =
          typeof data === "object" && data !== null && Array.isArray((data as { tracks?: unknown }).tracks)
            ? (data as { tracks: unknown[] }).tracks
            : [];
        const items = raw.flatMap((entry) => {
          if (typeof entry !== "object" || entry === null) return [];
          const { image, artist, time } = entry as { image?: unknown; artist?: unknown; time?: unknown };
          if (typeof image !== "string" || !image) return [];
          return [
            {
              image,
              artist: typeof artist === "string" ? artist : "",
              time: typeof time === "string" ? time : "",
            },
          ];
        });
        // API は新しい順 — 「左＝朝」にするため反転する。
        items.reverse();
        // 1曲ずつ tracksRef に足していくと、最初の数フレームは2〜3曲しか
        // 無い状態で描くことになる — 帯の半径は「隣の曲との間隔 ×
        // BLOB_SPREAD」なので（BLOB_SPREAD の doc comment 参照）、曲数が
        // 少ないほど半径が極端に大きくなり、画面全体が数色の薄いベタで
        // 覆われる。これも出だしの濁りの一因だったので、全曲ぶんの色が
        // 揃ってから一度に差し込む。登場アニメの起点も「最初に描けた
        // フレーム」なので、結果として完成した配色のまま開いていく。
        const collected: { colors: string[]; artist: string; time: string }[] = [];
        for (const item of items) {
          if (cancelled) return;
          const colors = await vividColorsFromImage(item.image);
          if (colors) collected.push({ colors, artist: item.artist, time: item.time });
        }
        if (cancelled) return;
        tracksRef.current = collected;
      } catch {
        // 取得できなければ何も描かない（背景は従来どおりのクリーム）。
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ラベルの出し入れ（LABEL_* の doc comment 参照）。曲が読み込まれるまで
  // 何も出さない。スロットごとに独立したサイクルが回っていて、山札
  // （deckRef）だけを共有する — 同じ曲が同時に2箇所へ出ることはない。
  useEffect(() => {
    if (!isDesktop) return;
    const timers = new Set<number>();
    let cancelled = false;
    const after = (ms: number, fn: () => void) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        if (!cancelled) fn();
      }, ms);
      timers.add(id);
    };

    /** いま各スロットが掴んでいる曲。近すぎる札を弾くために見る。 */
    const activeIndexBySlot: (number | null)[] = Array.from(
      { length: LABEL_SLOT_COUNT },
      () => null,
    );

    const drawIndex = (slot: number): number | null => {
      const tracks = tracksRef.current;
      // 近すぎて弾いた札はそのまま捨てる（山札は尽きたら引き直される）。
      // 何度も弾かれ続けないよう試行回数に上限を置く。
      for (let attempt = 0; attempt < 4; attempt++) {
        if (deckRef.current.length === 0) {
          const deck = shuffledArtistDeck(tracks);
          // 継ぎ目の重複回避 — 引き直した山札の1枚目が、いま出したばかりの
          // アーティストと同じなら後ろの1枚と入れ替える。
          if (deck.length > 1 && tracks[deck[0]].artist === lastArtistRef.current) {
            const swapWith = 1 + Math.floor(Math.random() * (deck.length - 1));
            [deck[0], deck[swapWith]] = [deck[swapWith], deck[0]];
          }
          deckRef.current = deck;
        }
        const index = deckRef.current.shift();
        if (index === undefined) return null;
        const tooClose = activeIndexBySlot.some((other, otherSlot) => {
          if (otherSlot === slot || other === null) return false;
          const a = lineDriftXRef.current[index];
          const b = lineDriftXRef.current[other];
          if (typeof a !== "number" || typeof b !== "number") return false;
          return Math.abs(a - b) < LABEL_MIN_SEPARATION_PX;
        });
        if (!tooClose) return index;
      }
      return null;
    };

    const setSlot = (
      slot: number,
      value: { index: number; time: string; artist: string; shown: boolean } | null,
    ) => {
      setLabels((prev) => {
        const next = [...prev];
        next[slot] = value;
        return next;
      });
    };

    const runSlot = (slot: number) => {
      const tracks = tracksRef.current;
      if (tracks.length === 0) {
        after(1000, () => runSlot(slot));
        return;
      }
      // スロット0以外は毎回は出さない（「たまに2本並ぶ」くらいの頻度）。
      // 待ち時間をサイクル長と揃えないので、位相も少しずつずれていく。
      if (slot > 0 && Math.random() > LABEL_SECOND_CHANCE) {
        after(LABEL_HOLD_MS + LABEL_GAP_MS + Math.random() * 1500, () => runSlot(slot));
        return;
      }
      const index = drawIndex(slot);
      if (index === null) {
        after(LABEL_GAP_MS, () => runSlot(slot));
        return;
      }
      const track = tracks[index];
      lastArtistRef.current = track.artist;
      if (!track.artist && !track.time) {
        after(LABEL_GAP_MS, () => runSlot(slot));
        return;
      }
      activeIndexBySlot[slot] = index;
      // 出るときは opacity を最初から 1 に（＝フェードイン無し）。登場は
      // ScrambleText が担う。
      setSlot(slot, { index, time: track.time, artist: track.artist, shown: true });
      after(LABEL_HOLD_MS, () => {
        setLabels((prev) => {
          const current = prev[slot];
          if (!current) return prev;
          const next = [...prev];
          next[slot] = { ...current, shown: false };
          return next;
        });
        after(LABEL_FADE_MS, () => {
          activeIndexBySlot[slot] = null;
          setSlot(slot, null);
          after(LABEL_GAP_MS, () => runSlot(slot));
        });
      });
    };

    for (let slot = 0; slot < LABEL_SLOT_COUNT; slot++) {
      after(1500 + slot * LABEL_SECOND_OFFSET_MS, () => runSlot(slot));
    }
    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
    };
  }, [isDesktop]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      mouseRef.current.tx = event.clientX / window.innerWidth;
      mouseRef.current.ty = event.clientY / window.innerHeight;
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame: number;
    const start = performance.now();

    /** 値ノイズ（2オクターブ）— sin の重ねより起伏が不規則になり、
     *  輪郭が有機的になる（EDGE_* の doc comment 参照）。 */
    const hash2 = (x: number, y: number) => {
      const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      return n - Math.floor(n);
    };
    const valueNoise = (x: number, y: number) => {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const xf = x - xi;
      const yf = y - yi;
      const u = xf * xf * (3 - 2 * xf);
      const v = yf * yf * (3 - 2 * yf);
      const a = hash2(xi, yi);
      const b = hash2(xi + 1, yi);
      const c = hash2(xi, yi + 1);
      const d = hash2(xi + 1, yi + 1);
      return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
    };
    const fbm = (x: number, y: number) => valueNoise(x, y) * 0.65 + valueNoise(x * 2.13 + 7.3, y * 2.13 - 3.1) * 0.35;

    /** 縁マスクを作る。距離場 + ノイズ + カーソル押し出しで輪郭を決める。
     *  カーソルに追従させるため毎フレーム作り直すが、MASK_RESOLUTION が
     *  粗いので負荷は無視できる。 */
    const buildMask = (
      width: number,
      height: number,
      /** 帯の基準線（＝いま見えている画面の下端）。ここより下は帯の内側扱い。 */
      bottomY: number,
      mx: number,
      my: number,
      reveal: number,
      /** 秒。波形を流すのに使う。 */
      t: number,
      /** 波形の効き具合 0..1（WAVE_* の doc comment 参照）。 */
      wave: number
    ): HTMLCanvasElement | null => {
      // 登場中は帯の厚みと裾を縮めておき、0 → 本来値へ伸ばす（REVEAL_MS の
      // doc comment ②）。裾は完全に 0 からだと「線が伸びる」ように見える
      // ので、35% を下限にして最初からぼけた状態で立ち上げる。
      const band = EDGE_BAND_PX * reveal;
      const feather = EDGE_FEATHER_PX * (0.35 + 0.65 * reveal);
      // 全体の濃さ（BAND_ALPHA_FLOOR の doc comment ②）。色相を触らずに
      // 一律で薄くするので、淡い間も最終形と同じ発色に見える。
      const maskGain = Math.min(1, reveal * MASK_REVEAL_GAIN);
      const mask = maskCanvasRef.current ?? (maskCanvasRef.current = document.createElement("canvas"));
      const aspect = width / height;
      // 波形が出ている間だけ解像度を上げる（MASK_RESOLUTION_WAVE_BOOST 参照）。
      const resolution = MASK_RESOLUTION + Math.round(wave * MASK_RESOLUTION_WAVE_BOOST);
      const mw = Math.max(2, Math.round(aspect >= 1 ? resolution : resolution * aspect));
      const mh = Math.max(2, Math.round(aspect >= 1 ? resolution / aspect : resolution));
      if (mask.width !== mw || mask.height !== mh) {
        mask.width = mw;
        mask.height = mh;
      }
      const mctx = mask.getContext("2d");
      if (!mctx) return null;

      const image = mctx.createImageData(mw, mh);
      // グレイン用に、マスクのアルファ（＝色が乗っている度合い）を控える。
      if (maskAlphaRef.current?.length !== mw * mh) maskAlphaRef.current = new Float32Array(mw * mh);
      const maskAlpha = maskAlphaRef.current;
      for (let y = 0; y < mh; y++) {
        for (let x = 0; x < mw; x++) {
          const px = (x / mw) * width;
          const py = (y / mh) * height;
          // 画面下辺からの距離だけを見る。四辺だと縁取りになってしまうので、下端に溜まる
          // 形にする（左右・上には色が出ない）。
          let distance = bottomY + BAND_OFFSET_PX - py;
          // 有機的な揺らぎ。
          distance += fbm(px / EDGE_NOISE_SCALE, py / EDGE_NOISE_SCALE) * EDGE_NOISE_PX;
          // 再生中の波形（WAVE_* の doc comment 参照）。縦位置には依存させず
          // 「x と時間の関数」にしているので、帯の縁がまるごと波形の形になる。
          if (wave > 0.001) {
            const sinA = Math.sin(((px + t * WAVE_SPEED_A) / WAVE_LENGTH_A_PX) * Math.PI * 2);
            const sinB = Math.sin(((px + t * WAVE_SPEED_B) / WAVE_LENGTH_B_PX) * Math.PI * 2);
            const drift = valueNoise(px / WAVE_NOISE_SCALE, t * 0.35);
            const shape =
              (sinA * 0.62 + sinB * 0.38) * (1 - WAVE_NOISE_MIX) + drift * WAVE_NOISE_MIX;
            distance += shape * WAVE_AMPLITUDE_PX * wave;
          }
          // カーソルの近くだけ輪郭を内側へ押し出す（縁がカーソルに反応する）。
          const dx = px / width - mx;
          const dy = py / height - my;
          const influence = Math.exp(-(dx * dx + dy * dy) / (2 * EDGE_CURSOR_FALLOFF * EDGE_CURSOR_FALLOFF));
          distance -= influence * EDGE_CURSOR_PUSH_PX;

          let a: number;
          if (distance <= band) a = 1;
          else if (distance >= band + feather) a = 0;
          else {
            const t = (distance - band) / feather;
            // smoothstep を3回 + 指数の裾 — 上端がさらに長く薄く伸びて、
            // 背景のクリームへ境目なく溶ける（
            // "グラデの上端をもっと自然に馴染むようにして"）。
            const e1 = t * t * (3 - 2 * t);
            const e2 = e1 * e1 * (3 - 2 * e1);
            const e3 = e2 * e2 * (3 - 2 * e2);
            a = (1 - e3) * Math.exp(-t * 1.6);
          }
          a *= maskGain;
          const i = (y * mw + x) * 4;
          image.data[i] = 255;
          image.data[i + 1] = 255;
          image.data[i + 2] = 255;
          image.data[i + 3] = Math.round(a * 255);
          maskAlpha[y * mw + x] = a;
        }
      }
      mctx.putImageData(image, 0, 0);
      return mask;
    };

    /** グレイン層（GRAIN_* の doc comment 参照）。CSS 1px = 1粒で作り、
     *  アルファ = マスクのアルファ（低解像度から補間で引く）× 粒のばらつき。
     *  同じ粒フレームの間は作り直さない（12fps）。 */
    let grainFrame = -1;
    let grainW = 0;
    let grainH = 0;
    const buildGrain = (width: number, height: number, mw: number, mh: number, now: number) => {
      const maskAlpha = maskAlphaRef.current;
      if (!maskAlpha || maskAlpha.length !== mw * mh) return null;
      const frame = Math.floor(now / (1000 / GRAIN_FPS));
      const grain = grainCanvasRef.current ?? (grainCanvasRef.current = document.createElement("canvas"));
      const w = Math.max(1, Math.floor(width));
      const h = Math.max(1, Math.floor(height));
      // 同じ粒フレーム・同じサイズなら使い回す。マスクはカーソルで毎フレーム
      // 変わるが、グレインの見た目に効くのは粒の分布なので実用上問題ない。
      if (frame === grainFrame && grainW === w && grainH === h) return grain;
      grainFrame = frame;
      grainW = w;
      grainH = h;
      if (grain.width !== w || grain.height !== h) {
        grain.width = w;
        grain.height = h;
      }
      const gctx = grain.getContext("2d");
      if (!gctx) return null;
      const image = gctx.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        // マスクは低解像度なので、行ごとに対応する行を引く（縦は最近傍で
        // 十分 — 帯の縦方向の変化は緩やか）。
        const my = Math.min(mh - 1, Math.floor((y / h) * mh));
        for (let x = 0; x < w; x++) {
          const mx = Math.min(mw - 1, Math.floor((x / w) * mw));
          const alpha = maskAlpha[my * mw + mx];
          const j = (y * w + x) * 4;
          if (alpha <= 0.004) {
            image.data[j + 3] = 0;
            continue;
          }
          const n = Math.sin((x * 12.9898 + y * 78.233 + frame * 37.719)) * 43758.5453;
          const level = Math.round((n - Math.floor(n)) * 255);
          image.data[j] = level;
          image.data[j + 1] = level;
          image.data[j + 2] = level;
          image.data[j + 3] = Math.round(alpha * GRAIN_OPACITY * 255);
        }
      }
      gctx.putImageData(image, 0, 0);
      return grain;
    };

    const render = (now: number) => {
      frame = requestAnimationFrame(render);
      // キャンバスは 100lvh（ツールバーが引っ込みきった高さ）ぶん確保して
      // あるので、実寸は canvas 自身から読む。
      const width = canvas.clientWidth || window.innerWidth;
      const height = canvas.clientHeight || window.innerHeight;
      // 帯の基準線は「いま見えている画面の下端」= window.innerHeight。
      //
      // キャンバスの下端を基準にすると、iOS Safari ではアドレスバーの裏
      // （見えていない領域）に帯の濃い部分が入ってしまい、見えている範囲には
      // 裾しか出ない＝「帯が薄く・短く」なる。基準を可視下端に戻せば見え感は
      // 元のまま、そこから下（アドレスバーの裏）は帯の内側扱いになって
      // ベタで埋まる（マスクは distance <= band で不透明なので、負の距離＝
      // 基準線より下は自動的に不透明になる）。
      const visibleBottom = Math.min(height, window.innerHeight);
      // 背景は動きが緩いので dpr は 1.5 で十分（スクロール中の負荷対策）。
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      // 幅だけでなく高さも再確保の条件に入れる。以前は幅の変化しか見ておらず、
      // iOS Safari でアドレスバーが伸縮して**高さだけ**変わったとき（＝まさに
      // 帯を出したい状況）に描画バッファが古い高さのままだった。バッファが
      // 足りない下側は描いても出ないので、アドレスバー裏に色が乗らない。
      const bufferWidth = Math.floor(width * dpr);
      const bufferHeight = Math.floor(height * dpr);
      if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
        canvas.width = bufferWidth;
        canvas.height = bufferHeight;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const tracks = tracksRef.current;
      if (tracks.length === 0) return;

      // グラデが開く進み具合（REVEAL_MS の doc comment ②）。
      if (revealStartRef.current === null) revealStartRef.current = now;
      const revealRaw = Math.min(1, (now - revealStartRef.current) / REVEAL_MS);
      const reveal = 1 - Math.pow(1 - revealRaw, 2.2);

      const mouse = mouseRef.current;
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;

      const t = (now - start) / 1000;
      // 曲どうしの間隔から半径を決める（BLOB_SPREAD の doc comment 参照）。
      const gap = tracks.length > 1 ? (width * 0.94) / (tracks.length - 1) : width;
      const radius = Math.max(BLOB_MIN_RADIUS_PX, gap * BLOB_SPREAD);
      // 帯全体の流れ（DRIFT_* の doc comment 参照）。
      //
      // 符号がマイナス＝右から左へ流れる。
      //
      // 位置は左＝朝・右＝いまの並びなので、時間が進むほど各曲は「過去の
      // 側」＝左へ下がり、右端がつねに「いま」になる（時系列のグラフが
      // 新しい値を右端から入れて全体を左へ送るのと同じ）。ヘッダー右上の
      // 再生中ティッカーも左送りなので、画面の上端と下端で流れが逆になる
      // こともない。プラスにすれば左→右に戻る。折り返しは下の `% wrap` が
      // 二重剰余なので、どちらの向きでもそのまま繋がる。
      //
      // ここで `% 1` を取らない。以前は drift を 0〜width で周回させていたが、
      // 位置の折り返しは下の `% wrap`（wrap = width + margin*2）で行っている。
      // 周期が width と wrap で食い違うので、drift が width から 0 に戻る
      // 瞬間に全部の帯が `width mod wrap` ぶんまとめて飛んでいた。単調に
      // 変化させて折り返しを一箇所に任せれば、継ぎ目は原理的に発生しない。
      const drift = -(t / DRIFT_CYCLE_SEC) * width;

      // 加算合成（lighter）。
      //
      // 光を重ねる方式なので、色どうしが「混ざって濁る」のではなく
      // 「足されて発光する」。赤+緑が黄、青+赤がマゼンタというふうに、
      // 重なった場所に第三の色が生まれるのがこの方式の見どころ。
      // 重なりが深い所は白へ抜けるが、それは許容。
      // 白飛びしすぎないよう、下の VIVID_LIGHTNESS を暗めに、1枚あたりの
      // 濃度（BLOB_ALPHA）も控えめにしてある。
      ctx.globalCompositeOperation = "lighter";
      // 重なり本数から求めた濃度補正（REFERENCE_OVERLAP の doc comment 参照）。
      // radius / margin / wrap はこの時点で全曲共通なので、ループの外で1度だけ。
      const overlapCount = (radius * 2) / ((width + (radius * 1.5 + 24) * 2) / tracks.length);
      const densityScale = Math.min(1, REFERENCE_OVERLAP / overlapCount);
      tracks.forEach((track, i) => {
        const colors = track.colors;
        // 元の位置 + 全体の流れ + 曲ごとの揺らぎ。画面幅で剰余を取るので
        // 左へ抜けた色が右から戻り、継ぎ目なくループする。
        const margin = radius * 1.5 + 24;
        const wrap = width + margin * 2;
        const spacing = wrap / tracks.length;
        // 揺らぎの頭打ちは2つ。
        //
        // ① 「曲どうしの間隔」に対する相対量 — 固定 90px は PC の間隔
        //    （約46px）なら2つ隣ぶんだが、SP の間隔（約17px）では5つ隣ぶんに
        //    なり、等間隔に置いたはずの帯が大きく寄り集まる。結果、団子に
        //    なった所だけが飽和して黄色〜白になり、空いた所には何も出ない
        //    ＝「狭く」見えていた。
        //
        // ② 揺らぎの最大速度が全体の流れを超えない上限 — 正弦の最大速度は
        //    A×2π/T。全体の流れ（width / DRIFT_CYCLE_SEC）は画面幅に比例
        //    するので、SP では 4.3px/s しかない。①だけだと揺らぎの
        //    4.7px/s がそれを上回り、帯が周期的に流れと逆へ戻って、
        //    向きが曖昧に見えていた（PC は 16px/s 対 12.5px/s で問題が
        //    出ていなかった）。流れの WOBBLE_SPEED_RATIO 倍で抑えて
        //    おけば、どの画面幅でも必ず流れの向きに単調に進む。
        const driftSpeed = width / DRIFT_CYCLE_SEC;
        const wobbleSpeedCap =
          (driftSpeed * WOBBLE_SPEED_RATIO * DRIFT_WOBBLE_SEC) / (Math.PI * 2);
        const wobbleAmplitude = Math.min(DRIFT_WOBBLE_PX, spacing * 1.5, wobbleSpeedCap);
        const wobble =
          Math.sin((t / DRIFT_WOBBLE_SEC) * Math.PI * 2 + i * 1.7) * wobbleAmplitude;
        // 曲を「画面幅の 94%」ではなく **折り返し周期（wrap）いっぱい**に
        // 等間隔で置く。
        //
        // 以前は画面幅ベースの帯（span）を、それより広い wrap の中で回して
        // いたため、wrap - span ぶんの「曲が1本も無い空白」が周期の中に
        // 残り、それが流れと一緒に画面を横切っていた（PC では空白 434px /
        // 画面 1440px なので端が薄くなる程度だが、SP では空白 282px /
        // 画面 390px と画面の大半を占め、「左端にしか出ない」ように見えて
        // いた）。周期いっぱいに等間隔で置けば、どの瞬間も画面内の密度が
        // 一定になり、空白そのものが存在しなくなる。 */
        const rawX = i * spacing;
        // 折り返しは必ず画面外で起きるように余白（margin）を取る。3色は
        // 下で ±radius*0.5 だけ横にずらして描くので、余白が radius ちょうど
        // だと、折り返し直前の帯の一番外側の色がまだ画面内に残っている状態で
        // 反対側へ飛ぶ（右端で色が1本だけ消える、として見えていた）。
        // カーソル押し出し（実効十数px）ぶんの余裕もここに含めてある。
        const baseX = (((rawX + drift + wobble + margin) % wrap) + wrap) % wrap - margin;
        lineXRef.current[i] = baseX;
        // ラベル用は揺らぎ抜き（lineDriftXRef の doc comment 参照）。
        lineDriftXRef.current[i] = (((rawX + drift + margin) % wrap) + wrap) % wrap - margin;
        // 玉ではなく縦線で描く。1色 = 画面の高さ
        // いっぱいに伸びる1本の帯で、横方向にだけグラデーションで消える
        // （縦は一定）。3色は横に少しずつずらして並べ、加算合成で隣と
        // 重なった所に第三の色が生まれる。縦の可視範囲は下辺のマスクが
        // 決めるので、ここでは画面全高に描いて構わない。
        colors.forEach((color, k) => {
          // 3本を色ごとに少し横へずらす（真上に重ねると1本に見える）。
          const offset = (k - (colors.length - 1) / 2) * radius * 0.5;
          const dx = baseX / width - mouse.x;
          const influence = Math.exp(-(dx * dx) / (2 * CURSOR_FALLOFF * CURSOR_FALLOFF));
          const x =
            baseX + offset + dx * width * influence * CURSOR_PUSH + Math.sin(t * 0.25 + i + k) * 4;
          // 横方向のグラデ: 中心で最も濃く、± radius で透明。
          const gradient = ctx.createLinearGradient(x - radius, 0, x + radius, 0);
          gradient.addColorStop(0, color.replace(")", " / 0)"));
          // 登場中は曲ごとの帯を薄いところから立ち上げる — 加算合成なので
          // 濃くなるにつれ重なりが一気に白へ飽和し、「ブワッ」と開く見え方に
          // なる。一度これを合成後の一律減光に置き
          // 換えたが、それだと均一に濃くなるだけで勢いが出なかったので戻した。
          gradient.addColorStop(
            0.5,
            color.replace(
              ")",
              ` / ${BLOB_ALPHA * densityScale * (BAND_ALPHA_FLOOR + (1 - BAND_ALPHA_FLOOR) * reveal)})`
            )
          );
          gradient.addColorStop(1, color.replace(")", " / 0)"));
          ctx.fillStyle = gradient;
          ctx.fillRect(x - radius, 0, radius * 2, height);
        });
      });
      ctx.globalCompositeOperation = "source-over";

      // 縁の帯だけを残すマスク（EDGE_BAND_PX の doc comment 参照）。
      // 低解像度の ImageData で1枚作り、キャッシュして拡大描画する。
      // ラベルを帯に追従させる（LABEL_* の doc comment 参照）。
      labelRefs.current.forEach((labelEl) => {
        if (!labelEl || !labelEl.dataset.index) return;
        const x = lineDriftXRef.current[Number(labelEl.dataset.index)];
        if (typeof x === "number") labelEl.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
      });

      // 波形の出入りをなめらかに（WAVE_LERP 参照）。
      waveRef.current += ((playingRef.current ? 1 : 0) - waveRef.current) * WAVE_LERP;
      const mask = buildMask(width, height, visibleBottom, mouse.x, mouse.y, reveal, t, waveRef.current);
      if (mask) {
        ctx.globalCompositeOperation = "destination-in";
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(mask, 0, 0, width, height);
        ctx.globalCompositeOperation = "source-over";

        // 色が乗っている所にだけグレインを重ねる（GRAIN_* の doc comment
        // 参照）。マスクのアルファをそのままグレインの濃さに使うので、
        // 背景のクリーム部分には一切乗らない。
        const grain = buildGrain(width, height, mask.width, mask.height, now);
        if (grain) {
          ctx.globalCompositeOperation = "overlay";
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(grain, 0, 0, width, height);
          ctx.imageSmoothingEnabled = true;
          ctx.globalCompositeOperation = "source-over";
        }
      }
    };

    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 w-full"
        style={{
          // var(--viewport-height)。
          //
          // iOS Safari のツールバーが占める領域はページの座標系の外にあり、
          // svh / dvh / lvh のどれを使っても届かない（100lvh を指定した
          // canvas の実測高さがビューポートと同値だった、というのが
          // lib/viewport-height.ts に残っている実測メモ）。screen.height を
          // 直接与えるとツールバー背面まで描画されるので、About の背面グラデ
          // （about-blend-background.tsx）と同じくその実測値を使う。
          height: `calc(var(--viewport-height, 100dvh) + ${CANVAS_OVERSHOOT_PX}px)`,
          display: "block",
          // 自前の合成レイヤーへ昇格させる。高さは（実測値 + 240px の余裕で）確実に足りている
          // のに下端で切れる、という状況が続いていたので、残る違いは
          // 「描画レイヤーがビューポートでクリップされるかどうか」しかない。
          // About の背面グラデが同じ手法で届いているのは、あちらが WebGL
          // canvas ＝最初から独立した GPU レイヤーだからで、こちらは 2D
          // canvas なので通常のレイヤーツリーに描かれ、ビューポート下端で
          // 切られていた可能性が高い。translateZ(0) / will-change は
          // このコードベースで既に何度も使っている昇格の常套手段。
          transform: "translateZ(0)",
          willChange: "transform",
          opacity: shown ? 1 : 0,
          transition: `opacity ${shown ? FADE_IN_MS : FADE_OUT_MS}ms ease-out`,
        }}
      />
      {/* 帯に添えるラベル（LABEL_* の doc comment 参照）。位置は rAF が
          transform で直接書く（React の再レンダーを挟まない）。 */}
      {isDesktop &&
        labels.map((label, slot) =>
          label ? (
            <div
              key={slot}
              ref={(el) => {
                labelRefs.current[slot] = el;
              }}
              data-index={label.index}
              aria-hidden
              className="pointer-events-none fixed left-0 font-normal"
              style={{
                bottom: LABEL_BOTTOM_PX,
                fontSize: LABEL_FONT_PX,
                lineHeight: 1.2,
                letterSpacing: "0.02em",
                whiteSpace: "nowrap",
                color: "var(--color-background)",
                mixBlendMode: "difference",
                opacity: label.shown && shown ? 1 : 0,
                transition: `opacity ${shown ? LABEL_FADE_MS : FADE_OUT_MS}ms ease-out`,
              }}
            >
              <LabelLeader key={label.index} time={label.time} artist={label.artist} />
            </div>
          ) : null,
        )}
    </>
  );
}
