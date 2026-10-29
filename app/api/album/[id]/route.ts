import { NextResponse, type NextRequest } from "next/server";
import { lookupAlbum } from "@/lib/musicbrainz";
import { adminSupabase, serverSupabase } from "@/lib/supabase/server";

/** Returns an album from listener's catalog, fetching and caching it from MusicBrainz the first time anyone opens it. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/album/[id]">) {
  const { id } = await ctx.params;
  const db = await serverSupabase();
  const { data: cached } = await db.from("albums").select("*").eq("id", id).maybeSingle();
  if (cached && (cached.source !== "musicbrainz" || cached.tracks.length)) return NextResponse.json(cached);
  try {
    const album = await lookupAlbum(id);
    if (!album) return NextResponse.json({ error: "Album not found" }, { status: 404 });
    const { data, error } = await adminSupabase().from("albums").upsert({ ...album, updated_at: new Date().toISOString() }).select().single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) {
    if (cached) return NextResponse.json(cached);
    const msg = (e as Error).message;
    return NextResponse.json({ error: /404/.test(msg) ? "Album not found" : "Couldn't load this album from MusicBrainz. Try again in a moment." }, { status: /404/.test(msg) ? 404 : 502 });
  }
}
