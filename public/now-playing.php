<?php
/**
 * Spotify "Now Playing" エンドポイント（さくらのレンタルサーバー用）
 * =================================================================
 * サイトを静的書き出し（next.config.ts の `output: "export"`）に切り替えたため、
 * Next.js の Route Handler（旧 app/api/now-playing/route.ts）は存在しない。
 * ただし Spotify の再生中トラック取得には client_secret と refresh_token が必要で、
 * これらはブラウザに出せない（出したら誰でもアカウントを操作できてしまう）ため、
 * サーバー側の処理が最低1つだけ必要になる。さくらで動くのが PHP なので、
 * ここだけ PHP で代替している。
 *
 * lib/spotify.ts の getNowPlaying() と同じ JSON を返す:
 *   再生中   : {"isPlaying":true,"title":...,"artist":...,"url":...,"albumImageUrl":...}
 *   それ以外 : {"isPlaying":false}
 * 失敗時も常に 200 + {"isPlaying":false} を返す（呼び出し側は「何も表示しない」
 * だけで済む。components/now-playing-provider.tsx 参照）。
 *
 * ── セットアップ ───────────────────────────────────────────────
 * 1. 認証情報ファイルを「ドキュメントルートの外」に置く。さくらの場合、
 *    公開領域が /home/<アカウント>/www なので、その一つ上に置く:
 *
 *      /home/<アカウント>/spotify-config.php
 *      <?php return [
 *        'client_id'     => 'xxxxxxxx',
 *        'client_secret' => 'xxxxxxxx',
 *        'refresh_token' => 'xxxxxxxx',
 *      ];
 *
 *    ※ www 配下に置くと URL 直打ちで中身が見える危険がある（PHPとして実行
 *      されるので通常は表示されないが、設定ミス1つで平文露出する）。
 *    ※ 環境変数（さくらのコントロールパネルで設定）が使える場合はそちらでも
 *      よい。下の読み込み処理は「ファイル → 環境変数」の順で探す。
 *
 * 2. refresh_token の取得は一度だけローカルで行う:
 *      npm run dev した状態で http://localhost:3000/api/spotify/login を開く
 *    …が、APIルートは削除済みなので、削除前のコミットに戻すか、Spotify の
 *    公式ドキュメントの Authorization Code Flow で取得する。取得済みの
 *    トークンがあれば再取得は不要（refresh_token は失効しない）。
 *
 * 3. このファイルは public/ に置いてあるので、`next build` の出力（out/）に
 *    そのままコピーされる。out/ の中身を www へアップロードすれば
 *    https://<ドメイン>/now-playing.php で動く。
 */

declare(strict_types=1);

/** レスポンスのキャッシュ秒数。
 *  クライアントは now-playing-provider.tsx の間隔で定期ポーリングするので、
 *  訪問者が増えるとそのまま Spotify へのリクエスト数になる。Spotify には
 *  レート制限（30秒窓）があるため、サーバー側で短時間キャッシュして
 *  「訪問者が何人いても Spotify へは最大 1回 / CACHE_SECONDS」に抑える。
 *  曲の切り替わりが最大この秒数だけ遅れて見える。 */
const CACHE_SECONDS = 20;

/** キャッシュファイルの置き場所。system の一時ディレクトリを使うので
 *  書き込み権限の設定が不要。取得に失敗してもキャッシュ無しで動作は続く。 */
function cache_path(): string
{
    return sys_get_temp_dir() . '/andmade-now-playing.json';
}

/** 常にこの形で返して終了する。JSON以外は絶対に出力しない
 *  （PHPのwarningが混ざるとクライアント側のJSON.parseが壊れるため、
 *   このファイル冒頭でエラー表示も切っている）。 */
function respond(array $payload): void
{
    header('Content-Type: application/json; charset=utf-8');
    // ブラウザ側では毎回聞きに来てよい（キャッシュはサーバー側で持つ）。
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function not_playing(): void
{
    respond(['isPlaying' => false]);
}

// PHPの警告・エラーが本文に混ざるとJSONが壊れるので出力を止める
// （ログには残る）。
ini_set('display_errors', '0');
error_reporting(E_ALL);

/** 認証情報を読む。ドキュメントルート外の設定ファイル → 環境変数 の順。 */
function load_credentials(): ?array
{
    $candidates = [
        // /home/<アカウント>/www/now-playing.php から見た一つ上の階層
        __DIR__ . '/../spotify-config.php',
        __DIR__ . '/../../spotify-config.php',
    ];
    foreach ($candidates as $path) {
        if (is_readable($path)) {
            $config = include $path;
            if (is_array($config)
                && !empty($config['client_id'])
                && !empty($config['client_secret'])
                && !empty($config['refresh_token'])) {
                return $config;
            }
        }
    }

    $clientId = getenv('SPOTIFY_CLIENT_ID');
    $clientSecret = getenv('SPOTIFY_CLIENT_SECRET');
    $refreshToken = getenv('SPOTIFY_REFRESH_TOKEN');
    if ($clientId && $clientSecret && $refreshToken) {
        return [
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'refresh_token' => $refreshToken,
        ];
    }

    return null;
}

/** 共通のHTTPリクエスト。[ステータスコード, 本文] を返す。
 *  失敗時は [0, null]。タイムアウトを短めにしてあるのは、Spotify が遅い時に
 *  このPHPがページ表示をブロックしないようにするため（そもそも非同期で
 *  呼ばれるが、PHPプロセスを長時間占有しないため）。 */
function http_request(string $url, string $method, array $headers, ?string $body): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_CONNECTTIMEOUT => 4,
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }
    $response = curl_exec($ch);
    if ($response === false) {
        curl_close($ch);
        return [0, null];
    }
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$status, $response];
}

/** refresh_token からアクセストークンを取り直す（lib/spotify.ts の
 *  refreshAccessToken() と同じ処理）。アクセストークンは1時間で失効するので
 *  毎回取り直す。 */
function refresh_access_token(array $config): ?string
{
    [$status, $body] = http_request(
        'https://accounts.spotify.com/api/token',
        'POST',
        [
            'Content-Type: application/x-www-form-urlencoded',
            'Authorization: Basic ' . base64_encode($config['client_id'] . ':' . $config['client_secret']),
        ],
        http_build_query([
            'grant_type' => 'refresh_token',
            'refresh_token' => $config['refresh_token'],
        ])
    );

    if ($status !== 200 || $body === null) {
        return null;
    }
    $data = json_decode($body, true);
    return is_array($data) && !empty($data['access_token']) ? $data['access_token'] : null;
}

// ── ここから本処理 ───────────────────────────────────────────────

// 1. キャッシュが新しければそれを返す（Spotifyへは行かない）。
$cacheFile = cache_path();
if (is_readable($cacheFile) && (time() - (int) @filemtime($cacheFile)) < CACHE_SECONDS) {
    $cached = @file_get_contents($cacheFile);
    if ($cached !== false && $cached !== '') {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo $cached;
        exit;
    }
}

// 2. 認証情報が無ければ何も再生していない扱い（lib/spotify.ts と同じ挙動）。
$config = load_credentials();
if ($config === null) {
    not_playing();
}

// 3. アクセストークンを更新。
$accessToken = refresh_access_token($config);
if ($accessToken === null) {
    not_playing();
}

// 4. 再生中トラックを取得。204 = 何も再生していない。
[$status, $body] = http_request(
    'https://api.spotify.com/v1/me/player/currently-playing',
    'GET',
    ['Authorization: Bearer ' . $accessToken],
    null
);

if ($status === 204 || $status < 200 || $status >= 300 || $body === null) {
    not_playing();
}

$data = json_decode($body, true);
if (!is_array($data) || empty($data['is_playing']) || empty($data['item'])) {
    not_playing();
}

$item = $data['item'];

// アーティスト名はカンマ区切りで連結（lib/spotify.ts と同じ）。
$artists = [];
foreach (($item['artists'] ?? []) as $artist) {
    if (!empty($artist['name'])) {
        $artists[] = $artist['name'];
    }
}

// Spotify は画像を大きい順（640/300/64px）に返すので、2番目が
// ホバープレビューにちょうどよい（lib/spotify.ts と同じ選び方）。
$images = $item['album']['images'] ?? [];
$albumImageUrl = $images[1]['url'] ?? ($images[0]['url'] ?? null);

$payload = [
    'isPlaying' => true,
    'title' => $item['name'] ?? '',
    'artist' => implode(', ', $artists),
    'url' => $item['external_urls']['spotify'] ?? null,
    'albumImageUrl' => $albumImageUrl,
];

// 5. キャッシュに書いてから返す（書けなくても致命的ではないので無視）。
@file_put_contents($cacheFile, json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

respond($payload);
