"use client";
import Link from "next/link";
import { useState } from "react";
import { ago, plural, stars } from "@/lib/format";
import type { CommentRow, FeedItem, Like } from "@/lib/feed";
import { targetOf } from "@/lib/feed";
import { supabase } from "@/lib/supabase/client";
import { ArtistBadge, Avatar, Cover, ListenNow } from "./bits";
import { useSession } from "./Providers";
import { SendMusic } from "./SendMusic";

const HEART = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.4 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.6 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" /></svg>;
const BUBBLE = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.5a8.5 8 0 0 1-12.3 7.2L3.5 20l1.4-4.2A8 8 0 1 1 20.5 11.5z" /></svg>;

/** A feed post laid out like Instagram: slim header, square cover, icon row, then likes, caption and comments. */
export function Post({ item, likes: initialLikes, comments: initialComments }: { item: FeedItem; likes: Like[]; comments: CommentRow[] }) {
  const { user, profile, toast } = useSession();
  const { profile: p, album } = item;
  const [type, id] = targetOf(item);
  const [likes, setLikes] = useState(initialLikes);
  const [comments, setComments] = useState(initialComments);
  const [text, setText] = useState("");
  const [allComments, setAllComments] = useState(false);
  const [more, setMore] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const db = supabase();

  const albumHref = `/album/${album.id}`;
  const artist = album.artist_mbid ? <Link href={`/artist/${album.artist_mbid}`}>{album.artist}</Link> : <>{album.artist}</>;
  let href = albumHref, chip: string | null = null, kind = "", rating: number | null = null, liked = false, review = "", listen = `${album.title} ${album.artist}`;
  let headline: React.ReactNode = <><Link href={albumHref}><b>{album.title}</b></Link> · {artist}{album.year ? ` · ${album.year}` : ""}</>;
  if (item.kind === "song") {
    const t = album.tracks[item.song.track_index];
    if (!t) return null;
    href = `${albumHref}/song/${item.song.track_index + 1}`;
    chip = `♪ ${t.title}`; kind = "reviewed a song";
    rating = item.song.rating; liked = item.song.liked; review = item.song.review; listen = `${t.title} ${album.artist}`;
    headline = <><Link href={href}><b>{t.title}</b></Link> · {artist} · from <Link href={albumHref}>{album.title}</Link></>;
  } else if (item.kind === "release") {
    chip = "New release"; kind = "released an album";
    review = album.tracks.length ? `${plural(album.tracks.length, "song")}${album.genre ? ` · ${album.genre}` : ""}` : album.genre;
  } else {
    rating = item.log.rating; liked = item.log.liked; review = item.log.review;
    const r = Object.entries(item.log.track_ratings ?? {}).filter(([i, v]) => v && album.tracks[+i]).sort((a, b) => b[1] - a[1])[0];
    if (r) chip = `Top song: ${album.tracks[+r[0]].title}`;
  }

  const youLiked = !!user && likes.some((l) => l.user_id === user.id);
  const can = !!user && !!profile;
  const toggleLike = async () => {
    if (!user || !profile) return;
    const mine: Like = { user_id: user.id, target_type: type, target_id: id, profile: { handle: profile.handle, name: profile.name } };
    const before = likes;
    setLikes(youLiked ? likes.filter((l) => l.user_id !== user.id) : [...likes, mine]);
    const { error } = youLiked
      ? await db.from("likes").delete().eq("user_id", user.id).eq("target_type", type).eq("target_id", id)
      : await db.from("likes").insert({ user_id: user.id, target_type: type, target_id: id });
    if (error) { setLikes(before); toast("Couldn't save that. Try again."); }
  };
  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || !user) return;
    setText("");
    const { data, error } = await db.from("comments").insert({ user_id: user.id, target_type: type, target_id: id, body }).select("*, profile:profiles(*)").single();
    if (error) { setText(body); return toast("Couldn't post your comment. Try again."); }
    setComments((cs) => [...cs, data as CommentRow]);
  };
  const remove = async (cid: string) => {
    if (confirm !== cid) return setConfirm(cid);
    const { error } = await db.from("comments").delete().eq("id", cid);
    if (error) return toast("Couldn't delete that comment.");
    setComments((cs) => cs.filter((c) => c.id !== cid));
  };
  const others = likes.filter((l) => l.user_id !== user?.id);
  const shown = allComments ? comments : comments.slice(-2);
  const long = review.length > 140 || review.split("\n").length > 2;

  return (
    <article className="ig">
      <header className="ig-h">
        <Avatar profile={p} />
        <div className="ig-who">
          <Link className="ig-handle" href={`/u/${p.handle}`}>{p.handle}</Link><ArtistBadge profile={p} />
          <span className="ig-sep">•</span><time dateTime={item.at}>{ago(item.at).replace(" ago", "")}</time>
          {kind && <span className="ig-kind">{kind}</span>}
        </div>
      </header>

      <Link className="ig-media" href={href} aria-label={`Open ${item.kind === "song" ? chip?.slice(2) : album.title}`}>
        <Cover album={album} />
        {chip && <span className="ig-chip">{chip}</span>}
      </Link>

      <div className="ig-actions">
        <button className={`act${youLiked ? " on" : ""}`} aria-pressed={youLiked} disabled={!can} onClick={toggleLike} title={youLiked ? "Unlike" : "Like"}>{HEART}<span className="sr">{youLiked ? "Unlike" : "Like"}</span></button>
        <button className="act" disabled={!can} title="Comment" onClick={(e) => (e.currentTarget.closest(".ig")?.querySelector(".ig-add input") as HTMLInputElement | null)?.focus()}>{BUBBLE}<span className="sr">Comment</span></button>
        <ListenNow compact query={listen} />
        <SendMusic icon label={item.kind === "song" ? (album.tracks[item.song.track_index]?.title ?? album.title) : album.title}
          attachment={item.kind === "song" ? { type: "song", albumId: album.id, index: item.song.track_index } : { type: "album", albumId: album.id }} />
        <span className="ig-rating">{rating ? <span className="stars" aria-label={`${rating} stars`}>{stars(rating)}</span> : null}{liked && <span className="heart" aria-label="loved it"> ♥</span>}</span>
      </div>

      <div className="ig-body">
        {likes.length > 0 && (
          <div className="ig-likes">{likes.length === 1 ? <>Liked by <b>{youLiked ? "you" : others[0]?.profile?.handle}</b></> : <><b>{plural(likes.length, "like")}</b></>}</div>
        )}
        <div className="ig-headline">{headline}</div>
        {item.kind === "release" && review && <div className="ig-headline">{review}</div>}
        {item.kind !== "release" && review && (
          <p className={`ig-caption${long && !more ? " clamp" : ""}`}>
            <Link className="ig-handle" href={`/u/${p.handle}`}>{p.handle}</Link> {review}
          </p>
        )}
        {long && !more && <button className="ig-more" onClick={() => setMore(true)}>more</button>}
        {comments.length > shown.length && <button className="ig-more" onClick={() => setAllComments(true)}>View all {comments.length} comments</button>}
        {shown.map((c) => (
          <p className="ig-comment" key={c.id}>
            {c.profile && <Link className="ig-handle" href={`/u/${c.profile.handle}`}>{c.profile.handle}</Link>} {c.body}
            {user && (c.user_id === user.id || p.id === user.id) && <button className="ig-del" onClick={() => remove(c.id)}>{confirm === c.id ? "tap again to delete" : "delete"}</button>}
          </p>
        ))}
        {can ? (
          <form className="ig-add" onSubmit={post}>
            <input value={text} maxLength={500} placeholder="Add a comment…" aria-label="Add a comment" onChange={(e) => setText(e.target.value)} />
            {text.trim() && <button type="submit">Post</button>}
          </form>
        ) : !user && <Link className="ig-more" href="/login">Sign in to like and comment</Link>}
      </div>
    </article>
  );
}
