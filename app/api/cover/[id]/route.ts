import { NextResponse, type NextRequest } from "next/server";

/**
 * Album art. The Cover Art Archive (MusicBrainz's own) and Deezer are asked at the same time and the first real
 * cover wins; Apple's catalog is the last resort. Redirects to the image; 404 means the page should draw
 * generated art instead.
 *
 * Only a definite "no cover anywhere" is cached (for a day). If any source timed out or was rate-limited, the
 * 404 isn't cached, so the next visit tries again rather than remembering a temporary failure.
 */
const FOUND = "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=2592000";
const NONE = "public, max-age=3600, s-maxage=86400";
const RETRY = "no-store";

/** "the real thing" ≈ "Real Thing (Deluxe Edition)": lowercased, accents and brackets dropped, punctuation flattened. */
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\(.*?\)|\[.*?\]/g, "")
  .replace(/&/g, " and ").replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();
const same = (a: string, b: string) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x)); };
/** Artist credits differ between catalogues ("Jay-Z & Kanye West" vs "JAY-Z"), so match on the lead name. */
const sameArtist = (a: string, b: string) => same(a, b) || same(a.split(/,|&| and | feat\.? | x /i)[0], b.split(/,|&| and | feat\.? | x /i)[0]);

class Temporary extends Error {}
const get = async (url: string, init?: RequestInit) => {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(7000) });
    if (r.status === 429 || r.status >= 500) throw new Temporary(`${r.status}`);
    return r;
  } catch (e) {
    throw e instanceof Temporary ? e : new Temporary((e as Error).message);
  }
};

async function caa(id: string, size: number): Promise<string | null> {
  const r = await get(`https://coverartarchive.org/release-group/${id}/front-${size}`, { method: "HEAD", redirect: "manual" });
  if (r.status >= 300 && r.status < 400) return r.headers.get("location");
  return r.ok ? `https://coverartarchive.org/release-group/${id}/front-${size}` : null;
}

type DzAlbum = { title: string; artist?: { name: string }; cover_medium?: string; cover_big?: string; cover_xl?: string; error?: unknown };
async function deezer(artist: string, title: string, size: number): Promise<string | null> {
  const pick = (list?: DzAlbum[]) => list?.find((d) => same(d.title, title) && sameArtist(d.artist?.name ?? "", artist));
  const url = (q: string) => `https://api.deezer.com/search/album?limit=10&q=${encodeURIComponent(q)}`;
  const run = async (q: string) => {
    const body = (await (await get(url(q))).json()) as { data?: DzAlbum[]; error?: { code?: number } };
    if (body.error) throw new Temporary("deezer quota"); // Deezer reports rate limits in the body
    return pick(body.data);
  };
  const hit = (await run(`artist:"${artist.replace(/"/g, "")}" album:"${title.replace(/"/g, "")}"`)) ?? (await run(`${artist} ${title}`));
  return hit ? (size > 300 ? hit.cover_xl || hit.cover_big : hit.cover_big || hit.cover_medium) ?? null : null;
}

async function itunes(artist: string, title: string, size: number): Promise<string | null> {
  const r = await get(`https://itunes.apple.com/search?entity=album&limit=10&term=${encodeURIComponent(`${artist} ${title}`)}`);
  if (r.status === 403) throw new Temporary("itunes rate limit");
  const { results } = (await r.json()) as { results?: { collectionName: string; artistName: string; artworkUrl100?: string }[] };
  const hit = results?.find((d) => same(d.collectionName, title) && sameArtist(d.artistName, artist));
  return hit?.artworkUrl100?.replace(/100x100bb/, `${size}x${size}bb`) ?? null;
}

/** Resolves with the first source that finds a cover; resolves null once every source has answered without one. */
function firstCover(sources: Promise<string | null>[], onTemporary: () => void): Promise<string | null> {
  return new Promise((resolve) => {
    let left = sources.length;
    if (!left) resolve(null);
    for (const s of sources) {
      s.then((url) => { if (url) resolve(url); }, (e) => { if (e instanceof Temporary) onTemporary(); })
        .finally(() => { if (--left === 0) resolve(null); });
    }
  });
}

export async function GET(request: NextRequest, ctx: RouteContext<"/api/cover/[id]">) {
  const { id } = await ctx.params;
  const p = request.nextUrl.searchParams;
  const artist = (p.get("a") ?? "").slice(0, 200), title = (p.get("t") ?? "").slice(0, 300);
  const size = p.get("s") === "500" ? 500 : 250;
  let temporary = false;
  const flag = () => { temporary = true; };

  const fast: Promise<string | null>[] = [];
  if (/^[0-9a-f-]{36}$/.test(id)) fast.push(caa(id, size));
  if (artist && title) fast.push(deezer(artist, title, size));
  let url = await firstCover(fast, flag);
  if (!url && artist && title) url = await firstCover([itunes(artist, title, size)], flag);

  if (url) return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": FOUND } });
  return new NextResponse(null, { status: 404, headers: { "Cache-Control": temporary ? RETRY : NONE } });
}
