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
 *   {"tracks":[{"image":"https://i.scdn.co/image/...","artist":"...","time":"HH:MM","date":"Aug.15,2026"}, ...]}
 *   直近再生順（新しい順）。取得できなかった場合は {"tracks":[]}。
 * 失敗時も常に 200 + 空配列（呼び出し側は「何も表示しない」だけで済む。
 * components/recently-played-flip.tsx 参照）。
 *
 * artist はジャケット下に出すため。複数アーティストはカンマ区切りで連結
 * （now-playing.php と同じ扱い）。
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

/** 再生ログの置き場所。
 *
 *  Spotify の「直近再生」は最大50曲しか遡れないので、あとから
 *  「Colors of Sound」のアーカイブ（日ごとの色）を作ろうとしても、過去は
 *  もう取れない。そこでこのエンドポイントが叩かれるたびに、取得できた
 *  ぶんを**日付ごとの JSON へ追記**していく。played_at をキーにするので、
 *  同じ曲が何度取り込まれても重複しない。
 *
 *  置き場所は **www の外**（このファイルの1つ上 = ドキュメントルートの親、
 *  さくらなら /home/andmade/colors-of-sound-logs）。理由は2つ —
 *   ・一時ディレクトリ（sys_get_temp_dir）はサーバー側の掃除で消え得るので
 *     アーカイブの保存先には使えない。
 *   ・www の下に置くと URL で直接読めてしまう（デプロイの rsync --delete で
 *     消える危険もある）。
 *  書き込みできない環境では黙って諦める（append_play_log 参照）。環境変数
 *  ANDMADE_COLORS_LOG_DIR があればそちらを優先する。
 *
 *  ■ 取りこぼしを無くすには cron が要る
 *  このログはこのエンドポイントが叩かれたときにしか動かない。Spotify の
 *  「直近再生」は50曲までしか遡れないので、誰も訪問しない時間が長いと
 *  その間の再生が失われる。サーバー側で10〜15分おきに叩いておくこと:
 *
 *      0,10,20,30,40,50 * * * * curl -s https://andmade.jp/recently-played.php > /dev/null
 *
 *  （キャッシュ（CACHE_SECONDS）が生きている間は API を叩かないので、
 *   Spotify へのリクエストが増えすぎることはない。） */
function log_dir(): string
{
    $dir = getenv('ANDMADE_COLORS_LOG_DIR');
    if (is_string($dir) && $dir !== '') {
        return rtrim($dir, '/');
    }
    return dirname(__DIR__) . '/colors-of-sound-logs';
}

/**
 * 取得できた再生履歴を日付（日本時間）ごとの JSON へ追記する。
 *
 * 形式: { "date": "2026-08-15", "plays": { "<played_at(ISO)>": {...} } }
 * played_at をキーにした連想配列なので、追記のたびに array_merge するだけで
 * 自然に重複が排除される（同じ再生は同じキー）。読み出す側は values を
 * 時刻順に並べ替えて使う想定。
 *
 * 失敗しても API のレスポンスには影響させない（ログはあくまで副作用）。
 */
function append_play_log(array $plays): void
{
    if ($plays === []) {
        return;
    }
    $dir = log_dir();
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        return;
    }
    // 1回の取得に複数日ぶんが混ざり得る（日付をまたいで聴いた場合）ので、
    // まず日付ごとに仕分けてからファイルを開く。
    $byDate = [];
    foreach ($plays as $play) {
        $byDate[$play['day']][$play['played_at']] = $play['entry'];
    }
    foreach ($byDate as $day => $entries) {
        $file = $dir . '/' . $day . '.json';
        $existing = [];
        if (is_readable($file)) {
            $decoded = json_decode((string) @file_get_contents($file), true);
            if (is_array($decoded) && isset($decoded['plays']) && is_array($decoded['plays'])) {
                $existing = $decoded['plays'];
            }
        }
        $merged = $existing + $entries; // 既存を優先（同じ played_at は上書きしない）
        ksort($merged);
        @file_put_contents(
            $file,
            json_encode(
                ['date' => $day, 'plays' => $merged],
                JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT
            ),
            LOCK_EX
        );
    }
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
    respond(['tracks' => []]);
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

// ジャケット画像のURLとアーティスト名を新しい順（APIの返却順そのまま）に
// 取り出す。Spotify は画像を大きい順（640/300/64px）に返すので、2番目が
// 表示サイズにちょうどよい（now-playing.php と同じ選び方）。
//
// 同じ曲を繰り返し聴いていると同じジャケットが並ぶが、パラパラ表示としては
// 「同じ画が続いて止まって見える」だけなので、連続する重複のみ間引く
// （離れた位置での再登場は時系列として意味があるので残す）。
$tracks = [];
/** アーカイブ用の再生ログ（append_play_log の doc comment 参照）。表示用の
 *  $tracks とは別物 — こちらは連続重複も間引かず、曲名まで残す。 */
$plays = [];
$previous = null;
foreach ($data['items'] as $entry) {
    $track = $entry['track'] ?? null;
    if (!is_array($track)) {
        continue;
    }
    $candidates = $track['album']['images'] ?? [];
    $url = $candidates[1]['url'] ?? ($candidates[0]['url'] ?? null);
    if ($url === null || $url === $previous) {
        continue;
    }
    $artists = [];
    foreach (($track['artists'] ?? []) as $artist) {
        if (!empty($artist['name'])) {
            $artists[] = $artist['name'];
        }
    }
    // time — 再生時刻（HH:MM、日本時間）。トップ背景の帯に添えるラベルで
    // 使う（components/sound-colors-background.tsx）。API の played_at は
    // ISO8601 の UTC。
    $time = '';
    // date — 再生日（Aug.15,2026 形式、日本時間）。トップ背景の帯の
    // ラベル1行目（2行目がアーティスト名）。
    $date = '';
    if (!empty($entry['played_at'])) {
        $playedAt = new DateTime($entry['played_at'], new DateTimeZone('UTC'));
        $playedAt->setTimezone(new DateTimeZone('Asia/Tokyo'));
        $time = $playedAt->format('H:i');
        $date = $playedAt->format('M.j,Y');
    }
    // アーカイブ用ログ（表示用の間引きとは無関係に、取れたものは全部残す）。
    if (!empty($entry['played_at'])) {
        $playedAtJst = new DateTime($entry['played_at'], new DateTimeZone('UTC'));
        $playedAtJst->setTimezone(new DateTimeZone('Asia/Tokyo'));
        $plays[] = [
            'day' => $playedAtJst->format('Y-m-d'),
            'played_at' => (string) $entry['played_at'],
            'entry' => [
                'played_at' => (string) $entry['played_at'],
                'time' => $playedAtJst->format('H:i'),
                'artist' => implode(', ', $artists),
                'title' => (string) ($track['name'] ?? ''),
                'image' => $url,
            ],
        ];
    }

    $tracks[] = [
        'image' => $url,
        'artist' => implode(', ', $artists),
        'time' => $time,
        'date' => $date,
    ];
    $previous = $url;
}

// 副作用としてログを追記（失敗してもレスポンスには影響しない）。
append_play_log($plays);

$payload = ['tracks' => $tracks];

// 5. キャッシュに書いてから返す（書けなくても致命的ではないので無視）。
@file_put_contents($cacheFile, json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

respond($payload);
