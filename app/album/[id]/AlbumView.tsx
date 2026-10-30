"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AddToList } from "@/components/AddToList";
import { ArtistBadge, Avatar, Cover, ListenNow, Rater } from "@/components/bits";
import { ListCard } from "@/components/ListCard";
import { ListenLater } from "@/components/ListenLater";
import { useSession } from "@/components/Providers";
import { RatingBars } from "@/components/RatingBars";
import { SendMusic } from "@/components/SendMusic";
import { forgetAlbum, getAlbum } from "@/lib/albums";
import { duration, fmtDate, halfStar, plural, stars, today } from "@/lib/format";
import { type ListRow, loadLists } from "@/lib/lists";
import { supabase } from "@/lib/supabase/client";
import type { Album, Log, Profile } from "@/lib/types";

type LogRow = Log & { profile: Pick<Profile, "id" | "handle" | "name" | "kind" | "avatar_url"> | null };
type SongRating = { user_id: string; track_index: number; rating: number | null };
type Draft = Pick<Log, "rating" | "liked" | "review" | "listened_on" | "track_ratings" | "use_average">;
const blank = (): Draft => ({ rating: null, liked: false, review: "", listened_on: today(), track_ratings: {}, use_average: false });

export function AlbumView({ id }: { id: string }) {
  const { user, profile, toast, following } = useSession();
  const router = useRouter();
  const [songRatings, setSongRatings] = useState<SongRating[]>([]);
  const [likeCounts, setLikeCounts] = useState<Map<string, number>>(new Map());
  const [lists, setLists] = useState<ListRow[]>([]);
  const [sort, setSort] = useState<"popular" | "recent" | "friends">("popular");
  const [album, setAlbum] = useState<Album | null>(null);
  const [error, setError] = useState("");
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [draft, setDraft] = useState<Draft>(blank());
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    let live = true;
    getAlbum(id).then((a) => live && setAlbum(a), (e) => live && setError(e.message));
    supabase().from("logs").select("*, profile:profiles(*)").eq("album_id", id).order("posted_at", { ascending: false }).limit(300)
      .then(async ({ data }) => {
        if (!live) return;
        const rows = (data as LogRow[]) ?? [];
        setLogs(rows);
        const reviewed = rows.filter((l) => l.review).map((l) => l.id);
        if (!reviewed.length) return;
        const { data: likes } = await supabase().from("likes").select("target_id").eq("target_type", "log").in("target_id", reviewed.slice(0, 200));
        const n = new Map<string, number>();
        for (const l of likes ?? []) n.set(l.target_id as string, (n.get(l.target_id as string) ?? 0) + 1);
        if (live) setLikeCounts(n);
      });
    supabase().from("song_reviews").select("user_id,track_index,rating").eq("album_id", id).not("rating", "is", null).limit(1000)
      .then(({ data }) => live && setSongRatings((data as SongRating[]) ?? []));
    loadLists({ albumId: id, limit: 8 }).then((ls) => live && setLists(ls), () => {});
    return () => { live = false; };
  }, [id]);

  const mine = useMemo(() => logs.find((l) => l.user_id === user?.id) ?? null, [logs, user]);
  useEffect(() => {
    if (mine) setDraft({ rating: mine.rating, liked: mine.liked, review: mine.review, listened_on: mine.listened_on ?? today(), track_ratings: mine.track_ratings ?? {}, use_average: mine.use_average });
  }, [mine]);

  const rated = logs.filter((l) => l.rating);
  const community = rated.length ? rated.reduce((s, l) => s + Number(l.rating), 0) / rated.length : 0;
  const tracks = album?.tracks ?? [];
  const trackVals = Object.values(draft.track_ratings).filter(Boolean);
  const trackAvg = trackVals.length ? trackVals.reduce((a, b) => a + b, 0) / trackVals.length : 0;
  const others = useMemo(() => {
    const list = logs.filter((l) => l.user_id !== user?.id && (l.review || l.rating));
    if (sort === "friends") return list.filter((l) => following.has(l.user_id));
    if (sort === "recent") return list;
    // Popular: reviews with words first, then by likes, then newest.
    return [...list].sort((a, b) => (b.review ? 1 : 0) - (a.review ? 1 : 0) || (likeCounts.get(b.id) ?? 0) - (likeCounts.get(a.id) ?? 0) || b.posted_at.localeCompare(a.posted_at));
  }, [logs, user, sort, following, likeCounts]);
  const friends = logs.filter((l) => following.has(l.user_id) && l.profile);

  // Everyone's rating for each song: their song review if they wrote one, otherwise the stars in their album review.
  const songAvgs = useMemo(() => {
    const by = new Map<string, number>();
    for (const l of logs) for (const [i, v] of Object.entries(l.track_ratings ?? {})) if (v) by.set(`${l.user_id}:${i}`, Number(v));
    for (const s of songRatings) if (s.rating) by.set(`${s.user_id}:${s.track_index}`, Number(s.rating));
    const sum = new Map<number, { t: number; n: number }>();
    for (const [k, v] of by) { const i = Number(k.split(":")[1]); const c = sum.get(i) ?? { t: 0, n: 0 }; c.t += v; c.n++; sum.set(i, c); }
    return new Map([...sum].map(([i, c]) => [i, { avg: c.t / c.n, n: c.n }]));
  }, [logs, songRatings]);
  const bestSong = [...songAvgs].filter(([i, c]) => tracks[i] && c.n >= 1).sort((a, b) => b[1].avg - a[1].avg || b[1].n - a[1].n)[0];

  const setTrack = (i: number, v: number) => setDraft((d) => {
    const track_ratings = { ...d.track_ratings };
    if (v) track_ratings[i] = v; else delete track_ratings[i];
    const vals = Object.values(track_ratings);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return { ...d, track_ratings, rating: d.use_average ? (avg ? halfStar(avg) : null) : d.rating };
  });

  const save = async () => {
    if (!user) return;
    setBusy(true);
    const row = { user_id: user.id, album_id: id, ...draft, review: draft.review.trim(), updated_at: new Date().toISOString() };
    const { data, error } = await supabase().from("logs").upsert(row, { onConflict: "user_id,album_id" }).select("*, profile:profiles(*)").single();
    setBusy(false);
    if (error) return toast("Couldn't save. Check your connection and try again.");
    setLogs((ls) => [data as LogRow, ...ls.filter((l) => l.user_id !== user.id)]);
    toast(mine ? "Updated your review" : "Posted to the feed");
  };
  const remove = async () => {
    if (!mine) return;
    const { error } = await supabase().from("logs").delete().eq("id", mine.id);
    if (error) return toast("Couldn't remove it. Try again.");
    setLogs((ls) => ls.filter((l) => l.id !== mine.id)); setDraft(blank()); setConfirmRemove(false); toast("Removed from your diary");
  };
  const deleteRelease = async () => {
    const { error } = await supabase().from("albums").delete().eq("id", id);
    if (error) return toast("Couldn't delete the release.");
    forgetAlbum(id); toast("Release deleted"); router.push(`/u/${profile?.handle}`);
  };

  if (error) return <div className="empty"><strong>{error}</strong><Link href="/albums">Search for another album</Link></div>;
  if (!album) return <p className="more">Loading album…</p>;

  return (
    <>
      <div className="sheet">
        <div className="cover-col">
          <Cover album={album} />
          <div className="specs">
            {album.year && <div><span>Released</span><span>{album.year}</span></div>}
            {tracks.length > 0 && <div><span>Tracks</span><span>{tracks.length}</span></div>}
            {album.genre && <div><span>Genre</span><span>{album.genre}</span></div>}
            <div><span>Community</span><span>{rated.length ? `★ ${community.toFixed(1)} · ${plural(rated.length, "rating")}` : "no ratings yet"}</span></div>
            <div><span>Logged</span><span>{plural(logs.length, "time")}</span></div>
            {bestSong && <div><span>Top song</span><span><Link className="u" href={`/album/${album.id}/song/${bestSong[0] + 1}`}>{tracks[bestSong[0]].title}</Link></span></div>}
          </div>
          <RatingBars ratings={rated.map((l) => Number(l.rating))} mine={mine?.rating ? Number(mine.rating) : null} />
          {friends.length > 0 && (
            <div className="friends-rated">
              <div className="label">Friends who logged it</div>
              <div className="fr-row">
                {friends.slice(0, 12).map((l) => (
                  <Link key={l.id} href={`/u/${l.profile!.handle}`} className="fr" title={`${l.profile!.name}${l.rating ? `: ${l.rating}★` : ""}`}>
                    <Avatar profile={l.profile} /><small>{l.rating ? stars(Number(l.rating)) : l.liked ? "♥" : "·"}</small>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          {album.source === "release" && <div className="kicker">Artist release</div>}
          <h1 className="display">{album.title}</h1>
          <div className="by">{album.source === "release" && album.owner_id ? <ArtistLink id={album.owner_id} name={album.artist} /> : album.artist_mbid ? <Link className="u" href={`/artist/${album.artist_mbid}`}>{album.artist}</Link> : album.artist}{album.genre ? ` · ${album.genre}` : ""}</div>
          <div className="actions" style={{ marginBottom: 16 }}>
            <ListenNow query={`${album.title} ${album.artist}`} />
            <SendMusic label={album.title} attachment={{ type: "album", albumId: album.id }} />
            <AddToList albumId={album.id} albumTitle={album.title} />
            <ListenLater albumId={album.id} logged={!!mine} />
            {album.source === "release" && album.owner_id === user?.id && <button className="btn ghost" onClick={deleteRelease}>Delete release</button>}
          </div>
          {user && profile ? (
            <div className="logbox">
              <div className="logline">
                <Rater value={Number(draft.rating) || 0} label="Your album rating" onChange={(v) => setDraft((d) => ({ ...d, rating: v || null, use_average: false }))} />
                <span className="rate-v">{draft.rating ? Number(draft.rating).toFixed(1) : "rate it"}</span>
                {tracks.length > 0 && (
                  <button className="pill" aria-pressed={draft.use_average} title="Rate the album by the average of your song ratings"
                    onClick={() => setDraft((d) => ({ ...d, use_average: !d.use_average, rating: !d.use_average && trackAvg ? halfStar(trackAvg) : d.rating }))}>Average</button>
                )}
                <button className="pill like" aria-pressed={draft.liked} onClick={() => setDraft((d) => ({ ...d, liked: !d.liked }))}>♥ {draft.liked ? "Liked" : "Like"}</button>
              </div>
              {tracks.length > 0 && (
                <span className="hint">
                  {draft.use_average
                    ? trackVals.length ? `Album rating is the average of ${plural(trackVals.length, "song")}: ${trackAvg.toFixed(2)}` : "Rate songs below and the album rating will follow their average."
                    : trackVals.length ? `${trackVals.length} of ${tracks.length} songs rated · average ${trackAvg.toFixed(2)}` : "Rate each song, or tap Average to rate the album by its songs."}
                </span>
              )}
              {tracks.length > 0 && <Tracklist album={album} ratings={draft.track_ratings} onRate={setTrack} community={songAvgs} />}
              <label className="field">Listened on<input className="input" type="date" max={today()} value={draft.listened_on ?? ""} onChange={(e) => setDraft((d) => ({ ...d, listened_on: e.target.value || null }))} /></label>
              <label className="field">Review<textarea className="textarea" maxLength={4000} placeholder="What did this record do to you?" value={draft.review} onChange={(e) => setDraft((d) => ({ ...d, review: e.target.value }))} /></label>
              <div className="actions">
                <button className="btn" disabled={busy} onClick={save}>{busy ? "Saving…" : mine ? "Update entry" : "Log to diary"}</button>
                {mine && <button className="btn ghost" onClick={() => (confirmRemove ? remove() : setConfirmRemove(true))}>{confirmRemove ? "Tap again to remove" : "Remove from diary"}</button>}
              </div>
            </div>
          ) : (
            <>
              {tracks.length > 0 && <Tracklist album={album} community={songAvgs} />}
              <p className="notice"><Link href="/login">Sign in</Link> to rate this album and its songs.</p>
            </>
          )}
        </div>
      </div>
      <div className="section-h"><h2>Reviews from listeners</h2>
        <span className="sorts" role="group" aria-label="Sort reviews">
          {(["popular", "recent", ...(user ? ["friends"] : [])] as const).map((k) => <button key={k} aria-pressed={sort === k} onClick={() => setSort(k as typeof sort)}>{k === "popular" ? "Popular" : k === "recent" ? "Recent" : "Friends"}</button>)}
        </span>
      </div>
      {others.length ? others.map((l) => (
        <article key={l.id} className="post" style={{ paddingBlock: 20 }}>
          <div className="who"><Avatar profile={l.profile} /><div className="n">{l.profile && <Link className="u" href={`/u/${l.profile.handle}`}>{l.profile.name}</Link>}<ArtistBadge profile={l.profile} /><small>{l.listened_on ? `listened ${fmtDate(l.listened_on)}` : ""}</small></div></div>
          <div className="meta"><span className="stars" style={{ fontSize: 18 }}>{stars(l.rating)}</span>{l.liked && <span className="heart">♥</span>}{likeCounts.get(l.id) ? <span className="hint">· {plural(likeCounts.get(l.id)!, "like")}</span> : null}</div>
          {l.review && <p className="review" style={{ marginTop: 8 }}>{l.review}</p>}
        </article>
      )) : <p className="muted">{sort === "friends" ? "No one you follow has logged this yet." : "No one else has reviewed this yet."}</p>}
      {lists.length > 0 && (
        <>
          <div className="section-h"><h2>On lists</h2><span>{plural(lists.length, "list")}</span></div>
          <div className="lgrid">{lists.map((l) => <ListCard key={l.id} list={l} />)}</div>
        </>
      )}
    </>
  );
}

function Tracklist({ album, ratings, onRate, community }: { album: Album; ratings?: Record<string, number>; onRate?: (i: number, v: number) => void; community?: Map<number, { avg: number; n: number }> }) {
  return (
    <div className="tracks">
      <div className="section-h" style={{ margin: "4px 0 2px", borderTopWidth: 1 }}><h2>Tracklist</h2><span>{plural(album.tracks.length, "song")}</span></div>
      <ol>
        {album.tracks.map((t, i) => (
          <li key={i}>
            <span className="no">{i + 1}</span>
            <Link className="tt" href={`/album/${album.id}/song/${i + 1}`}>{t.title}{t.length_ms ? <span className="len">{duration(t.length_ms)}</span> : null}</Link>
            {onRate ? <Rater small value={ratings?.[i] ?? 0} label={`Rate ${t.title}`} onChange={(v) => onRate(i, v)} /> : <span />}
            <span className="tv">{ratings?.[i] ? ratings[i].toFixed(1) : ""}</span>
            <span className="tc" title={community?.get(i) ? `Everyone: ${community.get(i)!.avg.toFixed(2)} from ${plural(community.get(i)!.n, "rating")}` : undefined}>{community?.get(i) ? `★ ${community.get(i)!.avg.toFixed(1)}` : ""}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ArtistLink({ id, name }: { id: string; name: string }) {
  const [handle, setHandle] = useState<string | null>(null);
  useEffect(() => { supabase().from("profiles").select("handle").eq("id", id).maybeSingle().then(({ data }) => setHandle(data?.handle ?? null)); }, [id]);
  return handle ? <Link className="u" href={`/u/${handle}`}>{name}</Link> : <>{name}</>;
}
