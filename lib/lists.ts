"use client";
import { getAlbum } from "./albums";
import type { MiniProfile } from "./feed";
import { supabase } from "./supabase/client";
import type { Album, List, ListItem } from "./types";

export type ListItemRow = ListItem & { album: Album };
export type ListRow = List & { profile: MiniProfile | null; items: ListItemRow[]; likes?: number };

const SELECT = "*, profile:profiles(id,handle,name,kind,avatar_url), items:list_items(*, album:albums(*))";

const tidy = (rows: ListRow[] | null) =>
  (rows ?? []).map((l) => ({ ...l, items: (l.items ?? []).filter((i) => i.album).sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)) }));

/** Lists with their albums, newest activity first. `userId` limits it to one person's lists; `albumId` to lists containing that album. */
export async function loadLists({ userId, albumId, ids, limit = 24 }: { userId?: string; albumId?: string; ids?: string[]; limit?: number } = {}) {
  const db = supabase();
  let q = db.from("lists").select(SELECT).order("updated_at", { ascending: false }).limit(limit);
  if (userId) q = q.eq("user_id", userId);
  if (ids) q = q.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  if (albumId) {
    const { data } = await db.from("list_items").select("list_id").eq("album_id", albumId).limit(200);
    const found = (data ?? []).map((r) => r.list_id as string);
    if (!found.length) return [];
    q = q.in("id", found);
  }
  const { data, error } = await q;
  if (error) throw new Error("Couldn't load lists.");
  return tidy(data as ListRow[]);
}

export async function loadList(id: string) {
  const { data } = await supabase().from("lists").select(SELECT).eq("id", id).maybeSingle();
  return data ? tidy([data as ListRow])[0] : null;
}

/** The most-liked lists, for Discover and the Lists page. */
export async function popularLists(limit = 12) {
  const { data } = await supabase().from("likes").select("target_id").eq("target_type", "list").order("created_at", { ascending: false }).limit(2000);
  const counts = new Map<string, number>();
  for (const r of data ?? []) counts.set(r.target_id as string, (counts.get(r.target_id as string) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  const lists = await loadLists({ ids: top.map(([id]) => id), limit });
  return lists.map((l) => ({ ...l, likes: counts.get(l.id) ?? 0 })).sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
}

/** Adds an album to the end of a list, caching a MusicBrainz album into the catalog first. */
export async function addToList(list: Pick<ListRow, "id" | "items">, albumId: string) {
  await getAlbum(albumId);
  const position = list.items.reduce((m, i) => Math.max(m, i.position), -1) + 1;
  const { data, error } = await supabase().from("list_items").insert({ list_id: list.id, album_id: albumId, position }).select("*, album:albums(*)").single();
  if (error) throw new Error(error.code === "23505" ? "That album is already on the list." : "Couldn't add it to the list.");
  return data as ListItemRow;
}
