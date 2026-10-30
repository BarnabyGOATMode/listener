"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Cover } from "@/components/bits";
import { plural } from "@/lib/format";
import { supabase } from "@/lib/supabase/client";
import type { Album } from "@/lib/types";

type AlbumRow = { album_id: string; ratings: number; logs: number; avg_rating: number; score: number };
type SongRow = { album_id: string; track_index: number; ratings: number; avg_rating: number; score: number };

const YEAR = new Date().getFullYear();
const PERIODS: [string, string, number | null][] = [["all", "All time", null], ["year", "This year", -1], ["month", "Last 30 days", 30], ["week", "Last 7 days", 7]];
const RELEASED: [string, string, number | null, number | null][] = [
  ["any", "Any year", null, null], [String(YEAR), String(YEAR), YEAR, YEAR], [String(YEAR - 1), String(YEAR - 1), YEAR - 1, YEAR - 1],
  ["2020s", "2020s", 2020, 2029], ["2010s", "2010s", 2010, 2019], ["2000s", "2000s", 2000, 2009], ["1990s", "1990s", 1990, 1999],
  ["1980s", "1980s", 1980, 1989], ["1970s", "1970s", 1970, 1979], ["older", "Before 1970", null, 1969],
];

const since = (key: string) => {
  const p = PERIODS.find((x) => x[0] === key)?.[2];
  if (p == null) return null;
  return p === -1 ? new Date(YEAR, 0, 1).toISOString() : new Date(Date.now() - p * 864e5).toISOString();
};

export default function ChartsPage() {
  return <Suspense><Charts /></Suspense>;
}

/** The community's top albums and songs, ranked by a weighted average so a single 5-star rating can't top the chart. */
function Charts() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get("tab") === "songs" ? "songs" : "albums";
  const period = params.get("period") ?? "all";
  const released = params.get("released") ?? "any";
  const genre = params.get("genre") ?? "";
  const [rows, setRows] = useState<{ album: Album; ratings: number; avg: number; track?: number }[] | null>(null);
  const [genres, setGenres] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params.toString());
    if (!v || v === "all" || v === "any" || (k === "tab" && v === "albums")) next.delete(k); else next.set(k, v);
    router.replace(`/charts${next.size ? `?${next}` : ""}`, { scroll: false });
  };

  useEffect(() => {
    supabase().from("albums").select("genre").neq("genre", "").order("updated_at", { ascending: false }).limit(800).then(({ data }) => {
      const n = new Map<string, number>();
      for (const r of data ?? []) for (const g of String(r.genre).split(/\s*[,/]\s*/)) if (g) n.set(g, (n.get(g) ?? 0) + 1);
      setGenres([...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([g]) => g));
    });
  }, []);

  useEffect(() => {
    let live = true;
    setRows(null); setFailed(false);
    (async () => {
      const db = supabase();
      const r = RELEASED.find((x) => x[0] === released) ?? RELEASED[0];
      const res = tab === "songs"
        ? await db.rpc("chart_songs", { since: since(period), min_ratings: 1, max_rows: 50 })
        : await db.rpc("chart_albums", { year_from: r[2], year_to: r[3], genre_like: genre || null, since: since(period), min_ratings: 1, max_rows: 100 });
      if (!live) return;
      if (res.error) { setFailed(true); setRows([]); return; }
      const list = (res.data ?? []) as (AlbumRow | SongRow)[];
      const ids = [...new Set(list.map((x) => x.album_id))];
      const { data } = ids.length ? await db.from("albums").select("*").in("id", ids) : { data: [] };
      if (!live) return;
      const byId = new Map(((data as Album[]) ?? []).map((a) => [a.id, a]));
      setRows(list.flatMap((x) => {
        const album = byId.get(x.album_id);
        const track = "track_index" in x ? x.track_index : undefined;
        if (!album || (track != null && !album.tracks[track])) return [];
        return [{ album, ratings: x.ratings, avg: Number(x.avg_rating), track }];
      }));
    })();
    return () => { live = false; };
  }, [tab, period, released, genre]);

  return (
    <>
      <div className="pagehead">
        <h1 className="display">Charts</h1>
        <p className="lede">The highest-rated records on listener, worked out from everyone&apos;s stars.</p>
      </div>
      <div className="tabs" role="tablist" style={{ marginTop: 18 }}>
        <button role="tab" aria-selected={tab === "albums"} onClick={() => set("tab", "albums")}>Albums</button>
        <button role="tab" aria-selected={tab === "songs"} onClick={() => set("tab", "songs")}>Songs</button>
      </div>
      <div className="cfilters">
        <label>Rated<select value={period} onChange={(e) => set("period", e.target.value)}>{PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        {tab === "albums" && <label>Released<select value={released} onChange={(e) => set("released", e.target.value)}>{RELEASED.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>}
        {tab === "albums" && genres.length > 0 && <label>Genre<select value={genre} onChange={(e) => set("genre", e.target.value)}><option value="">All genres</option>{genres.map((g) => <option key={g} value={g}>{g}</option>)}</select></label>}
      </div>
      {!rows ? <p className="more">Counting stars…</p>
        : failed ? <div className="empty"><strong>Charts aren&apos;t switched on yet.</strong>Run the newest database update (supabase/migrations/0005) in Supabase to turn them on.</div>
        : !rows.length ? <div className="empty"><strong>Nothing charts here yet.</strong>Try a wider filter, or go <Link href="/albums">rate some records</Link>.</div>
        : (
          <ol className="chart">
            {rows.map((r, i) => {
              const href = r.track != null ? `/album/${r.album.id}/song/${r.track + 1}` : `/album/${r.album.id}`;
              return (
                <li key={`${r.album.id}-${r.track ?? ""}`}>
                  <span className="cno">{i + 1}</span>
                  <Link href={href} className="ccov" tabIndex={-1} aria-hidden="true"><Cover album={r.album} size={250} /></Link>
                  <div className="cmeta">
                    <Link className="u" href={href}><b>{r.track != null ? r.album.tracks[r.track].title : r.album.title}</b></Link>
                    <small>
                      {r.album.artist_mbid ? <Link className="u" href={`/artist/${r.album.artist_mbid}`}>{r.album.artist}</Link> : r.album.artist}
                      {r.track != null ? <> · <Link className="u" href={`/album/${r.album.id}`}>{r.album.title}</Link></> : r.album.year ? ` · ${r.album.year}` : ""}
                    </small>
                  </div>
                  <div className="cscore"><b>★ {r.avg.toFixed(2)}</b><small>{plural(r.ratings, "rating")}</small></div>
                </li>
              );
            })}
          </ol>
        )}
      <p className="notice" style={{ marginTop: 28 }}>Charts use a weighted average: each record starts with three ratings at the site average, so a record rated by many people ranks above one with a single perfect score.</p>
    </>
  );
}
