/**
 * ビルド結果(out/)の健全性チェック。
 *
 * 静的書き出し + サブディレクトリ公開の組み合わせは、間違っていても
 * 「HTMLは返るが CSS/JS が全部404」という、パッと見では気づきにくい壊れ方を
 * する。実際に basePath の付け忘れで2回同じ状態になっているので、
 * アップロード前に機械的に弾く。
 *
 * 使い方:
 *   node scripts/verify-build.mjs            本番用（basePath なし）を検証
 *   node scripts/verify-build.mjs /preview   確認用（basePath あり）を検証
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const basePath = process.argv[2] ?? "";
const OUT = "out";
const problems = [];

function fail(message) {
  problems.push(message);
}

// 0. .htaccess の __BASE_PATH__ を実際の値に置換する。
//    ErrorDocument は絶対パスしか受け付けないので、公開先（/preview か
//    ルートか）によって値が変わる。手で書き換える運用は本番移行時に
//    忘れるため、ビルドの一部として機械的に埋める。
const htaccessPath = join(OUT, ".htaccess");
if (existsSync(htaccessPath)) {
  const original = readFileSync(htaccessPath, "utf8");
  if (original.includes("__BASE_PATH__")) {
    writeFileSync(htaccessPath, original.replaceAll("__BASE_PATH__", basePath));
    console.log(`  .htaccess: __BASE_PATH__ → "${basePath}"`);
  }
}

// 1. 最低限のファイルが揃っているか。
//    trailingSlash: true なので各ページは <route>/index.html の形で出る。
for (const file of ["index.html", ".htaccess", "now-playing.php", "404.html"]) {
  if (!existsSync(join(OUT, file))) fail(`out/${file} がありません`);
}
for (const route of ["about", "contact", "studies"]) {
  if (!existsSync(join(OUT, route, "index.html"))) {
    fail(`out/${route}/index.html がありません（trailingSlash: true が効いていない可能性）`);
  }
  // 同名の .html が残っていると、Apache 側でディレクトリと衝突して
  // 403 になる元の症状が再発する。
  if (existsSync(join(OUT, `${route}.html`))) {
    fail(`out/${route}.html と out/${route}/ が併存しています（403 の原因。next.config.ts の trailingSlash を確認）`);
  }
}

// 2. basePath が実際に反映されているか
//    index.html が読み込むスクリプト/スタイルのURLを見る。ここが
//    "/_next/..." のままだと、preview 配下では本番ルートを見にいって全部404。
if (existsSync(join(OUT, "index.html"))) {
  const html = readFileSync(join(OUT, "index.html"), "utf8");
  const assetRefs = [...html.matchAll(/(?:src|href)="(\/[^"]*_next\/[^"]*)"/g)].map((m) => m[1]);

  if (assetRefs.length === 0) {
    fail("out/index.html に _next/ のアセット参照が1つも見つかりません（ビルドが不完全な可能性）");
  } else {
    const expectedPrefix = `${basePath}/_next/`;
    const wrong = assetRefs.filter((ref) => !ref.startsWith(expectedPrefix));
    if (wrong.length > 0) {
      fail(
        basePath
          ? `basePath が反映されていません。アセットが "${expectedPrefix}" で始まっていません（例: ${wrong[0]}）。\n` +
            `    → npm run build:preview を使ってください（環境変数の手打ちだと付け忘れが起きます）`
          : `本番ビルドのはずが basePath が付いています（例: ${wrong[0]}）。\n` +
            `    → npm run build:production を使ってください`
      );
    }
  }
}

// 3. 実績詳細ページが生成されているか（microCMS に届いていないと0件になる）
const projectsDir = join(OUT, "projects");
if (!existsSync(projectsDir)) {
  fail("out/projects/ がありません（microCMS から実績を取得できていない可能性）");
} else {
  const entries = await readdir(projectsDir, { withFileTypes: true });
  const pages = entries.filter((e) => e.isDirectory() && existsSync(join(projectsDir, e.name, "index.html")));
  if (pages.length === 0) fail("実績詳細ページが1件も生成されていません");
  const stray = entries.filter((e) => e.isFile() && e.name.endsWith(".html"));
  if (stray.length > 0) {
    fail(`out/projects/ に .html が直接あります（例: ${stray[0].name}）。ディレクトリと衝突して 403 になります`);
  }
}

if (problems.length > 0) {
  console.error("\n✗ ビルド結果に問題があります:\n");
  for (const p of problems) console.error(`  - ${p}`);
  console.error("");
  process.exit(1);
}

console.log(
  `\n✓ ビルド結果OK（basePath: ${basePath || "なし＝本番ルート公開"}）` +
    `\n  out/ の中身を ${basePath ? "www/preview/" : "www/"} にアップロードしてください\n`
);
