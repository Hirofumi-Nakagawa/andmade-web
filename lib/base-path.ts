/**
 * 公開先がサイトのルートではなくサブディレクトリのときの接頭辞。
 *
 * 本番公開前の確認用として andmade.jp/preview/ に置く運用のために導入した
 * （DEPLOY.md「確認用ディレクトリの設定」参照）。ビルド時に
 * `NEXT_PUBLIC_BASE_PATH=/preview` を渡すと next.config.ts の `basePath` に
 * 入り、同時にこの定数にも入る。未指定なら空文字＝ルート公開（本番）。
 *
 * どこに付けるか:
 *  - next/link の href … Next が自動で付ける。触らなくてよい。
 *  - **next/image の src … 自動で付かない**。next.config.ts で
 *    `images.unoptimized: true`（静的書き出しでは必須）にしていると、
 *    Image は src をそのまま <img src> に出すだけで basePath を考慮しない。
 *    実際にこれでイントロとフッターのロゴが404になった。public/ 配下を指す
 *    src は必ず withBasePath() を通すこと。
 *  - 文字列としてブラウザに渡すパス全般 … CSS の url()、`new Image().src`、
 *    `fetch()` のURL、<link rel> の href など。同じく通す。
 *
 * 逆に通してはいけないもの: microCMS が返す絶対URL（https://... で始まる）。
 *
 * NEXT_PUBLIC_ 接頭辞が必須な理由: この値はクライアント側のコードからも
 * 読むため、ビルド時にバンドルへ埋め込まれる必要がある（Next はこの接頭辞が
 * 付いた環境変数だけを埋め込む）。
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** ルート絶対パス（"/images/foo.png"）に BASE_PATH を付ける。
 *  BASE_PATH が空（本番）のときは何も変わらない。 */
export function withBasePath(path: string): string {
  return `${BASE_PATH}${path}`;
}
