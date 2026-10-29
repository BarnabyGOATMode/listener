import "server-only";
import type { SearchHit, Track } from "./types";

const API = "https://musicbrainz.org/ws/2";
const UA = `listener/0.1 ( ${process.env.MUSICBRAINZ_CONTACT || "https://github.com/listener-app"} )`;
export const coverUrl = (releaseGroupId: string, size: 250 | 500 = 500) => `https://coverartarchive.org/release-group/${releaseGroupId}/front-${size}`;

/** MusicBrainz allows about one request per second per app, so space requests out and retry once when throttled. */
let last = 0;
async function mb<T>(path: string): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = last + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const res = await fetch(`${API}/${path}${path.includes("?") ? "&" : "?"}fmt=json`, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
    if (res.status === 503 || res.status === 429) continue;
    if (!res.ok) throw new Error(`MusicBrainz ${res.status} for ${path}`);
    return res.json() as Promise<T>;
  }
  throw new Error("MusicBrainz is busy; try again in a moment");
}

type Credit = { name: string; joinphrase?: string }[];
const creditName = (c?: Credit) => (c ?? []).map((a) => a.name + (a.joinphrase ?? "")).join("").trim() || "Unknown artist";
const yearOf = (d?: string) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null);
const lucene = (s: string) => s.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, " ").trim();

type RG = { id: string; title: string; "primary-type"?: string; "secondary-types"?: string[]; "first-release-date"?: string; "artist-credit"?: Credit; score?: number };

export async function searchAlbums(q: string): Promise<SearchHit[]> {
  const t = lucene(q);
  if (!t) return [];
  const query = `(releasegroup:(${t})^3 OR artist:(${t})) AND NOT secondarytype:(compilation OR live OR remix OR dj-mix OR mixtape/street)`;
  const data = await mb<{ "release-groups": RG[] }>(`release-group?query=${encodeURIComponent(query)}&limit=25`);
  return (data["release-groups"] ?? []).map((g) => ({
    id: g.id,
    title: g.title,
    artist: creditName(g["artist-credit"]),
    year: yearOf(g["first-release-date"]),
    type: g["primary-type"] ?? "Album",
    cover_url: coverUrl(g.id, 250),
  }));
}

type Release = { id: string; status?: string; date?: string; country?: string; media?: { format?: string; tracks?: { title: string; length?: number | null; position?: number }[] }[] };

/** Full album details: picks the earliest official release of the release group as the canonical tracklist. */
export async function lookupAlbum(releaseGroupId: string) {
  if (!/^[0-9a-f-]{36}$/.test(releaseGroupId)) return null;
  const g = await mb<RG & { genres?: { name: string; count: number }[]; tags?: { name: string; count: number }[] }>(`release-group/${releaseGroupId}?inc=artist-credits+genres`);
  const rel = await mb<{ releases: Release[] }>(`release?release-group=${releaseGroupId}&inc=recordings+media&limit=100`);
  const releases = (rel.releases ?? []).filter((r) => r.media?.some((m) => m.tracks?.length));
  releases.sort((a, b) => {
    const official = (r: Release) => (r.status === "Official" ? 0 : 1);
    return official(a) - official(b) || (a.date || "9999").localeCompare(b.date || "9999");
  });
  const pick = releases[0];
  const tracks: Track[] = (pick?.media ?? []).flatMap((m) => (m.tracks ?? []).map((tr) => ({ title: tr.title, length_ms: tr.length ?? null })));
  const genre = [...(g.genres ?? [])].sort((a, b) => b.count - a.count)[0]?.name ?? "";
  return {
    id: g.id,
    source: "musicbrainz" as const,
    title: g.title,
    artist: creditName(g["artist-credit"]),
    year: yearOf(g["first-release-date"]),
    genre: genre ? genre.replace(/\b\w/g, (c) => c.toUpperCase()) : "",
    cover_url: coverUrl(g.id, 500),
    tracks,
    mb_release_id: pick?.id ?? null,
  };
}
