import { NextResponse } from "next/server";
import { getRecentNews } from "@/lib/news";

export async function GET() {
  const news = await getRecentNews();
  return NextResponse.json(news);
}
