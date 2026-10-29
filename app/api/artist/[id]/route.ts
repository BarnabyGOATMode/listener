import { NextResponse, type NextRequest } from "next/server";
import { lookupArtist } from "@/lib/musicbrainz";

/** An artist and their discography from MusicBrainz. Cached at the edge for a day since discographies rarely change. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/artist/[id]">) {
  const { id } = await ctx.params;
  try {
    const artist = await lookupArtist(id);
    if (!artist) return NextResponse.json({ error: "Artist not found" }, { status: 404 });
    return NextResponse.json(artist, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
  } catch (e) {
    const notFound = /404/.test((e as Error).message);
    return NextResponse.json({ error: notFound ? "Artist not found" : "Couldn't load this artist from MusicBrainz. Try again in a moment." }, { status: notFound ? 404 : 502 });
  }
}
