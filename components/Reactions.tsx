"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ago, plural } from "@/lib/format";
import { type CommentRow, type Like, loadReactions } from "@/lib/feed";
import { supabase } from "@/lib/supabase/client";
import type { TargetType } from "@/lib/types";
import { Avatar } from "./bits";
import { useSession } from "./Providers";

/** A like button and a comment thread for anything that isn't a feed post (lists, for now). */
export function Reactions({ type, id, ownerId }: { type: TargetType; id: string; ownerId: string }) {
  const { user, profile, toast } = useSession();
  const [likes, setLikes] = useState<Like[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [text, setText] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const db = supabase();

  useEffect(() => {
    loadReactions([id]).then(({ likes, comments }) => {
      setLikes(likes.filter((l) => l.target_type === type));
      setComments(comments.filter((c) => c.target_type === type));
    });
  }, [id, type]);

  const youLiked = !!user && likes.some((l) => l.user_id === user.id);
  const toggle = async () => {
    if (!user || !profile) return;
    const before = likes;
    setLikes(youLiked ? likes.filter((l) => l.user_id !== user.id) : [...likes, { user_id: user.id, target_type: type, target_id: id, profile: { handle: profile.handle, name: profile.name } }]);
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

  return (
    <section className="reactions">
      <div className="actions">
        <button className={`pill like`} aria-pressed={youLiked} disabled={!profile} onClick={toggle}>♥ {youLiked ? "Liked" : "Like"}</button>
        <span className="hint">{likes.length ? plural(likes.length, "like") : "No likes yet"}{comments.length ? ` · ${plural(comments.length, "comment")}` : ""}</span>
      </div>
      <div className="section-h"><h2>Comments</h2><span>{comments.length}</span></div>
      {comments.map((c) => (
        <div key={c.id} className="cmt">
          <Avatar profile={c.profile} />
          <p>{c.profile && <Link className="u" href={`/u/${c.profile.handle}`}><b>{c.profile.handle}</b></Link>} {c.body} <small>· {ago(c.created_at)}</small>
            {user && (c.user_id === user.id || ownerId === user.id) && <button className="ig-del" onClick={() => remove(c.id)}>{confirm === c.id ? "tap again to delete" : "delete"}</button>}
          </p>
        </div>
      ))}
      {profile ? (
        <form className="ig-add" onSubmit={post}>
          <input value={text} maxLength={500} placeholder="Add a comment…" aria-label="Add a comment" onChange={(e) => setText(e.target.value)} />
          {text.trim() && <button type="submit">Post</button>}
        </form>
      ) : !user && <p className="hint"><Link className="u" href="/login">Sign in</Link> to like and comment.</p>}
    </section>
  );
}
