"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArtistBadge, Avatar, Cover, ListenNow, Rater } from "@/components/bits";
import { useSession } from "@/components/Providers";
import { SendMusic } from "@/components/SendMusic";
import { getAlbum } from "@/lib/albums";
import { fmtDate, plural, stars, today } from "@/lib/format";
import { supabase } from "@/lib/supabase/client";
import type { Album, Profile, SongReview } from "@/lib/types";

type Row = SongReview & { profile: Pick<Profile, "id" | "handle" | "name" | "kind"> | null };

export function SongView({ id, index }: { id: string; index: number }) {
  const { user, profile, toast } = useSession();
  const [album, setAlbum] = useState<Album | null>(null);
  const [error, setError] = useState("");
  const [reviews, setReviews] = useState<Row[]>([]);
  const [trackRatings, setTrackRatings] = useState<{ user_id: string; v: number }[]>([]);
  const [rating, setRating] = useState(0);
  const [liked, setLiked] = useState(false);
  const [review, setReview] = useState("");
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    let live = true;
    getAlbum(id).then((a) => live && setAlbum(a), (e) => live && setError(e.message));
    const db = supabase();
    db.from("song_reviews").select("*, profile:profiles(*)").eq("album_id", id).eq("track_index", index).order("posted_at", { ascending: false })
      .then(({ data }) => live && setReviews((data as Row[]) ?? []));
    db.from("logs").select("user_id, track_ratings").eq("album_id", id).limit(500)
      .then(({ data }) => live && setTrackRatings((data ?? []).map((l) => ({ user_id: l.user_id as string, v: Number((l.track_ratings as Record<string, number>)?.[index]) || 0 })).filter((x) => x.v)));
    return () => { live = false; };
  }, [id, index]);

  const mine = useMemo(() => reviews.find((r) => r.user_id === user?.id) ?? null, [reviews, user]);
  useEffect(() => {
    if (mine) { setRating(Number(mine.rating) || 0); setLiked(mine.liked); setReview(mine.review); setDate(mine.listened_on ?? today()); }
    else setRating(trackRatings.find((t) => t.user_id === user?.id)?.v ?? 0);
  }, [mine, trackRatings, user]);

  // One rating per person: their song review if they wrote one, otherwise their rating in the album's tracklist.
  const community = useMemo(() => {
    const by = new Map<string, number>();
    trackRatings.forEach((t) => by.set(t.user_id, t.v));
    reviews.forEach((r) => r.rating && by.set(r.user_id, Number(r.rating)));
    const vs = [...by.values()];
    return { n: vs.length, avg: vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0 };
  }, [reviews, trackRatings]);

  if (error) return <div className="empty"><strong>{error}</strong><Link href="/albums">Search for another album</Link></div>;
  if (!album) return <p className="more">Loading song…</p>;
  const track = album.tracks[index];
  if (!track) return <div className="empty"><strong>This album doesn&apos;t have a track {index + 1}.</strong><Link href={`/album/${id}`}>Back to {album.title}</Link></div>;
  const prev = album.tracks[index - 1], next = album.tracks[index + 1];
  const others = reviews.filter((r) => r.user_id !== user?.id && (r.review || r.rating));

  const save = async () => {
    if (!user) return;
    setBusy(true);
    const row = { user_id: user.id, album_id: id, track_index: index, rating: rating || null, liked, review: review.trim(), listened_on: date || null, updated_at: new Date().toISOString() };
    const { data, error } = await supabase().from("song_reviews").upsert(row, { onConflict: "user_id,album_id,track_index" }).select("*, profile:profiles(*)").single();
    setBusy(false);
    if (error) return toast("Couldn't save. Check your connection and try again.");
    setReviews((rs) => [data as Row, ...rs.filter((r) => r.user_id !== user.id)]);
    toast(mine ? "Updated your song review" : "Posted to the feed");
  };
  const remove = async () => {
    if (!mine) return;
    await supabase().from("song_reviews").delete().eq("id", mine.id);
    setReviews((rs) => rs.filter((r) => r.id !== mine.id)); setReview(""); setLiked(false); setConfirm(false); toast("Removed");
  };

  return (
    <>
      <div className="sheet">
        <div className="cover-col">
          <Link href={`/album/${id}`} aria-label={`Open ${album.title}`}><Cover album={album} /></Link>
          <div className="specs">
            <div><span>Track</span><span>{index + 1} of {album.tracks.length}</span></div>
            {album.year && <div><span>Released</span><span>{album.year}</span></div>}
            <div><span>Community</span><span>{community.n ? `★ ${community.avg.toFixed(1)} · ${plural(community.n, "rating")}` : "no ratings yet"}</span></div>
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="kicker">Song</div>
          <h1 className="display">{track.title}</h1>
          <div className="by">Track {index + 1} on <Link className="u" href={`/album/${id}`}>{album.title}</Link> · {album.artist}</div>
          <div className="actions" style={{ marginBottom: 16 }}>
            <ListenNow query={`${track.title} ${album.artist}`} />
            <SendMusic label={track.title} attachment={{ type: "song", albumId: id, index }} />
            <Link className="btn ghost" href={`/album/${id}`}>View album</Link>
          </div>
          {user && profile ? (
            <div className="logbox">
              <div className="logline">
                <Rater value={rating} label={`Your rating for ${track.title}`} onChange={setRating} />
                <span className="rate-v">{rating ? rating.toFixed(1) : "rate it"}</span>
                <button className="pill like" aria-pressed={liked} onClick={() => setLiked(!liked)}>♥ {liked ? "Liked" : "Like"}</button>
              </div>
              <label className="field">Listened on<input className="input" type="date" max={today()} value={date ?? ""} onChange={(e) => setDate(e.target.value)} /></label>
              <label className="field">Review<textarea className="textarea" maxLength={4000} placeholder="What does this song do that the others don't?" value={review} onChange={(e) => setReview(e.target.value)} /></label>
              <div className="actions">
                <button className="btn" disabled={busy} onClick={save}>{busy ? "Saving…" : mine ? "Update song review" : "Post song review"}</button>
                {mine && <button className="btn ghost" onClick={() => (confirm ? remove() : setConfirm(true))}>{confirm ? "Tap again to remove" : "Remove"}</button>}
              </div>
            </div>
          ) : <p className="notice"><Link href="/login">Sign in</Link> to rate and review this song.</p>}
          <div className="tracknav">
            {prev ? <Link href={`/album/${id}/song/${index}`}>← {prev.title}</Link> : <span />}
            {next && <Link href={`/album/${id}/song/${index + 2}`}>{next.title} →</Link>}
          </div>
        </div>
      </div>
      <div className="section-h"><h2>Reviews of this song</h2><span>{others.length}</span></div>
      {others.length ? others.map((r) => (
        <article key={r.id} className="post" style={{ paddingBlock: 20 }}>
          <div className="who"><Avatar profile={r.profile} /><div className="n">{r.profile && <Link className="u" href={`/u/${r.profile.handle}`}>{r.profile.name}</Link>}<ArtistBadge profile={r.profile} /><small>{r.listened_on ? `listened ${fmtDate(r.listened_on)}` : ""}</small></div></div>
          <div className="meta"><span className="stars" style={{ fontSize: 18 }}>{stars(r.rating)}</span>{r.liked && <span className="heart">♥</span>}</div>
          {r.review && <p className="review" style={{ marginTop: 8 }}>{r.review}</p>}
        </article>
      )) : <p className="muted">No one else has reviewed this song yet.</p>}
    </>
  );
}
