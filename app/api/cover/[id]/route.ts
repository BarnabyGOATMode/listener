import { NextResponse, type NextRequest } from "next/server";

/**
 * Album art, tried in order: the Cover Art Archive (MusicBrainz's own), then Deezer's and Apple's catalogs,
 * matched by artist and title. Redirects to the image; 404 means the page should draw generated art instead.
 * Each answer is cached at the edge for a week, so each album is only looked up once.
 */
const WEEK = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000";
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const close = (a: string, b: string) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x)); };

async function caa(id: string, size: number) {
  const r = await fetch(`https://coverartarchive.org/release-group/${id}/front-${size}`, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(4000) });
  return r.status >= 300 && r.status < 400 ? r.headers.get("location") : r.ok ? `https://coverartarchive.org/release-group/${id}/front-${size}` : null;
}

async function deezer(artist: string, title: string, size: number) {
  const q = `artist:"${artist.replace(/"/g, "")}" album:"${title.replace(/"/g, "")}"`;
  const r = await fetch(`https://api.deezer.com/search/album?limit=5&q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(4000) });
  if (!r.ok) return null;
  const { data } = (await r.json()) as { data?: { title: string; artist?: { name: string }; cover_big?: string; cover_xl?: string; cover_medium?: string }[] };
  const hit = data?.find((d) => close(d.title, title) && close(d.artist?.name ?? "", artist));
  return hit ? (size > 300 ? hit.cover_xl || hit.cover_big : hit.cover_big || hit.cover_medium) ?? null : null;
}

async function itunes(artist: string, title: string, size: number) {
  const r = await fetch(`https://itunes.apple.com/search?entity=album&limit=8&term=${encodeURIComponent(`${artist} ${title}`)}`, { signal: AbortSignal.timeout(4000) });
  if (!r.ok) return null;
  const { results } = (await r.json()) as { results?: { collectionName: string; artistName: string; artworkUrl100?: string }[] };
  const hit = results?.find((d) => close(d.collectionName, title) && close(d.artistName, artist));
  return hit?.artworkUrl100?.replace(/100x100bb/, `${size}x${size}bb`) ?? null;
}

export async function GET(request: NextRequest, ctx: RouteContext<"/api/cover/[id]">) {
  const { id } = await ctx.params;
  const p = request.nextUrl.searchParams;
  const artist = (p.get("a") ?? "").slice(0, 200), title = (p.get("t") ?? "").slice(0, 300);
  const size = p.get("s") === "500" ? 500 : 250;
  const sources = [
    () => (/^[0-9a-f-]{36}$/.test(id) ? caa(id, size) : null),
    () => (artist && title ? deezer(artist, title, size) : null),
    () => (artist && title ? itunes(artist, title, size) : null),
  ];
  for (const source of sources) {
    try {
      const url = await source();
      if (url) return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": WEEK } });
    } catch { /* try the next source */ }
  }
  return new NextResponse(null, { status: 404, headers: { "Cache-Control": WEEK } });
}
