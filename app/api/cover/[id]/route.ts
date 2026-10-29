import { NextResponse, type NextRequest } from "next/server";
import { sameArtist, sameTitle as same } from "@/lib/match";

/**
 * Album art. The Cover Art Archive (MusicBrainz's own) and Deezer are asked at the same time and the first real
 * cover wins; Apple's catalog is the last resort. The image itself is fetched here and served from listener's own
 * address, so browsers never talk to archive.org, Deezer or Apple directly. That keeps covers working behind ad
 * blockers and filtered networks, and avoids the plain-http links the Cover Art Archive sometimes hands out.
 * 404 means the page should draw generated art instead.
 *
 * Only a definite "no cover anywhere" is cached (for a day). If any source timed out or was rate-limited, the
 * 404 isn't cached, so the next visit tries again rather than remembering a temporary failure.
 */
const FOUND = "public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=2592000, immutable";
const NONE = "public, max-age=3600, s-maxage=86400";
const RETRY = "no-store";

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
  // cover_big is 500px and cover_medium 250px: the sizes the page asks for.
  return hit ? (size > 300 ? hit.cover_big || hit.cover_xl : hit.cover_medium || hit.cover_big) ?? null : null;
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

  if (url) {
    try {
      const img = await fetch(url.replace(/^http:\/\//, "https://"), { signal: AbortSignal.timeout(8000) });
      const type = img.headers.get("content-type") ?? "";
      if (img.ok && type.startsWith("image/")) {
        return new NextResponse(img.body, { headers: { "Content-Type": type, "Cache-Control": FOUND, "X-Cover-Source": new URL(url).hostname } });
      }
    } catch { /* fall through: treat as temporary so it's retried */ }
    temporary = true;
  }
  return new NextResponse(null, { status: 404, headers: { "Cache-Control": temporary ? RETRY : NONE } });
}
