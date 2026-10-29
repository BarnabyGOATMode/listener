"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/bits";
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
      const res = await loadFeed({ people, before });
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

  // Like Instagram's stories row: the people who posted most recently.
  const recent = useMemo(() => {
    const seen = new Map<string, MiniProfile>();
    for (const it of items) if (!seen.has(it.profile.id)) seen.set(it.profile.id, it.profile);
    return [...seen.values()].slice(0, 12);
  }, [items]);

  return (
    <div className="ig-layout">
      <div className="ig-main">
        {!user && ready && (
          <div className="ig-welcome">
            <h1 className="display">Keep a diary of <em>every album</em> you hear.</h1>
            <p className="lede" style={{ fontSize: 17 }}>Rate records and songs, write what they meant to you, and follow what your friends are listening to.</p>
            <div className="actions"><Link className="btn" href="/login?mode=up">Create an account</Link><Link className="btn ghost" href="/login">Sign in</Link></div>
          </div>
        )}
        {profile && <div className="ig-narrow"><PeopleSearch /></div>}
        {recent.length > 1 && (
          <div className="ig-stories" aria-label="Recently active">
            {recent.map((p) => (
              <Link key={p.id} href={`/u/${p.handle}`} className="ig-story">
                <span className="ring"><Avatar profile={p} /></span>
                <span className="nm">{p.handle}</span>
              </Link>
            ))}
          </div>
        )}
        {user && (
          <div className="tabs ig-tabs" role="tablist" aria-label="Feed">
            <button role="tab" aria-selected={scope === "following"} onClick={() => setScope("following")}>Following</button>
            <button role="tab" aria-selected={scope === "everyone"} onClick={() => setScope("everyone")}>Everyone</button>
          </div>
        )}
        {profile && scope === "following" && following.size < 5 && <div className="ig-narrow"><Suggestions /></div>}
        {items.map((it) => {
          const id = targetOf(it)[1];
          return <Post key={it.key} item={it} likes={likes.filter((l) => l.target_id === id)} comments={comments.filter((c) => c.target_id === id)} />;
        })}
        {!loading && !items.length && !error && (
          <div className="empty">
            {effective === "following"
              ? <><strong>Your feed is quiet.</strong>Follow some listeners, or switch to Everyone. When you log an album from <Link href="/albums">Search</Link>, it posts here too.</>
              : <><strong>No one has posted yet.</strong>Find an album in <Link href="/albums">Search</Link>, rate it, and yours will be the first review.</>}
          </div>
        )}
        {error && <p className="error">{error} <button className="linkish" onClick={() => page()}><u>Try again</u></button></p>}
        <div ref={sentinel} className="more">{loading ? "Loading…" : next ? "" : items.length ? "You're all caught up." : ""}</div>
      </div>

      <aside className="ig-rail">
        {profile ? (
          <>
            <div className="ig-me">
              <Avatar profile={profile} />
              <div className="n"><Link className="ig-handle" href={`/u/${profile.handle}`}>{profile.handle}</Link><small>{profile.name}</small></div>
              <Link className="ig-link" href={`/u/${profile.handle}?settings=1`}>Settings</Link>
            </div>
            <PeopleSearch />
            <Suggestions compact />
          </>
        ) : ready && (
          <div className="ig-me" style={{ display: "block" }}>
            <p className="muted" style={{ margin: "0 0 12px" }}>Sign in to follow friends and see their reviews.</p>
            <Link className="btn small" href="/login?mode=up">Create an account</Link>
          </div>
        )}
        <footer className="ig-foot">
          <Link href="/albums">Search</Link> · <Link href="/discover">Discover</Link> · <Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link>
          <div>© {new Date().getFullYear()} listener · Album data from MusicBrainz</div>
        </footer>
      </aside>
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
    <div className="ig-search">
      <input className="input" type="search" placeholder="Find friends by name or @username" aria-label="Find friends by name or username" autoCapitalize="off" spellCheck={false} value={q} onChange={(e) => setQ(e.target.value)} />
      {hits && (
        <div aria-live="polite" className="ig-results">
          {hits.length ? hits.map((p) => <Person key={p.id} p={p} />) : <p className="muted" style={{ margin: "10px 0" }}>No one matches “{q.trim()}”. Check the spelling, or ask your friend for their @username.</p>}
        </div>
      )}
    </div>
  );
}

function Suggestions({ compact }: { compact?: boolean }) {
  const { user, following } = useSession();
  const [list, setList] = useState<MiniProfile[]>([]);
  useEffect(() => {
    supabase().from("profiles").select("id,handle,name,kind").order("created_at", { ascending: false }).limit(30)
      .then(({ data }) => setList(((data as MiniProfile[]) ?? []).filter((p) => p.id !== user?.id && !following.has(p.id)).slice(0, compact ? 5 : 4)));
    // Only suggest on first load so people don't vanish as you follow them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  if (!list.length) return null;
  return (
    <div className="ig-suggest">
      <div className="ig-suggest-h">Suggested for you</div>
      {list.map((p) => <Person key={p.id} p={p} />)}
    </div>
  );
}
