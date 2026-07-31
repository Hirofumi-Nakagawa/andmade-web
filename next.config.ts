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

  // trailingSlash は敢えて既定(false)のまま = /about は out/about.html として
  // 書き出される。true にすると out/about/index.html になりURLが /about/ に
  // 変わるが、このコードベースの正規URLはすべてスラッシュ無し
  // (各ページの alternates.canonical、lib/site.ts の SITE_ROUTES、
  //  app/sitemap.ts、JSON-LD、app/llms.txt) なので、true にすると全ページで
  // canonical → 実URL の301リダイレクトが挟まることになる。
  // 代わりに public/.htaccess の RewriteRule で拡張子を補う。

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
