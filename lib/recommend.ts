import type { Album } from "./types";

export type Signal = { user_id: string; album_id: string; rating: number | null; liked: boolean };
export type Pick = { album: Album; why: string };

/**
 * Recommendation engine — a deliberately simple stand-in.
 *
 * Contract: given the viewer's own logs, everyone's recent logs, and a pool of candidate albums,
 * return up to `limit` albums the viewer hasn't logged, each with a short human-readable reason.
 * Replace the body with the real algorithm; the Discover page doesn't need to change.
 *
 * Current approach: score = 2 × how highly you rate that genre + community average + popularity.
 */
export function recommend({ mine, everyone, pool, limit = 12 }: { mine: Signal[]; everyone: Signal[]; pool: Album[]; limit?: number }): Pick[] {
  const byId = new Map(pool.map((a) => [a.id, a]));
  const logged = new Set(mine.map((m) => m.album_id));
  const genreScores = new Map<string, number[]>();
  for (const m of mine) {
    const g = byId.get(m.album_id)?.genre;
    if (g && m.rating) genreScores.set(g, [...(genreScores.get(g) ?? []), Number(m.rating)]);
  }
  const affinity = (g: string) => { const r = genreScores.get(g); return r ? r.reduce((a, b) => a + b, 0) / r.length : 0; };
  const stats = new Map<string, { n: number; sum: number; rated: number }>();
  for (const e of everyone) {
    const s = stats.get(e.album_id) ?? { n: 0, sum: 0, rated: 0 };
    s.n++; if (e.rating) { s.sum += Number(e.rating); s.rated++; }
    stats.set(e.album_id, s);
  }
  return pool
    .filter((a) => !logged.has(a.id))
    .map((a) => {
      const s = stats.get(a.id), avg = s?.rated ? s.sum / s.rated : 0, aff = a.genre ? affinity(a.genre) : 0;
      const score = aff * 2 + avg + (s?.n ?? 0) * 0.3;
      const why = aff >= 3.5 ? `Because you rate ${a.genre} highly` : s?.n ? "Popular on listener" : a.genre ? `Something new · ${a.genre}` : "Something new";
      return { album: a, why, score };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map(({ album, why }) => ({ album, why }));
}
