"use client";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { getAlbum } from "@/lib/albums";

/** Opens a song by title (from song search): loads the album, finds the track, and goes to its song page. */
export default function FindSong() {
  return <Suspense><Find /></Suspense>;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

function Find() {
  const { id } = useParams<{ id: string }>();
  const title = useSearchParams().get("title") ?? "";
  const router = useRouter();
  const [error, setError] = useState("");
  useEffect(() => {
    getAlbum(decodeURIComponent(id)).then((album) => {
      const want = norm(title);
      const i = album.tracks.findIndex((t) => norm(t.title) === want);
      const j = i >= 0 ? i : album.tracks.findIndex((t) => norm(t.title).startsWith(want) || want.startsWith(norm(t.title)));
      router.replace(j >= 0 ? `/album/${album.id}/song/${j + 1}` : `/album/${album.id}`);
    }, (e) => setError(e.message));
  }, [id, title, router]);
  return error ? <div className="empty"><strong>{error}</strong><Link href="/albums">Back to search</Link></div> : <p className="more">Finding “{title}”…</p>;
}
