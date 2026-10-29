import { NextResponse, type NextRequest } from "next/server";
import { lookupAlbum } from "@/lib/musicbrainz";
import { adminSupabase, serverSupabase } from "@/lib/supabase/server";

/** Returns an album from listener's catalog, fetching and caching it from MusicBrainz the first time anyone opens it. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/album/[id]">) {
  const { id } = await ctx.params;
  const db = await serverSupabase();
  const { data: cached } = await db.from("albums").select("*").eq("id", id).maybeSingle();
  // Albums cached before artist links existed have artist_mbid null; refresh those once so their artist name becomes a link.
  const stale = cached?.source === "musicbrainz" && (!cached.tracks.length || cached.artist_mbid === null);
  if (cached && !stale) return NextResponse.json(cached);
  try {
    const album = await lookupAlbum(id);
    if (!album) return NextResponse.json({ error: "Album not found" }, { status: 404 });
    const admin = adminSupabase();
    const row = { ...album, updated_at: new Date().toISOString() };
    let res = await admin.from("albums").upsert(row).select().single();
    // Until the artist-links migration has been run, the column doesn't exist; save without it.
    if (res.error && /artist_mbid/.test(res.error.message)) {
      const { artist_mbid: _skip, ...rest } = row;
      res = await admin.from("albums").upsert(rest).select().single();
      if (!res.error) return NextResponse.json({ ...res.data, artist_mbid: album.artist_mbid });
    }
    if (res.error) throw res.error;
    return NextResponse.json(res.data);
  } catch (e) {
    if (cached) return NextResponse.json(cached);
    const msg = (e as Error).message;
    return NextResponse.json({ error: /404/.test(msg) ? "Album not found" : "Couldn't load this album from MusicBrainz. Try again in a moment." }, { status: /404/.test(msg) ? 404 : 502 });
  }
}
