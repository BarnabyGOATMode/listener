"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AlbumCard } from "@/components/AlbumCard";
import { useSession } from "@/components/Providers";
import { supabase } from "@/lib/supabase/client";
import Link from "next/link";
import { Cover } from "@/components/bits";
import { duration, plural } from "@/lib/format";
import type { Album, SearchHit, SongHit } from "@/lib/types";

export default function AlbumsPage() {
  return <Suspense><SearchPage /></Suspense>;
}

function SearchPage() {
  const param = useSearchParams().get("q") ?? "";
  const [q, setQ] = useState(param);
  // Searching again from the masthead while already here updates the box.
  useEffect(() => setQ(param), [param]);
  const [hits, setHits] = useState<{ local: SearchHit[]; results: SearchHit[]; songs?: SongHit[]; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<Album[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    supabase().from("albums").select("*").order("updated_at", { ascending: false }).limit(24).then(({ data }) => setRecent((data as Album[]) ?? []));
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits(null); return; }
    setBusy(true);
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal });
        setHits(await r.json());
      } catch (e) {
        if ((e as Error).name !== "AbortError") setHits({ local: [], results: [], songs: [], error: "Search isn't reachable right now. Check your connection." });
      } finally { setBusy(false); }
    }, 400);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  return (
    <>
      <div className="intro">
        <h1 className="display">Keep a diary of <em>every album</em> you hear.</h1>
        <p className="lede">Search any record ever released. Rate it, rate its songs, and write what it meant to you.</p>
      </div>
      <div className="actions" style={{ paddingBlock: "20px 4px" }}>
        <input className="input" style={{ flex: "1 1 260px" }} type="search" placeholder="Search albums, EPs or artists" aria-label="Search albums, EPs or artists" value={q} onChange={(e) => setQ(e.target.value)} autoFocus={!param} />
        <button className="btn ghost" onClick={() => setAdding(!adding)} aria-expanded={adding}>Can&apos;t find it?</button>
      </div>
      {adding && <AddAlbum />}
      {hits ? (
        <>
          {hits.local.length > 0 && <Section title="On listener" note={`${hits.local.length}`} items={hits.local} />}
          {!!hits.songs?.length && <Songs songs={hits.songs} />}
          <Section title="Albums" note={busy ? "searching…" : plural(hits.results.length, "result")} items={hits.results} />
          {hits.error && <p className="error">{hits.error}</p>}
          {!busy && !hits.local.length && !hits.results.length && !hits.songs?.length && !hits.error && (
            <div className="empty"><strong>Nothing matched “{q.trim()}”.</strong>Check the spelling, try the artist&apos;s name, or add it yourself with “Can&apos;t find it?”.</div>
          )}
        </>
      ) : (
        <>
          <div className="section-h"><h2>Recently opened on listener</h2><span>{busy ? "searching…" : `${recent.length} records`}</span></div>
          {recent.length ? <div className="grid">{recent.map((a) => <AlbumCard key={a.id} album={a} />)}</div>
            : <div className="empty"><strong>The crates are empty.</strong>Search for an album above. Every album anyone opens is saved here.</div>}
        </>
      )}
      <p className="hint" style={{ marginTop: 40 }}>Album data from <a href="https://musicbrainz.org" target="_blank" rel="noopener noreferrer">MusicBrainz</a>. Covers from the <a href="https://coverartarchive.org" target="_blank" rel="noopener noreferrer">Cover Art Archive</a>.</p>
    </>
  );
}

function Section({ title, note, items }: { title: string; note: string; items: SearchHit[] }) {
  return (
    <>
      <div className="section-h"><h2>{title}</h2><span>{note}</span></div>
      <div className="grid">{items.map((h) => <AlbumCard key={h.id} album={h} sub={h.type} />)}</div>
    </>
  );
}

function Songs({ songs }: { songs: SongHit[] }) {
  return (
    <>
      <div className="section-h"><h2>Songs</h2><span>{songs.length}</span></div>
      <div className="songlist">
        {songs.map((s) => (
          <div className="songrow" key={`${s.album_id}-${s.title}`}>
            <Link href={`/album/${s.album_id}/find?title=${encodeURIComponent(s.title)}`} tabIndex={-1} aria-hidden="true"><Cover album={{ id: s.album_id, title: s.album, artist: s.artist, cover_url: null }} size={250} /></Link>
            <div className="t">
              <Link className="song-title" href={`/album/${s.album_id}/find?title=${encodeURIComponent(s.title)}`}>{s.title}</Link>
              <small>{s.artist_id ? <Link className="card-artist" href={`/artist/${s.artist_id}`}>{s.artist}</Link> : s.artist} · from <Link className="card-artist" href={`/album/${s.album_id}`}>{s.album}</Link>{s.year ? ` (${s.year})` : ""}</small>
            </div>
            <span className="len">{duration(s.length_ms)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function AddAlbum() {
  const { user } = useSession();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [year, setYear] = useState("");
  const [tracks, setTracks] = useState("");
  const [error, setError] = useState("");
  if (!user) return <p className="notice">Sign in to add an album that isn&apos;t on listener yet.</p>;
  return (
    <form className="form logbox" style={{ maxWidth: 640, marginTop: 16 }} onSubmit={async (e) => {
      e.preventDefault();
      if (!title.trim() || !artist.trim()) return setError("Add the album title and the artist.");
      const id = `c-${crypto.randomUUID()}`;
      const { error } = await supabase().from("albums").insert({
        id, source: "custom", title: title.trim(), artist: artist.trim(), year: Number(year) || null, owner_id: user.id,
        tracks: tracks.split("\n").map((t) => t.trim()).filter(Boolean).slice(0, 80).map((t) => ({ title: t.slice(0, 200) })),
      });
      if (error) return setError("Couldn't add that album. Try again.");
      router.push(`/album/${id}`);
    }}>
      <p className="muted" style={{ margin: 0 }}>Add a record that isn&apos;t in the catalog yet, like a local band&apos;s tape or a new release. Everyone can find it once it&apos;s added.</p>
      <div className="two">
        <label className="field">Album title<input className="input" value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="field">Artist<input className="input" value={artist} maxLength={300} onChange={(e) => setArtist(e.target.value)} /></label>
      </div>
      <label className="field" style={{ maxWidth: 200 }}>Release year<input className="input" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} /></label>
      <label className="field">Tracklist <span className="hint">optional · one song per line</span><textarea className="textarea" rows={5} value={tracks} onChange={(e) => setTracks(e.target.value)} /></label>
      {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
      <div className="actions"><button className="btn">Add album</button></div>
    </form>
  );
}
