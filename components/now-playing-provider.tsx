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
 */
const NOW_PLAYING_ENDPOINT = withBasePath("/now-playing.php");

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
