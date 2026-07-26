import { NextResponse } from "next/server";

/**
 * One-time setup route. Visit /api/spotify/login in the browser (with the
 * dev server running) to authorize this site against your own Spotify
 * account. Redirects to /api/spotify/callback, which prints a refresh token
 * to copy into .env.local as SPOTIFY_REFRESH_TOKEN. Not linked from
 * anywhere in the site's UI — this is a setup utility, not a page.
 */
export function GET() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "Set SPOTIFY_CLIENT_ID and SPOTIFY_REDIRECT_URI in .env.local first." },
      { status: 500 },
    );
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: "user-read-currently-playing",
    redirect_uri: redirectUri,
  });

  return NextResponse.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
}
