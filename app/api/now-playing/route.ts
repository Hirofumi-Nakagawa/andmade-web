import { NextResponse } from "next/server";
import { getNowPlaying } from "@/lib/spotify";

export async function GET() {
  const nowPlaying = await getNowPlaying();
  return NextResponse.json(nowPlaying);
}
