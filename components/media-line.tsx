import type { MediaItem } from "@/lib/about-content";

/** このサイト共通の縦位置の基準。Media の各行はこれで
 *  「キャップ上端〜ベースライン」の箱になる。 */
const TRIM = "[text-box-edge:cap_alphabetic] [text-box-trim:trim-both]";

/**
 * About の Media 1行ぶん。PC（app/about/page.tsx）と SP
 * （components/mobile-about.tsx）で同じ出し方をするので共有している。
 *
 * 3パターンある:
 *   1. `parts` あり — 行の一部だけがリンク（Spotify の Pt.1 / Pt.2）。
 *   2. `linked` — 行全体が1本のリンク。
 *   3. どちらも無し — ただのテキスト。
 *
 * 1 だけ下線の引き方が違う。2 のリンクは flex の子＝ブロック化されるので
 * text-box-trim が効き、.underline-sweep の「ボックス下端に絶対配置した
 * 帯」がそのままベースラインに乗る。1 のリンクは <p> の中のインラインなので
 * trim が効かず、同じやり方だと下線がディセント分だけ下がってしまう。
 * そこで .underline-sweep-line（インラインの background で引く版、
 * globals.css 参照）を使う — こちらはインラインボックスの上端＋アセントを
 * 基準にするので、trim の有無に関係なく 2 と同じ位置に乗る。
 */
export function MediaLine({ item, sp = false }: { item: MediaItem; sp?: boolean }) {
  // SP 用の言い回しがあればそちらを使う（MediaItem.partsSp の doc comment 参照）。
  const parts = (sp && item.partsSp) || item.parts;

  if (parts) {
    return (
      <p className={TRIM}>
        {parts.map((part, index) =>
          part.href ? (
            <a
              key={`${part.text}-${index}`}
              href={part.href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-sweep-line"
            >
              {part.text}
            </a>
          ) : (
            part.text
          ),
        )}
      </p>
    );
  }

  if (item.linked) {
    return (
      <a
        href={item.href ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        className={`underline-sweep ${TRIM}`}
      >
        {item.text}
      </a>
    );
  }

  return <p className={TRIM}>{item.text}</p>;
}
