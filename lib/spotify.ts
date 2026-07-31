export type NowPlaying =
  | { isPlaying: true; title: string; artist: string; url: string | null; albumImageUrl: string | null }
  | { isPlaying: false };

/**
 * Fetches what's currently playing on the site owner's Spotify account (not
 * the visitor's). Returns `{ isPlaying: false }` whenever Spotify isn't
 * configured, nothing is playing, or a request fails — callers should treat
 * that as "show nothing / fall back", never throw.
 *
 * NOTE: nothing calls this at runtime any more. The site is statically
 * exported (next.config.ts's own `output: "export"`), so the Route Handlers
 * that used to wrap this — app/api/now-playing plus the one-time
 * app/api/spotify/login|callback authorization pair — are gone, and
 * public/now-playing.php is the live implementation (a direct PHP port of
 * this file's two functions, kept in step with it deliberately). This stays
 * as the reference/type source: `NowPlaying` above is still the shape the
 * PHP returns and the shape components/now-playing-provider.tsx consumes.
 * To re-obtain a refresh_token, use Spotify's standard Authorization Code
 * flow (or restore the deleted login/callback routes from git history).
 */
export async function getNowPlaying(): Promise<NowPlaying> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return { isPlaying: false };
  }

  try {
    const accessToken = await refreshAccessToken(clientId, clientSecret, refreshToken);
    if (!accessToken) return { isPlaying: false };

    const response = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      headers: { Authorization: `Bearer ${accessToken}` },
      // Always ask Spotify fresh — this is polled client-side on its own interval.
      cache: "no-store",
    });

    // 204 = nothing currently playing.
    if (response.status === 204 || !response.ok) return { isPlaying: false };

    const data = await response.json();
    if (!data?.is_playing || !data?.item) return { isPlaying: false };

    const title: string = data.item.name;
    const artist: string = (data.item.artists ?? []).map((a: { name: string }) => a.name).join(", ");
    const url: string | null = data.item.external_urls?.spotify ?? null;
    // Spotify returns images largest-first (typically 640/300/64px) — the
    // middle one is plenty for a small hover preview.
    const images = data.item.album?.images ?? [];
    const albumImageUrl: string | null = images[1]?.url ?? images[0]?.url ?? null;

    return { isPlaying: true, title, artist, url, albumImageUrl };
  } catch {
    return { isPlaying: false };
  }
}

async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string | null> {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  });

  if (!response.ok) return null;
  const data = await response.json();
  return data.access_token ?? null;
}
