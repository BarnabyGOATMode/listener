import { sameArtist, sameTitle } from "./match";
import type { SearchHit, SongHit } from "./types";

type Popular = { title: string; artist: string };
export type TopResult = { kind: "album"; album: SearchHit } | { kind: "song"; song: SongHit } | null;

/** Lowercase words, accents dropped, punctuation as spaces. Brackets are kept, so "Weezer (Blue Album)" still has "blue". */
const words = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").split(/[^a-z0-9']+/).map((w) => w.replace(/'/g, "")).filter(Boolean);

/**
 * How well a title fits the search: take away the words that name the artist, then see how many of the rest appear
 * in the title. 1 = all of them; a search that only names the artist ("radiohead") counts as a fair fit (0.5).
 */
export function fit(q: string, title: string, artist: string) {
  const a = new Set(words(artist)), t = words(title);
  const rest = words(q).filter((w) => !a.has(w));
  if (!rest.length) return 0.5;
  return rest.filter((w) => t.includes(w) || (w.length >= 3 && t.some((x) => x.startsWith(w)))).length / rest.length;
}
/** The title is exactly the non-artist part of the search ("in rainbows" for "radiohead in rainbows"). */
const exact = (q: string, title: string, artist: string) => {
  const a = new Set(words(artist)), rest = words(q).filter((w) => !a.has(w)).join(" ");
  return !!rest && words(title).join(" ") === rest;
};
const popRank = (popular: Popular[], title: string, artist: string) => {
  const i = popular.findIndex((p) => sameTitle(p.title, title) && sameArtist(p.artist, artist));
  return i < 0 ? Infinity : i;
};
const GOOD = 0.6;
/** Popular releases that fit at least as an artist search lead; then good title fits; then everything else. */
const group = (f: number, p: number) => (p < Infinity && f >= 0.5 ? 0 : f >= GOOD ? 1 : 2);

/**
 * Orders search results around what the person typed. Releases Deezer ranks as popular lead when they fit the
 * words, then other titles that fit, then the rest; songs that don't fit at all are dropped. Picks one Top result,
 * and whether songs or albums should lead (songs only when the search names a song rather than an album).
 */
export function rankSearch(q: string, albums: SearchHit[], songs: SongHit[], hotAlbums: Popular[], hotTracks: Popular[]) {
  const A = albums.map((a, i) => ({ a, i, f: fit(q, a.title, a.artist), p: popRank(hotAlbums, a.title, a.artist) }))
    .sort((x, y) => group(x.f, x.p) - group(y.f, y.p) || x.p - y.p || y.f - x.f || x.i - y.i);
  const S = songs.map((s, i) => ({ s, i, f: fit(q, s.title, s.artist), p: popRank(hotTracks, s.title, s.artist) }))
    .filter((x) => x.f >= 0.5)
    .sort((x, y) => group(x.f, x.p) - group(y.f, y.p) || x.p - y.p || y.f - x.f || x.i - y.i);

  const a = A[0], s = S[0];
  const aGood = !!a && group(a.f, a.p) < 2, sGood = !!s && group(s.f, s.p) < 2;
  const aExact = aGood && exact(q, a.a.title, a.a.artist), sExact = sGood && exact(q, s.s.title, s.s.artist);
  // A song only wins when the search names it and doesn't name an album (a title track counts as the album).
  const songWins = sGood && sExact && !aExact && !(a && sameTitle(a.a.title, s.s.title));
  const top: TopResult = songWins ? { kind: "song", song: s.s } : aGood ? { kind: "album", album: a.a } : sGood ? { kind: "song", song: s.s } : null;
  return { top, albums: A.map((x) => x.a), songs: S.map((x) => x.s), songsFirst: top?.kind === "song" };
}
