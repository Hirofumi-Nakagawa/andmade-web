<?php
/**
 * Spotify「直近再生した曲」エンドポイント（さくらのレンタルサーバー用）
 * =====================================================================
 * public/now-playing.php の姉妹ファイル。サイトが静的書き出し
 * （next.config.ts の `output: "export"`）で Node ランタイムを持たない一方、
 * Spotify の取得には client_secret / refresh_token が必要でブラウザに出せない
 * ため、サーバー側の処理をここだけ PHP で用意している（理由の詳細は
 * now-playing.php の冒頭コメント参照）。
 *
 * 返す JSON:
 *   {"images":["https://i.scdn.co/image/...", ...]}   直近再生順（新しい順）
 *   {"images":[]}                                      取得できなかった場合
 * 失敗時も常に 200 + 空配列（呼び出し側は「何も表示しない」だけで済む。
 * components/recently-played-provider.tsx 参照）。
 *
 * ── セットアップ ───────────────────────────────────────────────
 * 認証情報は now-playing.php とまったく同じ /home/<アカウント>/spotify-config.php
 * （ドキュメントルート外）を共用する。新たに置くファイルは無い。
 *
 * ただしスコープが1つ増える: このエンドポイントが使う
 * `/v1/me/player/recently-played` には **user-read-recently-played** が必要。
 * 既存の refresh_token がそれを含んでいない場合、Spotify は 403 を返すので、
 * その時は Authorization Code Flow をもう一度だけ回して
 * `user-read-currently-playing user-read-recently-played` の両方を許可した
 * refresh_token を取り直し、spotify-config.php の値を差し替えること
 * （client_id / client_secret はそのままでよい）。403 のときは空配列が返る
 * だけなので、差し替え前でもサイトが壊れることはない。
 *
 * このファイルは public/ にあるので `next build` の出力（out/）へそのまま
 * コピーされ、www へアップロードすれば
 * https://<ドメイン>/recently-played.php で動く。
 */

declare(strict_types=1);

/** 取得する曲数。Spotify の上限は 50。 */
const RECENTLY_PLAYED_LIMIT = 50;

/** レスポンスのキャッシュ秒数。now-playing.php（20秒）より長くしてあるのは、
 *  「直近再生」は曲が終わるたびにしか変化せず、かつクライアントは
 *  ページ表示時に一度だけ取りに来る（ポーリングしない）ため。訪問者が
 *  何人いても Spotify へは最大 1回 / この秒数に抑えられる。 */
const CACHE_SECONDS = 300;

/** キャッシュファイルの置き場所。now-playing.php と同じく system の一時
 *  ディレクトリ（書き込み権限の設定が不要）。ファイル名だけ分ける。 */
function cache_path(): string
{
    return sys_get_temp_dir() . '/andmade-recently-played.json';
}

// PHPの警告・エラーが本文に混ざるとJSONが壊れるので出力を止める（ログには残る）。
ini_set('display_errors', '0');
error_reporting(E_ALL);

/** ローカル開発（http://localhost:3000 など）からの読み取りを許可する。
 *  now-playing.php の同名関数と同じ内容・同じ理由（Next の dev サーバーは
 *  PHP を実行できないので、開発時はサーバー上の本物を直接叩く）。 */
function allow_dev_origin(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin === '') {
        return;
    }
    if (preg_match('#^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$#', $origin)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
    }
}

/** 常にこの形で返して終了する。JSON以外は絶対に出力しない。 */
function respond(array $payload): void
{
    allow_dev_origin();
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/** 取得できなかったときの共通の返し方（呼び出し側は非表示になるだけ）。 */
function empty_result(): void
{
    respond(['images' => []]);
}

/** 認証情報を読む。now-playing.php とまったく同じ設定ファイルを共用する。 */
function load_credentials(): ?array
{
    $candidates = [
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

/** 共通のHTTPリクエスト。[ステータスコード, 本文] を返す（失敗時 [0, null]）。 */
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

/** refresh_token からアクセストークンを取り直す（now-playing.php と同じ）。 */
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
        allow_dev_origin();
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo $cached;
        exit;
    }
}

// 2. 認証情報が無ければ空で返す。
$config = load_credentials();
if ($config === null) {
    empty_result();
}

// 3. アクセストークンを更新。
$accessToken = refresh_access_token($config);
if ($accessToken === null) {
    empty_result();
}

// 4. 直近再生を取得。403 = スコープ不足（このファイル冒頭のセットアップ参照）。
[$status, $body] = http_request(
    'https://api.spotify.com/v1/me/player/recently-played?limit=' . RECENTLY_PLAYED_LIMIT,
    'GET',
    ['Authorization: Bearer ' . $accessToken],
    null
);

if ($status < 200 || $status >= 300 || $body === null) {
    empty_result();
}

$data = json_decode($body, true);
if (!is_array($data) || empty($data['items'])) {
    empty_result();
}

// ジャケット画像のURLだけを新しい順（APIの返却順そのまま）に取り出す。
// Spotify は画像を大きい順（640/300/64px）に返すので、2番目が表示サイズに
// ちょうどよい（now-playing.php と同じ選び方）。
//
// 同じ曲を繰り返し聴いていると同じジャケットが並ぶが、パラパラ表示としては
// 「同じ画が続いて止まって見える」だけなので、連続する重複のみ間引く
// （離れた位置での再登場は時系列として意味があるので残す）。
$images = [];
$previous = null;
foreach ($data['items'] as $entry) {
    $candidates = $entry['track']['album']['images'] ?? [];
    $url = $candidates[1]['url'] ?? ($candidates[0]['url'] ?? null);
    if ($url === null || $url === $previous) {
        continue;
    }
    $images[] = $url;
    $previous = $url;
}

$payload = ['images' => $images];

// 5. キャッシュに書いてから返す（書けなくても致命的ではないので無視）。
@file_put_contents($cacheFile, json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

respond($payload);
