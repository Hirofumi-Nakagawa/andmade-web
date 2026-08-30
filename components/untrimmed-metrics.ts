"use client";

import { useEffect, useState } from "react";

/**
 * `text-box-trim` が効かない環境（Firefox）向けに、フォントのメトリクスを
 * 実測して CSS 変数に入れる。
 *
 * このサイトは縦位置の基準を全面的に `text-box-trim: trim-both` に置いて
 * いる（ボックス下端＝ベースライン）。効かないブラウザではボックス下端が
 * 行ボックスの下端になり、その差だけ下にずれる。差は
 *
 *     ベースライン → 行ボックス下端 = (行送り − (アセンダ + ディセンダ)) / 2 + ディセンダ
 *                                   = 行送り/2 − (アセンダ − ディセンダ)/2
 *
 * で、行送りは CSS 側で `1lh` が使えるので、残る
 * **(アセンダ − ディセンダ) / 2**（em 単位のフォント定数）だけをここで測る。
 * これを `--font-ad-half` として入れておけば、補正が必要な箇所は
 * `calc(0.5lh - var(--font-ad-half))` と書けば済む（globals.css 参照）。
 *
 * あわせてキャップハイト（`--font-cap`）も測る。縦に積んだテキストの
 * 間隔の補正に要る値で、CSS には `cap` 単位があるものの対応状況が
 * ブラウザで割れるため（この修正で踏んだ「新しい CSS の単位・関数に
 * 依存すると Firefox で式ごと落ちる」のと同じ轍）、こちらも実測に寄せる。
 *
 * 測定は canvas の TextMetrics。fontBoundingBoxAscent / Descent は
 * ブラウザがそのフォントのために使っている値そのものなので、決め打ちの
 * 定数より確実で、フォントを差し替えても追従する。Web フォント
 * （Adobe Fonts）の読み込み完了を待つ必要があるので document.fonts.ready
 * のあとに測る。
 *
 * trim が効く環境（Chrome / Safari）では何もしない — CSS 側の補正が
 * `@supports not (...)` の中にあるので、値が入っていても使われない。
 */
/**
 * 縦に積んだテキストの間隔を詰め直す（.untrimmed-stack / .untrimmed-tighten）。
 *
 * 同じ補正は globals.css の @supports にも書いてあるが、**適用はこちらを
 * 正とする**。今回の Firefox 対応では「新しい CSS の単位・関数を使うと
 * 宣言ごと落ちる」を何度も踏んだので、落ちようのないインラインスタイルで
 * 当て直す。CSS 側は JS が動かない場合の保険として残してある（同じ値なので
 * 二重に効くことはない — インラインが勝つだけ）。
 *
 * 補正量は要素ごとに実測した行送りとキャップハイトから出すので、
 * font-size / 行送りが場所によって違っても正しく効く。
 */
function applyStackGaps(capEm: number): void {
  const targets = document.querySelectorAll<HTMLElement>(
    ".untrimmed-stack > * + *, .untrimmed-tighten",
  );
  targets.forEach((el) => {
    const style = getComputedStyle(el);
    const fontSize = Number.parseFloat(style.fontSize);
    const lineHeight = Number.parseFloat(style.lineHeight);
    if (!Number.isFinite(fontSize) || !Number.isFinite(lineHeight)) return;
    // trim が効かないぶん余分に入るのは (行送り − キャップハイト)。
    el.style.marginTop = `${-(lineHeight - capEm * fontSize).toFixed(2)}px`;
  });
}

/**
 * `text-box-trim` が効く環境かどうか。
 *
 * 初回レンダーは必ず true を返し、マウント後に実際の値へ切り替える。
 * サーバー側には CSS.supports が無いので、素直に判定すると SSR の HTML と
 * クライアント初回レンダーが食い違ってハイドレーションエラーになる。
 * これを使う側（ホバー時の板など）はマウント直後の見た目が問題にならない
 * ものに限る。
 */
export function useTextBoxTrimSupported(): boolean {
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setSupported(typeof CSS !== "undefined" && CSS.supports("text-box-trim", "trim-both"));
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return supported;
}

export function useUntrimmedMetrics(): void {
  useEffect(() => {
    if (typeof CSS !== "undefined" && CSS.supports("text-box-trim", "trim-both")) return;

    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      // 実際に使われている本文フォントで測る。サイズは 100px 固定にして、
      // 結果をそのまま em として扱えるようにする。
      const family = getComputedStyle(document.body).fontFamily;
      ctx.font = `100px ${family}`;
      const metrics = ctx.measureText("Hxdp");
      const ascent = metrics.fontBoundingBoxAscent;
      const descent = metrics.fontBoundingBoxDescent;
      if (!Number.isFinite(ascent) || !Number.isFinite(descent)) return;
      const adHalf = (ascent - descent) / 2 / 100;
      document.documentElement.style.setProperty("--font-ad-half", `${adHalf.toFixed(4)}em`);
      // キャップハイト = 大文字 "H" のインクの上端（ベースラインからの高さ）。
      const cap = ctx.measureText("H").actualBoundingBoxAscent;
      if (!Number.isFinite(cap) || cap <= 0) return;
      const capEm = cap / 100;
      document.documentElement.style.setProperty("--font-cap", `${capEm.toFixed(4)}em`);
      applyStackGaps(capEm);
    };

    // フォント確定前に一度測っておく（フォールバックのメトリクスでも、
    // 何も入らないよりは近い）。確定後にもう一度測って上書きする。
    measure();
    document.fonts.ready.then(measure);
    // --scale が変わると font-size も行送りも変わるので測り直す。
    window.addEventListener("resize", measure, { passive: true });
    return () => {
      cancelled = true;
      window.removeEventListener("resize", measure);
    };
  }, []);
}
