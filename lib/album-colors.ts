/**
 * 再生中ジャケットの代表色まわりの共有ロジック — per direct follow-up
 * ("TOPのヘッダー・フッター含め全要素がアイドル中はジャケの色をランダムに
 * 抽出して色が変わるようにして")。
 *
 * 2つの持ち場:
 * 1. extractAlbumColors() — ジャケット画像から代表色を最大6色抽出する。
 *    （経緯: 中央グラデ案 → 一覧の滲み/グリッチ/版ズレ案を経て、いずれも
 *    "全部なし" で撤去。抽出ロジックだけが生き残り、現行の「アイドル中の
 *    全要素インク差し替え」で使われている。過去の案は git 履歴参照。）
 * 2. applyRandomInk() — トップページ（#top 配下）のテキストを持つ末端要素
 *    すべてに、パレットからランダムに選んだ色を inline で塗り、解除用の
 *    復元関数を返す。idle-overlay.tsx がアイドルの点灯/消灯に合わせて呼ぶ。
 */

/** 抽出する色数（4 → 5 → 6 — per direct follow-ups "4色→5色抽出して
 *  ランダムに" → "ジャケから6色抽出するようにして"）と、量子化の粗さ
 *  （RGB 各チャンネルのビット数）。 */
const COLOR_COUNT = 6;
const QUANT_BITS = 3;

/** ジャケット画像から代表色を抽出する。失敗時は空配列。
 *  Spotify CDN（i.scdn.co）は CORS 許可があるので canvas で画素が読める。 */
export async function extractAlbumColors(url: string): Promise<string[]> {
  const image = await new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
  if (!image) return [];

  const size = 12;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(image, 0, 0, size, size);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, size, size).data;
  } catch {
    return []; // CORS で taint された場合
  }

  // 量子化バケツごとに出現数と平均色を集計。
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  const shift = 8 - QUANT_BITS;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = ((r >> shift) << (QUANT_BITS * 2)) | ((g >> shift) << QUANT_BITS) | (b >> shift);
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }

  const entries = Array.from(buckets.values())
    .map((bucket) => {
      const r = bucket.r / bucket.count;
      const g = bucket.g / bucket.count;
      const b = bucket.b / bucket.count;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      // 彩度（HSV の S）× 出現数をスコアに — 面積が広くても無彩色（白背景
      // など）ばかりが選ばれないように。
      const saturation = max === 0 ? 0 : (max - min) / max;
      return { r, g, b, count: bucket.count, score: bucket.count * (0.35 + saturation) };
    })
    .sort((a, b) => b.score - a.score);

  // 背景（クリーム #f6f6f4）に近い明るい色は除外する — per direct
  // follow-up ("背景色に近い明るい色は選ばないで")。知覚輝度（BT.601 の
  // 重み付け）がしきい値を超えるバケツは候補から落とす。全部落ちて
  // しまった場合（白系ジャケット）は、暗い順に拾い直す。
  const MAX_BRIGHTNESS = 200; // 0-255。#f6f6f4 は約 246
  const brightness = (e: { r: number; g: number; b: number }) => (e.r * 299 + e.g * 587 + e.b * 114) / 1000;
  const darkEnough = entries.filter((entry) => brightness(entry) <= MAX_BRIGHTNESS);
  const pool = darkEnough.length > 0 ? darkEnough : [...entries].sort((a, b) => brightness(a) - brightness(b));

  // 「できるだけ近くない」6色を選ぶ — per direct follow-up ("ジャケから
  // できるだけ近くない色6色を抽出してランダムに変更するようにして")。
  // 以前の「固定しきい値(90)を超えるものを順に採用 → 足りなければ埋める」
  // は、似た色ばかりのジャケットでしきい値を割ると近い色が並んだ。
  // farthest-point 方式に変更: 最上位スコアから始め、以降は「既に選んだ
  // どの色からも最も遠い（最小距離が最大の）候補」を繰り返し選ぶ。これで
  // パレット内の相互距離が構造的に最大化される。スコアはタイブレーク程度に
  // 薄く効かせ、代表性（画面に実際に多い色）も少し残す。
  const distance = (
    a: { r: number; g: number; b: number },
    b: { r: number; g: number; b: number }
  ) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);

  const picked: { r: number; g: number; b: number }[] = [];
  if (pool.length > 0) {
    picked.push(pool[0]);
    const maxScore = Math.max(...pool.map((entry) => entry.score));
    while (picked.length < COLOR_COUNT && picked.length < pool.length) {
      let best: (typeof pool)[number] | null = null;
      let bestValue = -1;
      for (const entry of pool) {
        if (picked.includes(entry)) continue;
        const minDistance = Math.min(...picked.map((p) => distance(p, entry)));
        // 距離を主、スコアを従（最大 +40 相当）で評価。
        const value = minDistance + (entry.score / maxScore) * 40;
        if (value > bestValue) {
          bestValue = value;
          best = entry;
        }
      }
      if (!best) break;
      picked.push(best);
    }
  }

  return picked.map((p) => `rgb(${Math.round(p.r)}, ${Math.round(p.g)}, ${Math.round(p.b)})`);
}

/**
 * トップページ（#top 配下）のテキストを持つ末端要素すべてに、パレットから
 * ランダムに選んだ色を inline で塗る。返り値は復元関数 — 呼び出し側は
 * アイドル解除時に必ず呼ぶこと（元の inline color 値まで正確に戻す）。
 *
 * 実装メモ:
 * - 対象は「子要素を持たず、空白以外のテキストを持つ」要素 — 親子で二重に
 *   塗って濃くなるのを避ける最小の近似。ScrambleText の1文字 span なども
 *   個別に拾われるが、それはむしろ「文字単位で色が散る」演出として好都合。
 * - inline style への直書きなのは、このプロジェクトの慣例（dev の生成CSS
 *   遅延を踏まない）と、React の className を汚さず確実に上書きするため。
 *   React が再レンダーで要素を作り直した場合、その要素の色は戻る（アイドル
 *   中はほぼ操作がないので実害は僅か）。
 * - color の transition はあえて仕込まない — 差し替わった瞬間に一斉に
 *   色が「切り替わる」方が、じわっと変わるより意図（ジャケ色に染まる）が
 *   明瞭だったため。必要になれば呼び出し側で一時的に付与する。
 */
export function applyRandomInk(colors: string[]): () => void {
  if (colors.length === 0) return () => {};
  const root = document.getElementById("top");
  if (!root) return () => {};

  const savedColor = new Map<HTMLElement, string>();
  const pickColor = () => colors[Math.floor(Math.random() * colors.length)];
  const paintWith = (el: HTMLElement, color: string) => {
    if (savedColor.has(el)) return;
    savedColor.set(el, el.style.color);
    el.style.color = color;
  };
  const paint = (el: HTMLElement) => paintWith(el, pickColor());

  // 「ひとかたまりで1色にしたい」要素 — per direct follow-up（"今回追加した
  // what mattersと、who we are、→、colors of soundの文言もアイドル時に
  // 文字色が変わるようにして"）。data-ink-group を付けた要素とその配下
  // すべてを同じ色で塗る。
  //
  // これが必要なのは、後段の「末端要素だけ塗る」走査では拾えないものが
  // あるため:
  //  - 「Who we are →」の矢印は <svg fill="currentColor">。svg 自身は
  //    テキストを持たないので末端走査の対象外だが、祖先の color を塗れば
  //    currentColor 経由で色が乗る。文字と矢印は同じ色であってほしいので、
  //    リンク全体をひとかたまりとして塗る。
  //  - 「Colors of Sound」も下線（.underline-sweep）と本文を必ず同色に
  //    したい。
  // 先頭で実行する（paintWith は塗り済みをスキップするので、後段の
  // .underline-sweep 走査や末端走査がこの色を上書きすることはない）。
  root.querySelectorAll<HTMLElement>("[data-ink-group]").forEach((el) => {
    const color = pickColor();
    paintWith(el, color);
    el.querySelectorAll<HTMLElement>("*").forEach((child) => paintWith(child, color));
  });

  // 先に「タイトル + タイトル下線」を1色に揃えて塗る — per direct
  // follow-up ("タイトルとタイトル下線は同じ色にして")。
  // .underline-sweep（::after が currentColor で線を引く）は要素と配下の
  // テキストを同じ色で塗り、SP の .underline-bar（background が
  // currentColor の別要素）は親のタイトル span ごと同色で塗る — bar 自身は
  // 塗らず継承させる。ここで塗った要素は savedColor に記録済みになるので、
  // 後段の全要素走査（ランダム色）はそれらをスキップする。
  root.querySelectorAll<HTMLElement>(".underline-sweep").forEach((el) => {
    const color = pickColor();
    paintWith(el, color);
    el.querySelectorAll<HTMLElement>("*").forEach((child) => paintWith(child, color));
  });
  root.querySelectorAll<HTMLElement>(".underline-bar").forEach((el) => {
    const holder = el.parentElement;
    if (!holder) return;
    const color = pickColor();
    paintWith(holder, color);
    holder.querySelectorAll<HTMLElement>("*").forEach((child) => paintWith(child, color));
  });

  root.querySelectorAll<HTMLElement>("*").forEach((el) => {
    // 子が <br> だけの要素も「末端」とみなす — per direct follow-up（"…
    // A sound~ …もアイドル時に文字色が変わるようにして"）。<br> で改行した
    // だけの段落（FV 右上の "A sound archive that turns / everyday listening
    // into color."）は children.length > 0 になるので、以前はここで丸ごと
    // スキップされ、色が変わらなかった。<br> はテキストを持たないので、
    // 親を塗っても二重塗りにはならない。
    const onlyLineBreaks = Array.from(el.children).every((child) => child.tagName === "BR");
    if (el.children.length > 0 && !onlyLineBreaks) return;
    if (!el.textContent || !el.textContent.trim()) return;
    paint(el);
  });

  // ブレンドモードの一時解除 — per direct follow-up ("アイドル中は、
  // お知らせとかブレンドモードは全部解除して")。お知らせ・SPヘッダー・
  // Tx/Img レールなどの mix-blend-exclusion は白文字前提の反転表示で、
  // 塗った色がそのまま見えない。アイドル中だけ normal に落とし、復元時に
  // 元の inline 値へ戻す（クラス由来なら removeProperty でクラスが復活）。
  const savedBlend = new Map<HTMLElement, string>();
  root.querySelectorAll<HTMLElement>('[class*="mix-blend-"]').forEach((el) => {
    savedBlend.set(el, el.style.mixBlendMode);
    el.style.mixBlendMode = "normal";
  });

  // ヘッダー上のスクロールインジケーターも塗る — per direct follow-up
  // ("ヘッダー上のスクロールインジケーターも色変わるようにして")。
  // ゲージは layout 直下の fixed（#top の外）なので document から引く。
  // バーは background-color（bg-black / bg-white + difference）なので
  // color ではなく backgroundColor を塗り、blend も一時的に normal へ
  // （親の mix-blend-difference は上の [class*="mix-blend-"] 走査が #top 外の
  // ため拾えない — ここで個別に落とす）。
  const savedGauge: { el: HTMLElement; background: string }[] = [];
  document.querySelectorAll<HTMLElement>("[data-scroll-gauge-bar]").forEach((el) => {
    savedGauge.push({ el, background: el.style.backgroundColor });
    el.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    const wrapper = el.parentElement;
    if (wrapper) {
      savedBlend.set(wrapper, wrapper.style.mixBlendMode);
      wrapper.style.mixBlendMode = "normal";
    }
  });

  // フッター右下のロゴも塗る — per direct follow-up ("フッターの右下ロゴ
  // も色変わるようにして")。ロゴは <img>（SVG。dark テーマでは invert で
  // 黒表示）なので color では塗れない。img を visibility: hidden にして、
  // 同じ SVG を mask にしたジャケ色のシルエット span をリンク内に重ねる。
  // 復元時は span を取り除き、img と親の position を元へ戻す。
  const savedLogo: {
    el: HTMLImageElement;
    visibility: string;
    parent: HTMLElement | null;
    parentPosition: string;
    overlay: HTMLSpanElement;
  }[] = [];
  root.querySelectorAll<HTMLImageElement>("img[data-footer-logo]").forEach((el) => {
    const parent = el.parentElement;
    const src = el.currentSrc || el.src;
    if (!parent || !src) return;
    const overlay = document.createElement("span");
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.position = "absolute";
    overlay.style.inset = "0";
    overlay.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    overlay.style.maskImage = `url("${src}")`;
    overlay.style.maskRepeat = "no-repeat";
    overlay.style.maskPosition = "center";
    overlay.style.maskSize = "contain";
    overlay.style.setProperty("-webkit-mask-image", `url("${src}")`);
    overlay.style.setProperty("-webkit-mask-repeat", "no-repeat");
    overlay.style.setProperty("-webkit-mask-position", "center");
    overlay.style.setProperty("-webkit-mask-size", "contain");
    const parentPosition = parent.style.position;
    if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
    savedLogo.push({ el, visibility: el.style.visibility, parent, parentPosition, overlay });
    el.style.visibility = "hidden";
    parent.appendChild(overlay);
  });

  return () => {
    savedLogo.forEach(({ el, visibility, parent, parentPosition, overlay }) => {
      overlay.remove();
      if (visibility) {
        el.style.visibility = visibility;
      } else {
        el.style.removeProperty("visibility");
      }
      if (parent) {
        if (parentPosition) {
          parent.style.position = parentPosition;
        } else {
          parent.style.removeProperty("position");
        }
      }
    });
    savedGauge.forEach(({ el, background }) => {
      if (background) {
        el.style.backgroundColor = background;
      } else {
        el.style.removeProperty("background-color");
      }
    });
    savedColor.forEach((previous, el) => {
      if (previous) {
        el.style.color = previous;
      } else {
        el.style.removeProperty("color");
      }
    });
    savedBlend.forEach((previous, el) => {
      if (previous) {
        el.style.mixBlendMode = previous;
      } else {
        el.style.removeProperty("mix-blend-mode");
      }
    });
  };
}
