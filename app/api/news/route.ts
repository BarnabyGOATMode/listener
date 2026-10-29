import { NextResponse } from "next/server";
import { latestNews } from "@/lib/news";

/** The music news wire, refreshed at most every 20 minutes for everyone. */
export async function GET() {
  const news = await latestNews();
  return NextResponse.json(news, {
    headers: { "Cache-Control": news.stories.length ? "public, s-maxage=1200, stale-while-revalidate=3600" : "no-store" },
  });
}
