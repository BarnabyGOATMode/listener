"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlbumCard } from "@/components/AlbumCard";
import { ListenNow } from "@/components/bits";
import { supabase } from "@/lib/supabase/client";
import type { ArtistPage } from "@/lib/types";

const SHELVES: [ArtistPage["releases"][number]["shelf"], string][] = [["album", "Albums"], ["ep", "EPs"], ["single", "Singles"], ["other", "Live, compilations & more"]];

export function ArtistView({ id }: { id: string }) {
  const [artist, setArtist] = useState<ArtistPage | null>(null);
  const [error, setError] = useState("");
  const [ratings, setRatings] = useState<Map<string, { avg: number; n: number }>>(new Map());

  useEffect(() => {
    let live = true;
    fetch(`/api/artist/${encodeURIComponent(id)}`).then(async (r) => {
      const body = await r.json();
      if (!live) return;
      if (!r.ok) return setError(body.error || "Couldn't load this artist.");
      setArtist(body);
      // Community ratings for any of these releases people have already logged on listener.
      const ids = (body as ArtistPage).releases.map((x) => x.id);
      const { data } = await supabase().from("logs").select("album_id,rating").in("album_id", ids.slice(0, 300)).not("rating", "is", null);
      const m = new Map<string, { sum: number; n: number }>();
      for (const l of data ?? []) { const c = m.get(l.album_id) ?? { sum: 0, n: 0 }; c.sum += Number(l.rating); c.n++; m.set(l.album_id, c); }
      if (live) setRatings(new Map([...m].map(([k, v]) => [k, { avg: v.sum / v.n, n: v.n }])));
    }, () => live && setError("Couldn't reach listener. Check your connection."));
    return () => { live = false; };
  }, [id]);

  const shelves = useMemo(() => SHELVES.map(([key, label]) => [label, artist?.releases.filter((r) => r.shelf === key) ?? []] as const).filter(([, list]) => list.length), [artist]);

  if (error) return <div className="empty"><strong>{error}</strong><Link href="/albums">Search albums instead</Link></div>;
  if (!artist) return <p className="more">Loading artist…</p>;

  return (
    <>
      <div className="pagehead">
        <div className="kicker">Artist</div>
        <h1 className="display">{artist.name}</h1>
        <div className="artist-meta">
          {artist.kind && <span>{artist.kind}</span>}
          {artist.area && <span>{artist.area}</span>}
          {artist.active && <span>{artist.active}</span>}
          {artist.genres.length > 0 && <span>{artist.genres.join(", ")}</span>}
        </div>
        {artist.disambiguation && <p className="lede" style={{ fontSize: 17 }}>{artist.disambiguation}</p>}
        <div className="actions" style={{ marginTop: 10 }}><ListenNow query={artist.name} /></div>
      </div>
      {shelves.map(([label, list]) => (
        <section key={label}>
          <div className="section-h"><h2>{label}</h2><span>{list.length}</span></div>
          <div className="grid">
            {list.map((r) => {
              const rt = ratings.get(r.id);
              return <AlbumCard key={r.id} hideArtist album={{ id: r.id, title: r.title, artist: artist.name, cover_url: r.cover_url, year: r.year }}
                sub={rt ? `★ ${rt.avg.toFixed(1)} · ${rt.n} on listener` : label === "Live, compilations & more" ? r.type : undefined} />;
            })}
          </div>
        </section>
      ))}
      {!shelves.length && <div className="empty"><strong>No releases listed for {artist.name} yet.</strong></div>}
      <p className="hint" style={{ marginTop: 40 }}>Discography from <a href={`https://musicbrainz.org/artist/${artist.id}`} target="_blank" rel="noopener noreferrer">MusicBrainz</a>. Something missing? Anyone can add it there, or use “Can&apos;t find it?” in Albums.</p>
    </>
  );
}
