import { NextResponse, type NextRequest } from "next/server";
import { byPopularity, popularAlbums, popularTracks } from "@/lib/deezer";
import { searchAlbums, searchSongs } from "@/lib/musicbrainz";
import { serverSupabase } from "@/lib/supabase/server";
import type { SearchHit } from "@/lib/types";

/** Search: albums already on listener (including artists' own releases), then songs and albums from all of MusicBrainz. */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 2) return NextResponse.json({ local: [], results: [], songs: [] });
  const db = await serverSupabase();
  // Every word must appear in the title or the artist, same as the MusicBrainz search.
  const words = q.replace(/[,()%*\\.:"]/g, " ").split(/\s+/).filter(Boolean).slice(0, 6);
  let local = db.from("albums").select("*").limit(12);
  for (const w of words) local = local.or(`title.ilike.%${w}%,artist.ilike.%${w}%`);
  const [l, albums, songs, hotAlbums, hotTracks] = await Promise.allSettled([local, searchAlbums(q), searchSongs(q), popularAlbums(q), popularTracks(q)]);
  const hot = <T,>(r: PromiseSettledResult<T[]>) => (r.status === "fulfilled" ? r.value : []);
  const localHits: SearchHit[] = l.status === "fulfilled" && l.value.data
    ? l.value.data.map((a) => ({ id: a.id, title: a.title, artist: a.artist, artist_id: a.artist_mbid || null, year: a.year, cover_url: a.cover_url, type: a.source === "release" ? "Artist release" : a.source === "custom" ? "Added by a listener" : "Album", local: true }))
    : [];
  const seen = new Set(localHits.map((h) => h.id));
  const failed = albums.status === "rejected" && songs.status === "rejected";
  return NextResponse.json(
    {
      local: localHits,
      results: byPopularity(hot(albums).filter((h) => !seen.has(h.id)), hot(hotAlbums), (h) => h.title, (h) => h.artist),
      songs: byPopularity(hot(songs), hot(hotTracks), (s) => s.title, (s) => s.artist),
      error: failed ? "Music search is busy right now. Try again in a moment." : undefined,
    },
    { headers: { "Cache-Control": failed ? "no-store" : "public, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
