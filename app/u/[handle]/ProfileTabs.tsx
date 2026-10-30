"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlbumCard } from "@/components/AlbumCard";
import { Cover } from "@/components/bits";
import { ListCard } from "@/components/ListCard";
import { useSession } from "@/components/Providers";
import { RatingBars } from "@/components/RatingBars";
import { ago, plural, stars } from "@/lib/format";
import { type ListRow, loadLists } from "@/lib/lists";
import { supabase } from "@/lib/supabase/client";
import type { Album, Log, Profile, SongReview } from "@/lib/types";

type LogRow = Log & { album: Album };
type SongRow = SongReview & { album: Album };

/** Every album and song someone has logged, by the day they heard it, grouped into months. */
export function Diary({ logs, songs, own }: { logs: LogRow[]; songs: SongRow[]; own: boolean }) {
  const entries = useMemo(() => [
    ...logs.map((l) => ({ key: l.id, day: l.listened_on ?? l.posted_at.slice(0, 10), album: l.album, title: l.album.title, sub: l.album.artist, href: `/album/${l.album_id}`, rating: l.rating, liked: l.liked, review: !!l.review, song: false })),
    ...songs.map((s) => ({ key: s.id, day: s.listened_on ?? s.posted_at.slice(0, 10), album: s.album, title: s.album.tracks[s.track_index].title, sub: `${s.album.artist} · ${s.album.title}`, href: `/album/${s.album_id}/song/${s.track_index + 1}`, rating: s.rating, liked: s.liked, review: !!s.review, song: true })),
  ].sort((a, b) => b.day.localeCompare(a.day)), [logs, songs]);

  if (!entries.length) return <div className="empty"><strong>The diary is empty.</strong>{own ? <>Every album and song you log shows up here by the day you heard it. Start in <Link href="/albums">Search</Link>.</> : null}</div>;
  const months: [string, typeof entries][] = [];
  for (const e of entries) {
    const m = e.day.slice(0, 7);
    if (months.at(-1)?.[0] !== m) months.push([m, []]);
    months.at(-1)![1].push(e);
  }
  return (
    <div className="diary">
      {months.map(([m, list]) => (
        <section key={m}>
          <h3 className="dmonth">{new Date(`${m}-15T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })}<span>{list.length} {list.length === 1 ? "entry" : "entries"}</span></h3>
          <ol>
            {list.map((e) => (
              <li key={e.key}>
                <span className="dday">{Number(e.day.slice(8, 10))}</span>
                <Link href={e.href} className="dcov" tabIndex={-1} aria-hidden="true"><Cover album={e.album} size={250} /></Link>
                <span className="dt"><Link className="u" href={e.href}><b>{e.song ? `♪ ${e.title}` : e.title}</b></Link><small>{e.sub}{e.album.year && !e.song ? ` · ${e.album.year}` : ""}</small></span>
                <span className="dr"><span className="stars">{stars(e.rating)}</span>{e.liked && <span className="heart"> ♥</span>}{e.review && <span className="dmark" title="Has a review">¶</span>}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

export function ProfileLists({ profile, own }: { profile: Profile; own: boolean }) {
  const [lists, setLists] = useState<ListRow[] | null>(null);
  useEffect(() => { loadLists({ userId: profile.id, limit: 60 }).then(setLists, () => setLists([])); }, [profile.id]);
  if (!lists) return <p className="more">Loading lists…</p>;
  return (
    <>
      {own && <div className="actions" style={{ marginBottom: 18 }}><Link className="btn small" href="/lists">Start a list</Link></div>}
      {lists.length ? <div className="lgrid">{lists.map((l) => <ListCard key={l.id} list={l} hideOwner />)}</div>
        : <div className="empty"><strong>No lists yet.</strong>{own ? "Make one from the Lists page, or tap “Add to list” on any album." : `${profile.name} hasn't made a list yet.`}</div>}
    </>
  );
}

type Later = { album_id: string; created_at: string; album: Album };
export function ListenLaterTab({ profile, own }: { profile: Profile; own: boolean }) {
  const { toast } = useSession();
  const [rows, setRows] = useState<Later[] | null>(null);
  useEffect(() => {
    supabase().from("listen_later").select("album_id, created_at, album:albums(*)").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(300)
      .then(({ data, error }) => setRows(error ? [] : ((data as unknown as Later[]) ?? []).filter((r) => r.album)));
  }, [profile.id]);
  if (!rows) return <p className="more">Loading…</p>;
  if (!rows.length) return <div className="empty"><strong>Nothing queued.</strong>{own ? "Tap “Listen later” on any album to save it here. It comes off the list once you log it." : `${profile.name} hasn't saved anything to listen to later.`}</div>;
  return (
    <div className="grid">
      {rows.map((r) => (
        <AlbumCard key={r.album_id} album={r.album} note={own ? (
          <button className="linkish hint" onClick={async () => {
            const { error } = await supabase().from("listen_later").delete().eq("user_id", profile.id).eq("album_id", r.album_id);
            if (error) toast("Couldn't remove it."); else setRows(rows.filter((x) => x.album_id !== r.album_id));
          }}>Saved {ago(r.created_at)} · remove</button>
        ) : `Saved ${ago(r.created_at)}`} />
      ))}
    </div>
  );
}

/** Someone's listening in numbers: how they rate, who and what they play most, and which decades. */
export function Stats({ logs, songs, name }: { logs: LogRow[]; songs: SongRow[]; name: string }) {
  const s = useMemo(() => {
    const rated = logs.filter((l) => l.rating).map((l) => Number(l.rating));
    const songRated = songs.filter((x) => x.rating).map((x) => Number(x.rating));
    const count = <K,>(items: K[]) => { const m = new Map<K, number>(); items.forEach((k) => m.set(k, (m.get(k) ?? 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
    const artists = new Map<string, { n: number; sum: number; rated: number; mbid?: string | null; covers: Album[] }>();
    for (const l of logs) {
      const a = artists.get(l.album.artist) ?? { n: 0, sum: 0, rated: 0, mbid: l.album.artist_mbid, covers: [] };
      a.n++; if (l.rating) { a.sum += Number(l.rating); a.rated++; } if (a.covers.length < 3) a.covers.push(l.album);
      artists.set(l.album.artist, a);
    }
    const decades = count(logs.filter((l) => l.album.year).map((l) => Math.floor(l.album.year! / 10) * 10)).sort((a, b) => a[0] - b[0]);
    const genres = count(logs.flatMap((l) => (l.album.genre ? l.album.genre.split(/\s*[,/]\s*/) : [])).filter(Boolean)).slice(0, 8);
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return { key, label: d.toLocaleDateString(undefined, { month: "short" }), n: [...logs, ...songs].filter((x) => (x.listened_on ?? x.posted_at).startsWith(key)).length };
    });
    const avg = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : 0;
    return {
      rated, songRated, avg, reviews: logs.filter((l) => l.review).length + songs.filter((x) => x.review).length,
      loved: logs.filter((l) => l.liked).length + songs.filter((x) => x.liked).length,
      artists: [...artists.entries()].sort((a, b) => b[1].n - a[1].n || b[1].sum - a[1].sum).slice(0, 8),
      decades, genres, months, fives: rated.filter((r) => r === 5).length,
    };
  }, [logs, songs]);

  if (!logs.length && !songs.length) return <div className="empty"><strong>No numbers yet.</strong>Stats fill in as {name} logs albums and songs.</div>;
  const maxDecade = Math.max(1, ...s.decades.map((d) => d[1]));
  const maxMonth = Math.max(1, ...s.months.map((m) => m.n));
  const maxGenre = Math.max(1, ...s.genres.map((g) => g[1]));
  return (
    <div className="stats">
      <div className="stat-tiles">
        <div><b>{logs.length}</b><span>albums logged</span></div>
        <div><b>{songs.length}</b><span>songs reviewed</span></div>
        <div><b>{s.avg ? s.avg.toFixed(2) : "–"}</b><span>average album rating</span></div>
        <div><b>{s.reviews}</b><span>written reviews</span></div>
        <div><b>{s.loved}</b><span>hearts given</span></div>
        <div><b>{s.fives}</b><span>five-star albums</span></div>
      </div>
      <div className="stat-two">
        <section>
          <h3 className="label">Rating spread</h3>
          <RatingBars ratings={s.rated} label="album ratings" />
          {s.songRated.length > 0 && <RatingBars ratings={s.songRated} label="song ratings" />}
        </section>
        <section>
          <h3 className="label">Logged per month</h3>
          <div className="vbars" role="img" aria-label="Albums and songs logged in each of the last 12 months">
            {s.months.map((m) => <span key={m.key} title={`${m.label}: ${m.n}`}><i style={{ height: `${Math.max(m.n ? 6 : 1, (m.n / maxMonth) * 100)}%` }} /><small>{m.label.slice(0, 1)}</small></span>)}
          </div>
        </section>
      </div>
      {s.artists.length > 0 && (
        <section>
          <div className="section-h"><h2>Most logged artists</h2></div>
          <ol className="top-artists">
            {s.artists.map(([artist, a], i) => (
              <li key={artist}>
                <span className="cno">{i + 1}</span>
                <span className="ta-covers" aria-hidden="true">{a.covers.map((c) => <Cover key={c.id} album={c} size={250} />)}</span>
                <span className="ta-name">{a.mbid ? <Link className="u" href={`/artist/${a.mbid}`}><b>{artist}</b></Link> : <b>{artist}</b>}<small>{plural(a.n, "album")}{a.rated ? ` · average ★ ${(a.sum / a.rated).toFixed(1)}` : ""}</small></span>
              </li>
            ))}
          </ol>
        </section>
      )}
      <div className="stat-two">
        {s.decades.length > 0 && (
          <section>
            <div className="section-h"><h2>By decade</h2></div>
            <div className="hbars">{s.decades.map(([d, n]) => <div key={d}><span>{d}s</span><i style={{ width: `${(n / maxDecade) * 100}%` }} /><b>{n}</b></div>)}</div>
          </section>
        )}
        {s.genres.length > 0 && (
          <section>
            <div className="section-h"><h2>Top genres</h2></div>
            <div className="hbars">{s.genres.map(([g, n]) => <div key={g}><span>{g}</span><i style={{ width: `${(n / maxGenre) * 100}%` }} /><b>{n}</b></div>)}</div>
          </section>
        )}
      </div>
    </div>
  );
}
