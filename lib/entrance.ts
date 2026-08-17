/**
 * トップページの「本文より一拍おいて出てくる」要素の共通タイミング — per
 * direct follow-ups（"一覧はワンテンポ遅らせて表示して" →
 * "Made Hereとcases、お知らせなどもワンテンポ遅らせて表示"）。
 *
 * FV のコピー（カーテンリビール）が動き出してから一拍おいて、一覧・左レール
 * （Made Here / N Cases / Txt-Img）・お知らせ・右下の "Scroll" が続く、
 * という順番を作るための待ち時間。PC / SP どちらもこの1つの値を見る。
 */
/** FV の「1拍目」— コピー（カーテンリビール）のあと、Who we are と
 *  「A sound archive〜/Colors of Sound」が入るまで。 */
export const FV_SECOND_BEAT_MS = 450;

/** FV の「2拍目」— さらにもう一拍おいて、一覧・左レール（Made Here /
 *  N Cases / Txt-Img）・お知らせ・右下の "Scroll" が続く — per direct
 *  follow-ups（"Who we areボタンとA sound archive~もワンテンポ遅らせて表示"
 *  → "さらにワンテンポ遅らせて一覧などを表示"）。 */
/** 900（= 1拍の2倍）→ 750 — per direct follow-up（"一覧の表示タイミングを
 *  もう少しだけ速くして"）。1拍目（Who we are / A sound archive）との差は
 *  300ms 残しつつ、全体の待ちを詰めている。 */
export const LIST_ENTRANCE_DELAY_MS = 750;

/**
 * 「初回表示ぶんか」の判定窓 — **ページに入った瞬間**からこの時間内に
 * IntersectionObserver が発火したものだけに LIST_ENTRANCE_DELAY_MS を足す。
 * スクロールで下から入ってくる行にまで足すと、ただ反応が鈍いだけになるため。
 */
export const INITIAL_REVEAL_WINDOW_MS = 1000;

/**
 * 「ページに入った瞬間」の時刻（performance.now()）。
 *
 * 当初は各カード／各行の**自分のマウント時刻**を基準にしていたが、それだと
 * Img → Txt の切り替えでも一覧が丸ごと作り直される＝毎回「初回」と判定され、
 * 切り替えのたびに一拍待たされていた — per direct follow-up（"img時から
 * txtを押して戻るとき、一拍あく感じがあるので、すぐ表示するようにして"）。
 *
 * 基準をページ単位に上げ、トップページのマウント時とイントロ完了時にだけ
 * 打ち直す（home-view.tsx / mobile-home.tsx が呼ぶ）。Txt/Img の切り替えでは
 * 打ち直さないので、2回目以降は遅延なしで即表示になる。
 */
let pageEnteredAt = 0;

/** トップページに入った（またはイントロが明けた）ことを記録する。 */
export function markPageEntered(): void {
  pageEnteredAt = typeof performance !== "undefined" ? performance.now() : 0;
}

/** いまが「ページに入った直後」か（pageEnteredAt の doc comment 参照）。 */
export function isInitialEntrance(): boolean {
  if (pageEnteredAt === 0) return false;
  return performance.now() - pageEnteredAt < INITIAL_REVEAL_WINDOW_MS;
}
