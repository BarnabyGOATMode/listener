import { NextResponse, type NextRequest } from "next/server";
import { popularAlbums, popularTracks } from "@/lib/deezer";
import { searchAlbums, searchSongs } from "@/lib/musicbrainz";
import { rankSearch } from "@/lib/rank";
import { serverSupabase } from "@/lib/supabase/server";
import type { SearchHit } from "@/lib/types";

/**
 * Search across listener's own catalogue (including artists' releases) and all of MusicBrainz, ranked around what
 * was typed: a single Top result, then albums and songs in whichever order fits the search.
 */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 2) return NextResponse.json({ top: null, albums: [], songs: [], songsFirst: false });
  const db = await serverSupabase();
  // Every word must appear in the title or the artist, same as the MusicBrainz search.
  const words = q.replace(/[,()%*\\.:"]/g, " ").split(/\s+/).filter(Boolean).slice(0, 6);
  let local = db.from("albums").select("*").limit(12);
  for (const w of words) local = local.or(`title.ilike.%${w}%,artist.ilike.%${w}%`);
  const [l, mbAlbums, mbSongs, hotAlbums, hotTracks] = await Promise.allSettled([local, searchAlbums(q), searchSongs(q), popularAlbums(q), popularTracks(q)]);
  const ok = <T,>(r: PromiseSettledResult<T[]>) => (r.status === "fulfilled" ? r.value : []);
  const localHits: SearchHit[] = l.status === "fulfilled" && l.value.data
    ? l.value.data.map((a) => ({ id: a.id, title: a.title, artist: a.artist, artist_id: a.artist_mbid || null, year: a.year, cover_url: a.cover_url, type: a.source === "release" ? "Artist release" : a.source === "custom" ? "Added by a listener" : "Album", local: true }))
    : [];
  const seen = new Set(localHits.map((h) => h.id));
  const albums = [...localHits, ...ok(mbAlbums).filter((h) => !seen.has(h.id))];
  const failed = mbAlbums.status === "rejected" && mbSongs.status === "rejected";
  return NextResponse.json(
    { ...rankSearch(q, albums, ok(mbSongs), ok(hotAlbums), ok(hotTracks)), error: failed ? "Music search is busy right now. Try again in a moment." : undefined },
    { headers: { "Cache-Control": failed ? "no-store" : "public, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
