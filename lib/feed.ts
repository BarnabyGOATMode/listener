"use client";
import { supabase } from "./supabase/client";
import type { Album, Comment, Log, Profile, SongReview, TargetType } from "./types";

export type MiniProfile = Pick<Profile, "id" | "handle" | "name" | "kind">;
export type LogItem = { kind: "log"; at: string; key: string; profile: MiniProfile; album: Album; log: Log };
export type SongItem = { kind: "song"; at: string; key: string; profile: MiniProfile; album: Album; song: SongReview };
export type ReleaseItem = { kind: "release"; at: string; key: string; profile: MiniProfile; album: Album };
export type FeedItem = LogItem | SongItem | ReleaseItem;
export type Like = { user_id: string; target_type: TargetType; target_id: string; profile: Pick<Profile, "handle" | "name"> | null };
export type CommentRow = Comment & { profile: MiniProfile | null };

export const targetOf = (it: FeedItem): [TargetType, string] =>
  it.kind === "log" ? ["log", it.log.id] : it.kind === "song" ? ["song", it.song.id] : ["release", it.album.id];

const P = "profile:profiles(id,handle,name,kind)";

/** One page of the feed, newest first, mixing album reviews, song reviews and artist releases. `people` limits it to those accounts. */
export async function loadFeed({ people, before, limit = 15 }: { people?: string[] | null; before?: string; limit?: number }) {
  const db = supabase();
  if (people && !people.length) return { items: [] as FeedItem[], next: null };
  let logs = db.from("logs").select(`*, ${P}, album:albums(*)`).order("posted_at", { ascending: false }).limit(limit);
  let songs = db.from("song_reviews").select(`*, ${P}, album:albums(*)`).order("posted_at", { ascending: false }).limit(limit);
  let releases = db.from("albums").select(`*, ${P}`).eq("source", "release").order("created_at", { ascending: false }).limit(limit);
  if (people) { logs = logs.in("user_id", people); songs = songs.in("user_id", people); releases = releases.in("owner_id", people); }
  if (before) { logs = logs.lt("posted_at", before); songs = songs.lt("posted_at", before); releases = releases.lt("created_at", before); }
  const [l, s, r] = await Promise.all([logs, songs, releases]);
  if (l.error || s.error || r.error) throw new Error("Couldn't load the feed.");
  type J<T> = T & { profile: MiniProfile; album: Album };
  const items: FeedItem[] = [
    ...(l.data as J<Log>[]).filter((x) => x.album && x.profile).map(({ profile, album, ...log }) => ({ kind: "log" as const, at: log.posted_at, key: `log-${log.id}`, profile, album, log })),
    ...(s.data as J<SongReview>[]).filter((x) => x.album && x.profile).map(({ profile, album, ...song }) => ({ kind: "song" as const, at: song.posted_at, key: `song-${song.id}`, profile, album, song })),
    ...(r.data as (Album & { profile: MiniProfile })[]).filter((x) => x.profile).map(({ profile, ...album }) => ({ kind: "release" as const, at: album.created_at, key: `rel-${album.id}`, profile, album })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  const full = (l.data?.length ?? 0) === limit || (s.data?.length ?? 0) === limit || (r.data?.length ?? 0) === limit;
  return { items, next: items.length && (full || items.length === limit) ? items[items.length - 1].at : null };
}

/** Likes and comments for a set of posts. */
export async function loadReactions(ids: string[]) {
  if (!ids.length) return { likes: [] as Like[], comments: [] as CommentRow[] };
  const db = supabase();
  const [l, c] = await Promise.all([
    db.from("likes").select("user_id,target_type,target_id, profile:profiles(handle,name)").in("target_id", ids),
    db.from("comments").select(`*, ${P}`).in("target_id", ids).order("created_at", { ascending: true }),
  ]);
  return { likes: (l.data as unknown as Like[]) ?? [], comments: (c.data as CommentRow[]) ?? [] };
}
