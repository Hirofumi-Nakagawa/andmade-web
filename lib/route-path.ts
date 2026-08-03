/**
 * ルート判定用のパス正規化。
 *
 * next.config.ts を `trailingSlash: true` にしたことで、`usePathname()` が
 * 返す値が "/about" ではなく "/about/" になった。一方コード側に書かれた
 * リンク先（NAV_ITEMS の href など）はスラッシュ無しのままなので、
 * `pathname === item.href` の素の比較が全て偽になり、ヘッダーやメニューの
 * current 表示が効かなくなる —— per direct follow-up
 * ("下層に飛んだとき、メニューがcurrentにならない")。
 *
 * 片方だけスラッシュを足して回ると、将来 trailingSlash を切り替えたときに
 * 同じ問題が逆向きに起きる。比較の両辺をここで正規化して、設定に依存しない
 * 形にしておく。
 */

/** 末尾スラッシュを落とす（ルート "/" だけはそのまま）。
 *  クエリやハッシュは usePathname() には含まれないので考慮不要。 */
export function normalizePath(path: string): string {
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

/** 2つのパスが同じルートを指すか（末尾スラッシュの有無を無視して比較）。 */
export function isSamePath(a: string, b: string): boolean {
  return normalizePath(a) === normalizePath(b);
}
