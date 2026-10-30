"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MiniProfile } from "@/lib/feed";
import { ago, stars } from "@/lib/format";
import { supabase } from "@/lib/supabase/client";
import type { Album } from "@/lib/types";
import { ArtistBadge, Avatar, Cover } from "./bits";

type Event = { key: string; at: string; who: MiniProfile; text: React.ReactNode; href: string; album?: Album | null; other?: MiniProfile | null; tag?: string };

type Owned = { id: string; profile: MiniProfile | null };
type LogT = Owned & { album: Album | null };
type SongT = Owned & { track_index: number; album: Album | null };
type ListT = Owned & { title: string; items?: { position: number; album: Album | null }[] };
type ReleaseT = { id: string; title: string; artist: string; cover_url: string | null; tracks: Album["tracks"] };
type Reaction = { user_id: string; target_type: string; target_id: string; created_at: string; profile: MiniProfile | null; id?: string; body?: string };

const PROFILE = "profile:profiles(id,handle,name,kind,avatar_url)";
const N = 8;

/** Who a liked or commented-on post belongs to and what it's about, for a batch of likes and comments. */
async function resolveTargets(rows: Reaction[]) {
  const db = supabase();
  const ids = (t: string) => [...new Set(rows.filter((r) => r.target_type === t).map((r) => r.target_id))];
  const [logs, songs, releases, lists] = await Promise.all([
    ids("log").length ? db.from("logs").select(`id, ${PROFILE}, album:albums(*)`).in("id", ids("log")) : { data: [] },
    ids("song").length ? db.from("song_reviews").select(`id, track_index, ${PROFILE}, album:albums(*)`).in("id", ids("song")) : { data: [] },
    ids("release").length ? db.from("albums").select("id, title, artist, cover_url, tracks").in("id", ids("release")) : { data: [] },
    ids("list").length ? db.from("lists").select(`id, title, ${PROFILE}, items:list_items(position, album:albums(*))`).in("id", ids("list")) : { data: [] },
  ]);
  const map = <T extends { id: string },>(d: unknown) => new Map(((d as T[]) ?? []).map((x) => [x.id, x]));
  return { log: map<LogT>(logs.data), song: map<SongT>(songs.data), release: map<ReleaseT>(releases.data), list: map<ListT>(lists.data) };
}

const firstCover = (l?: ListT) => [...(l?.items ?? [])].sort((a, b) => a.position - b.position).find((i) => i.album)?.album ?? null;
const whose = (owner: MiniProfile | null | undefined, actor: string) => (owner && owner.id === actor ? "their own" : owner ? `@${owner.handle}'s` : "a");

/** What a like or comment was on, as words, a link and a cover. Null when the post has since been deleted. */
function describe(r: Reaction, t: Awaited<ReturnType<typeof resolveTargets>>): Pick<Event, "text" | "href" | "album"> | null {
  if (r.target_type === "log") {
    const x = t.log.get(r.target_id);
    return x?.album ? { text: <>{whose(x.profile, r.user_id)} review of <i>{x.album.title}</i></>, href: `/album/${x.album.id}`, album: x.album } : null;
  }
  if (r.target_type === "song") {
    const x = t.song.get(r.target_id);
    const song = x?.album?.tracks?.[x.track_index];
    return x?.album && song ? { text: <>{whose(x.profile, r.user_id)} review of <i>{song.title}</i></>, href: `/album/${x.album.id}/song/${x.track_index + 1}`, album: x.album } : null;
  }
  if (r.target_type === "release") {
    const x = t.release.get(r.target_id);
    return x ? { text: <>the release <i>{x.title}</i></>, href: `/album/${x.id}`, album: x as unknown as Album } : null;
  }
  const x = t.list.get(r.target_id);
  return x ? { text: <>{whose(x.profile, r.user_id)} list <i>{x.title}</i></>, href: `/list/${x.id}`, album: firstCover(x) } : null;
}

/**
 * "Live on listener": everything public as it happens: sign-ups, album and song ratings, likes, comments, follows,
 * new lists and list additions, and artist releases. Realtime nudges it the moment something changes; a slow check
 * runs as a safety net in case the live connection drops.
 */
export function LiveFeed() {
  const [events, setEvents] = useState<Event[] | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const db = supabase();
    const [joined, logs, songs, likes, comments, follows, lists, added, releases] = await Promise.all([
      db.from("profiles").select("id,handle,name,kind,avatar_url,created_at").order("created_at", { ascending: false }).limit(N),
      db.from("logs").select(`id, posted_at, rating, liked, review, ${PROFILE}, album:albums(*)`).order("posted_at", { ascending: false }).limit(N),
      db.from("song_reviews").select(`id, posted_at, rating, liked, review, track_index, ${PROFILE}, album:albums(*)`).order("posted_at", { ascending: false }).limit(N),
      db.from("likes").select(`user_id, target_type, target_id, created_at, ${PROFILE}`).order("created_at", { ascending: false }).limit(N),
      db.from("comments").select(`id, user_id, target_type, target_id, body, created_at, ${PROFILE}`).order("created_at", { ascending: false }).limit(N),
      db.from("follows").select("follower_id, followee_id, created_at, follower:profiles!follows_follower_id_fkey(id,handle,name,kind,avatar_url), followee:profiles!follows_followee_id_fkey(id,handle,name,kind,avatar_url)").order("created_at", { ascending: false }).limit(N),
      db.from("lists").select(`id, title, created_at, ${PROFILE}, items:list_items(position, album:albums(*))`).order("created_at", { ascending: false }).limit(N),
      db.from("list_items").select("list_id, album_id, created_at, album:albums(*), list:lists(id, title, user_id, created_at, profile:profiles(id,handle,name,kind,avatar_url))").order("created_at", { ascending: false }).limit(N),
      db.from("albums").select("*, profile:profiles!albums_owner_id_fkey(id,handle,name,kind,avatar_url)").eq("source", "release").order("created_at", { ascending: false }).limit(N),
    ]);
    const reactions = [...((likes.data as unknown as Reaction[]) ?? []), ...((comments.data as unknown as Reaction[]) ?? [])];
    const targets = await resolveTargets(reactions);

    type Rev = { id: string; posted_at: string; rating: number | null; liked: boolean; review: string; track_index?: number; profile: MiniProfile | null; album: Album | null };
    const did = (r: Rev) => (r.review ? "reviewed" : r.rating ? "rated" : r.liked ? "loved" : "logged");
    const rate = (r: Rev) => <>{r.rating ? <> <span className="stars">{stars(r.rating)}</span></> : null}{r.liked ? <span className="heart"> ♥</span> : null}</>;
    const list: Event[] = [];

    for (const p of (joined.data as (MiniProfile & { created_at: string })[]) ?? [])
      list.push({ key: `j-${p.id}`, at: p.created_at, who: p, text: "joined listener", href: `/u/${p.handle}`, tag: "New" });
    for (const r of (logs.data as unknown as Rev[]) ?? []) if (r.profile && r.album)
      list.push({ key: `l-${r.id}`, at: r.posted_at, who: r.profile, text: <>{did(r)} <i>{r.album.title}</i>{rate(r)}</>, href: `/album/${r.album.id}`, album: r.album });
    for (const r of (songs.data as unknown as Rev[]) ?? []) {
      const song = r.album?.tracks?.[r.track_index ?? -1];
      if (r.profile && r.album && song) list.push({ key: `s-${r.id}`, at: r.posted_at, who: r.profile, text: <>{did(r)} <i>♪ {song.title}</i>{rate(r)}</>, href: `/album/${r.album.id}/song/${r.track_index! + 1}`, album: r.album });
    }
    for (const r of reactions) {
      const d = r.profile && describe(r, targets);
      if (!d) continue;
      const comment = r.body != null;
      list.push({ key: comment ? `c-${r.id}` : `k-${r.user_id}-${r.target_type}-${r.target_id}`, at: r.created_at, who: r.profile!, href: d.href, album: d.album,
        text: comment ? <>commented on {d.text}: “{r.body!.length > 60 ? `${r.body!.slice(0, 60)}…` : r.body}”</> : <>liked {d.text}</> });
    }
    type Follow = { follower_id: string; followee_id: string; created_at: string; follower: MiniProfile | null; followee: MiniProfile | null };
    for (const f of (follows.data as unknown as Follow[]) ?? []) if (f.follower && f.followee)
      list.push({ key: `f-${f.follower_id}-${f.followee_id}`, at: f.created_at, who: f.follower, text: <>followed <b>@{f.followee.handle}</b></>, href: `/u/${f.followee.handle}`, other: f.followee });
    type ListNew = ListT & { created_at: string };
    for (const l of (lists.data as unknown as ListNew[]) ?? []) if (l.profile)
      list.push({ key: `n-${l.id}`, at: l.created_at, who: l.profile, text: <>started a list <i>{l.title}</i></>, href: `/list/${l.id}`, album: firstCover(l), tag: firstCover(l) ? undefined : "List" });
    type Added = { list_id: string; album_id: string; created_at: string; album: Album | null; list: { id: string; title: string; created_at: string; profile: MiniProfile | null } | null };
    for (const a of (added.data as unknown as Added[]) ?? []) {
      // The first album on a brand-new list is already covered by "started a list".
      if (!a.album || !a.list?.profile || Math.abs(Date.parse(a.created_at) - Date.parse(a.list.created_at)) < 60_000) continue;
      list.push({ key: `a-${a.list_id}-${a.album_id}`, at: a.created_at, who: a.list.profile, text: <>added <i>{a.album.title}</i> to <i>{a.list.title}</i></>, href: `/list/${a.list.id}`, album: a.album });
    }
    for (const r of (releases.data as (Album & { profile: MiniProfile | null })[]) ?? []) if (r.profile)
      list.push({ key: `r-${r.id}`, at: r.created_at, who: r.profile, text: <>released <i>{r.title}</i></>, href: `/album/${r.id}`, album: r });

    const top = list.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 14);
    // Anything we haven't shown before (after the first load) slides in.
    const first = seen.current.size === 0;
    const newKeys = new Set(top.filter((e) => !seen.current.has(e.key)).map((e) => e.key));
    top.forEach((e) => seen.current.add(e.key));
    setFresh(first ? new Set() : newKeys);
    setEvents(top);
  }, []);

  useEffect(() => {
    load();
    const db = supabase();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Several changes often land together (a review plus its notification, a list plus its first album): reload once.
    const nudge = () => { clearTimeout(timer); timer = setTimeout(load, 700); };
    const ch = db.channel(`live-on-listener-${Math.random().toString(36).slice(2)}`); // each copy on the page gets its own channel
    for (const table of ["logs", "song_reviews", "likes", "comments", "follows", "lists", "list_items"])
      ch.on("postgres_changes", { event: "*", schema: "public", table }, nudge);
    ch.on("postgres_changes", { event: "INSERT", schema: "public", table: "profiles" }, nudge)
      .on("postgres_changes", { event: "*", schema: "public", table: "albums", filter: "source=eq.release" }, nudge)
      .subscribe();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 30_000);
    const onShow = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onShow);
    return () => { db.removeChannel(ch); clearInterval(t); clearTimeout(timer); document.removeEventListener("visibilitychange", onShow); };
  }, [load]);

  if (!events?.length) return null;
  return (
    <section className="live" aria-label="Live on listener">
      <div className="friends-h"><h2><span className="live-dot" aria-hidden="true" />Live on listener</h2><span>updates as it happens</span></div>
      <ol className="live-list" aria-live="polite">
        {events.map((e) => (
          <li key={e.key} className={fresh.has(e.key) ? "in" : undefined}>
            <Avatar profile={e.who} />
            <Link href={e.href} className="live-t">
              <b>@{e.who.handle}</b><ArtistBadge profile={e.who} /> {e.text}
              <small>{ago(e.at)}</small>
            </Link>
            {e.album ? <Link href={e.href} className="live-cover" tabIndex={-1} aria-hidden="true"><Cover album={e.album} size={250} /></Link>
              : e.other ? <Avatar profile={e.other} />
              : <span className="live-new">{e.tag ?? "New"}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}
