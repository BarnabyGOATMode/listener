import { NextResponse, type NextRequest } from "next/server";
import { searchAlbums } from "@/lib/musicbrainz";
import { serverSupabase } from "@/lib/supabase/server";
import type { SearchHit } from "@/lib/types";

/** Album search: albums already on listener (including artists' own releases) first, then everything on MusicBrainz. */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 2) return NextResponse.json({ local: [], results: [] });
  const safe = q.replace(/[,()%*\\]/g, " ");
  const db = await serverSupabase();
  const [local, remote] = await Promise.allSettled([
    db.from("albums").select("*").or(`title.ilike.%${safe}%,artist.ilike.%${safe}%`).limit(12),
    searchAlbums(q),
  ]);
  const localHits: SearchHit[] = local.status === "fulfilled" && local.value.data
    ? local.value.data.map((a) => ({ id: a.id, title: a.title, artist: a.artist, artist_id: a.artist_mbid ?? null, year: a.year, cover_url: a.cover_url, type: a.source === "release" ? "Artist release" : a.source === "custom" ? "Added by a listener" : "Album", local: true }))
    : [];
  const seen = new Set(localHits.map((h) => h.id));
  const results = remote.status === "fulfilled" ? remote.value.filter((h) => !seen.has(h.id)) : [];
  return NextResponse.json(
    { local: localHits, results, error: remote.status === "rejected" ? "Music search is busy right now. Try again in a moment." : undefined },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
