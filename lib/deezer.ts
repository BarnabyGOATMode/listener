import "server-only";
import { sameArtist, sameTitle } from "./match";

type Hit = { title: string; artist: string };

/** Deezer's search is ranked by how much people listen, which MusicBrainz doesn't know. Returns [] if Deezer is unavailable. */
async function search(kind: "album" | "track", q: string): Promise<Hit[]> {
  try {
    const r = await fetch(`https://api.deezer.com/search/${kind}?limit=40&q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(3500) });
    if (!r.ok) return [];
    const body = (await r.json()) as { data?: { title: string; artist?: { name: string } }[]; error?: unknown };
    return body.error ? [] : (body.data ?? []).map((d) => ({ title: d.title, artist: d.artist?.name ?? "" }));
  } catch { return []; }
}
export const popularAlbums = (q: string) => search("album", q);
export const popularTracks = (q: string) => search("track", q);

/**
 * Reorders MusicBrainz results so the ones Deezer ranks as popular come first, in Deezer's order.
 * Everything else keeps MusicBrainz's order after them, so obscure releases are still findable.
 */
export function byPopularity<T>(list: T[], popular: Hit[], title: (x: T) => string, artist: (x: T) => string): T[] {
  if (!popular.length) return list;
  const rank = (x: T) => { const i = popular.findIndex((p) => sameTitle(p.title, title(x)) && sameArtist(p.artist, artist(x))); return i < 0 ? Infinity : i; };
  return list.map((x, i) => ({ x, i, r: rank(x) })).sort((a, b) => a.r - b.r || a.i - b.i).map((e) => e.x);
}
