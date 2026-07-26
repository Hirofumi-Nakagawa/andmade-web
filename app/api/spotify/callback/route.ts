import { NextRequest, NextResponse } from "next/server";

/**
 * One-time setup route — see app/api/spotify/login/route.ts. Exchanges the
 * authorization code Spotify redirects back with for a refresh token, and
 * prints it as plain text so you can copy it into .env.local as
 * SPOTIFY_REFRESH_TOKEN. Nothing here is persisted or linked from the site.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return new NextResponse(`Spotify authorization failed: ${error}`, { status: 400 });
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

  if (!code || !clientId || !clientSecret || !redirectUri) {
    return new NextResponse(
      "Missing code, or SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET / SPOTIFY_REDIRECT_URI in .env.local.",
      { status: 500 },
    );
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    return new NextResponse(`Token exchange failed: ${JSON.stringify(data)}`, { status: 500 });
  }

  return new NextResponse(
    `Copy this into .env.local as SPOTIFY_REFRESH_TOKEN, then restart the dev server:\n\n${data.refresh_token}`,
    { headers: { "Content-Type": "text/plain" } },
  );
}
