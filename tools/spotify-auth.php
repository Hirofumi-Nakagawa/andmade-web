<?php
/**
 * Spotify の refresh_token 取り直し用ツール（使い捨て・手動アップロード）
 * =====================================================================
 * public/recently-played.php が使う `/v1/me/player/recently-played` には
 * **user-read-recently-played** スコープが必要。既存の refresh_token が
 * それを含んでいないと Spotify が 403 を返すため、両方のスコープを許可した
 * refresh_token を一度だけ取り直す必要がある。そのための最小限のツール。
 *
 * ★ このファイルは意図的に public/ ではなく tools/ に置いてある。
 *   public/ に置くと `next build` の出力に含まれ、以後ずっと本番に常設されて
 *   しまう（誰かが URL を叩くと、その人の Spotify アカウントでトークンを
 *   上書きできてしまう）。手でアップロードし、**使い終わったら必ず削除する**。
 *
 * ── 使い方 ─────────────────────────────────────────────────────
 * 1. このファイルを www 直下（/home/<アカウント>/www/spotify-auth.php）へ
 *    アップロードする。
 *
 * 2. ブラウザで https://andmade.jp/spotify-auth.php を開く。最初の画面に
 *    「Dashboard に登録すべき Redirect URI」が表示されるので、その文字列を
 *    そのまま Spotify Developer Dashboard → 対象アプリ → Settings →
 *    Redirect URIs に追加して保存する（既存の URI はそのままでよい）。
 *
 * 3. 画面のリンクから認可へ進む。Spotify の許可画面 → 「同意する」で戻る。
 *
 * 4. 戻り先で、新しい refresh_token が
 *      /home/<アカウント>/spotify-config.php
 *    の 'refresh_token' に **自動で書き込まれる**。画面にトークン自体は
 *    表示しない（画面・履歴・スクショに秘密を残さないため）。
 *    「更新しました」と出れば完了。
 *
 * 5. **このファイルをサーバーから削除する。**
 *    削除後、https://andmade.jp/contact/ でジャケットが回れば成功。
 *
 * ── うまくいかないとき ────────────────────────────────────────
 * ・「設定ファイルに書き込めません」→ spotify-config.php の書き込み権限が
 *   無い。FTP/SSH でパーミッションを一時的に 600→644 等にして再実行するか、
 *   下の FALLBACK_SHOW_TOKEN を true にして手で貼り替える（その場合は
 *   画面にトークンが出るので、貼り替えたらタブを閉じ、履歴も残さないこと）。
 * ・「INVALID_CLIENT」等が出る → 手順1の Redirect URI が未登録／不一致。
 */

declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

/** Redirect URI。Spotify は Dashboard の登録値と**1文字も違わない**ことを
 *  要求する（www の有無、末尾スラッシュ、http/https すべて厳密）。手で書くと
 *  取り違えるので、実際にこのページが開かれた URL からクエリを除いて自動で
 *  組み立てる。画面にもその値を表示するので、Dashboard にはそれをコピペする
 *  こと。固定したい場合だけ下の const を書き換える（null なら自動）。 */
const REDIRECT_URI_OVERRIDE = null;

function redirect_uri(): string
{
    if (REDIRECT_URI_OVERRIDE !== null) {
        return REDIRECT_URI_OVERRIDE;
    }
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $scheme = $https ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $path = strtok($_SERVER['REQUEST_URI'] ?? '/spotify-auth.php', '?');
    return $scheme . '://' . $host . $path;
}

/** 必要なスコープ。既存の「再生中の曲」用と、新規の「直近再生」用の両方。 */
const SCOPES = 'user-read-currently-playing user-read-playback-state user-read-recently-played';

/** true にすると、設定ファイルへ書けなかった場合に限り refresh_token を
 *  画面に表示する（手で貼り替える用）。既定は false = 画面に秘密を出さない。 */
const FALLBACK_SHOW_TOKEN = false;

function page(string $message): void
{
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    echo '<!doctype html><meta charset="utf-8"><title>Spotify auth</title>';
    echo '<body style="font:14px/1.7 system-ui;padding:40px;max-width:640px">';
    echo $message;
    echo '</body>';
    exit;
}

/** 設定ファイルの場所（now-playing.php / recently-played.php と同じ探索順）。 */
function config_path(): ?string
{
    foreach ([__DIR__ . '/../spotify-config.php', __DIR__ . '/../../spotify-config.php'] as $path) {
        if (is_readable($path)) {
            return $path;
        }
    }
    return null;
}

$configPath = config_path();
if ($configPath === null) {
    page('<p><b>spotify-config.php が見つかりません。</b>www の一つ上の階層にあるか確認してください。</p>');
}

$config = include $configPath;
if (!is_array($config) || empty($config['client_id']) || empty($config['client_secret'])) {
    page('<p><b>spotify-config.php の client_id / client_secret が読めません。</b></p>');
}

// ── 1. 認可画面へ送る（code が無いとき） ─────────────────────────
if (!isset($_GET['code'])) {
    if (isset($_GET['error'])) {
        page('<p><b>認可がキャンセルされました。</b>やり直す場合はこのページを再読み込みしてください。</p>');
    }

    // CSRF 対策の state。Cookie に置いて戻りで突き合わせる。
    $state = bin2hex(random_bytes(16));
    setcookie('spotify_auth_state', $state, [
        'expires' => time() + 600,
        'path' => '/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);

    // ?go=1 が付くまでは飛ばさず、Dashboard に登録すべき値を見せる —
    // "redirect_uri: Not matching configuration" は登録値との不一致が原因
    // なので、まず実際に使う文字列を確認できるようにする。
    if (!isset($_GET['go'])) {
        $uri = htmlspecialchars(redirect_uri(), ENT_QUOTES);
        page(
            '<p>Spotify Developer Dashboard → 対象アプリ → Settings → '
            . 'Redirect URIs に、<b>下の値をそのまま</b>追加して保存してください'
            . '（1文字でも違うと「Not matching configuration」になります）。</p>'
            . '<pre style="white-space:pre-wrap;word-break:break-all;background:#f3f3f3;padding:12px">'
            . $uri . '</pre>'
            . '<p>保存できたら <a href="?go=1">こちらから認可へ進む</a>。</p>'
        );
    }

    $url = 'https://accounts.spotify.com/authorize?' . http_build_query([
        'client_id' => $config['client_id'],
        'response_type' => 'code',
        'redirect_uri' => redirect_uri(),
        'scope' => SCOPES,
        'state' => $state,
        // 既に許可済みでも必ず同意画面を出す（スコープ追加を確実に反映させる）。
        'show_dialog' => 'true',
    ]);
    header('Location: ' . $url, true, 302);
    exit;
}

// ── 2. code を refresh_token に交換する ─────────────────────────
$state = $_GET['state'] ?? '';
$expected = $_COOKIE['spotify_auth_state'] ?? '';
if ($state === '' || !hash_equals($expected, $state)) {
    page('<p><b>state が一致しません。</b>最初からやり直してください（このページを直接開き直す）。</p>');
}
setcookie('spotify_auth_state', '', ['expires' => time() - 3600, 'path' => '/']);

$ch = curl_init('https://accounts.spotify.com/api/token');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/x-www-form-urlencoded',
        'Authorization: Basic ' . base64_encode($config['client_id'] . ':' . $config['client_secret']),
    ],
    CURLOPT_POSTFIELDS => http_build_query([
        'grant_type' => 'authorization_code',
        'code' => $_GET['code'],
        'redirect_uri' => redirect_uri(),
    ]),
    CURLOPT_TIMEOUT => 10,
]);
$response = curl_exec($ch);
$status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($response === false || $status !== 200) {
    page(
        '<p><b>トークンの取得に失敗しました。</b>（HTTP ' . $status . '）</p>'
        . '<p>使用した redirect_uri: <code>' . htmlspecialchars(redirect_uri(), ENT_QUOTES) . '</code></p>'
        . '<p>この文字列が Dashboard の Redirect URIs に登録されているか確認してください。</p>'
    );
}

$data = json_decode((string) $response, true);
$refreshToken = is_array($data) ? ($data['refresh_token'] ?? null) : null;
if (!is_string($refreshToken) || $refreshToken === '') {
    page('<p><b>refresh_token が返りませんでした。</b>最初からやり直してください。</p>');
}

// ── 3. 設定ファイルの refresh_token だけを書き換える ────────────
// 画面には出さない。ファイルは丸ごと生成し直す（元の client_id/secret は
// 読み込み済みの値をそのまま使う）。
$php = "<?php return [\n"
    . "  'client_id'     => " . var_export((string) $config['client_id'], true) . ",\n"
    . "  'client_secret' => " . var_export((string) $config['client_secret'], true) . ",\n"
    . "  'refresh_token' => " . var_export($refreshToken, true) . ",\n"
    . "];\n";

$written = @file_put_contents($configPath, $php);
if ($written === false) {
    if (FALLBACK_SHOW_TOKEN) {
        page(
            '<p><b>設定ファイルに書き込めませんでした。</b>下の値を spotify-config.php の '
            . "'refresh_token' に手で貼り替えてください（貼り替えたらこのタブを閉じ、"
            . '履歴も消してください）。</p><pre style="white-space:pre-wrap;word-break:break-all;background:#f3f3f3;padding:12px">'
            . htmlspecialchars($refreshToken, ENT_QUOTES) . '</pre>'
        );
    }
    page(
        '<p><b>設定ファイルに書き込めませんでした。</b>（パーミッション不足）'
        . 'spotify-config.php を書き込み可能にして、このページを最初からやり直してください。'
        . 'どうしても書けない場合は、このファイル内の FALLBACK_SHOW_TOKEN を true にすると'
        . '画面に値を表示できます（秘密が画面に出る点に注意）。</p>'
    );
}

page(
    '<p><b>更新しました。</b>refresh_token を spotify-config.php に書き込みました'
    . '（値は画面に表示していません）。</p>'
    . '<p style="color:#b00"><b>このファイル（spotify-auth.php）をサーバーから削除してください。</b></p>'
    . '<p>削除後、<a href="/contact/">/contact/</a> でジャケットが回れば成功です。</p>'
);
