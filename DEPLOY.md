# さくらのレンタルサーバーへのデプロイ手順

このサイトは静的書き出し（`next.config.ts` の `output: "export"`）で、
Node が動かないサーバーでも公開できる構成になっている。
唯一のサーバー処理は Spotify の Now Playing だけで、そこは PHP で代替している。

---

## 1. 全体像

| もの | どこで解決しているか |
|---|---|
| 実績一覧・実績詳細・お知らせ・Studies | **ビルド時**に microCMS から取得してHTMLに埋め込み |
| Spotify Now Playing | **PHP**（`now-playing.php`）が実行時に取得 |
| 画像 | microCMS の imgix（URLパラメータでリサイズ）と `public/` の実ファイル |

**CMS を更新したら再ビルド＋再アップロードが必要**（Now Playing だけは自動更新）。

---

## 2. 初回だけ必要な作業

### 2-1. Spotify の認証情報をサーバーに置く

`/home/<アカウント>/spotify-config.php` を作る（**公開領域 `www` の外**）:

```php
<?php return [
  'client_id'     => '（.env.local の SPOTIFY_CLIENT_ID）',
  'client_secret' => '（同 SPOTIFY_CLIENT_SECRET）',
  'refresh_token' => '（同 SPOTIFY_REFRESH_TOKEN）',
];
```

`www` の中に置かないこと。設定ミス1つで平文露出する。

> `refresh_token` は失効しないので、`.env.local` にある既存の値をそのまま使える。
> 再取得が必要になったら、削除済みの `app/api/spotify/login|callback` を
> git 履歴から戻すか、Spotify の Authorization Code Flow を手動で実行する。

### 2-2. ビルド用の環境変数

ローカルの `.env.local` に以下があること（ビルド時にしか使わない）:

```
MICROCMS_SERVICE_DOMAIN=...
MICROCMS_API_KEY=...
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...
```

`SPOTIFY_*` はビルドには不要（PHP 側が持つ）。

---

## 3. GitHub Actions の設定（初回のみ）

`.github/workflows/deploy.yml` がデプロイを自動化する。
GitHub リポジトリの **Settings → Secrets and variables → Actions → New repository secret**
で以下6つを登録する。

| Secret 名 | 値 |
|---|---|
| `MICROCMS_SERVICE_DOMAIN` | `.env.local` と同じ |
| `MICROCMS_API_KEY` | `.env.local` と同じ |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | `.env.local` と同じ |
| `FTP_SERVER` | `<アカウント>.sakura.ne.jp` |
| `FTP_USERNAME` | さくらのFTPユーザー名（＝アカウント名） |
| `FTP_PASSWORD` | さくらのFTPパスワード |
| `FTP_SERVER_DIR` | `/home/<アカウント>/www/`（**末尾のスラッシュ必須**） |

> `SPOTIFY_*` は登録不要。ビルドには使わず、サーバー上の
> `spotify-config.php` が持つ（2-1参照）。

### リポジトリの作成と初回push

```bash
git add -A
git commit -m "静的書き出し構成に移行"

# GitHub で空のリポジトリを作ってから
git remote add origin git@github.com:<ユーザー名>/andmade-web.git
git branch -M main
git push -u origin main
```

push した時点で1回目のデプロイが走る。Actions タブで進行を確認できる。

---

## 4. 毎回のデプロイ

### コードを変更したとき

```bash
git add -A && git commit -m "変更内容" && git push
```

push すると自動でビルド＋アップロードされる。**手元でのビルドは不要**。

### microCMS だけ更新したとき

コードは変わっていないので push するものが無い。
GitHub の **Actions タブ → Deploy to Sakura → Run workflow** ボタンを押す。
最新の CMS 内容で再ビルドされてアップロードされる。

### 手動でアップロードしたい場合

```bash
npm run build
```

`out/` の**中身**を `/home/<アカウント>/www/` へアップロード。
`.htaccess` は先頭がドットのため FTP クライアントで隠れていることがある
（FileZilla なら「サーバー」→「隠しファイルを強制表示」をオン）。
これを上げ忘れると `/about` などが404になる。

`out/` には以下が自動で含まれる（`public/` からコピーされる）:

- `.htaccess` — 拡張子なしURLの解決、404、キャッシュ、gzip
- `now-playing.php` — Spotify エンドポイント

---

## 5. 確認

- `https://<ドメイン>/` — トップが表示される
- `https://<ドメイン>/about` — 拡張子なしURLが解決している（`.htaccess` が効いている証拠）
- `https://<ドメイン>/projects/<slug>` — 実績詳細
- `https://<ドメイン>/now-playing.php` — JSON が返る
  - 再生中: `{"isPlaying":true,"title":...}`
  - それ以外: `{"isPlaying":false}`
  - **500 エラーや HTML が返る場合**は PHP 側の問題。まず設定ファイルのパスを疑う
- `https://<ドメイン>/存在しないURL` — 404ページが出る
- `https://<ドメイン>/sitemap.xml` と `/llms.txt`

---

## 6. 仕組みの補足

### now-playing.php

`lib/spotify.ts` の PHP 移植。処理は同じ:
refresh_token → アクセストークン更新 → `/v1/me/player/currently-playing` → JSON 整形。

- **20秒キャッシュ**を持つ（`CACHE_SECONDS`）。訪問者が何人いても Spotify への
  リクエストは20秒に1回までに抑えられ、レート制限にかからない。
  曲の切り替わりが最大20秒遅れて見える。
- 失敗時は必ず `{"isPlaying":false}` を200で返す。表示側は「何も出さない」だけ。
- `lib/spotify.ts` を直したら、この PHP も合わせること（意図的な二重実装）。

### .htaccess の拡張子リライト

静的書き出しでは `/about` は `out/about.html` というファイルになる。
このサイトの正規URL（canonical、sitemap、JSON-LD）は全てスラッシュ無し・
拡張子無しなので、`.htaccess` で `.html` を補って解決している。
`trailingSlash: true` にすると `/about/` になり、全ページで
canonical → 実URL の301リダイレクトが挟まるため採用していない。

---

## 7. 制約（変わった点）

| 項目 | 変更前 | 変更後 |
|---|---|---|
| CMS更新の反映 | 即時 | **再ビルド＋アップロードが必要** |
| 実績の追加 | 即時に詳細ページが増える | 次のビルドまで404 |
| Now Playing | Next.js の API ルート | PHP（変わらず動く） |
| `next/image` の最適化 | 有効 | 無効（`unoptimized`）。元々 microCMS 側でリサイズしているので実害なし |

CMS 更新を即反映したくなった場合は、
実績・お知らせも PHP プロキシ経由のクライアント取得に変える（Now Playing と同じ形）か、
Vercel などの Node が動くホスティングに移すことになる。
