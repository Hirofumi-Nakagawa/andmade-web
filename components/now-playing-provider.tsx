"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { NowPlaying } from "@/lib/spotify";

/** How often to re-poll /api/now-playing while the tab is open. */
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
        const response = await fetch("/api/now-playing", { cache: "no-store" });
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
