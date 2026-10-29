"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AlbumCard } from "@/components/AlbumCard";
import { useSession } from "@/components/Providers";
import { supabase } from "@/lib/supabase/client";
import Link from "next/link";
import { Cover } from "@/components/bits";
import { duration, plural } from "@/lib/format";
import type { TopResult } from "@/lib/rank";
import type { Album, SearchHit, SongHit } from "@/lib/types";

type Results = { top: TopResult; albums: SearchHit[]; songs: SongHit[]; songsFirst: boolean; error?: string };

export default function AlbumsPage() {
  return <Suspense><SearchPage /></Suspense>;
}

function SearchPage() {
  const param = useSearchParams().get("q") ?? "";
  const [q, setQ] = useState(param);
  // Searching again from the masthead while already here updates the box.
  useEffect(() => setQ(param), [param]);
  const [hits, setHits] = useState<Results | null>(null);
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
        if ((e as Error).name !== "AbortError") setHits({ top: null, albums: [], songs: [], songsFirst: false, error: "Search isn't reachable right now. Check your connection." });
      } finally { setBusy(false); }
    }, 400);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  return (
    <>
      <div className="pagehead"><h1 className="display">Search</h1></div>
      <div className="actions" style={{ paddingBlock: "16px 4px" }}>
        <input className="input" style={{ flex: "1 1 260px" }} type="search" placeholder="Albums, songs or artists" aria-label="Search albums, songs or artists" value={q} onChange={(e) => setQ(e.target.value)} autoFocus={!param} />
        <button className="btn ghost" onClick={() => setAdding(!adding)} aria-expanded={adding}>Can&apos;t find it?</button>
      </div>
      {adding && <AddAlbum />}
      {hits ? (
        <>
          {hits.top && <Top top={hits.top} />}
          {hits.songsFirst && !!hits.songs.length && <Songs songs={hits.songs} skip={hits.top} />}
          {(() => {
            const rest = hits.albums.filter((a) => !(hits.top?.kind === "album" && hits.top.album.id === a.id));
            return rest.length ? <Section title={hits.top?.kind === "album" ? "More albums" : "Albums"} note={busy ? "searching…" : plural(rest.length, "result")} items={rest} /> : null;
          })()}
          {!hits.songsFirst && !!hits.songs.length && <Songs songs={hits.songs} skip={hits.top} />}
          {hits.error && <p className="error">{hits.error}</p>}
          {!busy && !hits.albums.length && !hits.songs.length && !hits.error && (
            <div className="empty"><strong>Nothing matched “{q.trim()}”.</strong>Check the spelling, try the artist&apos;s name, or add it yourself with “Can&apos;t find it?”.</div>
          )}
        </>
      ) : (
        <>
          <div className="section-h"><h2>Recently opened</h2><span>{busy ? "searching…" : `${recent.length} records`}</span></div>
          {recent.length ? <div className="grid">{recent.map((a) => <AlbumCard key={a.id} album={a} />)}</div>
            : <div className="empty"><strong>No albums yet.</strong>Albums appear here once someone opens them.</div>}
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

/** The single best match for the search, shown large. */
function Top({ top }: { top: NonNullable<TopResult> }) {
  const isSong = top.kind === "song";
  const href = isSong ? `/album/${top.song.album_id}/find?title=${encodeURIComponent(top.song.title)}` : `/album/${top.album.id}`;
  const cover = isSong ? { id: top.song.album_id, title: top.song.album, artist: top.song.artist, cover_url: null } : top.album;
  const title = isSong ? top.song.title : top.album.title;
  const artist = isSong ? top.song.artist : top.album.artist;
  const artistId = isSong ? top.song.artist_id : top.album.artist_id;
  return (
    <>
      <div className="section-h"><h2>Top result</h2></div>
      <div className="top-result">
        <Link href={href} tabIndex={-1} aria-hidden="true"><Cover album={cover} size={500} /></Link>
        <div className="t">
          <span className="kicker">{isSong ? "Song" : top.album.type === "Single" || top.album.type === "EP" ? top.album.type : "Album"}</span>
          <Link className="top-title" href={href}>{title}</Link>
          <div className="by">{artistId ? <Link className="u" href={`/artist/${artistId}`}>{artist}</Link> : artist}
            {isSong ? <> · from <Link className="u" href={`/album/${top.song.album_id}`}>{top.song.album}</Link></> : top.album.year ? ` · ${top.album.year}` : ""}</div>
          <div className="actions"><Link className="btn" href={href}>{isSong ? "Rate this song" : "Rate this album"}</Link></div>
        </div>
      </div>
    </>
  );
}

function Songs({ songs: all, skip }: { songs: SongHit[]; skip: TopResult }) {
  const songs = all.filter((s) => !(skip?.kind === "song" && skip.song.album_id === s.album_id && skip.song.title === s.title)).slice(0, 8);
  if (!songs.length) return null;
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
