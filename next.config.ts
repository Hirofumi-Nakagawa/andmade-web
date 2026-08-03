import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 静的書き出し — さくらのレンタルサーバー(Node実行環境なし、PHP/Apacheのみ)
  // へアップロードするための構成。`next build` が out/ に完成HTMLを吐き、
  // それをそのままドキュメントルートへ置く。Nodeを要求する機能
  // (Route Handlers = app/api/*、ISR、Server Actions、next/image の最適化)は
  // すべて使えなくなるため、それぞれ以下で代替している:
  //   - CMSデータ(projects/news/studies) → ビルド時に取得して埋め込み(SSG)
  //   - Spotify Now Playing → public/now-playing.php (サーバー側の秘密鍵が
  //     必要なため、ここだけPHPで代替。詳細はそのファイルのコメント参照)
  output: "export",

  // next/image の最適化はNodeのImage Optimization APIが前提なので静的書き出し
  // では使えない。unoptimized: true で <img> 相当の素の出力になる(srcSet/sizes
  // 属性は維持される)。このサイトの画像は元々microCMSのimgix(URLパラメータで
  // リサイズ)かpublic/配下の実ファイルなので、Next側の最適化には依存していない。
  images: { unoptimized: true },

  // 公開先がサブディレクトリのときだけ設定する（例: NEXT_PUBLIC_BASE_PATH=/preview
  // → andmade.jp/preview/ で動く）。未設定なら undefined = ルート公開＝本番。
  // これを入れると next/link・next/image・_next/ のアセットURLに自動で接頭辞が
  // 付く。文字列として直接ブラウザに渡すパス（CSSのurl()、new Image().src、
  // fetch のURL 等）には付かないので、そちらは lib/base-path.ts の
  // withBasePath() を通している。
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,

  // /about → out/about/index.html として書き出す。
  //
  // 当初は false（= out/about.html）にして、.htaccess のリライトで拡張子を
  // 補う方式にしていたが、さくらの共有サーバーでは動かなかった:
  //   - Next 16 は about.html を出すのと同時に about/ というディレクトリも
  //     作る（中身はクライアント遷移用の __next.*.txt のみ、index なし）
  //   - Apache の mod_dir がリライトより先に「末尾スラッシュを付ける301」を
  //     出すため、/about は結局 about/ ディレクトリへの要求になり、
  //     index が無いので 403 Forbidden
  //   - それを止める DirectorySlash / Options 系のディレクティブは
  //     AllowOverride で許可されておらず、書くと 500
  // true にすれば about/index.html になって衝突自体が消え、Apache が標準の
  // DirectoryIndex でそのまま配信できる。.htaccess でのリライトは不要。
  // 正規URL（canonical / sitemap / llms.txt / JSON-LD）も末尾スラッシュ付きに
  // 揃えてあるので、リダイレクトも挟まらない。
  trailingSlash: true,

  // Next.js blocks cross-origin requests to dev-only assets/HMR by default,
  // allowing only `localhost`. Testing on an actual phone over the LAN hits
  // the dev server via its LAN IP instead, so those requests were silently
  // blocked — the server-rendered HTML still painted fine (hence header/
  // footer, which don't depend on any JS reveal, showing up), but hydration
  // never completed, so every JS-driven reveal effect (mobile-project-list.tsx,
  // mobile-home.tsx's rail) never ran and stayed stuck at its default
  // opacity-0 state (reported as "ヘッダー・フッター以外表示されない", only
  // reproducing via the LAN IP, not localhost). Listing the whole
  // 192.168.3.0/24 subnet (a wildcard prefix, not just the one current IP)
  // so this keeps working if the phone/router hands out a different address
  // later.
  allowedDevOrigins: ["192.168.3.*"],
};

export default nextConfig;
