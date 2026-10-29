"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Person } from "@/components/People";
import { Post } from "@/components/Post";
import { useSession } from "@/components/Providers";
import { type CommentRow, type FeedItem, type Like, type MiniProfile, loadFeed, loadReactions, targetOf } from "@/lib/feed";
import { supabase } from "@/lib/supabase/client";

export default function FeedPage() {
  const { user, profile, ready, following } = useSession();
  const [scope, setScope] = useState<"following" | "everyone">("following");
  const [items, setItems] = useState<FeedItem[]>([]);
  const [likes, setLikes] = useState<Like[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const sentinel = useRef<HTMLDivElement>(null);
  const effective = user ? scope : "everyone";
  const people = effective === "following" && user ? [user.id, ...following] : null;
  const peopleKey = people?.join(",") ?? "all";

  const page = useCallback(async (before?: string) => {
    setLoading(true); setError("");
    try {
      const res = await loadFeed({ people: people, before });
      const r = await loadReactions(res.items.map((i) => targetOf(i)[1]));
      setItems((cur) => (before ? [...cur, ...res.items] : res.items));
      setLikes((cur) => (before ? [...cur, ...r.likes] : r.likes));
      setComments((cur) => (before ? [...cur, ...r.comments] : r.comments));
      setNext(res.next);
    } catch (e) { setError((e as Error).message); }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peopleKey]);

  useEffect(() => { if (ready) page(); }, [ready, page]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !next) return;
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting && !loading) page(next); }, { rootMargin: "800px" });
    io.observe(el);
    return () => io.disconnect();
  }, [next, loading, page]);

  return (
    <div className="feedwrap">
      {!user && ready && (
        <div className="intro" style={{ paddingTop: 12 }}>
          <h1 className="display" style={{ fontSize: "clamp(34px,5vw,52px)" }}>Keep a diary of <em>every album</em> you hear.</h1>
          <p className="lede">Rate records and songs, write what they meant to you, and follow what your friends are listening to.</p>
          <div className="actions"><Link className="btn" href="/login?mode=up">Create an account</Link><Link className="btn ghost" href="/login">Sign in</Link></div>
        </div>
      )}
      {profile && <PeopleSearch />}
      {user && (
        <div className="tabs" role="tablist" aria-label="Feed">
          <button role="tab" aria-selected={scope === "following"} onClick={() => setScope("following")}>Following</button>
          <button role="tab" aria-selected={scope === "everyone"} onClick={() => setScope("everyone")}>Everyone</button>
        </div>
      )}
      {profile && scope === "following" && following.size < 5 && <Suggestions />}
      {items.map((it) => {
        const id = targetOf(it)[1];
        return <Post key={it.key} item={it} likes={likes.filter((l) => l.target_id === id)} comments={comments.filter((c) => c.target_id === id)} />;
      })}
      {!loading && !items.length && !error && (
        <div className="empty">
          {effective === "following"
            ? <><strong>Your feed is quiet.</strong>Follow some listeners, or switch to Everyone. When you log an album from <Link href="/albums">Albums</Link>, it posts here too.</>
            : <><strong>No one has posted yet.</strong>Find an album in <Link href="/albums">Albums</Link>, rate it, and yours will be the first review.</>}
        </div>
      )}
      {error && <p className="error">{error} <button className="linkish" onClick={() => page()}><u>Try again</u></button></p>}
      <div ref={sentinel} className="more">{loading ? "Loading…" : next ? "" : items.length ? "You're all caught up." : ""}</div>
    </div>
  );
}

function PeopleSearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<MiniProfile[] | null>(null);
  const { user } = useSession();
  useEffect(() => {
    const term = q.trim().toLowerCase().replace(/^@/, "").replace(/[,()%*\\]/g, "");
    if (!term) { setHits(null); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase().from("profiles").select("id,handle,name,kind").or(`handle.ilike.%${term}%,name.ilike.%${term}%`).neq("id", user?.id ?? "").limit(20);
      setHits((data as MiniProfile[]) ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [q, user]);
  return (
    <div style={{ marginBottom: 10 }}>
      <input className="input" type="search" placeholder="Find friends by name or @username" aria-label="Find friends by name or username" autoCapitalize="off" spellCheck={false} value={q} onChange={(e) => setQ(e.target.value)} />
      {hits && (
        <div aria-live="polite">
          <div className="section-h" style={{ margin: "16px 0 4px" }}><h2>People</h2><span>{hits.length} found</span></div>
          {hits.length ? hits.map((p) => <Person key={p.id} p={p} />) : <p className="muted">No one matches “{q.trim()}”. Check the spelling, or ask your friend for their @username.</p>}
        </div>
      )}
    </div>
  );
}

function Suggestions() {
  const { user, following } = useSession();
  const [list, setList] = useState<MiniProfile[]>([]);
  useEffect(() => {
    supabase().from("profiles").select("id,handle,name,kind").order("created_at", { ascending: false }).limit(30)
      .then(({ data }) => setList(((data as MiniProfile[]) ?? []).filter((p) => p.id !== user?.id && !following.has(p.id)).slice(0, 5)));
    // Only suggest on first load so people don't vanish as you follow them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  if (!list.length) return null;
  return (
    <div style={{ paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
      <div className="section-h" style={{ margin: "20px 0 4px" }}><h2>Listeners to follow</h2></div>
      {list.map((p) => <Person key={p.id} p={p} />)}
    </div>
  );
}
