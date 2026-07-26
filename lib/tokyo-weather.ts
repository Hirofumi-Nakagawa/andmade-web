/** Tokyo's own coordinates — idle-overlay.tsx always shows Tokyo's current
 *  temperature, not the visitor's local weather (ANDMADE is Tokyo-based). */
const TOKYO_LATITUDE = 35.6895;
const TOKYO_LONGITUDE = 139.6917;

/** How often idle-overlay.tsx re-fetches the temperature — weather doesn't
 *  need anywhere near IdleDateTime's own 1s clock tick cadence. */
export const WEATHER_POLL_MS = 15 * 60_000;

/** Open-Meteo — free, no API key/signup required (unlike Spotify's own
 *  OAuth setup in lib/spotify.ts), so this fetches directly from the client
 *  rather than needing a server-side API route to keep a secret hidden.
 *  Returns null on any failure (network error, unexpected response shape,
 *  etc.) — same "just hide it" convention as lib/spotify.ts's own
 *  getNowPlaying, never throws. */
export async function fetchTokyoTemperatureC(): Promise<number | null> {
  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${TOKYO_LATITUDE}&longitude=${TOKYO_LONGITUDE}&current=temperature_2m&timezone=Asia%2FTokyo`,
      { cache: "no-store" },
    );
    if (!response.ok) return null;
    const data = await response.json();
    const temperature = data?.current?.temperature_2m;
    return typeof temperature === "number" ? temperature : null;
  } catch {
    return null;
  }
}
