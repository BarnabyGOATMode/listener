"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MiniProfile } from "@/lib/feed";
import { ago, stars } from "@/lib/format";
import { supabase } from "@/lib/supabase/client";
import type { Album } from "@/lib/types";
import { ArtistBadge, Avatar, Cover } from "./bits";

type Event =
  | { kind: "joined"; key: string; at: string; who: MiniProfile }
  | { kind: "album"; key: string; at: string; who: MiniProfile; album: Album; rating: number | null }
  | { kind: "song"; key: string; at: string; who: MiniProfile; album: Album; index: number; rating: number | null };

/** "Live on listener": who just joined and the latest reviews, refreshed every 20 seconds with new entries sliding in. */
export function LiveFeed() {
  const [events, setEvents] = useState<Event[] | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const db = supabase();
    const [joined, logs, songs] = await Promise.all([
      db.from("profiles").select("*").order("created_at", { ascending: false }).limit(8),
      db.from("logs").select("id, posted_at, rating, profile:profiles(*), album:albums(*)").order("posted_at", { ascending: false }).limit(8),
      db.from("song_reviews").select("id, posted_at, rating, track_index, profile:profiles(*), album:albums(*)").order("posted_at", { ascending: false }).limit(6),
    ]);
    type Row = { id: string; posted_at: string; rating: number | null; track_index?: number; profile: MiniProfile | null; album: Album | null };
    const list: Event[] = [
      ...((joined.data as (MiniProfile & { created_at: string })[]) ?? []).map((p) => ({ kind: "joined" as const, key: `j-${p.id}`, at: p.created_at, who: p })),
      ...(((logs.data as unknown) as Row[]) ?? []).filter((r) => r.profile && r.album).map((r) => ({ kind: "album" as const, key: `l-${r.id}`, at: r.posted_at, who: r.profile!, album: r.album!, rating: r.rating })),
      ...(((songs.data as unknown) as Row[]) ?? []).filter((r) => r.profile && r.album?.tracks?.[r.track_index ?? -1]).map((r) => ({ kind: "song" as const, key: `s-${r.id}`, at: r.posted_at, who: r.profile!, album: r.album!, index: r.track_index!, rating: r.rating })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
    // Anything we haven't shown before (after the first load) slides in.
    const first = seen.current.size === 0;
    const added = new Set(list.filter((e) => !seen.current.has(e.key)).map((e) => e.key));
    list.forEach((e) => seen.current.add(e.key));
    setFresh(first ? new Set() : added);
    setEvents(list);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 20_000);
    return () => clearInterval(t);
  }, [load]);

  if (!events?.length) return null;
  return (
    <section className="live" aria-label="Live on listener">
      <div className="friends-h"><h2><span className="live-dot" aria-hidden="true" />Live on listener</h2><span>updates as it happens</span></div>
      <ol className="live-list" aria-live="polite">
        {events.map((e) => {
          const href = e.kind === "joined" ? `/u/${e.who.handle}` : e.kind === "album" ? `/album/${e.album.id}` : `/album/${e.album.id}/song/${e.index + 1}`;
          return (
            <li key={e.key} className={fresh.has(e.key) ? "in" : undefined}>
              <Avatar profile={e.who} />
              <Link href={href} className="live-t">
                <b>@{e.who.handle}</b><ArtistBadge profile={e.who} />{" "}
                {e.kind === "joined" ? "joined listener" : <>rated <i>{e.kind === "song" ? e.album.tracks[e.index].title : e.album.title}</i>{e.rating ? <> <span className="stars">{stars(e.rating)}</span></> : null}</>}
                <small>{ago(e.at)}</small>
              </Link>
              {e.kind !== "joined" ? <Link href={href} className="live-cover" tabIndex={-1} aria-hidden="true"><Cover album={e.album} size={250} /></Link> : <span className="live-new">New</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
