"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** サイト内で使う問い合わせ先のメールアドレスの単一の定義。
 *  変更時はここ1か所でよい（以前は mailto: リンクとして4ファイルに
 *  重複していた）。 */
export const CONTACT_EMAIL = "info@andmade.jp";

/** "Copied" 表示を出しておく時間。 */
const COPIED_MS = 1500;

/**
 * メールアドレスの表示 — クリック/タップでメーラーを立ち上げる代わりに、
 * アドレスをクリップボードへコピーして "Copied" を表示する — per direct
 * follow-up ("サイト内で使用してるinfo@andmade.jpのメアドは、クリックで
 * メーラーを立ち上げずに、コピーするようにして その際、クリック（もしくは
 * タップ）するとCopiedの文字が表示されるようにして")。
 *
 * それまでの `<a href="mailto:...">` の置き換え。見た目は呼び出し側の
 * className をそのまま着る（下線・色・ホバーは各所の既存指定のまま）ので、
 * この component が持つのは挙動だけ。
 *
 * "Copied" はメアドの表示はそのままに、その上 10px・横幅中央に黒角丸ベタの
 * ピルで出す — per direct follow-up ("メアドはそのまま表示した状態で、
 * メアドの上10pxくらいの位置にZoomアイコンのように黒角丸ベタでCopiedって
 * 表示して（ウェイトはRegular、12pxで）" → "copiedはメアドの横幅に対して
 * 中央位置に表示")。
 *
 * ピルは `position: fixed` を **createPortal で document.body 直下に**
 * 出す — 位置はクリック時に getBoundingClientRect で測って決める。
 * 変遷: ①ボタン相対の absolute → MENU パネルの計測と相互作用して
 * 「ガクッ」。② fixed に変更 → それでも出ない: fixed は祖先に transform
 * （MENU パネルの開閉アニメ、RevealOnMount の translate 等）があると
 * ビューポートではなくその祖先が基準になり、実測したビューポート座標と
 * 食い違って画面外に描かれていた（"まだ出ない" の原因）。ポータルで
 * body 直下に出せば transform を持つ祖先が存在せず、fixed が常に
 * ビューポート基準になる。表示している 1.5 秒の間ボタンは静止している
 * 前提（メニューは開いて止まっている）なので、追従は不要。
 *
 * クリップボードは navigator.clipboard を優先し、非対応環境（非HTTPSの
 * LAN 実機確認・古いブラウザ）では textarea + execCommand にフォールバック。
 * iOS の execCommand は contentEditable + readOnly + Range 選択の組み合わせ
 * でないと選択自体が成立しない（既知のレシピ。readOnly はキーボード抑止を
 * 兼ねる）。mailto の最終フォールバックは撤去した — 「メーラーを立ち上げ
 * ない」がそもそもの要件で、失敗時にメーラーが開くのは要件違反のうえ、
 * 失敗し得るのは非HTTPSの開発環境だけ（本番は clipboard API が常に通る）。
 * 同じ理由でピルはコピーの成否に関わらず出す — 成否分岐を残すと、開発環境
 * だけ「タップしても何も起きない」ように見えて、無いバグを追うことになる
 * （実際に2往復した）。
 */
export function CopyEmail({
  className,
  tabIndex,
  inverted = false,
  belowMenu = false,
  offsetY = 0,
}: {
  className?: string;
  tabIndex?: number;
  /** "Copied" ピルの配色を反転（白ベタ＋黒文字）— per direct follow-up
   *  ("Contactは色反転して表示して")。黒背景のページ（Contact）や黒い
   *  MENU パネルの上では、既定の黒ベタが背景に溶けて見えないため。 */
  inverted?: boolean;
  /** ピルを SP の MENU パネル（z-50）より背面に置く — per direct follow-up
   *  ("spでcontactのメアドタップで表示されるcopiedはmenuを開いたとき
   *  menuより背面にくるようにして")。ページ本文中のメアド（SP Contact）
   *  用。MENU パネルの中のメアドは逆にパネルより前面が正しいので、
   *  既定は前面のまま。 */
  belowMenu?: boolean;
  /** ピルの縦位置の微調整（px、正で下へ）。PC フッターだけ +2 —
   *  per direct follow-up ("pcのフッターのcopiedはfix位置を2px下げて")。 */
  offsetY?: number;
}) {
  /** 表示中のピルの位置（ビューポート座標、ボタンの上端中央）。null = 非表示。 */
  const [pill, setPill] = useState<{ x: number; y: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleClick() {
    // ガクッ対策（per direct follow-up ×2 "menuがガクってなる"）: 非HTTPS
    // （LAN の IP で実機確認する開発時）は navigator.clipboard が無く、
    // フォールバックに落ちる。textarea.select() は iOS でキーボード起動＋
    // 画面スクロールを誘発した（それが「ガクッ」）。readOnly（キーボード
    // 抑止）・fontSize 16px（フォーカスズーム抑止）・画面内 fixed・
    // focus({preventScroll}) で跳ねない。
    // iOS の execCommand は readOnly のままの setSelectionRange だけでは
    // 選択が成立せずコピーできない（"copiedが表示されない" の原因）——
    // contentEditable を併用して Range で選択するのが既知のレシピ。
    // ※ pointerdown の preventDefault（iOS で click ごと死ぬ）と mailto の
    //   最終フォールバックは撤去済み — コンポーネントの doc comment 参照。
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = CONTACT_EMAIL;
        textarea.readOnly = true;
        textarea.contentEditable = "true";
        textarea.style.position = "fixed";
        textarea.style.top = "50%";
        textarea.style.left = "50%";
        textarea.style.opacity = "0";
        textarea.style.fontSize = "16px";
        document.body.appendChild(textarea);
        textarea.focus({ preventScroll: true });
        const range = document.createRange();
        range.selectNodeContents(textarea);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        textarea.setSelectionRange(0, textarea.value.length);
        document.execCommand("copy");
        textarea.remove();
      } catch {
        // 非HTTPSの開発環境でしか通らない経路。黙って諦める（doc comment 参照）。
      }
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setPill({ x: rect.left + rect.width / 2, y: rect.top - 10 + offsetY });
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setPill(null), COPIED_MS);
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleClick}
      aria-label={`メールアドレス ${CONTACT_EMAIL} をコピー`}
      // cursor-pointer — button の既定カーソルは矢印なので、リンクだった
      // 頃と同じ見た目に合わせる。
      // touchAction: manipulation は実機タップの遅延・ダブルタップズーム
      // 誤爆対策（このコードベースのタップ要素の通例）。
      className={`cursor-pointer ${className ?? ""}`}
      style={{ touchAction: "manipulation" }}
      tabIndex={tabIndex}
    >
      {CONTACT_EMAIL}
      {pill &&
        createPortal(
        // role="status" — コピーできたことをスクリーンリーダーにも通知する。
        // fixed + クリック時の実測位置（コンポーネントの doc comment 参照）。
        // translate(-50%, -100%) で「ボタン上端中央の 10px 上」にピルの
        // 下端中央が来る＝メアドの横幅に対して中央（直接の指示）。
        // 見た目はすべてインラインスタイル — 新規の Tailwind arbitrary
        // クラスは生成CSSに乗るまで存在しない問題を踏んだため。
        // padding は 8px/14px → 5px/10px（直接の指示 "paddingをもう少し
        // 狭めて"）。zIndex は MENU パネルより上ならよいが、面倒を避けて
        // ほぼ最上位に。
          <span
            role="status"
            // 少し下からスライド＋フェードイン（直接の指示）。CSS の
            // @keyframes ではなく Web Animations API — globals.css に置いた
            // keyframes が効かない報告があり（このプロジェクトの生成CSSの
            // 遅延と同根の可能性）、el.animate() はスタイルシートを一切
            // 経由しないので確実。ref コールバックはマウント時に一度だけ
            // 呼ばれる＝ピルが出るたびに再生される。中央寄せの transform と
            // 衝突しないよう、開始オフセットも transform ごとキーフレームに
            // 含める。
            ref={(el) => {
              el?.animate(
                [
                  { opacity: 0, transform: "translate(-50%, calc(-100% + 8px))" },
                  { opacity: 1, transform: "translate(-50%, -100%)" },
                ],
                { duration: 250, easing: "ease-out" }
              );
            }}
            style={{
              position: "fixed",
              left: pill.x,
              top: pill.y,
              transform: "translate(-50%, -100%)",
              // belowMenu: SP の MENU パネル（z-50）とその下敷きの closer
              // （z-40）より下 = 39。メニューが開いたらピルは隠れる。
              // 既定はほぼ最上位（MENU パネル内のメアド用）。
              zIndex: belowMenu ? 39 : 10000,
              borderRadius: 9999,
              background: inverted ? "#fff" : "#000",
              color: inverted ? "#000" : "#fff",
              padding: "5px 10px",
              fontSize: 12,
              lineHeight: 1,
              fontWeight: 400,
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            Copied
            {/* 吹き出しの下向き▼（直接の指示）。CSS の border 三角 —
                左右 transparent、上だけピルと同色の実線にすると下向きの
                三角形になる定石。ピルの下端中央に接続。 */}
            <span
              aria-hidden
              style={{
                position: "absolute",
                top: "100%",
                left: "50%",
                transform: "translateX(-50%)",
                width: 0,
                height: 0,
                borderLeft: "3px solid transparent",
                borderRight: "3px solid transparent",
                borderTop: `4px solid ${inverted ? "#fff" : "#000"}`,
              }}
            />
          </span>,
          document.body
        )}
    </button>
  );
}
