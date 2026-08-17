"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * 「1行ずつ、下からマスクで上がってくる」テキスト — per direct follow-up
 * （"カーテンリビールはイントロの3行と同じように順に下からマスクで表示される
 * 仕様だけど"）。site-intro.tsx の3行タグラインと同じ作り（各行が
 * overflow-hidden の窓を持ち、中身が translateY(下) → 0 へ上がる）を、
 * トップ FV のコピー用に切り出したもの。値もイントロと揃えてある。
 *
 * PC は改行位置がデザイン指定なので `lines` をそのまま渡す。SP は画面幅で
 * 折り返し位置が変わるため `text` だけを渡し、**実際の折り返しを実測して**
 * 行に割る（Range で1文字ずつ矩形の top を見て、段が変わった位置で切る）。
 * 折り返し行をそのまま1つの窓に入れてしまうと2行目以降がマスクに切られる
 * ので、この実測が必要になる。
 */

/** 出だしはイントロ（site-intro.tsx の TAGLINE_*）と同じ 700ms / 150ms /
 *  同じイージングだったが、per direct follow-up（"ここのカーテンリビールが
 *  ちょっと大味な感じがする"）で全体を落ち着かせている:
 *   ・1行の時間を長く（700 → 900ms）
 *   ・行どうしの間隔を詰める（150 → 110ms）— 数行が緩やかに追いかける
 *   ・イージングを expo 寄りの滑らかなものへ（止まり際がより静か）
 *   ・持ち上げ量を必要最小限まで下げる（160% → 135%、窓の外に隠れる
 *     ぎりぎり = (行の高さ + 下パディング) / 行の高さ ≒ 129%）。移動距離が
 *     短いぶん、飛び込んでくる感じが弱まる。 */
const REVEAL_MS = 900;
const LINE_STAGGER_MS = 110;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** 窓（overflow-hidden）を上下に少し広げる量。行送りが詰まっている
 *  （leading 1.05）ぶん、素のままだとディセンダ（y/p/g）とキャップの頭が
 *  切れる。padding で広げ、同じ量の負マージンで見た目の行送りは元のまま。
 *  広げたぶん中身の初期位置も深く（HIDDEN_TRANSLATE）しておく。 */
const PAD_TOP_EM = 0.1;
const PAD_BOTTOM_EM = 0.3;
const HIDDEN_TRANSLATE = "135%";

function splitIntoVisualLines(el: HTMLElement, text: string): string[] {
  const node = el.firstChild;
  if (!node || node.nodeType !== Node.TEXT_NODE) return [text];
  const range = document.createRange();
  const lines: string[] = [];
  let lineStart = 0;
  let lastTop: number | null = null;

  for (let i = 1; i <= text.length; i++) {
    range.setStart(node, i - 1);
    range.setEnd(node, i);
    const rect = range.getBoundingClientRect();
    // 折り返し位置の空白は幅0の矩形になることがあるので読み飛ばす。
    if (rect.width === 0 && rect.height === 0) continue;
    if (lastTop === null) {
      lastTop = rect.top;
      continue;
    }
    if (rect.top - lastTop > 1) {
      lines.push(text.slice(lineStart, i - 1).trim());
      lineStart = i - 1;
      lastTop = rect.top;
    }
  }
  lines.push(text.slice(lineStart).trim());
  return lines.filter((line) => line.length > 0);
}

type CurtainLinesProps = {
  /** 1行に割る前の全文（`lines` を渡すときは未使用でよいが、実測版と同じ
   *  文字列を渡しておくと計測用の隠し要素と内容がずれない）。 */
  text: string;
  /** 改行位置がデザイン指定の場合はこちら。渡すと実測はしない。 */
  lines?: string[];
  /** true になった瞬間から順に上がってくる。 */
  active: boolean;
  /** 文字組み（サイズ・行送り・ウェイト・色）を渡す。 */
  className?: string;
  /** 1行目が動き出すまでの待ち。 */
  delayMs?: number;
  /** 最終行が上がりきった瞬間に一度だけ呼ばれる — 「カーテンの後に
   *  フェードインさせたい」要素（Who we are）のため。行数が実測で決まる
   *  SP でも正しく効くよう、時間の計算ではなく実際の transitionend で
   *  通知する（ScrambleText の onSettled と同じ考え方）。 */
  onSettled?: () => void;
};

export function CurtainLines({
  text,
  lines: explicitLines,
  active,
  className,
  delayMs = 0,
  onSettled,
}: CurtainLinesProps) {
  const measureRef = useRef<HTMLParagraphElement>(null);
  const [measured, setMeasured] = useState<string[] | null>(null);
  const lines = explicitLines ?? measured ?? [text];

  /**
   * 実際にカーテンを動かすフラグ。`active` をそのまま使わないのは、SP のよう
   * に**行が実測であとから差し替わる**場合に備えるため — per direct
   * follow-up（"SPのときも下層からトップに戻ったら、pc同様we uncoverは
   * カーテンリビールのアニメーションを付ける"）。
   *
   * 行が変わると下の各行 div は key ごと作り直される。そのとき既に
   * `active` が true だと、新しい div は「最初から表示済み」の状態で
   * マウントされ、遷移の開始値が存在しない＝アニメーションが起きない。
   * 復帰時（イントロ無し）は `active` が1フレーム後に true になるので、
   * ちょうど実測の差し替えと重なって毎回これを踏んでいた。
   *
   * 行の内容が変わったレンダーで false に戻し（レンダー中の前値比較
   * setState — このコードベースで確立された書き方）、次のフレームで true に
   * するので、作り直された div も必ず「隠れた状態」から始まる。
   */
  const signature = `${active}:${lines.join("\u0000")}`;
  const [prevSignature, setPrevSignature] = useState(signature);
  const [play, setPlay] = useState(false);
  if (signature !== prevSignature) {
    setPrevSignature(signature);
    setPlay(false);
  }
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => setPlay(true));
    return () => cancelAnimationFrame(frame);
  }, [signature, active]);

  useEffect(() => {
    if (explicitLines) return;
    const el = measureRef.current;
    if (!el) return;

    // setState は rAF / ResizeObserver のコールバック内（＝effect 本体の
    // 同期実行ではない）。幅が変われば割り直す。
    const update = () => setMeasured(splitIntoVisualLines(el, text));
    const frame = requestAnimationFrame(update);
    const observer = new ResizeObserver(() => update());
    observer.observe(el);
    // Web フォント（Adobe Fonts）が入れ替わると折り返しも変わる。
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) update();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [text, explicitLines]);

  return (
    <div className="relative">
      {/* 計測用の影（レイアウトには影響しない absolute、常に非表示）。 */}
      {!explicitLines && (
        <p ref={measureRef} aria-hidden className={`invisible absolute inset-x-0 top-0 ${className ?? ""}`}>
          {text}
        </p>
      )}

      {/* flex 列 — 隣り合うブロックの負マージンは相殺（margin collapsing）
          されてしまい、下の padding ぶんを margin で打ち消す前提が崩れて
          行送りが狂う。flex アイテム間はマージンが相殺されないので、
          padding と負マージンがそのまま打ち消し合い、行送りは leading の
          値ちょうどになる。 */}
      <div className={`flex flex-col ${className ?? ""}`}>
        {lines.map((line, i) => {
          // 上端・下端だけ text-box-trim を効かせる — per direct follow-up
          // （"we un coverの位置を目視でWhat Mattersの上面にそろえて"）。
          // 元の 1枚の <p> は trim-both で「1行目のキャップ上端＝ボックス
          // 上端」になっていたが、行ごとに分けた際にそれが外れ、ハーフ
          // レディング（行送り 1.05 に対するフォントの content 高さの差）
          // ぶん、コピー全体が数px下がっていた。1行目に trim-start、
          // 最終行に trim-end を当てれば、行間（line-height）はそのままに
          // 上下端だけが元と同じ「キャップ上端／ベースライン」基準に戻る。
          //
          // インラインスタイルで当てているのは、このコードベースの慣例
          // （新規の arbitrary クラスは dev で生成CSSが追いつかず一時的に
          // 効かないことがある）に加え、text-box-trim が React の
          // CSSProperties にまだ無いため Object.assign で流し込む必要が
          // あるため。
          const edgeStyle: CSSProperties = {};
          if (i === 0) {
            Object.assign(edgeStyle, {
              textBoxEdge: "cap alphabetic",
              textBoxTrim: lines.length === 1 ? "trim-both" : "trim-start",
            });
          } else if (i === lines.length - 1) {
            Object.assign(edgeStyle, { textBoxEdge: "cap alphabetic", textBoxTrim: "trim-end" });
          }

          return (
            <div
              key={`${i}-${line}`}
              className="overflow-hidden"
              style={{
                paddingTop: `${PAD_TOP_EM}em`,
                paddingBottom: `${PAD_BOTTOM_EM}em`,
                marginTop: `-${PAD_TOP_EM}em`,
                marginBottom: `-${PAD_BOTTOM_EM}em`,
              }}
            >
              <div
                style={{
                  ...edgeStyle,
                  translate: play ? "0 0" : `0 ${HIDDEN_TRANSLATE}`,
                  transitionProperty: "translate",
                  transitionDuration: `${REVEAL_MS}ms`,
                  transitionDelay: play ? `${delayMs + i * LINE_STAGGER_MS}ms` : "0ms",
                  transitionTimingFunction: EASE,
                }}
                onTransitionEnd={play && i === lines.length - 1 ? onSettled : undefined}
              >
                {line}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
