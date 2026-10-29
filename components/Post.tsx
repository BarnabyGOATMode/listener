"use client";
import Link from "next/link";
import { useState } from "react";
import { ago, fmtDate, plural, stars } from "@/lib/format";
import type { CommentRow, FeedItem, Like } from "@/lib/feed";
import { targetOf } from "@/lib/feed";
import { supabase } from "@/lib/supabase/client";
import type { TargetType } from "@/lib/types";
import { ArtistBadge, Avatar, Cover, ListenNow } from "./bits";
import { useSession } from "./Providers";

export function Post({ item, likes, comments }: { item: FeedItem; likes: Like[]; comments: CommentRow[] }) {
  const { profile: p, album } = item;
  const [type, id] = targetOf(item);
  const head = (
    <div className="who">
      <Avatar profile={p} />
      <div className="n">
        <Link className="u" href={`/u/${p.handle}`}>{p.name}</Link><ArtistBadge profile={p} />
        <small>@{p.handle} · {item.kind === "song" ? "reviewed a song · " : item.kind === "release" ? "released a new album · " : ""}{ago(item.at)}</small>
      </div>
    </div>
  );
  const albumHref = `/album/${album.id}`;

  if (item.kind === "release") {
    return (
      <article className="post">
        {head}
        <Link className="post-art" href={albumHref} aria-label={`Open ${album.title}`}><Cover album={album} /></Link>
        <div className="post-b">
          <h3><Link href={albumHref}>{album.title}</Link> <small>{album.artist}{album.year ? ` · ${album.year}` : ""}</small></h3>
          <span className="when">{album.tracks.length ? plural(album.tracks.length, "song") : "New release"}{album.genre ? ` · ${album.genre}` : ""}</span>
          <div className="actions" style={{ marginTop: 8 }}><ListenNow query={`${album.title} ${album.artist}`} /><Link className="btn ghost" href={albumHref}>Rate this release</Link></div>
        </div>
        <Reactions type={type} id={id} ownerId={p.id} likes={likes} comments={comments} />
      </article>
    );
  }

  if (item.kind === "song") {
    const s = item.song, t = album.tracks[s.track_index];
    const songHref = `${albumHref}/song/${s.track_index + 1}`;
    if (!t) return null;
    return (
      <article className="post">
        {head}
        <Link className="songcard" href={songHref}>
          <Cover album={album} size={250} />
          <div style={{ minWidth: 0 }}>
            <div className="kicker">Song · Track {s.track_index + 1} of {album.tracks.length}</div>
            <h3>{t.title}</h3>
            <div className="from">from <b>{album.title}</b> · {album.artist}</div>
          </div>
        </Link>
        <div className="post-b">
          {(s.rating || s.liked) && <div className="meta"><span className="stars">{stars(s.rating)}</span>{s.liked && <span className="heart" aria-label="liked">♥</span>}</div>}
          {s.review && <p>{s.review}</p>}
          {s.listened_on && <span className="when">Listened {fmtDate(s.listened_on)}</span>}
          <div className="actions" style={{ marginTop: 8 }}><ListenNow query={`${t.title} ${album.artist}`} /><Link className="btn ghost" href={songHref}>View song</Link></div>
        </div>
        <Reactions type={type} id={id} ownerId={p.id} likes={likes} comments={comments} />
      </article>
    );
  }

  const l = item.log;
  const ratings = Object.entries(l.track_ratings ?? {}).filter(([i, v]) => v && album.tracks[+i]);
  const top = ratings.sort((a, b) => b[1] - a[1])[0];
  return (
    <article className="post">
      {head}
      <Link className="post-art" href={albumHref} aria-label={`Open ${album.title}`}><Cover album={album} /></Link>
      <div className="post-b">
        {(l.rating || l.liked) && <div className="meta"><span className="stars">{stars(l.rating)}</span>{l.liked && <span className="heart" aria-label="liked">♥</span>}</div>}
        <h3><Link href={albumHref}>{album.title}</Link> <small>{album.artist}{album.year ? ` · ${album.year}` : ""}</small></h3>
        {l.review && <p>{l.review}</p>}
        {top && (
          <span className="when">Top song: <Link className="u" href={`${albumHref}/song/${+top[0] + 1}`}>{album.tracks[+top[0]].title}</Link> <span className="stars">{stars(top[1])}</span>
            {l.use_average ? ` · album rated by the average of ${plural(ratings.length, "song")}` : ""}</span>
        )}
        {l.listened_on && <span className="when">Listened {fmtDate(l.listened_on)}</span>}
        <div className="actions" style={{ marginTop: 8 }}><ListenNow query={`${album.title} ${album.artist}`} /><Link className="btn ghost" href={albumHref}>View album</Link></div>
      </div>
      <Reactions type={type} id={id} ownerId={p.id} likes={likes} comments={comments} />
    </article>
  );
}

const HEART = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.4 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.6 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" /></svg>;
const BUBBLE = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.5a8.5 8 0 0 1-12.3 7.2L3.5 20l1.4-4.2A8 8 0 1 1 20.5 11.5z" /></svg>;

function Reactions({ type, id, ownerId, likes: initialLikes, comments: initialComments }: { type: TargetType; id: string; ownerId: string; likes: Like[]; comments: CommentRow[] }) {
  const { user, profile, toast } = useSession();
  const [likes, setLikes] = useState(initialLikes);
  const [comments, setComments] = useState(initialComments);
  const [text, setText] = useState("");
  const [all, setAll] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const liked = !!user && likes.some((l) => l.user_id === user.id);
  const can = !!user && !!profile;
  const db = supabase();

  const toggleLike = async () => {
    if (!user || !profile) return;
    const mine: Like = { user_id: user.id, target_type: type, target_id: id, profile: { handle: profile.handle, name: profile.name } };
    setLikes((ls) => (liked ? ls.filter((l) => l.user_id !== user.id) : [...ls, mine]));
    const { error } = liked
      ? await db.from("likes").delete().eq("user_id", user.id).eq("target_type", type).eq("target_id", id)
      : await db.from("likes").insert({ user_id: user.id, target_type: type, target_id: id });
    if (error) { setLikes(initialLikes); toast("Couldn't save that. Try again."); }
  };
  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || !user) return;
    setText("");
    const { data, error } = await db.from("comments").insert({ user_id: user.id, target_type: type, target_id: id, body }).select("*, profile:profiles(id,handle,name,kind)").single();
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
  const first = liked ? "you" : others[0]?.profile?.handle;
  const shown = all ? comments : comments.slice(-2);
  return (
    <div className="post-a">
      <div className="bar2">
        <button className={`act${liked ? " on" : ""}`} aria-pressed={liked} disabled={!can} onClick={toggleLike}>{HEART}<span>{likes.length || ""}</span><span className="sr">{liked ? "Unlike" : "Like"}</span></button>
        <button className="act" disabled={!can} onClick={(e) => (e.currentTarget.closest(".post-a")?.querySelector("input") as HTMLInputElement | null)?.focus()}>{BUBBLE}<span>{comments.length || ""}</span><span className="sr">Comment</span></button>
      </div>
      {likes.length > 0 && <div className="likedby">Liked by <b>{first}</b>{likes.length > 1 ? ` and ${plural(likes.length - 1, "other")}` : ""}</div>}
      {comments.length > shown.length && <button className="linkish muted" style={{ fontSize: 14 }} onClick={() => setAll(true)}>View all {comments.length} comments</button>}
      {shown.map((c) => (
        <div className="cmt" key={c.id}>
          {c.profile && <Link href={`/u/${c.profile.handle}`}>{c.profile.handle}</Link>}<span>{c.body}</span>
          <span className="cm">{ago(c.created_at)}{user && (c.user_id === user.id || ownerId === user.id) && <> · <button className="linkish" style={{ textDecoration: "underline" }} onClick={() => remove(c.id)}>{confirm === c.id ? "Tap again to delete" : "Delete"}</button></>}</span>
        </div>
      ))}
      {can ? (
        <form className="cform" onSubmit={post}>
          <input value={text} maxLength={500} placeholder="Add a comment…" aria-label="Add a comment" onChange={(e) => setText(e.target.value)} />
          <button type="submit">Post</button>
        </form>
      ) : !user && <Link className="hint" href="/login">Sign in to like and comment</Link>}
    </div>
  );
}
