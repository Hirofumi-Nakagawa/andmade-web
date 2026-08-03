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

## 3. 確認用ディレクトリの設定（本番公開前の運用）

本番公開まで、デプロイ先は `www/preview/` ディレクトリにして
`https://andmade.jp/preview/` で確認する。
`andmade.jp` 直下は手作業で上げた coming-soon ページのまま触らない。

Basic認証を掛けるので、URLを知られても中身は見られない。

### 3-1. Basic認証のパスワードファイルを作る

**手元のMacで**以下を実行（`preview` はユーザー名、任意に変更可）:

```bash
htpasswd -nb preview '好きなパスワード'
```

`preview:$apr1$...` のような1行が出力される。これをコピーして、
サーバーの `/home/<アカウント>/.htpasswd` というファイルに貼り付けて保存する
（**`www` の外**。中に置くとURL直打ちでハッシュを取られる可能性がある）。

FTPクライアントで新規ファイルを作るか、ローカルで `.htpasswd` を作って
その階層にアップロードする。

### 3-2. .htaccess のパスを書き換える

`public/.htaccess` の先頭にある

```
AuthUserFile /home/<アカウント>/.htpasswd
```

の `<アカウント>` を実際のさくらのアカウント名に書き換えて commit する。

この `.htaccess` は `www/preview/` に置かれるので、認証は preview 配下だけに
効く。coming-soon ページには影響しない。

### 3-3. デプロイ先を preview に向ける

GitHub の Secret `SSH_TARGET_DIR` を以下にする:

```
/home/<アカウント>/www/preview/
```

### 3-4. basePath を設定する

サブディレクトリ公開では、`/_next/...` などのルート絶対パスがそのままだと
`andmade.jp/_next/...`（＝ coming-soon 側）を見に行って全部404になる。
Next の `basePath` で接頭辞を付けて解決する。

GitHub の **Settings → Secrets and variables → Actions → Variables タブ**
（Secrets ではない）で **New repository variable**:

| Name | Value |
|---|---|
| `BASE_PATH` | `/preview` |

> 先頭スラッシュあり・末尾スラッシュなし。
> 本番公開時はこの Variable を**削除するか空にする**だけでルート公開に戻る。

`next/link` / `next/image` は Next が自動で接頭辞を付ける。
CSS の `url()`、`new Image().src`、`fetch()` のURLなど「文字列として渡すパス」
だけは自動対応されないので、`lib/base-path.ts` の `withBasePath()` を
通してある（新しくそういうコードを書くときは同じように通すこと）。

---

### 本番公開に切り替えるとき

上から順に実行する。順番を変えると事故る。

1. `public/.htaccess` の Basic認証ブロックを**まるごとコメントアウト**して commit・push
   （2026-08 の本番公開時に対応済み。`AuthType`〜`Require` の4行と
   `<Files "now-playing.php">` はセットで扱うこと）
2. Variable `BASE_PATH` を**削除**（または空文字に）
3. Secret `SSH_TARGET_DIR` を `/home/<アカウント>/www/` に変更
4. Actions から **Run workflow**

> 1 を忘れると本番サイトがID/パスワードを要求する状態で公開される。
> 2 を忘れるとアセットのパスが `/preview/_next/...` のままで表示が崩れる。
> 3 を先にやると coming-soon ページが認証付きのまま上書きされる。

`SSH_TARGET_DIR` を `www/` にすると、rsync の `--delete-after` によって
`www` 直下の「out/ に無いファイル」はすべて消える。手作業で置いた
coming-soon ページと `www/preview/` も対象になる（`/home/<アカウント>/` 直下の
`.htpasswd` と `spotify-config.php` は www の外なので消えない）。

サーバー上の `www/preview/` は消しても残しても構わない。
残す場合、Basic認証が外れた状態のコピーがそこに残るので、
検索エンジンに拾われたくなければ削除しておくのが無難。

---

## 4. GitHub Actions の設定（初回のみ）

`.github/workflows/deploy.yml` がデプロイを自動化する。
GitHub リポジトリの **Settings → Secrets and variables → Actions → New repository secret**
で以下6つを登録する。

| Secret 名 | 値 |
|---|---|
| `MICROCMS_SERVICE_DOMAIN` | `.env.local` と同じ |
| `MICROCMS_API_KEY` | `.env.local` と同じ |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | `.env.local` と同じ |
| `SSH_HOST` | `<アカウント>.sakura.ne.jp` |
| `SSH_USER` | さくらのアカウント名 |
| `SSH_PRIVATE_KEY` | 下記で作る秘密鍵の中身（全文） |
| `SSH_TARGET_DIR` | `/home/<アカウント>/www/preview/`（**末尾のスラッシュ必須**） |

### なぜFTPではなくSSHか

さくらの「国外IPアドレスフィルタ」は**FTPを海外IPから遮断する**。
GitHub Actions のランナーは米国にあるため、FTPS では
TLSハンドシェイク直後に切断されて必ず失敗する
（`Server sent FIN packet unexpectedly`）。

SSHはこのフィルタの対象外なので、フィルタを有効にしたまま使える。
パスワードではなく鍵認証になる点でもFTPより安全。

### SSH鍵の作成と登録

**1. 手元のMacで鍵を作る**（パスフレーズなし。自動化で使うため）

```bash
ssh-keygen -t ed25519 -f ~/.ssh/andmade_sakura -C "github-actions" -N ""
```

**2. 公開鍵をサーバーに登録**

```bash
ssh-copy-id -i ~/.ssh/andmade_sakura.pub <アカウント>@<アカウント>.sakura.ne.jp
```

サーバーパスワードを聞かれる。成功したら接続確認:

```bash
ssh -i ~/.ssh/andmade_sakura <アカウント>@<アカウント>.sakura.ne.jp
```

パスワードなしでログインできればOK（`exit` で抜ける）。

**3. 秘密鍵をGitHubに登録**

```bash
pbcopy < ~/.ssh/andmade_sakura
```

クリップボードに入るので、Secret `SSH_PRIVATE_KEY` にそのまま貼り付ける。
`-----BEGIN OPENSSH PRIVATE KEY-----` から
`-----END OPENSSH PRIVATE KEY-----` までの**全文**が必要（改行含む）。

> 貼り付けるのは `.pub` が**付かない方**（秘密鍵）。
> 秘密鍵は画面に表示させないこと（クリップボード経由で扱う）。

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

## 5. 毎回のデプロイ

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

## 6. 確認

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

## 7. 仕組みの補足

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

## 8. 制約（変わった点）

| 項目 | 変更前 | 変更後 |
|---|---|---|
| CMS更新の反映 | 即時 | **再ビルド＋アップロードが必要** |
| 実績の追加 | 即時に詳細ページが増える | 次のビルドまで404 |
| Now Playing | Next.js の API ルート | PHP（変わらず動く） |
| `next/image` の最適化 | 有効 | 無効（`unoptimized`）。元々 microCMS 側でリサイズしているので実害なし |

CMS 更新を即反映したくなった場合は、
実績・お知らせも PHP プロキシ経由のクライアント取得に変える（Now Playing と同じ形）か、
Vercel などの Node が動くホスティングに移すことになる。
