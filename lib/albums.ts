"use client";
import type { Album } from "./types";

const memo = new Map<string, Promise<Album>>();

/** Loads an album through the server, which caches MusicBrainz albums into listener's catalog. */
export function getAlbum(id: string): Promise<Album> {
  if (!memo.has(id)) {
    const p = fetch(`/api/album/${encodeURIComponent(id)}`).then(async (r) => {
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Couldn't load this album.");
      return body as Album;
    });
    p.catch(() => memo.delete(id));
    memo.set(id, p);
  }
  return memo.get(id)!;
}
export const forgetAlbum = (id: string) => memo.delete(id);
