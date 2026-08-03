"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { withBasePath } from "@/lib/base-path";
import type { NowPlaying } from "@/lib/spotify";

/**
 * The one server-side endpoint this otherwise fully-static site still needs.
 *
 * Was `/api/now-playing` (a Next.js Route Handler). The site is now built
 * with `output: "export"` (see next.config.ts) for PHP-only hosting, so no
 * Node runtime exists at request time — but Spotify's API requires a
 * client_secret + refresh_token that must never reach the browser, so this
 * genuinely can't move client-side. public/now-playing.php reimplements the
 * old route in PHP and returns the exact same JSON shape; see that file's
 * own header comment for the deployment/credentials setup.
 *
 * Root-relative (not just "now-playing.php") so it resolves the same from
 * every route, including nested ones like /projects/<slug>/. withBasePath()
 * because a plain fetch URL is a string Next doesn't rewrite — see
 * lib/base-path.ts.
 *
 * 開発時だけ preview 環境の PHP を見に行く — per direct follow-up
 * ("localhost:3000でspotifyが確認できなくなってるのはなぜ？")。`npm run dev`
 * が動かすのは Next の開発サーバーで PHP を実行できないため、相対パスのままだと
 * 404 → 常に「再生なし」になってしまう。サーバー側に置いた本物を叩けば
 * ローカルでも表示を確認できる。
 *
 * 本番公開に伴い /preview/ から直下へ変更した（preview ディレクトリは
 * 本番デプロイの rsync --delete で消える）。Basic 認証も外れているので、
 * public/.htaccess 側の <Files "now-playing.php"> 除外は不要になっている。
 * 返るのは再生中の曲名だけで、認証情報も CMS の内容も含まない。
 *
 * NODE_ENV は Next がビルド時に静的な値へ置き換えるので、本番ビルドでは
 * この分岐ごと消える（開発用の URL が成果物に残ることはない）。
 */
const DEV_NOW_PLAYING_ENDPOINT = "https://andmade.jp/now-playing.php";
const NOW_PLAYING_ENDPOINT =
  process.env.NODE_ENV === "development" ? DEV_NOW_PLAYING_ENDPOINT : withBasePath("/now-playing.php");

/** How often to re-poll the endpoint above while the tab is open. Matches
 *  that PHP's own CACHE_SECONDS, so each poll lands on roughly one fresh
 *  Spotify call regardless of how many visitors are on the site. */
const NOW_PLAYING_POLL_MS = 20_000;

const NowPlayingContext = createContext<NowPlaying>({ isPlaying: false });

/**
 * Mounted once in app/layout.tsx (which — unlike page.tsx — never unmounts
 * on client-side navigation between routes), so the polled Spotify state
 * survives page switches instead of resetting to `{ isPlaying: false }` and
 * re-fetching from scratch each time. Previously SiteHeader and
 * HeaderSummon each ran their own independent poll loop starting from
 * "nothing playing", which is why the header's "Playing" display used to
 * flash empty for a moment on every navigation (and double-polled Spotify
 * to boot). Both now just read from this context instead.
 */
export function NowPlayingProvider({ children }: { children: React.ReactNode }) {
  const [nowPlaying, setNowPlaying] = useState<NowPlaying>({ isPlaying: false });

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch(NOW_PLAYING_ENDPOINT, { cache: "no-store" });
        const data: NowPlaying = await response.json();
        if (!cancelled) setNowPlaying(data);
      } catch {
        if (!cancelled) setNowPlaying({ isPlaying: false });
      }
    }

    poll();
    const interval = setInterval(poll, NOW_PLAYING_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return <NowPlayingContext.Provider value={nowPlaying}>{children}</NowPlayingContext.Provider>;
}

export function useNowPlaying(): NowPlaying {
  return useContext(NowPlayingContext);
}
